#!/usr/bin/env node
/**
 * miniapp-poller.js
 * 定时从 Cloudflare Worker 拉取小程序用户消息，通过 OpenClaw /tools/invoke 注入 session，
 * 再把回复写回 Worker KV，供小程序轮询拉取。
 */

const WORKER_URL    = process.env.WORKER_URL    || 'https://claw-miniapp-worker.luckyalex9556.workers.dev';
const WORKER_TOKEN  = process.env.WORKER_TOKEN  || '';
const OPENCLAW_URL  = process.env.OPENCLAW_URL  || 'http://127.0.0.1:18789';
const OPENCLAW_TOKEN= process.env.OPENCLAW_TOKEN|| '';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000');

// 每个 openid 对应一个独立 session key，保持对话上下文
const sessionKeys = {};

// 本地去重缓存，防止同一条消息被重复处理（重启后清空，TTL 1小时）
const processedIds = new Map(); // msgId -> timestamp
const PROCESSED_TTL = 3600 * 1000;

function isProcessed(msgId) {
  const ts = processedIds.get(msgId);
  if (!ts) return false;
  if (Date.now() - ts > PROCESSED_TTL) { processedIds.delete(msgId); return false; }
  return true;
}
function markProcessed(msgId) { processedIds.set(msgId, Date.now()); }

function getSessionKey(openid) {
  if (!sessionKeys[openid]) {
    sessionKeys[openid] = `agent:main:miniapp:${openid}`;
  }
  return sessionKeys[openid];
}

async function ocInvoke(tool, args) {
  const res = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
    },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) throw new Error(`tools/invoke failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchPending() {
  const res = await fetch(`${WORKER_URL}/pending`, {
    headers: { Authorization: `Bearer ${WORKER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`pending fetch failed: ${res.status}`);
  const data = await res.json();
  return data.pending || [];
}

async function ackMessages(openid, msgIds) {
  await fetch(`${WORKER_URL}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_TOKEN}` },
    body: JSON.stringify({ openid, msgIds }),
  });
}

async function pushReply(openid, message) {
  await fetch(`${WORKER_URL}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_TOKEN}` },
    body: JSON.stringify({ openid, message, type: 'text' }),
  });
}

async function fetchUrlContent(url) {
  try {
    // 用 OpenClaw 的 web_fetch 工具抓取内容（支持 chrome-wrapper 绕过微信限制）
    const result = await ocInvoke('web_fetch', { url, extractMode: 'markdown', maxChars: 8000 });
    const text = result?.result?.content?.[0]?.text || result?.result?.details?.content || '';
    return text.trim() || null;
  } catch (e) {
    console.error('[poller] web_fetch failed:', e.message);
    return null;
  }
}

async function formatMessage(type, content, extra) {
  switch (type) {
    case 'link': {
      const title = extra?.title || '';
      // 先抓取链接内容
      const pageContent = await fetchUrlContent(content);
      if (pageContent) {
        return `[小程序分享链接] ${title}\n链接：${content}\n\n--- 页面内容 ---\n${pageContent}`;
      }
      return `[小程序分享链接] ${title}\n${content}`;
    }
    case 'voice': return `[语音转文字] ${content}`;
    case 'image': return `[图片] ${content}`;
    case 'task':  return `[任务指令] ${content}`;
    default:      return content;
  }
}

async function processMessage(msg) {
  const text = await formatMessage(msg.type, msg.content, msg.extra);
  const sessionKey = getSessionKey(msg.openid);

  // 通过 sessions_send 注入消息到 OpenClaw session，等待回复
  const result = await ocInvoke('sessions_send', {
    sessionKey,
    message: text,
    timeoutSeconds: 60,
  });

  // 从结果里提取回复文本
  // details.reply 是最直接的回复字段
  const reply = result?.result?.details?.reply;
  if (reply) {
    // 去掉 OpenClaw 内部的 reply tag
    return reply.replace(/\[\[reply_to[^\]]*\]\]/g, '').trim() || null;
  }
  // fallback: 解析 content[0].text 里的 JSON
  const contentText = result?.result?.content?.[0]?.text;
  if (contentText) {
    try {
      const parsed = JSON.parse(contentText);
      const r = parsed?.reply || '';
      return r.replace(/\[\[reply_to[^\]]*\]\]/g, '').trim() || null;
    } catch { return contentText.trim() || null; }
  }
  return null;
}

async function poll() {
  try {
    const pending = await fetchPending();
    if (pending.length === 0) return;

    console.log(`[poller] ${pending.length} pending message(s)`);

    // 按用户分组
    const byUser = {};
    for (const msg of pending) {
      (byUser[msg.openid] = byUser[msg.openid] || []).push(msg);
    }

    for (const [openid, msgs] of Object.entries(byUser)) {
      const toAck = [];
      for (const msg of msgs) {
        if (isProcessed(msg.msgId)) {
          toAck.push(msg.msgId); // 已处理过，直接 ack 清掉
          continue;
        }
        try {
          const reply = await processMessage(msg);
          markProcessed(msg.msgId);
          toAck.push(msg.msgId);
          if (reply) {
            await pushReply(openid, reply);
            console.log(`[poller] replied to ${openid.slice(0,8)}...: ${reply.slice(0, 60)}`);
          }
        } catch (e) {
          console.error(`[poller] failed to process msg ${msg.msgId}:`, e.message);
        }
      }
      if (toAck.length) await ackMessages(openid, toAck);
    }
  } catch (e) {
    console.error('[poller] error:', e.message);
  }
}

console.log(`[poller] started, interval=${POLL_INTERVAL}ms`);
poll();
setInterval(poll, POLL_INTERVAL);
