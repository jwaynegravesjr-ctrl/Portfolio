import * as T from 'three';

export type InkSegment = {
  x1: number; y1: number; x2: number; y2: number;
  width: number; alpha?: number; color?: string;
};

export type InkLayerPlan = {
  sources: HTMLElement[];
  start: number;
  duration: number;
  poolDiameter: number;
  segments?: InkSegment[];
  clipTo?: HTMLElement;
  anchor?: HTMLElement;
};

export type InkBlockSpec = {
  id: string;
  element: HTMLElement;
  duration: number;
  selector: string;
  layers: () => InkLayerPlan[];
  triggerLineViewportHeights?: number;
  finishLineViewportHeights?: number;
  completeOnScroll?: HTMLElement;
};

export type InkFormationDiagnostics = {
  supported: boolean;
  fallback: string | null;
  pixelRatio: number;
  blocks: Array<{
    id: string; selector: string; text: string; state: InkBlockState;
    progress: number; elapsedSeconds: number; duration: number;
    triggerLineViewportHeights: number; finishLineViewportHeights: number | null;
  }>;
  activeRenderingCount: number;
  canvasPresent: boolean;
};

export type InkBlockState = 'waiting' | 'active' | 'paused' | 'complete' | 'fallback';
export type InkFormationApi = {
  replay(): void;
  pause(): void;
  play(): void;
  seek(id: string, seconds: number): void;
  diagnostics(): InkFormationDiagnostics;
  dispose(): void;
  setMotionEnabled(enabled: boolean): void;
};

type TextRun = {
  text: string; x: number; right: number; top: number; font: string; fontSize: number;
  color: string; background: string; direction: CanvasDirection; letterSpacing: string;
  fontFeatureSettings: string;
};
type InkLayer = {
  mesh: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  anchor: HTMLElement; offsetX: number; offsetY: number;
  width: number; height: number; start: number; duration: number; clipTo?: HTMLElement; disposed: boolean;
};
type InkBlock = {
  spec: InkBlockSpec; state: InkBlockState; elapsed: number; lastTick: number;
  layers: InkLayer[]; hidden: boolean;
};

const vertexShader = `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

// The approved study shader: connected character growth, short-lived dense pools,
// and a wet margin that extends slightly beyond the final glyph coverage.
const fragmentShader = `
  uniform sampler2D uMask;
  uniform sampler2D uField;
  uniform vec2 uSize;
  uniform vec2 uPageOrigin;
  uniform float uProgress;
  uniform float uSdfRange;
  uniform float uSeedRange;
  uniform float uPoolRadius;
  uniform vec3 uInk;
  uniform vec4 uClipRect;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uClipEnabled;
  varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
  }
  void main(){
    if(uClipEnabled>.5){
      vec2 screen=vec2(gl_FragCoord.x/uPixelRatio,uViewport.y-gl_FragCoord.y/uPixelRatio);
      if(screen.x<uClipRect.x||screen.y<uClipRect.y||screen.x>uClipRect.z||screen.y>uClipRect.w)discard;
    }
    vec4 field=texture2D(uField,vUv);
    float cover=texture2D(uMask,vUv).a;
    float sd=(field.r-.5)*uSdfRange*2.;
    float arrival=field.g;
    float grain=noise((uPageOrigin+vUv*uSize)*.21);
    float ragged=(grain-.5)*.065;
    float front=smoothstep(arrival-.035+ragged,arrival+.04+ragged,uProgress);
    if(uProgress>.998)front=1.;
    float density=mix(.76,1.,smoothstep(.10,.74,uProgress));
    float core=cover*front*density;
    float resolved=smoothstep(arrival+.035,arrival+.21,uProgress);
    float wet=front*(1.-resolved);
    float poolAge=uProgress-field.a;
    float poolIn=smoothstep(0.,.025,poolAge);
    float poolOut=1.-smoothstep(.105,.235,poolAge);
    float seedDistance=field.b*uSeedRange;
    float poolRadius=uPoolRadius*poolIn;
    float poolDistance=seedDistance+(grain-.5)*1.35;
    float poolShape=1.-smoothstep(max(0.,poolRadius-.72)+(grain-.5)*.45,poolRadius+.7+(grain-.5)*.45,poolDistance);
    float pools=poolShape*poolIn*poolOut*(1.-smoothstep(.69,.94,uProgress))*.88;
    float outside=smoothstep(-.25,1.05,sd)*(1.-smoothstep(2.4+(grain-.5)*.9,5.05+(grain-.5)*.9,sd));
    float halo=outside*wet*(.12+grain*.08);
    float alpha=core+pools*(1.-core)+halo*(1.-core)*(1.-pools);
    if(uProgress>=.999)alpha=cover;
    gl_FragColor=vec4(uInk,clamp(alpha,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function supportsWebgl() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl'));
  } catch { return false; }
}

function canvasFont(style: CSSStyleDeclaration) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function rgbChannels(color: string): number[] | null {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(value => value + value).join('') : hex;
    return [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16));
  }
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? channels : null;
}

function opaqueBackground(color: string) {
  if (color === 'transparent') return false;
  const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (color.startsWith('rgba(')) return (values[3] ?? 1) > 0;
  if (color.includes('/')) return (values.at(-1) ?? 1) > 0;
  return true;
}

function collectRuns(sources: HTMLElement[]): TextRun[] {
  const runs: TextRun[] = [];
  const range = document.createRange();
  for (const source of sources) {
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node.textContent || '';
      if (!value.trim()) continue;
      const owner = node.parentElement || source;
      if (owner.closest('.sr-only,[hidden]')) continue;
      const closedDetails = owner.closest('details:not([open])');
      if (closedDetails && !owner.closest('summary')) continue;
      const style = getComputedStyle(owner);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      let backdrop = style.backgroundColor;
      let ancestor = owner;
      while (ancestor) {
        const candidate = getComputedStyle(ancestor).backgroundColor;
        if (opaqueBackground(candidate)) { backdrop = candidate; break; }
        ancestor = ancestor.parentElement!;
      }
      if (!opaqueBackground(backdrop)) backdrop = '#efe7d7';
      const byLine = new Map<string, TextRun>();
      let offset = 0;
      let atWordStart = true;
      for (const character of Array.from(value)) {
        const end = offset + character.length;
        range.setStart(node, offset); range.setEnd(node, end);
        const rect = range.getBoundingClientRect();
        offset = end;
        if (!rect.height || (!rect.width && !character.trim()) || !rect.width) {
          if (/\s/.test(character)) atWordStart = true;
          continue;
        }
        const key = `${Math.round(rect.top * 2)}:${style.color}:${backdrop}:${canvasFont(style)}`;
        let run = byLine.get(key);
        if (!run) {
          run = { text: '', x: rect.left, top: rect.top, font: canvasFont(style),
            right: rect.right, fontSize: parseFloat(style.fontSize) || 16, color: style.color, background: backdrop,
            direction: style.direction === 'rtl' ? 'rtl' : 'ltr', letterSpacing: style.letterSpacing,
            fontFeatureSettings: style.fontVariantNumeric.includes('tabular-nums') ? '"tnum"' : style.fontFeatureSettings };
          byLine.set(key, run);
        }
        run.right = Math.max(run.right, rect.right);
        let painted = character;
        if (style.textTransform === 'uppercase') painted = character.toLocaleUpperCase();
        else if (style.textTransform === 'lowercase') painted = character.toLocaleLowerCase();
        else if (style.textTransform === 'capitalize' && atWordStart) painted = character.toLocaleUpperCase();
        run.text += painted;
        atWordStart = /\s/.test(character);
      }
      runs.push(...[...byLine.values()].sort((a, b) => a.top - b.top));
    }
  }
  range.detach();
  return runs;
}

function distances(bits: Uint8Array, width: number, height: number, target: 0 | 1) {
  const count = width * height;
  const distance = new Float32Array(count), nearest = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const source = bits[i] === target;
    distance[i] = source ? 0 : 1e8; nearest[i] = source ? i : -1;
  }
  const relax = (at: number, from: number, cost: number) => {
    if (from < 0 || from >= count) return;
    const d = distance[from] + cost;
    if (d < distance[at]) { distance[at] = d; nearest[at] = nearest[from]; }
  };
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * width + x;
    if (x > 0) relax(at, at - 1, 1);
    if (y > 0) { relax(at, at - width, 1); if (x > 0) relax(at, at - width - 1, diagonal); if (x + 1 < width) relax(at, at - width + 1, diagonal); }
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const at = y * width + x;
    if (x + 1 < width) relax(at, at + 1, 1);
    if (y + 1 < height) { relax(at, at + width, 1); if (x + 1 < width) relax(at, at + width + 1, diagonal); if (x > 0) relax(at, at + width - 1, diagonal); }
  }
  return { distance, nearest };
}

function createField(canvas: HTMLCanvasElement, ratio: number) {
  const width = canvas.width, height = canvas.height, count = width * height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is unavailable');
  const pixels = context.getImageData(0, 0, width, height).data;
  const bits = new Uint8Array(count), seen = new Uint8Array(count), seeds = new Uint8Array(count);
  const arrival = new Float32Array(count), seedTimes = new Float32Array(count), steps = new Int32Array(count);
  steps.fill(-1);
  for (let i = 0; i < count; i++) bits[i] = pixels[i * 4 + 3] > 34 ? 1 : 0;
  const queue = new Int32Array(count);
  const around = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
  const random = (n: number) => { const v = Math.sin(n * 127.1 + 91.7) * 43758.5453123; return v - Math.floor(v); };
  for (let first = 0; first < count; first++) {
    if (!bits[first] || seen[first]) continue;
    let head = 0, tail = 1, minX = width, maxX = 0, minY = height, maxY = 0;
    queue[0] = first; seen[first] = 1;
    while (head < tail) {
      const at = queue[head++], y = Math.floor(at / width), x = at - y * width;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx,dy] of around) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (bits[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
      }
    }
    const sx = (minX + maxX) / 2, sy = (minY + maxY) / 2;
    let seed = first, closest = Infinity;
    for (let j = 0; j < tail; j++) {
      const at = queue[j], y = Math.floor(at / width), x = at - y * width, d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < closest) { closest = d; seed = at; }
    }
    const delay = .012 + random(first + tail * 13.1) * .105;
    seeds[seed] = 1; seedTimes[seed] = delay;
    head = 0; tail = 1; queue[0] = seed; steps[seed] = 0;
    let longest = 1;
    while (head < tail) {
      const at = queue[head++], y = Math.floor(at / width), x = at - y * width;
      for (const [dx,dy] of around) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (bits[next] && steps[next] < 0) { steps[next] = steps[at] + 1; longest = Math.max(longest, steps[next]); queue[tail++] = next; }
      }
    }
    for (let j = 0; j < tail; j++) { const at = queue[j]; arrival[at] = delay + .075 + steps[at] / longest * .60; }
  }
  const toInk = distances(bits, width, height, 1), toPaper = distances(bits, width, height, 0), toSeed = distances(seeds, width, height, 1);
  const rgba = new Uint8Array(count * 4), byte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const sdfRange = 24, seedRange = 18;
  for (let i = 0; i < count; i++) {
    const signed = (toInk.distance[i] - toPaper.distance[i]) / ratio;
    const near = toInk.nearest[i], seed = toSeed.nearest[i];
    rgba[i * 4] = byte(.5 + signed / (2 * sdfRange));
    rgba[i * 4 + 1] = byte(near < 0 ? 1 : arrival[near] + toInk.distance[i] / ratio * .0022);
    rgba[i * 4 + 2] = byte(seed < 0 ? 1 : toSeed.distance[i] / ratio / seedRange);
    rgba[i * 4 + 3] = byte(seed < 0 ? 1 : seedTimes[seed]);
  }
  const texture = new T.DataTexture(rgba, width, height, T.RGBAFormat, T.UnsignedByteType);
  texture.flipY = true; texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = false; texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true;
  return { texture, sdfRange, seedRange };
}

function textBounds(runs: TextRun[], segments: InkSegment[]) {
  const context = document.createElement('canvas').getContext('2d');
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const run of runs) {
    if (!context) continue;
    context.font = run.font;
    const measureContext = context as CanvasRenderingContext2D & { fontKerning?: string; letterSpacing?: string; fontFeatureSettings?: string };
    if (measureContext.fontKerning !== undefined) measureContext.fontKerning = 'normal';
    if (measureContext.letterSpacing !== undefined) measureContext.letterSpacing = run.letterSpacing;
    if (measureContext.fontFeatureSettings !== undefined) measureContext.fontFeatureSettings = run.fontFeatureSettings;
    const metrics = context.measureText(run.text);
    const ascent = metrics.fontBoundingBoxAscent || run.fontSize * .82;
    const descent = metrics.fontBoundingBoxDescent || run.fontSize * .22;
    const baseline = run.top + ascent;
    run.top = baseline;
    left = Math.min(left, run.x); right = Math.max(right, run.right, run.x + metrics.width);
    top = Math.min(top, baseline - ascent); bottom = Math.max(bottom, baseline + descent);
  }
  for (const line of segments) {
    left = Math.min(left, line.x1, line.x2); right = Math.max(right, line.x1, line.x2);
    top = Math.min(top, line.y1, line.y2); bottom = Math.max(bottom, line.y1, line.y2);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top) || right <= left || bottom <= top) throw new Error('A layer has no measurable content');
  return { left, top, right, bottom };
}

export function createInkFormation(options: {
  blocks: InkBlockSpec[]; paperColor: string; maxPixelRatio?: number; enabled?: boolean;
}): InkFormationApi {
  const blocks: InkBlock[] = options.blocks.map(spec => ({ spec, state: 'waiting', elapsed: 0, lastTick: 0, layers: [], hidden: false }));
  const paperColor = options.paperColor;
  const pixelLimit = options.maxPixelRatio ?? 1.5;
  let pixelRatio = Math.min(pixelLimit, window.devicePixelRatio || 1);
  let renderer: T.WebGLRenderer | null = null, camera: T.OrthographicCamera | null = null;
  let scene: T.Scene | null = null, canvas: HTMLCanvasElement | null = null;
  let fallbackReason: string | null = null, raf = 0, disposed = false, paused = false, fontsReady = false;
  let pausedByVisibility = false;
  const listeners: Array<() => void> = [];
  const inkCache = new Map<string, T.Color>();
  const inkColor = (css: string) => { let value = inkCache.get(css); if (!value) { value = new T.Color(css); inkCache.set(css, value); } return value; };

  const listen = (target: EventTarget, name: string, callback: EventListener, config?: AddEventListenerOptions) => {
    target.addEventListener(name, callback, config); listeners.push(() => target.removeEventListener(name, callback, config));
  };
  const setState = (block: InkBlock, state: InkBlockState) => { block.state = state; block.spec.element.dataset.inkState = state; };
  const showNative = (block: InkBlock) => { if (block.hidden) block.spec.element.classList.remove('ink-source-hidden'); block.hidden = false; };
  const hideNative = (block: InkBlock) => { if (!block.hidden) block.spec.element.classList.add('ink-source-hidden'); block.hidden = true; };
  const releaseLayer = (layer: InkLayer) => {
    if (layer.disposed) return;
    layer.disposed = true; scene?.remove(layer.mesh);
    layer.mesh.material.uniforms.uMask.value.dispose(); layer.mesh.material.uniforms.uField.value.dispose();
    layer.mesh.material.dispose(); layer.mesh.geometry.dispose();
  };
  const clearLayers = (block: InkBlock) => { block.layers.forEach(releaseLayer); block.layers = []; showNative(block); };
  const fallback = (reason: string) => {
    if (fallbackReason || disposed) return;
    fallbackReason = reason;
    for (const block of blocks) { clearLayers(block); setState(block, 'fallback'); }
    renderer?.dispose(); renderer = null; canvas?.remove(); canvas = null; scene = null; camera = null;
    if (raf) cancelAnimationFrame(raf); raf = 0;
  };

  const positionLayer = (layer: InkLayer) => {
    const rect = layer.anchor.getBoundingClientRect();
    layer.mesh.position.x = rect.left + layer.offsetX + layer.width / 2;
    layer.mesh.position.y = window.innerHeight - (rect.top + layer.offsetY + layer.height / 2);
    layer.mesh.material.uniforms.uViewport.value.set(innerWidth, innerHeight);
    layer.mesh.material.uniforms.uPixelRatio.value = pixelRatio;
    if (layer.clipTo) {
      const clip = layer.clipTo.getBoundingClientRect();
      layer.mesh.material.uniforms.uClipRect.value.set(clip.left, clip.top, clip.right, clip.bottom);
    }
  };

  const makeLayer = (block: InkBlock, plan: InkLayerPlan, runs: TextRun[], segments: InkSegment[], color: string, background: string, order: number) => {
    if (!renderer || !scene) throw new Error('Renderer is unavailable');
    const bounds = textBounds(runs, segments);
    const clipRect = plan.clipTo?.getBoundingClientRect();
    if (clipRect) {
      bounds.left = Math.max(bounds.left, clipRect.left); bounds.right = Math.min(bounds.right, clipRect.right);
      bounds.top = Math.max(bounds.top, clipRect.top); bounds.bottom = Math.min(bounds.bottom, clipRect.bottom);
    }
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null;
    const pad = 24, ratio = pixelRatio;
    const originX = Math.floor((bounds.left - pad) * ratio) / ratio;
    const originY = Math.floor((bounds.top - pad) * ratio) / ratio;
    const endX = Math.ceil((bounds.right + pad) * ratio) / ratio;
    const endY = Math.ceil((bounds.bottom + pad) * ratio) / ratio;
    const width = Math.max(1, Math.ceil((endX - originX) * ratio));
    const height = Math.max(1, Math.ceil((endY - originY) * ratio));
    const localWidth = width / ratio, localHeight = height / ratio;
    const maskCanvas = document.createElement('canvas'); maskCanvas.width = width; maskCanvas.height = height;
    const context = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is unavailable');
    context.scale(ratio, ratio);
    if (clipRect) {
      context.beginPath(); context.rect(clipRect.left - originX, clipRect.top - originY, clipRect.width, clipRect.height); context.clip();
    }
    if (runs.length) { context.fillStyle = background; context.fillRect(0, 0, localWidth, localHeight); }
    context.textBaseline = 'alphabetic'; context.textAlign = 'left';
    const fontContext = context as CanvasRenderingContext2D & { fontKerning?: string; letterSpacing?: string; fontFeatureSettings?: string };
    for (const run of runs) {
      context.font = run.font; context.direction = run.direction;
      if (fontContext.fontKerning !== undefined) fontContext.fontKerning = 'normal';
      if (fontContext.letterSpacing !== undefined) fontContext.letterSpacing = run.letterSpacing;
      if (fontContext.fontFeatureSettings !== undefined) fontContext.fontFeatureSettings = run.fontFeatureSettings;
      context.fillStyle = run.color; context.fillText(run.text, run.x - originX, run.top - originY);
    }
    if (runs.length) {
      const rgb = rgbChannels(color);
      if (!rgb) throw new Error(`Unsupported text color: ${color}`);
      const paper = rgbChannels(background);
      if (!paper) throw new Error(`Unsupported text background: ${background}`);
      const image = context.getImageData(0, 0, width, height), pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) { pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; continue; }
        let coverage = 0;
        for (let channel = 0; channel < 3; channel++) {
          const span = paper[channel] - rgb[channel];
          coverage += Math.abs(span) > 0.01 ? (paper[channel] - pixels[i + channel]) / span : 0;
        }
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
        pixels[i + 3] = Math.round(Math.max(0, Math.min(1, coverage / 3)) * 255);
      }
      context.putImageData(image, 0, 0);
    }
    context.fillStyle = '#fff';
    for (const line of segments) {
      const snap = (value: number) => Math.round(value * ratio) / ratio;
      const left = snap(Math.min(line.x1, line.x2));
      const right = snap(Math.max(line.x1, line.x2));
      const top = snap(Math.min(line.y1, line.y2) - line.width / 2);
      context.globalAlpha = line.alpha ?? 1;
      context.fillRect(left - originX, top - originY, right - left, line.width);
    }
    context.globalAlpha = 1;
    const { texture: field, sdfRange, seedRange } = createField(maskCanvas, ratio);
    const mask = new T.CanvasTexture(maskCanvas);
    mask.colorSpace = T.NoColorSpace; mask.minFilter = mask.magFilter = T.LinearFilter;
    mask.generateMipmaps = false; mask.needsUpdate = true;
    const uniforms = {
      uMask: { value: mask }, uField: { value: field }, uSize: { value: new T.Vector2(localWidth, localHeight) },
      uPageOrigin: { value: new T.Vector2(window.scrollX + originX, window.scrollY + originY) },
      uProgress: { value: 0 }, uSdfRange: { value: sdfRange }, uSeedRange: { value: seedRange },
      uPoolRadius: { value: plan.poolDiameter / 2 }, uInk: { value: inkColor(color) },
      uClipRect: { value: new T.Vector4() }, uViewport: { value: new T.Vector2(innerWidth, innerHeight) },
      uPixelRatio: { value: pixelRatio }, uClipEnabled: { value: plan.clipTo ? 1 : 0 },
    };
    const material = new T.ShaderMaterial({ vertexShader, fragmentShader, uniforms,
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, premultipliedAlpha: false });
    const geometry = new T.PlaneGeometry(localWidth, localHeight), mesh = new T.Mesh(geometry, material);
    mesh.renderOrder = order; mesh.position.z = 0; mesh.frustumCulled = false; scene.add(mesh);
    const anchor = plan.anchor ?? plan.clipTo ?? block.spec.element;
    const anchorRect = anchor.getBoundingClientRect();
    const layer: InkLayer = { mesh, anchor, offsetX: originX - anchorRect.left, offsetY: originY - anchorRect.top,
      width: localWidth, height: localHeight, start: plan.start, duration: plan.duration, clipTo: plan.clipTo, disposed: false };
    positionLayer(layer);
    return layer;
  };

  const buildBlock = (block: InkBlock) => {
    clearLayers(block); block.elapsed = 0;
    const layerOrder: InkLayer[] = [];
    for (const plan of block.spec.layers()) {
      const allRuns = collectRuns(plan.sources);
      const colors = new Map<string, TextRun[]>();
      for (const run of allRuns) { const key = `${run.color}\n${run.background}`; const group = colors.get(key) ?? []; group.push(run); colors.set(key, group); }
      for (const [key, runs] of colors) {
        const [color, background] = key.split('\n');
        const layer = makeLayer(block, plan, runs, [], color, background, layerOrder.length + 1);
        if (layer) layerOrder.push(layer);
      }
      const byColor = new Map<string, InkSegment[]>();
      for (const segment of plan.segments ?? []) {
        const color = segment.color ?? '#211c17', group = byColor.get(color) ?? [];
        group.push(segment); byColor.set(color, group);
      }
      for (const [color, lines] of byColor) {
        const layer = makeLayer(block, plan, [], lines, color, paperColor, layerOrder.length + 1);
        if (layer) layerOrder.push(layer);
      }
    }
    if (!layerOrder.length) throw new Error('Ink block contains no visible glyphs or rules');
    block.layers = layerOrder; hideNative(block);
  };

  const setLayerProgress = (block: InkBlock) => {
    for (const layer of block.layers) {
      layer.mesh.material.uniforms.uProgress.value = Math.max(0, Math.min(1, (block.elapsed - layer.start) / layer.duration));
      positionLayer(layer);
    }
  };
  const render = () => { if (renderer && scene && camera) renderer.render(scene, camera); };
  const completeBlock = (block: InkBlock) => { clearLayers(block); block.elapsed = block.spec.duration; setState(block, 'complete'); };
  const beginBlock = (block: InkBlock) => {
    if (block.state !== 'waiting' || fallbackReason) return false;
    try { buildBlock(block); block.elapsed = 0; block.lastTick = 0; setState(block, paused ? 'paused' : 'active'); return true; }
    catch (error) { console.warn('Ink layer setup failed', error); fallback('setup-failed'); return false; }
  };
  const positionFloorSeconds = (block: InkBlock) => {
    const finishLine = block.spec.finishLineViewportHeights;
    if (finishLine === undefined) return 0;
    const height = Math.max(1, innerHeight), triggerLine = block.spec.triggerLineViewportHeights ?? .8;
    const top = block.spec.element.getBoundingClientRect().top;
    const progress = Math.max(0, Math.min(1, (triggerLine * height - top) / ((triggerLine - finishLine) * height)));
    return block.spec.duration * progress;
  };
  const currentVisibility = (block: InkBlock) => { const rect = block.spec.element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; };
  const scanTriggers = (replay = false) => {
    if (!fontsReady || fallbackReason) return;
    for (const block of blocks) if (block.state === 'paused') setLayerProgress(block);
    const started: InkBlock[] = [];
    for (const block of blocks) {
      if (block.state !== 'waiting') continue;
      const rect = block.spec.element.getBoundingClientRect();
      if (rect.bottom <= 0) { completeBlock(block); continue; }
      const finishLine = block.spec.finishLineViewportHeights;
      if (!paused && finishLine !== undefined && rect.top <= innerHeight * finishLine) { completeBlock(block); continue; }
      const triggerLine = block.spec.triggerLineViewportHeights ?? .8;
      if (rect.top <= innerHeight * triggerLine && beginBlock(block)) started.push(block);
    }
    if (replay) for (const block of blocks) {
      const triggerLine = block.spec.triggerLineViewportHeights ?? .8;
      if (block.state === 'waiting' && currentVisibility(block) && block.spec.element.getBoundingClientRect().top <= innerHeight * triggerLine && beginBlock(block)) started.push(block);
    }
    const now = performance.now(); for (const block of started) block.lastTick = now;
    if (!paused) for (const block of blocks) {
      if (block.state !== 'active' || block.spec.finishLineViewportHeights === undefined) continue;
      block.elapsed = Math.max(block.elapsed, positionFloorSeconds(block));
      if (block.elapsed >= block.spec.duration) completeBlock(block); else setLayerProgress(block);
    }
  };
  const frame = (now: number) => {
    raf = 0;
    if (disposed || fallbackReason || !renderer || !scene || !camera || document.hidden) return;
    let active = false;
    for (const block of blocks) {
      if (block.state !== 'active') continue;
      active = true;
      block.elapsed = Math.max(block.elapsed + Math.max(0, (now - block.lastTick) / 1000), positionFloorSeconds(block));
      block.lastTick = now;
      if (block.elapsed >= block.spec.duration) { completeBlock(block); continue; }
      setLayerProgress(block);
    }
    render();
    if (active && blocks.some(block => block.state === 'active')) raf = requestAnimationFrame(frame);
  };
  const requestRender = () => { if (!fallbackReason && !disposed && !raf && !document.hidden) raf = requestAnimationFrame(frame); };
  const pause = () => {
    if (fallbackReason || disposed) return;
    paused = true; const now = performance.now();
    for (const block of blocks) {
      if (block.state !== 'active') continue;
      block.elapsed += Math.max(0, (now - block.lastTick) / 1000); block.lastTick = now;
      if (block.elapsed >= block.spec.duration) { completeBlock(block); continue; }
      setLayerProgress(block); setState(block, 'paused');
    }
    if (raf) cancelAnimationFrame(raf); raf = 0; render();
  };
  const play = () => {
    if (fallbackReason || disposed) return;
    paused = false;
    for (const block of blocks) if (block.state === 'paused') { setState(block, 'active'); block.lastTick = performance.now(); }
    scanTriggers(); requestRender();
  };
  const replay = () => {
    if (!fontsReady || fallbackReason || disposed) return;
    paused = false;
    for (const block of blocks) { clearLayers(block); block.elapsed = 0; block.lastTick = 0; setState(block, 'waiting'); hideNative(block); }
    scanTriggers(true); requestRender();
  };
  const seek = (id: string, seconds: number) => {
    const block = blocks.find(candidate => candidate.spec.id === id);
    if (!block || !fontsReady || fallbackReason || disposed || !Number.isFinite(seconds)) return;
    pause();
    if (seconds >= block.spec.duration) { completeBlock(block); render(); return; }
    if (block.state === 'complete' || block.state === 'waiting') buildBlock(block);
    block.elapsed = Math.max(0, seconds); block.lastTick = performance.now(); setLayerProgress(block); setState(block, 'paused'); render();
  };
  const finishAll = () => { for (const block of blocks) completeBlock(block); if (raf) cancelAnimationFrame(raf); raf = 0; render(); };
  const onScroll = () => { if (!fallbackReason && !disposed) { scanTriggers(); requestRender(); } };
  const onResize = () => {
    if (fallbackReason || disposed) return;
    for (const block of blocks) if (block.state === 'active' || block.state === 'paused') completeBlock(block);
    pixelRatio = Math.min(pixelLimit, window.devicePixelRatio || 1);
    if (renderer && camera) {
      camera.right = innerWidth; camera.top = innerHeight; camera.bottom = 0; camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false); render();
    }
    scanTriggers();
  };
  const onElementScroll = (event: Event) => {
    const target = event.currentTarget;
    const block = blocks.find(candidate => candidate.spec.completeOnScroll === target);
    if (block && (block.state === 'active' || block.state === 'paused')) { completeBlock(block); render(); }
  };
  const revealInteractive = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest('a,button,summary,[tabindex]:not([tabindex="-1"])');
    if (!control) return;
    const marked = control.closest<HTMLElement>('[data-ink]');
    const block = (marked && blocks.find(candidate => candidate.spec.element === marked))
      ?? blocks.find(candidate => control.contains(candidate.spec.element) || candidate.spec.element.contains(control));
    if (block && block.state !== 'complete') { completeBlock(block); render(); }
  };
  const diagnostics = (): InkFormationDiagnostics => ({
    supported: !fallbackReason, fallback: fallbackReason, pixelRatio,
    blocks: blocks.map(block => ({ id: block.spec.id, selector: block.spec.selector,
      text: (block.spec.element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), state: block.state,
      progress: block.spec.duration ? Math.min(1, block.elapsed / block.spec.duration) : 0,
      elapsedSeconds: block.elapsed, duration: block.spec.duration,
      triggerLineViewportHeights: block.spec.triggerLineViewportHeights ?? .8,
      finishLineViewportHeights: block.spec.finishLineViewportHeights ?? null })),
    activeRenderingCount: blocks.reduce((count, block) => count + block.layers.filter(layer => !layer.disposed).length, 0),
    canvasPresent: Boolean(canvas?.isConnected),
  });
  const setMotionEnabled = (enabled: boolean) => { if (!enabled) fallback('motion-off'); };
  const dispose = () => {
    if (disposed) return; disposed = true;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    blocks.forEach(clearLayers); listeners.forEach(remove => remove());
    renderer?.dispose(); renderer = null; canvas?.remove(); canvas = null;
  };

  const api: InkFormationApi = { replay, pause, play, seek, diagnostics, dispose, setMotionEnabled };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fallback('reduced-motion'); return api; }
  if (!options.enabled) { fallback('motion-off'); return api; }
  if (!supportsWebgl()) { fallback('missing-webgl'); return api; }
  try {
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true });
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
    renderer.setClearColor(paperColor, 0); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false);
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = () => fallback('setup-failed');
    canvas = renderer.domElement; canvas.id = 'site-ink-canvas'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:68';
    document.body.append(canvas);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback('context-lost'); });
    camera = new T.OrthographicCamera(0, innerWidth, innerHeight, 0, -10, 10); scene = new T.Scene();
    listen(window, 'scroll', onScroll, { passive: true }); listen(window, 'resize', onResize, { passive: true });
    listen(window.matchMedia('(prefers-reduced-motion: reduce)'), 'change', event => { if ((event as MediaQueryListEvent).matches) fallback('reduced-motion'); });
    for (const block of blocks) if (block.spec.completeOnScroll) listen(block.spec.completeOnScroll, 'scroll', onElementScroll, { passive: true });
    listen(document, 'visibilitychange', () => {
      if (document.hidden) { pausedByVisibility = !paused; if (pausedByVisibility) pause(); }
      else if (pausedByVisibility) { pausedByVisibility = false; play(); }
    });
    listen(window, 'beforeprint', () => finishAll());
    listen(document, 'pointerover', revealInteractive, { passive: true });
    listen(window, 'focusin', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest<HTMLElement>('[data-ink]');
      const block = (element && blocks.find(candidate => candidate.spec.element === element))
        ?? blocks.find(candidate => candidate.spec.element.contains(target) || target.contains(candidate.spec.element));
      if (block && block.state !== 'complete') { completeBlock(block); render(); }
    });
    renderer.render(scene, camera);
    document.fonts.ready.then(() => {
      if (!disposed && !fallbackReason) {
        fontsReady = true;
        for (const block of blocks) hideNative(block);
        onScroll();
      }
    });
  } catch (error) { console.warn('Ink renderer setup failed', error); fallback('setup-failed'); }
  return api;
}
