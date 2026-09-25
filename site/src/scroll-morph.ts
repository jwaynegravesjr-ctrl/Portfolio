import { ease, progress } from './numbers';
import { createHeaderInk } from './header-ink';
import { createTopBirds } from './top-birds';

/** The normal-flow banner yields to the original inked navigation as it scrolls away. */
export function initScrollMorph() {
  const hero = document.getElementById('hero')!;
  const header = document.getElementById('masthead')!;
  const copy = document.getElementById('masthead-copy')!;
  const inkHeader = createHeaderInk(header, copy);
  const topBirds = createTopBirds(header);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'perch-morph'; svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position:'fixed', inset:'0 auto auto 0', pointerEvents:'none', overflow:'visible', zIndex:'72' });
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('fill','none'); line.setAttribute('stroke','#272a25');
  line.setAttribute('stroke-width','1.3'); line.setAttribute('stroke-linecap','round');
  svg.append(line); document.body.append(svg);
  let queued = 0, enabled = document.documentElement.dataset.motion !== 'off';
  function update() {
    queued = 0;
    const p = ease(progress(scrollY, 0, Math.max(80, hero.offsetHeight * .85)));
    const scrolled = scrollY > 18;
    inkHeader.setWanted(scrolled, enabled);
    topBirds.setProgress(ease(progress(p, .32, 1)), enabled, scrolled);
    const wordmark = header.querySelector<HTMLElement>('.wordmark');
    const firstLink = header.querySelector<HTMLElement>('nav a');
    const mobile = innerWidth < 650, inset = mobile ? 4 : 10;
    const start = Math.max(0, (wordmark?.getBoundingClientRect().right ?? innerWidth * .4) + inset);
    const end = Math.max(start, (firstLink?.getBoundingClientRect().left ?? innerWidth * .6) - inset);
    const center = (start + end) / 2;
    const length = Math.max(0, Math.min(mobile ? end - start : 268, end - start));
    const y = mobile ? 43 : 52;
    line.setAttribute('d', `M${(center-length/2).toFixed(1)} ${y} Q${center.toFixed(1)} ${y-.8} ${(center+length/2).toFixed(1)} ${y}`);
    svg.style.opacity = String(p);
  }
  function layout() {
    document.documentElement.style.setProperty('--nav-height', `${innerWidth < 650 ? 58 : 70}px`);
    svg.setAttribute('viewBox', `0 0 ${innerWidth} 70`);
    svg.style.width = `${innerWidth}px`; svg.style.height = '70px';
    inkHeader.resize(); topBirds.resize(); update();
  }
  function schedule() { if (!queued) queued = requestAnimationFrame(update); }
  function motion(event: Event) { enabled = (event as CustomEvent<{enabled:boolean}>).detail.enabled; schedule(); }
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', layout);
  window.addEventListener('perch:motion', motion);
  layout();
  return { refresh:layout, dispose() {
    cancelAnimationFrame(queued); window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', layout); window.removeEventListener('perch:motion', motion);
    topBirds.dispose(); inkHeader.dispose(); svg.remove();
  }};
}
