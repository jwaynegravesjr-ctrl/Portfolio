import { createInkFormation, type InkBlockSpec, type InkFormationApi, type InkLayerPlan, type InkSegment } from './ink-formation';

declare global { interface Window { siteInk?: Pick<InkFormationApi, 'replay' | 'pause' | 'play' | 'seek' | 'diagnostics' | 'dispose'> } }

const TEXT_DURATION = 1.6;
const TABLE_DURATION = 2.2;
const TEXT_TRIGGER_LINE = 1.04;
const TEXT_FINISH_LINE = .75;
const TABLE_TRIGGER_LINE = .8;

function tableRules(table: HTMLTableElement, selectors: string): InkSegment[] {
  const result: InkSegment[] = [];
  for (const cell of table.querySelectorAll<HTMLElement>(selectors)) {
    const style = getComputedStyle(cell);
    const width = Number.parseFloat(style.borderBottomWidth) || 0;
    if (width <= 0) continue;
    const rect = cell.getBoundingClientRect();
    const values = style.borderBottomColor.match(/[\d.]+/g)?.map(Number) ?? [];
    const hasAlpha = style.borderBottomColor.startsWith('rgba(') || style.borderBottomColor.includes('/');
    result.push({ x1: rect.left, x2: rect.right, y1: rect.bottom - width / 2, y2: rect.bottom - width / 2,
      width, alpha: hasAlpha ? (values.at(-1) ?? 1) : 1, color: style.borderBottomColor });
  }
  return result;
}

function tablePlans(wrapper: HTMLElement): InkLayerPlan[] {
  const table = wrapper.querySelector<HTMLTableElement>('table');
  if (!table) return [];
  const caption = table.querySelector<HTMLElement>('caption');
  const headings = table.querySelector<HTMLElement>('thead tr');
  const rows = [...table.querySelectorAll<HTMLElement>('tbody tr')];
  const plans: InkLayerPlan[] = [
    { sources: [], segments: tableRules(table, 'thead th,tbody th,tbody td'), start: 0, duration: .78, poolDiameter: 7.6, clipTo: wrapper },
  ];
  if (caption) plans.push({ sources: [caption], start: .18, duration: .67, poolDiameter: 6.8, clipTo: wrapper });
  if (headings) plans.push({ sources: [headings], start: .39, duration: .62, poolDiameter: 6.8, clipTo: wrapper });
  rows.forEach((row, index) => plans.push({ sources: [row], start: .72 + index * .215, duration: .62, poolDiameter: 5.8, clipTo: wrapper }));
  return plans;
}

function blockId(element: HTMLElement, index: number) {
  return element.dataset.inkId || element.id || `ink-${String(index + 1).padStart(3, '0')}`;
}

function makeBlocks(): InkBlockSpec[] {
  const elements = [...document.querySelectorAll<HTMLElement>('[data-ink]')]
    .filter(element => !element.closest('.sr-only,[hidden]'));
  return elements.map((element, index) => {
    const id = blockId(element, index);
    element.dataset.inkId ||= id;
    const isTable = element.matches('[data-ink-id="impact-table"],.table-wrap table');
    const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
    const poolDiameter = size >= 32 ? 11 : size <= 12 ? 5.8 : 6.4;
    const selector = element.id ? `#${CSS.escape(element.id)}` : `[data-ink-id="${CSS.escape(id)}"]`;
    return {
      id, element, selector, duration: isTable ? TABLE_DURATION : TEXT_DURATION,
      triggerLineViewportHeights: isTable ? TABLE_TRIGGER_LINE : TEXT_TRIGGER_LINE,
      finishLineViewportHeights: isTable ? undefined : TEXT_FINISH_LINE,
      visibleOnly: isTable,
      layers: () => isTable ? tablePlans(element) : [{ sources: [element], start: 0, duration: TEXT_DURATION, poolDiameter }],
    };
  });
}

export function initSiteInk(enabled: boolean): InkFormationApi {
  const api = createInkFormation({ blocks: makeBlocks(), paperColor: '#efe7d7', maxPixelRatio: 1.5, enabled });
  if (new URLSearchParams(location.search).has('inspect')) {
    const { replay, pause, play, seek, diagnostics, dispose } = api;
    window.siteInk = { replay, pause, play, seek, diagnostics, dispose };
  }
  return api;
}
