// pages/chat/chat.js
const app = getApp();
const recorderManager = wx.getRecorderManager();

Page({
  data: {
    messages: [],
    inputText: '',
    typing: false,
    scrollTo: '',
  },

  onLoad() {
    this.loadHistory();
    app.on('newReplies', replies => this.onNewReplies(replies));
    this.setupRecorder();
  },

  loadHistory() {
    const history = wx.getStorageSync('chatHistory') || [];
    this.setData({ messages: history.slice(-50) });
    this.scrollBottom();
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  async sendText() {
    const text = this.data.inputText.trim();
    if (!text) return;
    this.setData({ inputText: '' });
    this.addMessage('me', text);
    this.setData({ typing: true });
    try {
      await app.request('/send', 'POST', {
        openid: app.globalData.openid,
        type: 'text',
        content: text,
      });
    } catch {
      wx.showToast({ title: '发送失败', icon: 'error' });
      this.setData({ typing: false });
    }
  },

  onNewReplies(replies) {
    this.setData({ typing: false });
    replies.forEach(r => this.addMessage('nana', r.message));
  },

  addMessage(from, message) {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      from,
      message,
      timeStr: formatTime(Date.now()),
    };
    const messages = [...this.data.messages, msg].slice(-100);
    this.setData({ messages, scrollTo: `msg-${msg.id}` });
    wx.setStorageSync('chatHistory', messages);
  },

  scrollBottom() {
    const msgs = this.data.messages;
    if (msgs.length > 0) {
      this.setData({ scrollTo: `msg-${msgs[msgs.length-1].id}` });
    }
  },

  setupRecorder() {
    recorderManager.onStop(async ({ tempFilePath }) => {
      // 语音转文字
      wx.showLoading({ title: '识别中...' });
      try {
        const { result } = await new Promise((res, rej) =>
          wx.cloud?.translateVoice
            ? wx.cloud.translateVoice({ filePath: tempFilePath, success: res, fail: rej })
            : rej('no cloud')
        );
        wx.hideLoading();
        if (result) {
          this.setData({ inputText: result });
        }
      } catch {
        wx.hideLoading();
        // 直接发语音文件描述
        await app.request('/send', 'POST', {
          openid: app.globalData.openid,
          type: 'voice',
          content: '[语音消息]',
        });
      }
    });
  },

  startVoice() {
    recorderManager.start({ duration: 60000, format: 'mp3' });
    wx.showToast({ title: '录音中...', icon: 'loading', duration: 60000 });
  },

  stopVoice() {
    recorderManager.stop();
    wx.hideToast();
  },
});

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
