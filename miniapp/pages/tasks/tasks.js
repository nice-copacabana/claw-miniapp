// pages/tasks/tasks.js
const app = getApp();

Page({
  data: {
    tasks: [],
    loading: false,
    newTask: '',
    submitting: false,
  },

  onLoad() { this.refresh(); },
  onShow() { this.refresh(); },
  onTaskInput(e) { this.setData({ newTask: e.detail.value }); },

  async refresh() {
    this.setData({ loading: true });
    try {
      const res = await app.request('/tasks', 'GET');
      const tasks = (res.tasks || []).map(t => ({
        ...t,
        statusText: { running: '运行中', done: '已完成', failed: '失败' }[t.status] || t.status,
        timeStr: formatTime(t.startedAt),
      }));
      this.setData({ tasks });
    } catch {
      wx.showToast({ title: '获取失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async submitTask() {
    const task = this.data.newTask.trim();
    if (!task) return wx.showToast({ title: '请输入任务描述', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await app.request('/send', 'POST', {
        openid: app.globalData.openid,
        type: 'task',
        content: task,
      });
      wx.showToast({ title: '任务已提交 ✓', icon: 'success' });
      this.setData({ newTask: '' });
      setTimeout(() => this.refresh(), 2000);
    } catch {
      wx.showToast({ title: '提交失败', icon: 'error' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
