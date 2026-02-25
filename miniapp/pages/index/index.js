// pages/index/index.js
const app = getApp();

Page({
  data: {
    online: false,
    messages: [],
  },

  onLoad() {
    this.checkHealth();
    this.loadRecentMessages();
    app.on('newReplies', replies => this.onNewReplies(replies));
  },

  onShow() {
    this.checkHealth();
  },

  async checkHealth() {
    try {
      const res = await app.request('/health');
      this.setData({ online: res.ok });
    } catch { this.setData({ online: false }); }
  },

  loadRecentMessages() {
    const cached = wx.getStorageSync('recentMessages') || [];
    this.setData({ messages: cached.slice(-10) });
  },

  onNewReplies(replies) {
    const msgs = this.data.messages.concat(
      replies.map(r => ({
        id: r.id,
        from: 'nana',
        message: r.message,
        timeStr: formatTime(r.ts),
      }))
    ).slice(-20);
    this.setData({ messages: msgs });
    wx.setStorageSync('recentMessages', msgs);
    wx.showTabBarRedDot({ index: 1 });
  },

  goChat() { wx.switchTab({ url: '/pages/chat/chat' }); },
  goCapture() { wx.switchTab({ url: '/pages/capture/capture' }); },
  goTasks() { wx.switchTab({ url: '/pages/tasks/tasks' }); },

  quickNote() {
    wx.showModal({
      title: '随手记',
      editable: true,
      placeholderText: '说点什么...',
      success: async ({ confirm, content }) => {
        if (confirm && content) {
          await app.request('/send', 'POST', {
            openid: app.globalData.openid,
            type: 'text',
            content: `[随手记] ${content}`,
          });
          wx.showToast({ title: '已发给娜娜', icon: 'success' });
        }
      },
    });
  },
});

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
