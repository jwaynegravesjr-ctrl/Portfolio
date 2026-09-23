/** The sheet itself is a working notebook: cells, loose threads, then a gentler order.
 * This is drawn afresh from absolute time. No spreadsheet engine or retained marks.
 */
const PAGE = {
  width: 1600, height: 900,
  left: 48, right: 1582, top: 42, bottom: 866,
  columns: 13, rows: 22,
  enter: .72, leave: 35.55, clear: 39.45,
  gridInk: .235, smallInk: .32, writingInk: .4,
} as const;
// These exact phrases name the human process. Verification follows the demonstrated revision.
export const DATA_HEADINGS = [
  { text: 'Many data sources', x: 170, y: 128, at: 3.8, reveal: .9, fadeAt: 8, clearAt: 10, size: 26, alpha: .56, center: false },
  { text: 'problem identified', x: 660, y: 128, at: 10.6, reveal: .9, fadeAt: 14.2, clearAt: 16.2, size: 26, alpha: .57, center: false },
  { text: 'plan created', x: 1230, y: 128, at: 13.1, reveal: .9, fadeAt: 17.3, clearAt: 19.5, size: 26, alpha: .56, center: false },
  { text: 'plan verified by operational leaders', x: 800, y: 706, at: 22.9, reveal: .28, fadeAt: 23.55, clearAt: 25, size: 27, alpha: .6, center: true },
] as const;
type Point = [number, number];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const progress = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const smooth = (n: number) => n * n * (3 - 2 * n);
const ramp = (t: number, a: number, b: number) => smooth(progress(t, a, b));
const writingPresence = (time: number, at: number, reveal: number, fadeAt = Infinity, clearAt = fadeAt + .7) =>
  ramp(time, at, at + reveal) * (Number.isFinite(fadeAt) ? 1 - ramp(time, fadeAt, clearAt) : 1);
/** Normalized heading coverage; shared with drawing so seek checks need no Canvas. */
export const dataHeadingOpacity = (time: number, heading: typeof DATA_HEADINGS[number]): number =>
  writingPresence(time, heading.at, heading.reveal, heading.fadeAt, heading.clearAt);
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const hash = (n: number) => { const f = Math.sin(n * 127.1 + 311.7) * 43758.5453; return f - Math.floor(f); };
const cubic = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
    s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
};

/** Black alpha coverage only; the renderer supplies diluted warm ink. */
export function drawDataPaper(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.clearRect(0, 0, PAGE.width, PAGE.height);
  if (time <= PAGE.enter || time >= PAGE.clear) return;
  const loss = progress(time, PAGE.leave, PAGE.clear);
  const opacity = 1 - ramp(loss, .23, 1);
  const trouble = ramp(time, 5.15, 10.1) * (1 - ramp(time, 18.9, 24.8));
  const regroup = ramp(time, 19.1, 24.2);
  const cw = (PAGE.right - PAGE.left) / PAGE.columns;
  const rh = (PAGE.bottom - PAGE.top) / PAGE.rows;
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';

  // The ruling belongs to the fixed sheet. Only its ink bends and revises.
  const warp = (x: number, y: number, seed: number): Point => {
    const upper = Math.exp(-(((y - 226) / 183) ** 2));
    const middle = Math.exp(-(((x - 818) / 405) ** 2));
    const amplitude = trouble * upper * middle;
    return [
      x + Math.sin(y * .019 + x * .004) * amplitude * 14 + Math.sin(y * .047 + seed) * .42,
      y + Math.sin(x * .016 - y * .013) * amplitude * 14 + Math.sin(x * .035 + seed) * .35,
    ];
  };
  const stroke = (points: Point[], alpha: number, seed: number, width = .8, reveal = 1) => {
    if (reveal <= 0 || alpha <= 0) return;
    ctx.globalAlpha = alpha * opacity;
    ctx.lineWidth = width;
    ctx.beginPath();
    const maximum = reveal * (points.length - 1);
    for (let k = 0; k < points.length - 1 && k < maximum; k++) {
      // Erosion unthreads the line before its surviving ink becomes a faint stain.
      if (loss > .09 && hash(seed + k * .731) < ramp(loss, .09, .91) * .91) continue;
      const end = Math.min(1, maximum - k);
      const a = points[k], b = points[k + 1];
      const bleed = ramp(loss, .28, .82) * 3.3 * Math.sin(k * 1.7 + seed);
      ctx.moveTo(a[0] + bleed, a[1] + bleed * .18);
      ctx.lineTo(mix(a[0], b[0], end) + bleed, mix(a[1], b[1], end) + bleed * .18);
    }
    ctx.stroke();
  };
  const rule = (a: Point, b: Point, seed: number, alpha: number, reveal = 1) => {
    const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 13);
    const points: Point[] = [];
    for (let j = 0; j <= count; j++) points.push(warp(mix(a[0], b[0], j / count), mix(a[1], b[1], j / count), seed));
    stroke(points, alpha, seed, .83 + hash(seed) * .23, reveal);
  };
  const curve = (a: Point, b: Point, c: Point, d: Point, seed: number, alpha: number, reveal = 1, width = .9) => {
    const points: Point[] = [];
    for (let j = 0; j <= 56; j++) {
      const p = cubic(a, b, c, d, j / 56);
      p[1] += Math.sin(j * .77 + seed) * .34;
      points.push(p);
    }
    stroke(points, alpha, seed, width, reveal);
  };
  const writing = (text: string, x: number, y: number, at: number, alpha = .365, size = 14, seed = 1, until = Infinity, italic = false, revealDuration = .9, clearAt = until + .7) => {
    const visible = writingPresence(time, at, revealDuration, until, clearAt);
    if (!visible) return;
    ctx.font = `${italic ? 'italic ' : ''}${size}px Georgia, 'Times New Roman', serif`;
    const revealed = progress(time, at, at + revealDuration) * (text.length + 4);
    let xHere = x;
    for (let i = 0; i < text.length; i++) {
      if (loss < .1 || hash(seed + i * 1.37) > ramp(loss, .1, .94) * .78) {
        ctx.globalAlpha = alpha * opacity * visible * smooth(clamp(revealed - i));
        ctx.fillText(text[i], xHere, y + Math.sin(i * .61 + seed) * .45);
      }
      xHere += ctx.measureText(text[i]).width + .18;
    }
  };

  // The ruling reaches almost every edge; gutters and lettered columns suggest a worksheet.
  for (let i = 0; i <= PAGE.columns; i++) {
    const x = PAGE.left + i * cw;
    rule([x, 16], [x, PAGE.bottom], 10 + i, PAGE.gridInk * (.8 + hash(i + 10) * .2), ramp(time, .92 + i * .075, 3.8 + i * .075));
    if (i < PAGE.columns) writing(String.fromCharCode(65 + i), x + cw * .48, 26, 2.7 + i * .08, .32, 12, 30 + i);
  }
  for (let j = 0; j <= PAGE.rows; j++) {
    const y = PAGE.top + j * rh;
    rule([17, y], [PAGE.right, y], 50 + j, PAGE.gridInk * (.78 + hash(j + 80) * .22), ramp(time, .72 + j * .085, 3.8 + j * .085));
    if (j < PAGE.rows) writing(String(j + 1).padStart(2, '0'), 21, y + rh * .51, 2.95 + j * .065, .285, 11, 90 + j);
  }

  // Faint ruling survives behind the stage, with breathing room around feathers and labels.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  const stageQuiet = ctx.createLinearGradient(0, 335, 0, 655);
  stageQuiet.addColorStop(0, 'rgba(0,0,0,0)');
  stageQuiet.addColorStop(.2, 'rgba(0,0,0,.5)');
  stageQuiet.addColorStop(.5, 'rgba(0,0,0,.82)');
  stageQuiet.addColorStop(.76, 'rgba(0,0,0,.8)');
  stageQuiet.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = stageQuiet;
  ctx.fillRect(0, 335, 1600, 320);
  const labelQuiet = ctx.createLinearGradient(400, 0, 1200, 0);
  labelQuiet.addColorStop(0, 'rgba(0,0,0,0)');
  labelQuiet.addColorStop(.2, 'rgba(0,0,0,.85)');
  labelQuiet.addColorStop(.8, 'rgba(0,0,0,.85)');
  labelQuiet.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = labelQuiet;
  ctx.fillRect(400, 49, 800, 59);
  const headingQuiet = ctx.createLinearGradient(0, 106, 0, 153);
  headingQuiet.addColorStop(0, 'rgba(0,0,0,0)');
  headingQuiet.addColorStop(.45, 'rgba(0,0,0,.52)');
  headingQuiet.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = headingQuiet;
  ctx.fillRect(143, 106, 1342, 47);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';

  // Cell contents are little bars and paired ticks, not invented workplace metrics.
  // Their offsets settle into row baselines as the groups reconsider the route.
  for (let k = 0; k < 55; k++) {
    const column = Math.floor(hash(410 + k * 3) * 13);
    const row = Math.floor(hash(415 + k * 3) * 21);
    const x = PAGE.left + column * cw + 17;
    const y = PAGE.top + (row + .57) * rh;
    if (y > 342 && y < 651 || y < 114 && x > 370 && x < 1240) continue;
    if (y > 107 && y < 169 || y > 680 && y < 729 && x > 510 && x < 1080) continue;
    const reveal = ramp(time, 3.6 + hash(k + 220) * 4.6, 4.8 + hash(k + 220) * 4.6);
    const dx = (hash(k + 33) - .5) * 20 * (1 - regroup);
    const dy = (hash(k + 35) - .5) * 8 * (1 - regroup);
    const length = 13 + hash(k + 31) * 28;
    const a = warp(x + dx, y + dy, k), b = warp(x + dx + length, y + dy, k);
    stroke([a, b], PAGE.smallInk * (.6 + hash(k) * .28), 300 + k, 1, reveal);
    if (k % 3 === 0) {
      stroke([[a[0] + length + 6, a[1] - 3], [a[0] + length + 6, a[1] + 2]], .24, 360 + k, .87, reveal);
      stroke([[a[0] + length + 10, a[1] - 3], [a[0] + length + 10, a[1] + 2]], .21, 370 + k, .8, reveal);
    }
  }

  // Two unthreaded rows meet in one small tangle above the difficult fork.
  // The right-hand input opens the tangle into two generous, quiet bends.
  const drawThreads = ramp(time, 6.48, 10.6);
  const threadPresence = drawThreads * (1 - ramp(time, 33.1, 35.2));
  const weave = 1 - regroup;
  const knotX = 822, knotY = 219;
  curve([294, 225], [mix(440, 376, regroup), mix(137, 200, regroup)],
    [mix(1031, 531, regroup), mix(326, 199, regroup)], [mix(knotX + 23, 658, regroup), mix(knotY + 13, 225, regroup)],
    500, .38 * threadPresence, ramp(time, 6.48, 8.4), 1.14);
  curve([1303, 187], [mix(1117, 1248, regroup), mix(113, 177, regroup)],
    [mix(643, 1060, regroup), mix(326, 220, regroup)], [mix(knotX - 20, 969, regroup), mix(knotY - 8, 225, regroup)],
    501, .355 * threadPresence, ramp(time, 9.48, 11.25), 1.07);
  const knot: Point[] = [];
  for (let k = 0; k <= 92; k++) {
    const a = k / 92 * Math.PI * 3.8;
    knot.push([knotX + Math.cos(a) * (23 - k * .13) * weave, knotY + Math.sin(a * 1.15) * 12 * weave]);
  }
  stroke(knot, .3 * threadPresence * weave, 509, .9, ramp(time, 10.15, 12.2));

  // Observations travel only a short distance as the revised grouping becomes clear.
  const firstX = mix(349, 409, regroup), firstY = mix(177, 176, regroup);
  const secondX = mix(1173, 1058, regroup), secondY = mix(261, 177, regroup);
  writing('B7 / central', firstX, firstY, 6.6, PAGE.writingInk, 15, 620, 20.2);
  writing('B8 / central', secondX, secondY, 9.6, PAGE.writingInk, 15, 621, 20.3);
  writing('same fork', 775, 274, 10.25, .38, 16, 622, 18.3, true);
  writing('more room?', 437, 313, 11.4, .37, 17, 623, 18.25, true);
  writing('a different approach', 1030, 308, 18.15, .39, 16, 624, 26.6, true);
  writing('B7 / left pocket', firstX, firstY, 21.1, .39, 15, 626);
  writing('B8 / right pocket', secondX, secondY, 21.45, .39, 15, 627);
  writing('spacing + route', 1000, 642, 22.15, .38, 16, 628, Infinity, true);

  // Open cell corners gently align: a familiar spreadsheet gesture, left in pen.
  for (let i = 0; i < 2; i++) {
    const x = i ? secondX - 12 : firstX - 12;
    const y = i ? secondY : firstY;
    const alpha = .32 * ramp(time, 11.5 + i * .2, 13 + i * .2);
    const w = mix(135, 157, regroup), h = mix(18 + i * 7, 18, regroup);
    const tilt = (i ? -4 : 3) * (1 - regroup);
    stroke([[x + 15, y - h], [x, y - h + tilt], [x, y + h], [x + 34, y + h]], alpha, 651 + i, 1.04);
    stroke([[x + w - 32, y - h], [x + w, y - h], [x + w, y + h - tilt], [x + w - 12, y + h]], alpha * .85, 654 + i, .93);
  }

  // Lower ruled rows become small swoops, as though the sheet has learned to make room.
  for (let i = 0; i < 3; i++) {
    const y = 686 + i * 37;
    const space = regroup * (1 - ramp(time, 35, 36));
    curve([176, y], [330, y - 8 * trouble], [395, y - 25 * space], [476, y - 8 * space],
      702 + i, .25, ramp(time, 12.2 + i * .3, 14.3 + i * .3), .94);
    curve([1124, y + 3], [1220, y + 28 * space], [1332, y - 18 * space], [1431, y],
      708 + i, .265, ramp(time, 18.5 + i * .3, 20.6 + i * .3), .96);
  }
  writing('= question + question', 639, 802, 8.8, .275, 16, 730, 17.5, true);
  writing('= spacing + a different approach', 575, 802, 18.35, .285, 16, 731, 27.3, true);
  writing('= room + a little patience', 619, 802, 28.15, .29, 17, 732, Infinity, true);

  // Headings are ink on the same sheet, with no boxes, UI labels, or moving panels.
  for (let i = 0; i < DATA_HEADINGS.length; i++) {
    const h = DATA_HEADINGS[i];
    ctx.font = `${h.size}px Georgia, 'Times New Roman', serif`;
    const width = ctx.measureText(h.text).width + (h.text.length - 1) * .18;
    const x = h.center ? h.x - width / 2 : h.x;
    writing(h.text, x, h.y, h.at, h.alpha, h.size, 810 + i, h.fadeAt, false, h.reveal, h.clearAt);
  }
  // A changed underline preserves the first plan as a trace while making its revision explicit.
  const planNotePresence = 1 - ramp(time, 23.1, 24.25);
  const earlierPlan = (1 - ramp(time, 19.2, 21.4) * .79) * planNotePresence;
  rule([1233, 146], [1364, 147], 830, .33 * earlierPlan, ramp(time, 13.75, 14.5));
  curve([1232, 149], [1272, 141], [1330, 154], [1384, 146],
    831, .41 * planNotePresence, ramp(time, 20.45, 22.8), 1.02);
  writing('revised together', 1233, 166, 22.15, .41, 14, 832, 23.1, true, .9, 24.25);
  ctx.restore();
}
