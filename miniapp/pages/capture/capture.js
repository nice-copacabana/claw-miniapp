// pages/capture/capture.js
const app = getApp();

Page({
  data: {
    url: '', urlTitle: '',
    imageUrl: '', imageNote: '',
    note: '',
    sending: false, sendingImg: false, sendingNote: false,
  },

  // 接收微信分享过来的链接（onShareAppMessage 反向：从其他app分享到小程序）
  onLoad(options) {
    // 从分享链接进入时，options.q 或 options.url 可能带有链接
    if (options.url) this.setData({ url: decodeURIComponent(options.url) });
    if (options.title) this.setData({ urlTitle: decodeURIComponent(options.title) });
  },

  onUrlInput(e) { this.setData({ url: e.detail.value }); },
  onTitleInput(e) { this.setData({ urlTitle: e.detail.value }); },
  onImageNoteInput(e) { this.setData({ imageNote: e.detail.value }); },
  onNoteInput(e) { this.setData({ note: e.detail.value }); },

  async sendLink() {
    const { url, urlTitle } = this.data;
    if (!url.trim()) return wx.showToast({ title: '请输入链接', icon: 'none' });
    this.setData({ sending: true });
    try {
      await app.request('/send', 'POST', {
        openid: app.globalData.openid,
        type: 'link',
        content: url.trim(),
        extra: { title: urlTitle },
      });
      wx.showToast({ title: '已发给娜娜 ✓', icon: 'success' });
      this.setData({ url: '', urlTitle: '' });
    } catch {
      wx.showToast({ title: '发送失败', icon: 'error' });
    } finally {
      this.setData({ sending: false });
    }
  },

  pickImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: ({ tempFiles }) => {
        this.setData({ imageUrl: tempFiles[0].tempFilePath });
      },
    });
  },

  async sendImage() {
    const { imageUrl, imageNote } = this.data;
    if (!imageUrl) return;
    this.setData({ sendingImg: true });
    try {
      // 上传图片到 Worker，拿到 URL
      const { url: uploadedUrl } = await new Promise((res, rej) =>
        wx.uploadFile({
          url: `${app.globalData.workerUrl}/upload`,
          filePath: imageUrl,
          name: 'file',
          success: r => res(JSON.parse(r.data)),
          fail: rej,
        })
      );
      await app.request('/send', 'POST', {
        openid: app.globalData.openid,
        type: 'image',
        content: uploadedUrl,
        extra: { note: imageNote },
      });
      wx.showToast({ title: '已发给娜娜 ✓', icon: 'success' });
      this.setData({ imageUrl: '', imageNote: '' });
    } catch {
      wx.showToast({ title: '发送失败', icon: 'error' });
    } finally {
      this.setData({ sendingImg: false });
    }
  },

  async sendNote() {
    const { note } = this.data;
    if (!note.trim()) return wx.showToast({ title: '请输入内容', icon: 'none' });
    this.setData({ sendingNote: true });
    try {
      await app.request('/send', 'POST', {
        openid: app.globalData.openid,
        type: 'text',
        content: `[随手记] ${note.trim()}`,
      });
      wx.showToast({ title: '已发给娜娜 ✓', icon: 'success' });
      this.setData({ note: '' });
    } catch {
      wx.showToast({ title: '发送失败', icon: 'error' });
    } finally {
      this.setData({ sendingNote: false });
    }
  },
});
