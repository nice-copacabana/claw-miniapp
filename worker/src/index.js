/**
 * Cloudflare Worker - claw-miniapp bridge
 * 
 * 路由：
 * POST /send      - 小程序发消息给娜娜
 * GET  /messages  - 小程序轮询拉取娜娜回复
 * POST /push      - OpenClaw 主动推送消息到 KV
 * GET  /health    - 健康检查
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers（小程序需要）
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      if (path === '/health') {
        return json({ ok: true, ts: Date.now() }, cors);
      }

      if (path === '/send' && request.method === 'POST') {
        return handleSend(request, env, cors);
      }

      if (path === '/messages' && request.method === 'GET') {
        return handlePoll(request, env, cors);
      }

      if (path === '/push' && request.method === 'POST') {
        return handlePush(request, env, cors);
      }

      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: e.message }, cors, 500);
    }
  }
};

// 小程序发消息 → 转发给 OpenClaw
async function handleSend(request, env, cors) {
  const body = await request.json();
  const { openid, type, content, extra } = body;

  if (!openid || !content) {
    return json({ error: 'missing openid or content' }, cors, 400);
  }

  // 构造发给 OpenClaw 的消息
  const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    msgId,
    openid,
    type: type || 'text',   // text | link | voice | image
    content,
    extra: extra || {},
    ts: Date.now(),
  };

  // 存入 KV（待处理队列）
  await env.MESSAGES.put(
    `pending:${msgId}`,
    JSON.stringify(payload),
    { expirationTtl: 86400 }
  );

  // 转发到 OpenClaw webhook
  const ocUrl = `${env.OPENCLAW_URL}${env.OPENCLAW_WEBHOOK_PATH}`;
  const ocResp = await fetch(ocUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENCLAW_TOKEN}`,
    },
    body: JSON.stringify({
      channel: 'miniapp',
      from: openid,
      message: formatMessage(type, content, extra),
      msgId,
    }),
  });

  if (!ocResp.ok) {
    console.error('OpenClaw forward failed:', await ocResp.text());
  }

  return json({ ok: true, msgId }, cors);
}

// 小程序轮询拉取娜娜回复
async function handlePoll(request, env, cors) {
  const url = new URL(request.url);
  const openid = url.searchParams.get('openid');
  const since = parseInt(url.searchParams.get('since') || '0');

  if (!openid) {
    return json({ error: 'missing openid' }, cors, 400);
  }

  // 从 KV 拉取该用户的回复
  const key = `reply:${openid}`;
  const raw = await env.MESSAGES.get(key);
  const replies = raw ? JSON.parse(raw) : [];

  // 只返回 since 之后的消息
  const newReplies = replies.filter(r => r.ts > since);

  return json({ ok: true, replies: newReplies, ts: Date.now() }, cors);
}

// OpenClaw 主动推送回复到 KV
async function handlePush(request, env, cors) {
  // 验证来源（简单 token 验证）
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.OPENCLAW_TOKEN}`) {
    return json({ error: 'unauthorized' }, cors, 401);
  }

  const body = await request.json();
  const { openid, message, type } = body;

  if (!openid || !message) {
    return json({ error: 'missing openid or message' }, cors, 400);
  }

  // 追加到用户回复列表
  const key = `reply:${openid}`;
  const raw = await env.MESSAGES.get(key);
  const replies = raw ? JSON.parse(raw) : [];

  replies.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: type || 'text',
    message,
    ts: Date.now(),
  });

  // 只保留最近 50 条
  const trimmed = replies.slice(-50);
  await env.MESSAGES.put(key, JSON.stringify(trimmed), { expirationTtl: 7 * 86400 });

  return json({ ok: true }, cors);
}

// 根据消息类型格式化发给 OpenClaw 的文本
function formatMessage(type, content, extra) {
  switch (type) {
    case 'link':
      return `[分享链接] ${extra?.title || ''}\n${content}`;
    case 'voice':
      return `[语音转文字] ${content}`;
    case 'image':
      return `[图片] ${content}`;
    case 'task':
      return `[任务指令] ${content}`;
    default:
      return content;
  }
}

function json(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
