# 部署指南

## 前置条件
- 微信小程序开发者账号（AppID + AppSecret）
- Cloudflare 账号（免费）
- Node.js 18+

## 第一步：部署 Cloudflare Worker

```bash
cd worker
npm install

# 创建 KV 命名空间
npx wrangler kv:namespace create MESSAGES
# 把输出的 id 填入 wrangler.toml 的 id 字段

# 设置敏感环境变量
npx wrangler secret put OPENCLAW_URL      # 如: https://your-server:18789
npx wrangler secret put OPENCLAW_TOKEN    # OpenClaw gateway token
npx wrangler secret put WX_APPID          # 小程序 AppID
npx wrangler secret put WX_APPSECRET      # 小程序 AppSecret

# 部署
npx wrangler deploy
```

部署成功后会得到 Worker URL，格式：
`https://claw-miniapp-worker.YOUR_SUBDOMAIN.workers.dev`

## 第二步：配置小程序

1. 打开 `miniapp/app.js`，把 `WORKER_URL` 改为你的 Worker URL
2. 打开微信开发者工具，导入 `miniapp/` 目录
3. 填入你的 AppID
4. 在「开发设置」→「服务器域名」里添加 Worker URL 为合法域名

## 第三步：配置 OpenClaw

在 `openclaw.json` 里添加 miniapp webhook 接收：

```json
{
  "webhooks": {
    "miniapp": {
      "enabled": true,
      "path": "/webhook/miniapp",
      "secret": "YOUR_OPENCLAW_TOKEN"
    }
  }
}
```

重启 OpenClaw：`openclaw gateway restart`

## 第四步：测试

1. 微信开发者工具里预览小程序
2. 在「对话」页发一条消息
3. 检查 Telegram 是否收到转发
4. 在 Telegram 回复，检查小程序是否收到

## 公众号文章转发流程

手机微信看到文章 → 点右上角「...」→「复制链接」→ 打开小程序「捕捉」页 → 粘贴链接 → 发给娜娜

后续：配置小程序为「分享目标」后，可以直接从微信分享菜单选择本小程序，无需手动复制粘贴。
