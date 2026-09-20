/* Only public campaign content. No analytics, cookies, native bridge, or HTML injection. */
const requestedLanguage = new URLSearchParams(location.search).get('lang');
const language = (requestedLanguage ?? navigator.language).startsWith('zh') ? 'zhHans' : 'en';
const labels = language === 'zhHans'
  ? { loading: '正在加载活动…', empty: '暂无进行中的活动', failed: '活动暂时无法打开，请稍后重试。', retry: '重试' }
  : { loading: 'Loading activity…', empty: 'No active activity', failed: 'Activity unavailable. Please try again.', retry: 'Retry' };
document.documentElement.lang = language === 'zhHans' ? 'zh-Hans' : 'en';
const status = document.getElementById('status');
const article = document.getElementById('campaign');
const retry = document.getElementById('retry');
retry.textContent = labels.retry;
retry.addEventListener('click', load);
let deadline;
let loading = false;

function showEmpty() {
  article.hidden = true;
  status.hidden = false;
  status.textContent = labels.empty;
  document.title = 'Kepori';
}

async function load() {
  if (loading) return;
  loading = true;
  clearTimeout(deadline);
  retry.hidden = true;
  article.hidden = true;
  status.hidden = false;
  status.textContent = labels.loading;
  try {
    const response = await fetch('/campaigns/current.json', { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Unavailable');
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 65536) throw new Error('Oversized');
    const manifest = JSON.parse(text);
    if (manifest.schemaVersion !== 1) throw new Error('Unsupported');
    const campaign = manifest.campaign;
    const now = Date.now();
    if (!campaign) { showEmpty(); return; }
    const end = Date.parse(campaign.endsAt);
    const start = campaign.startsAt ? Date.parse(campaign.startsAt) : -Infinity;
    if (!Number.isFinite(end) || Number.isNaN(start)) throw new Error('Invalid dates');
    if (now < start || now >= end) { showEmpty(); return; }
    const title = campaign.titles?.[language];
    const content = campaign.content?.[language];
    if (typeof title !== 'string' || !Array.isArray(content?.paragraphs)
        || !content.paragraphs.every(value => typeof value === 'string')) throw new Error('Invalid content');
    document.getElementById('title').textContent = title;
    document.title = `${title} · Kepori`;
    const paragraphs = content.paragraphs.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    });
    document.getElementById('body').replaceChildren(...paragraphs);
    const image = document.getElementById('image');
    image.hidden = true;
    image.removeAttribute('src');
    if (campaign.image) {
      const url = new URL(campaign.image, location.origin);
      if (url.origin !== location.origin || url.protocol !== 'https:') throw new Error('Invalid image');
      image.src = url.href;
      image.alt = content.imageAlt ?? '';
      image.hidden = false;
    }
    status.hidden = true;
    article.hidden = false;
    // Only expire the current content; do not replace an active reading session with a new campaign.
    const expire = () => {
      if (Date.now() >= end) showEmpty();
      else deadline = setTimeout(expire, Math.min(end - Date.now(), 2147483647));
    };
    expire();
  } catch {
    status.hidden = false;
    status.textContent = labels.failed;
    retry.hidden = false;
  } finally { loading = false; }
}
load();
