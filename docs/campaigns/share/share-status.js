// Anonymous same-origin configuration. No claims, identities or entitlements are sent.
export function campaignSnapshot(payload, now = Date.now()) {
  const unavailable = { state: 'Unavailable', campaign: null };
  if (payload?.schemaVersion !== 1) return unavailable;
  const c = payload.campaign;
  if (c === null) return { state: 'Draft', campaign: null };
  if (!c || c.id !== 'share-pro') return unavailable;
  let url;
  try { url = new URL(c.url); } catch { return unavailable; }
  if (url.origin !== 'https://kepori.app' || url.pathname !== '/campaigns/share/'
    || url.username || url.password || url.search || url.hash) return unavailable;
  for (const locale of ['zhHans', 'en']) {
    const title = c.titles?.[locale];
    if (typeof title !== 'string' || !title.trim() || [...title].length > 60
      || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) return unavailable;
  }
  if (typeof c.endsAt !== 'string' || !Number.isFinite(Date.parse(c.endsAt))) return unavailable;
  const end = Date.parse(c.endsAt);
  const start = c.startsAt === undefined ? -Infinity : Date.parse(c.startsAt);
  if ((c.startsAt !== undefined && (typeof c.startsAt !== 'string' || !Number.isFinite(start)))
    || start >= end) return unavailable;
  if (now >= end) return { state: 'Ended', campaign: c };
  if (now < start) return { state: 'Scheduled', campaign: c };
  return { state: 'Active', campaign: c };
}

export function createCampaignMonitor(onChange) {
  let payload;
  let snapshot = { state: 'Loading', campaign: null };
  let boundaryTimer;
  let interval;
  let controller;
  let pending;
  let revision = 0;
  let running = false;

  function publish(value) {
    snapshot = value;
    onChange(value);
    clearTimeout(boundaryTimer);
    if (!running || !value.campaign) return;
    const now = Date.now();
    const next = value.state === 'Scheduled' ? Date.parse(value.campaign.startsAt)
      : value.state === 'Active' ? Date.parse(value.campaign.endsAt) : null;
    if (next !== null) boundaryTimer = setTimeout(recheck, Math.min(Math.max(1, next - now), 2147483647));
  }

  function recheck() {
    if (payload !== undefined) publish(campaignSnapshot(payload));
    return snapshot;
  }

  async function refresh() {
    if (!running || document.hidden) return;
    if (pending) return pending;
    const current = ++revision;
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    pending = (async () => {
      try {
        const response = await fetch('/campaigns/current.json', {
          cache: 'no-store', credentials: 'omit', redirect: 'error', signal: requestController.signal
        });
        if (!response.ok) throw new Error('Configuration unavailable');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 65536) throw new Error('Configuration too large');
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (current !== revision || !running) return;
        if (requestController.signal.aborted) throw new Error('Configuration timed out');
        const next = campaignSnapshot(value);
        payload = next.state === 'Unavailable' ? undefined : value;
        publish(next);
      } catch {
        if (current !== revision || !running) return;
        payload = undefined;
        publish({ state: 'Unavailable', campaign: null });
      } finally {
        clearTimeout(timeout);
        if (current === revision) { controller = null; pending = null; }
      }
    })();
    return pending;
  }

  function suspend() {
    running = false;
    revision += 1;
    controller?.abort();
    controller = null;
    pending = null;
    clearTimeout(boundaryTimer);
    clearInterval(interval);
  }

  function resume() {
    if (running || document.hidden) return;
    running = true;
    recheck();
    interval = setInterval(() => { recheck(); void refresh(); }, 60000);
    void refresh();
  }

  const onVisibility = () => { if (document.hidden) suspend(); else resume(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', refresh);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume);
  resume();
  return {
    recheck, refresh,
    stop() {
      suspend();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', refresh);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
    }
  };
}
