/**
 * Cloudflare Worker - claw-miniapp bridge
 *
 * 路由：
 * POST /send      - 小程序发消息（存 KV，娜娜轮询拉取）
 * GET  /pending   - 娜娜拉取待处理消息
 * POST /ack       - 娜娜确认已处理消息
 * POST /push      - 娜娜推送回复到 KV
 * GET  /messages  - 小程序轮询拉取娜娜回复
 * GET  /health    - 健康检查
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      if (path === '/health') return json({ ok: true, ts: Date.now() }, cors);
      if (path === '/send'    && request.method === 'POST') return handleSend(request, env, cors);
      if (path === '/pending' && request.method === 'GET')  return handlePending(request, env, cors);
      if (path === '/ack'     && request.method === 'POST') return handleAck(request, env, cors);
      if (path === '/push'    && request.method === 'POST') return handlePush(request, env, cors);
      if (path === '/messages'&& request.method === 'GET')  return handlePoll(request, env, cors);
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: e.message }, cors, 500);
    }
  }
};

// ── 小程序发消息 → 只存 KV ──────────────────────────────────────────────────
async function handleSend(request, env, cors) {
  const body = await request.json();
  const { openid, type, content, extra } = body;
  if (!openid || !content) return json({ error: 'missing openid or content' }, cors, 400);

  const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    msgId, openid,
    type: type || 'text',
    content,
    extra: extra || {},
    ts: Date.now(),
  };

  // 存入待处理队列
  await env.MESSAGES.put(`pending:${msgId}`, JSON.stringify(payload), { expirationTtl: 86400 });

  // 维护该用户的 pending 索引
  const idxKey = `pending_idx:${openid}`;
  const raw = await env.MESSAGES.get(idxKey);
  const idx = raw ? JSON.parse(raw) : [];
  idx.push(msgId);
  await env.MESSAGES.put(idxKey, JSON.stringify(idx.slice(-100)), { expirationTtl: 86400 });

  // 维护全局用户列表（供 /pending 不传 openid 时使用）
  const globalRaw = await env.MESSAGES.get('global_pending_users');
  const users = globalRaw ? JSON.parse(globalRaw) : [];
  if (!users.includes(openid)) {
    users.push(openid);
    await env.MESSAGES.put('global_pending_users', JSON.stringify(users), { expirationTtl: 86400 });
  }

  return json({ ok: true, msgId }, cors);
}

// ── 娜娜拉取待处理消息 ────────────────────────────────────────────────────────
async function handlePending(request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.OPENCLAW_TOKEN}`) return json({ error: 'unauthorized' }, cors, 401);

  const url = new URL(request.url);
  const openid = url.searchParams.get('openid'); // 可选，不传则拉所有用户

  let pending = [];

  if (openid) {
    pending = await fetchPendingForUser(openid, env);
  } else {
    // 拉全局索引（所有用户）
    const globalRaw = await env.MESSAGES.get('global_pending_users');
    const users = globalRaw ? JSON.parse(globalRaw) : [];
    for (const uid of users) {
      const msgs = await fetchPendingForUser(uid, env);
      pending.push(...msgs);
    }
  }

  return json({ ok: true, pending, ts: Date.now() }, cors);
}

async function fetchPendingForUser(openid, env) {
  const idxKey = `pending_idx:${openid}`;
  const raw = await env.MESSAGES.get(idxKey);
  if (!raw) return [];
  const ids = JSON.parse(raw);
  const msgs = [];
  for (const id of ids) {
    const m = await env.MESSAGES.get(`pending:${id}`);
    if (m) msgs.push(JSON.parse(m));
  }
  return msgs;
}

// ── 娜娜确认已处理，清除 pending ─────────────────────────────────────────────
async function handleAck(request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.OPENCLAW_TOKEN}`) return json({ error: 'unauthorized' }, cors, 401);

  const { openid, msgIds } = await request.json();
  if (!openid || !msgIds?.length) return json({ error: 'missing params' }, cors, 400);

  // 删除各条消息
  for (const id of msgIds) {
    await env.MESSAGES.delete(`pending:${id}`);
  }

  // 更新索引
  const idxKey = `pending_idx:${openid}`;
  const raw = await env.MESSAGES.get(idxKey);
  const idx = raw ? JSON.parse(raw) : [];
  const newIdx = idx.filter(id => !msgIds.includes(id));
  if (newIdx.length > 0) {
    await env.MESSAGES.put(idxKey, JSON.stringify(newIdx), { expirationTtl: 86400 });
  } else {
    await env.MESSAGES.delete(idxKey);
  }

  return json({ ok: true }, cors);
}

// ── 娜娜推送回复 → 存 KV ─────────────────────────────────────────────────────
async function handlePush(request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.OPENCLAW_TOKEN}`) return json({ error: 'unauthorized' }, cors, 401);

  const { openid, message, type } = await request.json();
  if (!openid || !message) return json({ error: 'missing params' }, cors, 400);

  const key = `reply:${openid}`;
  const raw = await env.MESSAGES.get(key);
  const replies = raw ? JSON.parse(raw) : [];
  replies.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: type || 'text',
    message,
    ts: Date.now(),
  });
  await env.MESSAGES.put(key, JSON.stringify(replies.slice(-50)), { expirationTtl: 7 * 86400 });

  return json({ ok: true }, cors);
}

// ── 小程序轮询拉回复 ──────────────────────────────────────────────────────────
async function handlePoll(request, env, cors) {
  const url = new URL(request.url);
  const openid = url.searchParams.get('openid');
  const since = parseInt(url.searchParams.get('since') || '0');
  if (!openid) return json({ error: 'missing openid' }, cors, 400);

  const raw = await env.MESSAGES.get(`reply:${openid}`);
  const replies = raw ? JSON.parse(raw) : [];
  const newReplies = replies.filter(r => r.ts > since);

  return json({ ok: true, replies: newReplies, ts: Date.now() }, cors);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function json(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
