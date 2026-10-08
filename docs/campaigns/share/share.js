// Activity presentation and contact copying. Requests and expiry belong to share-status.js.
import { shareCopy } from './share-copy.js';
import { createCampaignMonitor } from './share-status.js';
const $ = id => document.getElementById(id);
const supported = Object.keys(shareCopy);
let lang = new URL(location.href).searchParams.get('lang') || 'zh-Hans';
if (lang === 'zh') lang = 'zh-Hans';
if (!supported.includes(lang)) lang = 'en';
let offer = 'month';
let copyRevision = 0;
let activity = { state: 'Loading', campaign: null };
let endDate = '2026-11-11T16:00:00Z';
const dialog = $('apply-dialog');
const format = (key, values = {}) => shareCopy[lang][key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
const number = value => new Intl.NumberFormat(lang).format(value);
const price = () => new Intl.NumberFormat(lang, { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(48);
const likes = () => number(offer === 'month' ? 20 : 50);
const reward = () => format(offer === 'month' ? 'monthRequest' : 'lifetimeRequest', { price: price() });

for (const code of supported) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = new Intl.DisplayNames([code], { type: 'language' }).of(code);
  $('language').append(option);
}

function render() {
  document.documentElement.lang = lang;
  document.title = format('pageTitle');
  $('language').value = lang;
  document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = format(el.dataset.copy); });
  document.querySelectorAll('[data-likes]').forEach(el => { el.textContent = format('likes', { likes: number(el.dataset.likes) }); });
  document.querySelectorAll('[data-step-title]').forEach(el => { el.textContent = shareCopy[lang].steps[el.dataset.stepTitle][0]; });
  document.querySelectorAll('[data-step-detail]').forEach(el => { el.textContent = shareCopy[lang].steps[el.dataset.stepDetail][1]; });
  for (const [id, values] of [['rules-list', shareCopy[lang].rules], ['ideas-list', shareCopy[lang].ideas]]) {
    $(id).replaceChildren(...values.map(value => {
      const item = document.createElement('li'); item.textContent = value; return item;
    }));
  }
  $('language').setAttribute('aria-label', format('languageLabel'));
  $('rewards').setAttribute('aria-label', format('groupLabel'));
  $('contacts').setAttribute('aria-label', format('contactGroup'));
  $('close-dialog').setAttribute('aria-label', format('closeLabel'));
  $('contact-value').setAttribute('aria-label', format('manualCopyLabel'));
  $('lifetime-price').textContent = price();
  const active = activity.state === 'Active';
  const status = format(`state${activity.state}`);
  $('campaign-state').textContent = status;
  const date = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date(Date.parse(endDate) - 1));
  $('deadline').textContent = format('deadline', { date });
  $('apply-label').textContent = format(active ? 'ctaActive' : 'ctaInactive');
  $('dialog-description').textContent = active ? format('dialogActive', { reward: reward() }) : format('dialogInactive', { status });
  $('likes-check').textContent = format('likesProof', { likes: likes() });
  $('copy-message').disabled = !active;
  $('retry').hidden = activity.state !== 'Unavailable';
}

function clearCopyFeedback() {
  copyRevision += 1;
  $('contact-feedback').textContent = '';
  $('contact-value').hidden = true;
  $('contact-value').value = '';
  $('announcement').textContent = '';
}

$('language').onchange = event => {
  lang = event.target.value;
  const url = new URL(location.href); url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  clearCopyFeedback();
  render();
};
document.querySelectorAll('[data-offer]').forEach(button => {
  button.onclick = () => {
    if (offer === button.dataset.offer) return;
    clearCopyFeedback();
    offer = button.dataset.offer;
    document.querySelectorAll('[data-offer]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
    $('announcement').textContent = format('selectedAnnouncement', { reward: reward(), likes: likes() });
  };
});
$('apply').onclick = () => {
  monitor.recheck();
  clearCopyFeedback();
  render();
  if (!dialog.open) dialog.showModal();
};
function closeContactDialog() {
  clearCopyFeedback();
  dialog.close();
}
$('close-dialog').onclick = closeContactDialog;
dialog.addEventListener('cancel', clearCopyFeedback);
dialog.addEventListener('close', () => {
  if (!dialog.open) clearCopyFeedback();
});
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeContactDialog();
});
async function copyText(text, successKey) {
  const revision = ++copyRevision;
  let timeout;
  $('contact-value').hidden = true;
  $('contact-feedback').textContent = format('copying');
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard timeout')), 2000);
      })
    ]);
    if (revision !== copyRevision || !dialog.open) return;
    $('contact-feedback').textContent = format(successKey);
  } catch {
    if (revision !== copyRevision || !dialog.open) return;
    const field = $('contact-value');
    field.value = text;
    field.hidden = false;
    field.focus();
    field.select();
    $('contact-feedback').textContent = format('copyFailed');
  } finally {
    clearTimeout(timeout);
  }
}
document.querySelectorAll('[data-contact]').forEach(button => {
  button.onclick = () => copyText(button.dataset.contact, button.dataset.success || 'copiedContact');
});
$('copy-message').onclick = () => {
  monitor.recheck();
  if (activity.state !== 'Active') return;
  void copyText(format('application', { reward: reward(), likes: likes() }), 'copiedMessage');
};
$('retry').onclick = () => void monitor.refresh();
const monitor = createCampaignMonitor(snapshot => {
  if (activity.state !== snapshot.state || activity.campaign?.endsAt !== snapshot.campaign?.endsAt) clearCopyFeedback();
  activity = snapshot;
  if (snapshot.campaign) endDate = snapshot.campaign.endsAt;
  render();
});
render();
