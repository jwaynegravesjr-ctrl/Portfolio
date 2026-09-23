import { initSiteInk } from './site-ink';

/** Accessible ink formation, margin leaves, motion preference, and report dialog. */
export function initSiteEffects(): { dispose(): void } {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector<HTMLButtonElement>('#motion-toggle');
  const leafCanvas = document.querySelector<HTMLCanvasElement>('#falling-leaves');
  const leafContext = leafCanvas?.getContext('2d');
  const dialog = document.querySelector<HTMLDialogElement>('#report-dialog');
  const reportImage = document.querySelector<HTMLImageElement>('#report-image');
  const reportTitle = document.querySelector<HTMLElement>('#report-title');
  const closeReport = document.querySelector<HTMLButtonElement>('#close-report');
  const reportButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-report]')];
  const resumeDialog = document.querySelector<HTMLDialogElement>('#resume-dialog');
  const resumeFrame = document.querySelector<HTMLIFrameElement>('#resume-frame');
  const closeResume = document.querySelector<HTMLButtonElement>('#close-resume');
  const resumeLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-resume-view]')];
  const disposers: Array<() => void> = [];
  let explicit: boolean | undefined;
  try {
    const stored = localStorage.getItem('shared-perch-motion');
    if (stored === 'on' || stored === 'off') explicit = stored === 'on';
  } catch { /* Private storage does not prevent use of the page. */ }
  let enabled = explicit ?? !preference.matches;
  let viewportWidth = innerWidth, viewportHeight = innerHeight;
  let leafFrame = 0, disposed = false, opener: HTMLElement | null = null;
  const ink = initSiteInk(enabled);

  function listen(target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn, options);
    disposers.push(() => target.removeEventListener(type, fn, options));
  }

  function resize() {
    viewportWidth = innerWidth; viewportHeight = innerHeight;
    if (leafCanvas && leafContext) {
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      leafCanvas.width = Math.round(viewportWidth * scale);
      leafCanvas.height = Math.round(viewportHeight * scale);
      leafContext.setTransform(scale, 0, 0, scale, 0, 0);
    }
  }

  function leaf(time: number, identity: number) {
    if (!leafContext) return;
    const cycle = (time + identity * 9) % 27, duration = 12.7;
    if (cycle > duration) return;
    const travel = cycle / duration, side = identity % 2 === 0 ? -1 : 1;
    const margin = Math.max(10, Math.min(45, viewportWidth * .025));
    const drift = Math.sin(travel * Math.PI * 3 + identity) * margin * .36;
    const x = side < 0 ? margin + drift : viewportWidth - margin - drift;
    const y = -35 + travel * (viewportHeight + 85);
    const angle = Math.sin(travel * Math.PI * 3.3 + identity) * .65 + side * .3;
    const alpha = .35 * Math.min(1, travel * 7, (1 - travel) * 7);
    leafContext.save(); leafContext.translate(x, y); leafContext.rotate(angle);
    leafContext.scale(.7 + identity * .08, .85); leafContext.globalAlpha = Math.max(0, alpha);
    leafContext.strokeStyle = '#53432f'; leafContext.fillStyle = '#8b7759'; leafContext.lineWidth = .8;
    leafContext.beginPath();
    leafContext.moveTo(0, 17); leafContext.bezierCurveTo(-4, 8, -14, 5, -11, -5);
    leafContext.bezierCurveTo(-8, -12, -2, -12, 3, -23); leafContext.bezierCurveTo(5, -12, 12, -8, 11, 0);
    leafContext.bezierCurveTo(10, 8, 2, 8, 0, 17); leafContext.closePath();
    leafContext.globalAlpha *= .25; leafContext.fill(); leafContext.globalAlpha /= .25; leafContext.stroke();
    leafContext.beginPath(); leafContext.moveTo(-1, 23); leafContext.quadraticCurveTo(2, 3, 3, -17);
    leafContext.moveTo(1, 6); leafContext.lineTo(-6, -1); leafContext.moveTo(2, -1); leafContext.lineTo(8, -6);
    leafContext.moveTo(2, -7); leafContext.lineTo(-5, -11); leafContext.stroke(); leafContext.restore();
  }

  function animateLeaves(now: number) {
    leafFrame = 0;
    if (disposed || !enabled || document.hidden || !leafContext) return;
    leafContext.clearRect(0, 0, viewportWidth, viewportHeight);
    if (scrollY > viewportHeight * .3) for (let i = 0; i < 3; i++) leaf(now / 1000, i);
    leafFrame = requestAnimationFrame(animateLeaves);
  }

  function syncMotion() {
    root.dataset.motion = enabled ? 'on' : 'off';
    motionButton?.setAttribute('aria-pressed', String(enabled));
    if (motionButton) motionButton.textContent = enabled ? 'Motion on' : 'Motion off';
    if (leafFrame) cancelAnimationFrame(leafFrame);
    leafFrame = 0; leafContext?.clearRect(0, 0, viewportWidth, viewportHeight);
    ink.setMotionEnabled(enabled);
    if (enabled && !document.hidden) leafFrame = requestAnimationFrame(animateLeaves);
    window.dispatchEvent(new CustomEvent('perch:motion', { detail: { enabled } }));
  }

  function close() { dialog?.close(); }
  reportButtons.forEach(button => listen(button, 'click', () => {
    const source = button.dataset.report;
    if (!dialog || !reportImage || !source) return;
    reportImage.src = source; reportImage.alt = button.dataset.title ?? 'Synthetic genetics governance report';
    if (reportTitle) reportTitle.textContent = button.dataset.title ?? 'Report preview';
    opener = button; dialog.showModal(); closeReport?.focus();
  }));
  if (closeReport) listen(closeReport, 'click', close);
  if (dialog) {
    listen(dialog, 'click', event => {
      if (event.target !== dialog) return;
      const pointer = event as MouseEvent, bounds = dialog.getBoundingClientRect();
      if (pointer.clientX < bounds.left || pointer.clientX > bounds.right || pointer.clientY < bounds.top || pointer.clientY > bounds.bottom) close();
    });
    listen(dialog, 'close', () => { opener?.focus(); opener = null; });
  }
  let resumeOpener: HTMLAnchorElement | null = null;
  resumeLinks.forEach(link => listen(link, 'click', event => {
    if (!resumeDialog || !resumeFrame || typeof resumeDialog.showModal !== 'function') return;
    event.preventDefault();
    resumeOpener = link;
    resumeFrame.src = link.href;
    resumeDialog.showModal();
    closeResume?.focus();
  }));
  if (closeResume) listen(closeResume, 'click', () => resumeDialog?.close());
  if (resumeDialog) {
    listen(resumeDialog, 'click', event => {
      if (event.target !== resumeDialog) return;
      const pointer = event as MouseEvent, bounds = resumeDialog.getBoundingClientRect();
      if (pointer.clientX < bounds.left || pointer.clientX > bounds.right || pointer.clientY < bounds.top || pointer.clientY > bounds.bottom) resumeDialog.close();
    });
    listen(resumeDialog, 'close', () => {
      if (resumeFrame) resumeFrame.src = 'about:blank';
      resumeOpener?.focus(); resumeOpener = null;
    });
  }
  listen(window, 'resize', resize, { passive: true });
  listen(document, 'visibilitychange', () => {
    if (leafFrame) cancelAnimationFrame(leafFrame);
    leafFrame = 0;
    if (enabled && !document.hidden) leafFrame = requestAnimationFrame(animateLeaves);
  });
  listen(preference, 'change', () => { if (explicit === undefined) { enabled = !preference.matches; syncMotion(); } });
  if (motionButton) listen(motionButton, 'click', () => {
    enabled = !enabled; explicit = enabled;
    try { localStorage.setItem('shared-perch-motion', enabled ? 'on' : 'off'); } catch { /* Optional preference persistence. */ }
    syncMotion();
  });
  resize(); syncMotion();
  return { dispose() {
    disposed = true; if (leafFrame) cancelAnimationFrame(leafFrame); leafFrame = 0;
    disposers.forEach(remove => remove()); ink.dispose(); leafContext?.clearRect(0, 0, viewportWidth, viewportHeight);
  } };
}
