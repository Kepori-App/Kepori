(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('apply-dialog');
  let likes = '20', reward = '1 个月 Pro', active = false;
  let status = '正在确认活动状态…';
  let checking = false;

  function update() {
    $('campaign-state').textContent = status;
    $('apply-label').textContent = active ? '申请奖励' : '查看联系方式';
    $('copy-message').disabled = !active;
    $('dialog-description').textContent = active
      ? `联系我们并提供以下材料，申请 ${reward}。`
      : `${status}可以先保存联系方式，暂不受理本活动申请。`;
    $('likes-check').textContent = `${likes} 赞以上的截图`;
  }

  async function checkStatus() {
    if (checking) return;
    checking = true;
    active = false;
    status = '正在确认活动状态…';
    update();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/campaigns/current.json', {
        cache: 'no-store', credentials: 'omit', signal: controller.signal
      });
      if (!response.ok) throw new Error('Unavailable');
      const config = await response.json();
      if (config.schemaVersion !== 1 || !('campaign' in config)) throw new Error('Invalid configuration');
      const c = config.campaign;
      status = '活动尚未开始。';
      if (c && c.id === 'share-pro') {
        const url = new URL(c.url);
        const start = c.startsAt ? Date.parse(c.startsAt) : 0;
        const end = Date.parse(c.endsAt);
        if (url.origin !== 'https://kepori.app' || url.pathname !== '/campaigns/share/'
          || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          throw new Error('Invalid campaign');
        }
        const now = Date.now();
        active = now >= start && now < end;
        status = active ? '核验后发放奖励' : now >= end ? '活动已结束。' : '活动尚未开始。';
      }
    } catch {
      status = '暂时无法确认活动状态，请联网后重试。';
    } finally {
      clearTimeout(timer);
      checking = false;
      update();
    }
  }

  document.querySelectorAll('.reward').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('.reward').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      likes = button.dataset.likes;
      reward = button.dataset.reward;
      $('target-title').textContent = `目标：${reward}`;
      $('target-caption').textContent = `单篇作品达到 ${likes} 赞`;
      $('announcement').textContent = `已选择 ${reward}，需要 ${likes} 赞`;
      update();
    };
  });
  $('apply').onclick = () => {
    $('contact-feedback').textContent = '';
    $('contact-value').hidden = true;
    update();
    dialog.showModal();
    checkStatus();
  };
  $('close-dialog').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });

  async function copy(text, success) {
    const field = $('contact-value');
    field.hidden = true;
    try {
      await navigator.clipboard.writeText(text);
      $('contact-feedback').textContent = success;
    } catch {
      field.value = text;
      field.hidden = false;
      field.focus();
      field.select();
      $('contact-feedback').textContent = '无法自动复制，请长按下方文字复制。';
    }
  }
  document.querySelectorAll('[data-contact]').forEach(button => {
    button.onclick = () => copy(button.dataset.contact, '已复制，请前往邮箱或 QQ 联系我们。');
  });
  $('copy-message').onclick = () => {
    if (!active) return;
    copy(`你好，我想申请 Kepori 分享活动的 ${reward} 奖励。\n我的作品已达到 ${likes} 赞。\n作品链接：\n我会一并提供点赞截图。`, '申请说明已复制，请补充作品链接并附上截图。');
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkStatus();
  });
  window.addEventListener('online', checkStatus);
  setInterval(() => { if (!document.hidden) checkStatus(); }, 60000);
  checkStatus();
})();
