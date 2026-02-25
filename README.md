# claw-miniapp

私人助理微信小程序，接入 OpenClaw/娜娜。

## 功能
- 转发公众号/网页链接给娜娜处理
- 文字/语音直接对话
- 随手记录想法、待办
- 查看 agent 任务状态
- 接收娜娜主动推送

## 架构
```
微信小程序 → Cloudflare Worker → OpenClaw Webhook → 娜娜
```

## 目录结构
```
miniapp/        # 微信小程序前端（原生）
worker/         # Cloudflare Worker 中转服务
docs/           # 部署文档
```

## 部署
见 docs/DEPLOY.md
