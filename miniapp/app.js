// app.js
const WORKER_URL = 'https://claw-miniapp-worker.luckyalex9556.workers.dev';

App({
  globalData: {
    workerUrl: WORKER_URL,
    openid: '',
    lastPollTs: 0,
  },

  onLaunch() {
    this.initUser();
    this.startPolling();
  },

  // 获取用户标识（本地生成稳定 ID，无需后端登录接口）
  initUser() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      // 首次启动生成一个本地唯一 ID
      openid = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      wx.setStorageSync('openid', openid);
    }
    this.globalData.openid = openid;
  },

  // 全局轮询娜娜回复（30秒一次）
  startPolling() {
    setInterval(() => this.pollReplies(), 30000);
  },

  async pollReplies() {
    const openid = this.globalData.openid;
    if (!openid) return;
    try {
      const res = await this.request(
        `/messages?openid=${openid}&since=${this.globalData.lastPollTs}`,
        'GET'
      );
      if (res.replies?.length > 0) {
        this.globalData.lastPollTs = res.ts;
        // 通知所有页面有新消息
        this.emit('newReplies', res.replies);
      }
    } catch (e) { /* 静默失败 */ }
  },

  // 简单事件总线
  _listeners: {},
  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); },
  emit(event, data) { (this._listeners[event] || []).forEach(fn => fn(data)); },

  // 统一请求方法
  request(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.globalData.workerUrl}${path}`,
        method,
        data,
        header: { 'Content-Type': 'application/json' },
        success: res => res.statusCode === 200 ? resolve(res.data) : reject(res),
        fail: reject,
      });
    });
  },
});
