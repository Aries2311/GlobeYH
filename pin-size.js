// pin-size.js  — central controller ng pin/logo size

// robust mobile detection
export function isMobile() {
  return (
    matchMedia('(max-width:768px)').matches ||
    matchMedia('(pointer:coarse)').matches ||
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

export function isEmbed() {
  const q = new URLSearchParams(location.search);
  const qEmbed = (q.get('embed') || '').toLowerCase();
  const noUI = (q.get('ui') || '') === '0' || (q.get('noui') || '') === '1';
  let inIframe = false; try { inIframe = self !== top; } catch { inIframe = true; }
  return inIframe || noUI || (qEmbed && qEmbed !== '0' && qEmbed !== 'false');
}

// compute size (px) with URL override support (?iconsize=48)
export function getPinSize() {
  const q = new URLSearchParams(location.search);
  const override = parseInt(q.get('iconsize') || '', 10);
  if (Number.isFinite(override)) return Math.max(12, Math.min(128, override));

  const mobile = isMobile();
  const embed = isEmbed();

  // defaults tuned for your project
  if (mobile && embed) return 36;      // maliit kapag embedded sa mobile
  if (mobile && !embed) return 40;
  if (!mobile && embed) return 52;     // desktop embed (kasalukuyang default mo)
  return 46;                           // desktop app (non-embed)
}

// notify on size changes (rotation / resize)
export function observePinSize(cb) {
  if (typeof cb !== 'function') return;
  let last = -1;
  const run = () => {
    const sz = getPinSize();
    if (sz !== last) { last = sz; cb(sz); }
  };
  run();
  const ro = new ResizeObserver(run);
  ro.observe(document.documentElement);
  addEventListener('resize', run);
  addEventListener('orientationchange', run);
}
