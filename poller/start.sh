#!/bin/bash
# 启动 miniapp-poller
export WORKER_URL="https://claw-miniapp-worker.luckyalex9556.workers.dev"
export WORKER_TOKEN="60892eb441f9e832ddab0832b486a1b88fc5d19d6539615c"
export OPENCLAW_URL="http://127.0.0.1:18789"
export OPENCLAW_TOKEN="60892eb441f9e832ddab0832b486a1b88fc5d19d6539615c"
export POLL_INTERVAL="5000"

exec node /home/liroot/github_repos/claw-miniapp/poller/miniapp-poller.js
