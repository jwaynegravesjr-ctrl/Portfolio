/** Timing and observations for the approved banner and graph. No scroll position enters this score. */
export const CONFIG = Object.freeze({
  /** The bird/debris score moves at 85% of its previous rate; the artwork's source score remains 11s. */
  birdSpeed: .85,
  birdLead: 1.6,
  duration: 1.6 + 11 / .85,
  /** Another 10% faster than the previous 115% graph rate. */
  chartSpeed: 1.15 * 1.10,
  chartDuration: 7.2 / (1.15 * 1.10),
  paper: '#f2eee3', heroPaper: '#efe7d7', ink: '#272a25', muted: '#70756a', sage: '#74856d',
  seed: 303, maxDpr: 1.6,
});

export type Month = Readonly<{ name: string; short: string; cases: number; errors: number; rate: number }>;
const referenceCounts = [
  ['April', 37548, 153], ['May', 38649, 127], ['June', 40125, 105],
  ['July', 37205, 78], ['August', 45866, 65],
] as const;
export const REFERENCE_MONTHS: readonly Month[] = Object.freeze(referenceCounts.map(([name, cases, errors]) =>
  Object.freeze({ name, short: name.slice(0, 3).toUpperCase(), cases, errors, rate: 1000 * errors / cases })));
export let MONTHS: readonly Month[] = REFERENCE_MONTHS;

/** The site's native table is authoritative. A divergence is reported and never silently overwritten. */
export function useTableObservations(table: HTMLTableElement): string[] {
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const parsed = rows.map(row => {
    const cells = [...row.children].map(cell => (cell.textContent ?? '').trim());
    const name = cells[0], cases = Number(cells[1]?.replaceAll(',', '')), errors = Number(cells[2]?.replaceAll(',', ''));
    if (!name || !Number.isFinite(cases) || !Number.isFinite(errors) || cases <= 0 || errors < 0)
      throw new Error('The monthly data table has an invalid observation');
    return Object.freeze({ name, short: name.slice(0, 3).toUpperCase(), cases, errors, rate: 1000 * errors / cases });
  });
  if (parsed.length !== 5) throw new Error(`Expected five monthly observations; found ${parsed.length}`);
  MONTHS = Object.freeze(parsed);
  const differences: string[] = [];
  parsed.forEach((month, index) => {
    const reference = REFERENCE_MONTHS[index];
    if (!reference || month.name !== reference.name || month.cases !== reference.cases || month.errors !== reference.errors)
      differences.push(`${month.name}: table ${month.cases}/${month.errors}, reference ${reference?.cases ?? '—'}/${reference?.errors ?? '—'}`);
  });
  return differences;
}

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const phase = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
export const rand = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); };
export const nameAmount = (t: number) => phase(t, .03, .92);
export const titleAmount = (t: number) => phase(t, .27, 1.17);
export const birdFormation = (bird: number, t: number) => phase(t, .08 + bird * .065, 1.7 + bird * .065);

export type Job = Readonly<{
  id: number; bird: number; start: number; duration: number; wire: number; u: number;
  kind: string; cooperative: boolean; dir: number;
}>;
const startsA = [.55, .87, 1.18, 1.54, 1.91, 2.25, 2.59, 2.93];
const startsB = [3.75, 4.18, 4.72, 5.2, 5.64, 6.09, 6.55, 7.65];
export const HOMES = [.08, .28, .49, .7, .88, .16, .4, .78] as const;
export const WIRES = [0, 0, 0, 0, 0, 1, 1, 1] as const;
const kinds = ['paper', 'thread', 'leaf', 'ribbon', 'twig', 'paper', 'leaf', 'tangle',
  'ribbon', 'leaf', 'paper', 'thread', 'twig', 'ribbon', 'paper', 'tangle'];
export const JOBS: readonly Job[] = Object.freeze(Array.from({ length: 16 }, (_, id) => {
  const bird = id % 8, second = id >= 8;
  return Object.freeze({ id, bird, start: second ? startsB[bird] : startsA[bird],
    duration: id === 15 ? 3.2 : 2.72, wire: second ? (WIRES[bird] + 1) % 3 : WIRES[bird],
    u: clamp(HOMES[bird] + (second ? (bird % 2 ? .055 : -.02) : .02), .055, .95),
    kind: kinds[id], cooperative: id === 15, dir: bird % 2 ? -1 : 1 });
}));
export const clearOffset = (job: Job) => 1.88 + (job.cooperative ? .48 : 0);
export const birdScoreTime = (time: number) => Math.max(0, time - CONFIG.birdLead) * CONFIG.birdSpeed;
export const remainingDebris = (time: number) => JOBS.filter(job => birdScoreTime(time) < job.start + clearOffset(job)).length;
