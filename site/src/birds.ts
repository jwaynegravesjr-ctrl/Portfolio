import {STYLE} from './config';

/** Original, programmatic songbird drawing for The Shared Perch, third study.
 * Local origin is the midpoint between planted toes. Width/height are ratios.
 * The two supplied contexts share a transform; this module never clears either.
 */
export interface BirdPose {
  spread: number;
  flap: number;
  pitch: number;
  head: number;
  breath: number;
  tail: number;
  facing: number;
  feet: [number, number][];
  ruffle: number;
  /** A perched, single-wing invitation; zero preserves the ordinary pose. */
  signal?: number;
  /** A small spoken chirp, opening the two beak tips by at most 5.4 pixels. */
  tweet?: number;
}

export interface BirdSpec {
  seed: number;
  width: number;
  height: number;
  tuft: number;
}

type Context = CanvasRenderingContext2D;
type Point = [number, number];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function variation(seed: number, index: number): number {
  let n = (seed * 1597334677 + index * 3812015801) | 0;
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function line(ctx: Context, path: Path2D, width = 1, density = 0.75,
  seed = 1, broken = true): void {
  ctx.save();
  ctx.strokeStyle = `rgba(0,0,0,${density})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (broken) {
    ctx.setLineDash([29 + seed % 13, 0.9, 53, 1.4, 17, 0.5]);
    ctx.lineDashOffset = -(seed % 31);
  } else ctx.setLineDash([]);
  ctx.stroke(path);
  ctx.restore();
}

function shape(ink: Context, mask: Context, path: Path2D, wash: number,
  outline?: Path2D, seed = 1, width = 1.35, density = 0.77): void {
  mask.fillStyle = '#000';
  mask.fill(path);
  ink.fillStyle = `rgba(0,0,0,${wash * STYLE.wash})`;
  ink.fill(path);
  // Strengthen the silhouette nib while keeping the beak and interior hatching fine.
  if (outline) line(ink, outline, width * (width >= 1.2 ? STYLE.contour : 1), density, seed);
}

function strokes(ctx: Context, paths: string[], width: number,
  density: number, seed: number): void {
  paths.forEach((d, i) => line(ctx, new Path2D(d), width * (0.9 + variation(seed, i) * 0.2),
    density, seed + i * 11));
}

function paired(ink: Context, mask: Context, transform: (c: Context) => void,
  draw: () => void): void {
  ink.save(); mask.save();
  transform(ink); transform(mask);
  draw();
  ink.restore(); mask.restore();
}

/** A lopsided fan: the five primary tips each turn independently into the edge.
 * Its folded projection is compact; spread exposes the same fan at the shoulder.
 */
function wing(ink: Context, mask: Context, seed: number, spread: number,
  flap: number, far: boolean, front = 0): void {
  const s = clamp(spread);
  const angle = mix(-1.48, 0.16 + flap * 0.78, s);
  const p = new Path2D('M 1 1 C -14 -2 -26 -12 -35 -28 '
    + 'C -49 -51 -57 -72 -67 -82 Q -73 -89 -73 -78 '
    + 'Q -72 -65 -64 -49 Q -86 -71 -91 -64 '
    + 'Q -94 -59 -76 -38 Q -98 -53 -101 -44 '
    + 'Q -101 -39 -82 -25 Q -104 -32 -104 -24 '
    + 'Q -104 -18 -79 -10 Q -98 -12 -96 -3 '
    + 'Q -93 4 -66 7 C -36 13 -13 9 1 1 Z');
  paired(ink, mask, c => {
    c.translate(far ? mix(5, 19, front) : mix(-7, -19, front), far ? mix(-66, -64, front) : -64);
    if (far) c.scale(-mix(0.78, 1, front), mix(0.90, 1, front));
    c.rotate(angle);
    c.scale(mix(0.39, 0.96, s), mix(0.34, 0.96, s));
  }, () => {
    shape(ink, mask, p, far ? mix(0.048, 0.065, front) : 0.065, p, seed, far ? mix(1.5, 1.6, front) : 1.6,
      far ? mix(0.53, 0.78, front) : 0.78);
    ink.save(); ink.clip(p);
    const featherWash = ink.createLinearGradient(-8, 4, -91, -64);
    const washWeight = (far ? mix(.7, 1, front) : 1) * STYLE.wash;
    featherWash.addColorStop(0, `rgba(0,0,0,${.13 * washWeight})`);
    featherWash.addColorStop(.48, `rgba(0,0,0,${.055 * washWeight})`);
    featherWash.addColorStop(1, 'rgba(0,0,0,0)');
    ink.fillStyle = featherWash; ink.fillRect(-108, -96, 116, 112); ink.restore();
    strokes(ink, [
      'M -7 0 Q -29 -11 -63 -72',
      'M -10 1 Q -30 -8 -81 -56',
      'M -13 3 Q -36 -4 -89 -39',
      'M -14 5 Q -41 1 -94 -21',
      'M -19 6 Q -43 5 -85 -2',
      'M -15 -8 Q -32 -6 -37 3',
      'M -23 -16 Q -38 -15 -43 -3',
      'M -31 -24 Q -46 -24 -52 -10',
    ], 0.85, far ? 0.29 : 0.45, seed + 41);
    strokes(ink, [
      'M -17 -3 l -8 -1', 'M -23 -10 l -7 -3',
      'M -30 -18 l -6 -5', 'M -36 -26 l -5 -7',
      'M -51 -48 l -5 -9', 'M -57 -56 l -4 -8',
    ], 0.58, 0.29, seed + 69);
  });
}

function tail(ink: Context, mask: Context, seed: number, tilt: number,
  ruffle: number): void {
  const p = new Path2D('M -22 -37 C -35 -30 -46 -18 -58 -10 '
    + 'Q -66 -3 -60 0 Q -54 3 -40 -7 Q -54 8 -48 9 '
    + 'Q -43 10 -31 -3 Q -41 14 -34 12 Q -24 6 -15 -18 Z');
  paired(ink, mask, c => {
    c.translate(-23, -30); c.rotate(tilt + ruffle * 0.055); c.translate(23, 30);
  }, () => {
    shape(ink, mask, p, 0.085, p, seed, 1.3, 0.76);
    ink.save(); ink.clip(p);
    const tailWash = ink.createLinearGradient(-20, -30, -55, 8);
    tailWash.addColorStop(0, `rgba(0,0,0,${.11 * STYLE.wash})`);
    tailWash.addColorStop(.58, `rgba(0,0,0,${.042 * STYLE.wash})`);
    tailWash.addColorStop(1, 'rgba(0,0,0,0)');
    ink.fillStyle = tailWash; ink.fillRect(-72, -42, 64, 64); ink.restore();
    strokes(ink, ['M -24 -25 Q -40 -11 -57 -1',
      'M -23 -23 Q -33 -8 -46 6', 'M -19 -22 Q -26 -8 -33 8'],
    0.8, 0.55, seed + 13);
    strokes(ink, ['M -30 -19 l -7 4', 'M -34 -14 l -8 5',
      'M -37 -9 l -8 5'], 0.55, 0.30, seed + 19);
  });
}

function torso(ink: Context, mask: Context, seed: number, ruffle: number, front = 0): void {
  const profile = 'M 9 -74 C -4 -79 -21 -72 -28 -57 '
    + 'C -34 -45 -32 -33 -23 -24 Q -17 -18 -7 -17 '
    + 'Q -1 -13 3 -16 Q 14 -13 24 -25 C 36 -37 36 -55 29 -64 '
    + 'Q 25 -72 19 -75';
  const frontal = 'M 0 -75 C -14 -78 -29 -65 -32 -49 '
    + 'C -35 -37 -28 -26 -18 -21 Q -11 -17 -4 -17 '
    + 'Q 0 -16 4 -17 Q 11 -17 18 -21 C 28 -26 35 -37 32 -49 '
    + 'Q 29 -65 14 -74';
  const target = frontal.match(/-?\d+(?:\.\d+)?/g)!.map(Number); let point = 0;
  const contour = front === 0 ? profile : profile.replace(/-?\d+(?:\.\d+)?/g,
    n => String(mix(Number(n), target[point++], front)));
  const full = new Path2D(contour + ' Z'), edge = new Path2D(contour);
  // Far feathers pass behind the body, rather than showing through its wash.
  ink.save(); ink.globalCompositeOperation = 'destination-out';
  ink.fillStyle = '#000'; ink.fill(full); ink.restore();
  shape(ink, mask, full, 0.028, edge, seed, 1.5, 0.79);
  ink.save();
  ink.clip(full);
  const shade = ink.createRadialGradient(mix(-23, 0, front), -53, 1, mix(-14, 0, front), -47, 43);
  shade.addColorStop(0, 'rgba(0,0,0,0.072)');
  shade.addColorStop(0.6, 'rgba(0,0,0,0.022)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ink.fillStyle = shade; ink.fillRect(-50, -95, 100, 95);
  ink.restore();
  strokes(ink, [
    'M 25 -57 Q 29 -53 29 -49', 'M 27 -44 q 0 6 -3 9',
    'M 21 -30 l -3 4', 'M 14 -23 l -3 2',
    'M -21 -66 l -4 5', 'M -25 -53 l -3 5',
    'M -17 -24 l 5 3', 'M -11 -21 l 4 1',
  ], 0.62, 0.41 * (1 - front), seed + 31);
  const r = clamp(ruffle);
  strokes(ink, [
    `M -26 -51 q ${-3 - r * 4} -4 ${-6 - r * 6} ${-2 - r * 2}`,
    `M -28 -45 q ${-4 - r * 4} -1 ${-5 - r * 5} ${2 + r * 3}`,
    `M -18 -24 q ${-3 - r * 3} 2 ${-5 - r * 3} ${1 + r * 4}`,
  ], 0.84, 0.65 * (1 - front), seed + 8);
}

/** A geometric front bridge keeps one beak while the profile turns through us.
 * Eye separation and the beak's position project continuously onto the page.
 */
function turningHead(ink: Context, mask: Context, spec: BirdSpec, turn: number,
  ruffle: number, profile: number, tweet = 0): void {
  const a = clamp(profile), f = 1 - a;
  const point = (x: number, y: number, fx: number, fy: number) =>
    `${mix(fx, x, a)} ${mix(fy, y, a)}`;
  const contour = new Path2D(`M ${point(-6,-68,-15,-67)} `
    + `C ${point(-8,-76,-24,-77)} ${point(-7,-88,-25,-90)} ${point(0,-97,-16,-99)} `
    + `C ${point(6,-105,-7,-108)} ${point(20,-106,8,-108)} ${point(27,-98,17,-99)} `
    + `Q ${point(31,-94,24,-92)} ${point(31,-90,23,-88)} `
    + `Q ${point(32,-86,24,-85)} ${point(31,-83,22,-82)} `
    + `C ${point(29,-75,21,-73)} ${point(24,-69,16,-69)} ${point(16,-66,15,-67)}`);
  const fill = new Path2D(contour); fill.closePath();
  paired(ink, mask, c => {
    c.translate(8*a,-71); c.rotate(turn*a); c.translate(-8*a,71);
  }, () => {
    ink.save(); ink.globalCompositeOperation = 'destination-out'; ink.fillStyle = '#000';
    ink.fill(fill); ink.restore();
    shape(ink, mask, fill, 0.036, contour, spec.seed+3, 1.4, 0.81);
    const beak = new Path2D();
    beak.moveTo(mix(-3.5,31,a),mix(-87,-90,a));
    beak.quadraticCurveTo(mix(-1,40,a),mix(-82,-88,a),mix(0,43,a),mix(-80.5,-86,a));
    beak.quadraticCurveTo(mix(2,39,a),mix(-83,-84,a),mix(3.5,31,a),mix(-87,-83,a));
    beak.closePath();
    ink.save(); ink.globalCompositeOperation='destination-out'; ink.fillStyle='#000'; ink.fill(beak); ink.restore();
    shape(ink,mask,beak,0.065,beak,spec.seed+9,0.95,0.79);
    const eye = (x: number, y: number, density: number, radius: number) => {
      ink.fillStyle=`rgba(0,0,0,${density})`; ink.beginPath();
      ink.ellipse(x,y,radius,1.9,0,0,Math.PI*2); ink.fill();
      ink.save(); ink.globalCompositeOperation='destination-out';
      ink.beginPath(); ink.arc(x+0.35,y-0.5,0.38,0,Math.PI*2); ink.fill(); ink.restore();
    };
    eye(mix(8,22.4,a),-89.7,0.91,mix(1.45,1.75,a));
    if(a<0.8)eye(mix(-8,12,a),-89.7,0.91*clamp((0.8-a)/0.55),1.45);
    const count=Math.max(1,Math.min(4,Math.round(spec.tuft)));
    for(let j=0;j<count;j++){
      const x=mix((j-(count-1)/2)*3.6,5+j*3.6,a);
      const lift=4+variation(spec.seed,j+91)*4+ruffle*4;
      const p=new Path2D();p.moveTo(x,mix(-105,-101,a));
      p.quadraticCurveTo(x-4*a,-106-lift,x+mix((j-(count-1)/2)*2,-8+j,a),-102-lift);
      line(ink,p,0.9,0.75,spec.seed+j);line(mask,p,1.5,1,spec.seed+j,false);
    }
    if(f>0.4)strokes(ink,['M -14 -79 l 3 2','M 14 -79 l -3 2'],0.6,0.3*f,spec.seed);
    if(tweet>0)openBeak(ink,mask,spec.seed,a,tweet);
  });
}

/** Two small pen-nib contours articulate around the old beak's center.
 * The intact-beak drawing is untouched when tweet is zero or omitted.
 */
function openBeak(ink:Context,mask:Context,seed:number,profile:number,tweet:number):void {
  const a=clamp(profile),v=clamp(tweet),tipX=43*a,tipY=mix(-80.5,-86,a);
  const p=(frontX:number,frontY:number,sideX:number,sideY:number):Point=>
    [mix(frontX,sideX,a),mix(frontY,sideY,a)];
  const old=new Path2D();
  old.moveTo(...p(-3.5,-87,31,-90));
  old.quadraticCurveTo(...p(-1,-82,40,-88),tipX,tipY);
  old.quadraticCurveTo(...p(2,-83,39,-84),...p(3.5,-87,31,-83));old.closePath();
  for(const c of [ink,mask]){
    c.save();c.globalCompositeOperation='destination-out';c.fillStyle='#000';
    c.strokeStyle='#000';c.lineWidth=2.2;c.setLineDash([]);c.fill(old);c.stroke(old);c.restore();
  }
  const upper=new Path2D();
  upper.moveTo(...p(-3.5,-87,31,-90));
  upper.quadraticCurveTo(...p(-2.5,-84.7-v*1.4,37.5,-90.2),tipX,tipY-v*2.7);
  upper.quadraticCurveTo(...p(2.5,-84.7-v*1.4,39,-87.1),...p(3.5,-87,31,-86.6-v*.7));
  upper.closePath();
  const lower=new Path2D();
  lower.moveTo(...p(-3.2,-82+v*1.6,31,-86.6+v*.7));
  lower.quadraticCurveTo(...p(-2,-80.3+v*2,37,-85),mix(0,42.5,a),tipY+v*2.7);
  lower.quadraticCurveTo(...p(2,-80.3+v*2,36,-82.5),...p(3.2,-82+v*1.6,30.7,-83));
  lower.closePath();
  shape(ink,mask,upper,.058,upper,seed+111,1.02,.81);
  shape(ink,mask,lower,.045,lower,seed+112,.93,.76);
}

function head(ink: Context, mask: Context, spec: BirdSpec, turn: number,
  ruffle: number, tweet = 0): void {
  const forehead = (variation(spec.seed, 71) - 0.5) * 2;
  const neck = new Path2D(`M -6 -68 C -8 -76 -7 -88 0 -97 `
    + `C 6 ${-105 + forehead} 20 -106 27 -98 Q 31 -94 31 -90 `
    + 'L 43 -86 Q 39 -84 31 -83 C 29 -75 24 -69 16 -66 Z');
  const contour = new Path2D(`M -6 -69 C -8 -76 -7 -88 0 -97 `
    + `C 6 ${-105 + forehead} 20 -106 27 -98 Q 31 -94 31 -90 `
    + 'L 43 -86 Q 39 -84 31 -83 C 29 -75 24 -69 16 -66');
  paired(ink, mask, c => {
    c.translate(8, -71); c.rotate(turn); c.translate(-8, 71);
  }, () => {
    // Remove only the buried body contour; the open lower neck joins the breast.
    ink.save(); ink.globalCompositeOperation = 'destination-out';
    ink.fillStyle = '#000'; ink.fill(neck); ink.restore();
    shape(ink, mask, neck, 0.036, contour, spec.seed + 3, 1.4, 0.81);
    ink.save(); ink.clip(neck);
    const cap = ink.createLinearGradient(0, -107, 2, -81);
    cap.addColorStop(0, 'rgba(0,0,0,0.09)'); cap.addColorStop(1, 'rgba(0,0,0,0)');
    ink.fillStyle = cap; ink.fillRect(-16, -112, 65, 50); ink.restore();
    strokes(ink, ['M 31 -87 L 39 -86', 'M 30 -89 l 4 1',
      'M 13 -78 q 5 2 10 -2', 'M 10 -76 l 3 2',
      'M -3 -91 l 3 -5', 'M 1 -97 l 4 -3', 'M 7 -100 l 4 -1'],
    0.68, 0.44, spec.seed + 18);
    ink.fillStyle = 'rgba(0,0,0,0.91)';
    ink.beginPath(); ink.ellipse(22.4, -89.7, 1.75, 1.9, -0.16, 0, Math.PI * 2); ink.fill();
    ink.save(); ink.globalCompositeOperation = 'destination-out';
    ink.beginPath(); ink.arc(22.8, -90.4, 0.42, 0, Math.PI * 2); ink.fill(); ink.restore();
    line(ink, new Path2D('M 19 -93 Q 22 -94 24 -93'), 0.72, 0.59, spec.seed);
    const count = Math.max(1, Math.min(4, Math.round(spec.tuft)));
    for (let j = 0; j < count; j++) {
      const x = 5 + j * 3.6;
      const lift = 4 + variation(spec.seed, j + 91) * 4 + ruffle * 4;
      const tuft = new Path2D();
      tuft.moveTo(x, -101);
      tuft.quadraticCurveTo(x - 4, -106 - lift, x - 8 + j, -102 - lift);
      line(ink, tuft, 0.9, 0.75, spec.seed + j);
      line(mask, tuft, 1.5, 1, spec.seed + j, false);
    }
    if(tweet>0)openBeak(ink,mask,spec.seed,1,tweet);
  });
}

/** Foot endpoints are in unmirrored local page axes, independent of the body.
 * Their shins follow the moving abdomen, while their toes remain planted.
 */
function feet(ink: Context, mask: Context, spec: BirdSpec, pose: BirdPose): void {
  const angle = pose.pitch;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const facing = clamp(pose.facing,-1,1);
  const sy = spec.height * (1 + pose.breath * 0.012);
  const abdomen = (x: number, y: number): Point => {
    const px = x * spec.width * facing, py = (y + 18) * sy;
    return [cs * px - sn * py, -18 + sn * px + cs * py];
  };
  pose.feet.slice(0, 2).forEach((f, i) => {
    const turnedOnFeet=(pose.feet[1][0]-pose.feet[0][0])*facing<0;
    const hip=turnedOnFeet?1-i:i;
    const start = abdomen(hip ? 9 : -8, -19);
    const knee: Point = [mix(start[0], f[0], 0.48) - facing * 2, mix(start[1], f[1], 0.62)];
    const leg = new Path2D();
    leg.moveTo(start[0], start[1]); leg.lineTo(knee[0], knee[1]); leg.lineTo(f[0], f[1]);
    leg.moveTo(f[0] - 4.5, f[1] + 0.8); leg.quadraticCurveTo(f[0], f[1] - 1, f[0] + 6, f[1] + 0.8);
    leg.moveTo(f[0], f[1]); leg.lineTo(f[0] + 1.2, f[1] + 2.7);
    line(ink, leg, i ? 1.05 : 0.9, i ? 0.83 : 0.63, spec.seed + i, false);
    line(mask, leg, 1.7, 1, spec.seed + i, false);
  });
}

export function paintBird(ink: Context, mask: Context, spec: BirdSpec,
  pose: BirdPose): void {
  ink.save(); mask.save();
  ink.globalCompositeOperation = 'source-over'; mask.globalCompositeOperation = 'source-over';
  ink.lineCap = mask.lineCap = 'round'; ink.lineJoin = mask.lineJoin = 'round';
  feet(ink, mask, spec, pose);
  const profile = Math.abs(clamp(pose.facing,-1,1));
  const front = 1-profile;
  const signal = clamp(pose.signal ?? 0);
  paired(ink, mask, c => {
    c.translate(0, -18); c.rotate(pose.pitch);
    c.scale(spec.width * (pose.facing < 0 ? -1 : 1), spec.height * (1 + pose.breath * 0.012));
    c.translate(0, 18);
  }, () => {
    // The far shoulder faces the invitation; the near wing and planted feet
    // retain their existing pose. A little lift keeps this from a rigid point.
    wing(ink, mask, spec.seed + 13, Math.max(pose.spread,signal*.76),
      pose.flap * mix(0.85,1,front)+signal*.18, true, front);
    paired(ink,mask,c=>{c.translate(front*7,0);c.scale(mix(0.2,1,profile),1);},()=>
      tail(ink, mask, spec.seed + 27, pose.tail*profile, pose.ruffle));
    torso(ink, mask, spec.seed, pose.ruffle, front);
    wing(ink, mask, spec.seed + 67, pose.spread, pose.flap, false, front);
    if(profile===1)head(ink, mask, spec, pose.head, pose.ruffle,clamp(pose.tweet??0));
    else turningHead(ink,mask,spec,pose.head,pose.ruffle,profile,clamp(pose.tweet??0));
  });
  ink.restore(); mask.restore();
}
