(() => {
'use strict';

/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function wpick(items) {
  let tot = 0; for (const it of items) tot += it[1];
  let r = Math.random() * tot;
  for (const it of items) { r -= it[1]; if (r <= 0) return it[0]; }
  return items[items.length - 1][0];
}
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* ---------- canvases ---------- */
const cv = document.getElementById('sky');
const ctx = cv.getContext('2d');
const mk = () => document.createElement('canvas');
const skyC = mk(), skyX = skyC.getContext('2d');
const fxC = mk(), fxX = fxC.getContext('2d');
const blA = mk(), blAX = blA.getContext('2d');
const blB = mk(), blBX = blB.getContext('2d');
let W = 1, H = 1, S = 1, dpr = 1, Y0 = 1;
const starsBright = [];

function resize() {
  const cssW = Math.max(1, window.innerWidth), cssH = Math.max(1, window.innerHeight);
  let d = Math.min(window.devicePixelRatio || 1, 2);
  while (cssW * cssH * d * d > 2.6e6 && d > 0.5) d -= 0.25;
  dpr = d;
  W = Math.max(2, Math.round(cssW * d));
  H = Math.max(2, Math.round(cssH * d));
  S = Math.min(H / 800, W / 520);
  Y0 = H;
  for (const c of [cv, skyC, fxC]) { c.width = W; c.height = H; }
  blA.width = Math.max(2, W >> 2); blA.height = Math.max(2, H >> 2);
  blB.width = Math.max(2, W >> 4); blB.height = Math.max(2, H >> 4);
  buildSky();
}

/* ---------- sky and stars ---------- */
function buildSky() {
  const g = skyX;
  g.globalCompositeOperation = 'source-over';
  const gr = g.createLinearGradient(0, 0, 0, Y0);
  gr.addColorStop(0, '#02040b');
  gr.addColorStop(0.5, '#070c1c');
  gr.addColorStop(0.82, '#0b1124');
  gr.addColorStop(1, '#0c1226');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const R = rng(7);
  g.globalCompositeOperation = 'lighter';
  starsBright.length = 0;
  for (let i = 0; i < 110; i++) {
    const x = R(), y = R() * 0.97, m = Math.pow(R(), 3);
    const s = (0.5 + m * 1.1) * dpr;
    const a = (0.08 + m * 0.38) * 1;
    const cr = (230 + R() * 25) | 0, cg = (235 + R() * 20) | 0;
    g.fillStyle = 'rgba(' + cr + ',' + cg + ',255,' + a.toFixed(3) + ')';
    g.fillRect(x * W, y * H, s, s);
    if (m > 0.5 && starsBright.length < 10) {
      starsBright.push({ x: x * W, y: y * H, s: s * 1.25, a: 0.35, ph: R() * TAU, f: 0.8 + R() * 2.2 });
    }
  }
  g.globalCompositeOperation = 'source-over';

}

/* ---------- sound (all synthesised) ---------- */
const A = {
  ctx: null, on: false, master: null, verb: null, nb: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.on; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(ctx.destination);
    /* a darker, longer room: the open air that makes a boom roll away */
    const len = Math.floor(ctx.sampleRate * 3.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const dd = ir.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        y += ((Math.random() * 2 - 1) - y) * 0.08;
        dd[i] = y * Math.pow(1 - i / len, 2.4) * 5;
      }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    this.verb.connect(wet); wet.connect(this.master);
    const nl = ctx.sampleRate * 3;
    this.nb = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.nb.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.on = true;
    this.ambient();
    return true;
  },
  noise(loop) {
    const s = this.ctx.createBufferSource(); s.buffer = this.nb; s.loop = !!loop; return s;
  },
  route(node, pan, wet) {
    const ctx = this.ctx; let n = node;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n.connect(p); n = p; }
    n.connect(this.master);
    const s = ctx.createGain(); s.gain.value = wet; n.connect(s); s.connect(this.verb);
  },
  /* one noise burst through a filter with a sharp attack and an exponential decay */
  hit(t, type, f0, f1, q, peak, attack, decay, pan, wet) {
    const ctx = this.ctx;
    const n = this.noise(false);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    n.connect(f); f.connect(g); this.route(g, pan, wet);
    n.start(t, Math.random() * 2); n.stop(t + decay + 0.05);
  },
  sub(t, f0, f1, peak, decay, pan, wet) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); this.route(g, pan, wet); o.start(t); o.stop(t + decay + 0.05);
  },
  /* a shell going off: sharp crack, the body of the bang, a sub thump, a long rumble, and an echo */
  boom(delay, pan, size, far, vol) {
    if (!this.on) return;
    const t = this.ctx.currentTime + delay, v = vol == null ? 1 : vol;
    const near = 1 - far * 0.75;
    this.hit(t, 'lowpass', 1300, 350, 0.7, 0.6 * v * near * (0.6 + size * 0.5), 0.001, 0.12 + size * 0.06, pan, 0.2);
    this.hit(t, 'lowpass', 900 * (1 - far * 0.4), 90, 0.8, 1.1 * v * (0.5 + size * 0.6), 0.003, 0.7 + size * 1.0, pan, 0.3);
    this.sub(t, 85, 28, 1.3 * v * (0.55 + size * 0.5), 0.65 + size * 0.5, pan, 0.25);
    this.hit(t + 0.05, 'lowpass', 150, 90, 0.5, 0.32 * v * (0.5 + size * 0.5), 0.12, 1.6 + size * 1.4, pan, 0.4);
    const e = 0.38 + Math.random() * 0.4;
    this.hit(t + e, 'lowpass', 400, 100, 0.6, 0.28 * v, 0.02, 0.9 + size * 0.5, -pan * 0.6, 0.4);
  },
  /* the popping and sizzling that follows: clusters of sharp little clicks */
  crackle(delay, pan, count, spread, far) {
    if (!this.on) return;
    const ctx = this.ctx, base = ctx.currentTime + delay;
    let done = 0;
    while (done < count) {
      const centre = base + Math.pow(Math.random(), 1.3) * spread;
      const cluster = Math.min(count - done, 1 + ((Math.random() * 5) | 0));
      for (let i = 0; i < cluster; i++) {
        const t = centre + Math.random() * 0.07;
        const pk = Math.pow(Math.random(), 2.2) * 0.16 * (1 - 0.35 * far) + 0.015;
        this.hit(t, 'bandpass', rand(700, 2600), rand(500, 1800), 0.5, pk, 0.001, rand(0.01, 0.04), pan + rand(-0.3, 0.3), 0.1);
      }
      done += cluster;
    }
  },
  ambient() {
    const ctx = this.ctx;
    const w = this.noise(true);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.3;
    const wg = ctx.createGain(); wg.gain.value = 0.02;
    const l = ctx.createOscillator(); l.frequency.value = 0.07;
    const ld = ctx.createGain(); ld.gain.value = 0.012; l.connect(ld); ld.connect(wg.gain);
    w.connect(lp); lp.connect(wg); wg.connect(this.master);
    w.start(0, Math.random() * 2); l.start();
    const chirp = () => {
      if (!this.on) return;
      const t0 = ctx.currentTime + 0.02, f = rand(4300, 4900);
      const pulses = 3 + ((Math.random() * 2) | 0), pan = rand(-0.9, 0.9), vol = rand(0.002, 0.005);
      for (let i = 0; i < pulses; i++) {
        const t = t0 + i * 0.034;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
        o.connect(g); this.route(g, pan, 0.1); o.start(t); o.stop(t + 0.03);
      }
      setTimeout(chirp, rand(900, 3200));
    };
    setTimeout(chirp, 800);
  }
};

/* ---------- fireworks ---------- */
const PAL = {
  gold: { c: [[255, 196, 96]], ember: true },
  silver: { c: [[255, 246, 232]] },
  red: { c: [[255, 58, 48]] },
  rose: { c: [[255, 70, 150]] },
  orange: { c: [[255, 132, 40]], ember: true },
  green: { c: [[76, 255, 138]] },
  blue: { c: [[80, 170, 255]] },
  violet: { c: [[176, 104, 255]] },
  redgold: { c: [[255, 58, 48], [255, 196, 96]] },
  bluewhite: { c: [[80, 170, 255], [255, 246, 232]] },
  greenviolet: { c: [[76, 255, 138], [176, 104, 255]] }
};
const PAL_ITEMS = [['gold', 3], ['red', 2], ['rose', 2], ['orange', 2], ['green', 1.6], ['blue', 2], ['violet', 1.6], ['silver', 1.4], ['redgold', 1.2], ['bluewhite', 1], ['greenviolet', 0.7]];
const TYPES = {
  peony:   { k: 1.35, T: [1.7, 2.3], g: 95, trail: 0.03,  white: 0.14, size: 1.7, n: 210, fade: 1.25 },
  chrys:   { k: 1.25, T: [2.0, 2.6], g: 85, trail: 0.10,  white: 0.16, size: 1.6, n: 230, fade: 1.0, sw: true },
  willow:  { k: 1.75, T: [3.4, 4.4], g: 58, trail: 0.13,  white: 0.10, size: 1.7, n: 150, fade: 0.9, ember: true },
  ring:    { k: 1.3,  T: [1.6, 2.0], g: 80, trail: 0.035, white: 0.14, size: 1.9, n: 96,  fade: 1.2, ring: true },
  crackle: { k: 1.45, T: [1.3, 1.7], g: 100, trail: 0.05, white: 0.10, size: 2.2, n: 80,  fade: 1.1, crk: 5 },
  star:    { k: 1.7,  T: [2.6, 3.2], g: 28, trail: 0.03,  white: 0.2,  size: 2.4, n: 300, fade: 0.7 },
  wish:    { k: 0.85, T: [8, 10], g: 10, trail: 0.05, white: 0.25, size: 2.6, n: 300, fade: 0.55 },
  strobe:  { k: 1.3,  T: [2.4, 3.2], g: 75, trail: 0.012, white: 0.05, size: 2.0, n: 80,  fade: 0.7, strobe: true }
};
const SOUND_CRACKLE = { peony: 8, chrys: 12, willow: 16, ring: 4, crackle: 55, strobe: 18, double: 10 };

const rockets = [], sparks = [], later = [];
let clock = 0, last = 0;
const spk = { x: 0, y: 0, on: false, acc: 0 };

function newShell() {
  const type = wpick([['peony', 0.24], ['chrys', 0.2], ['willow', 0.14], ['ring', 0.08], ['crackle', 0.1], ['strobe', 0.08], ['double', 0.1]]);
  let palName = wpick(PAL_ITEMS);
  if (type === 'willow') palName = Math.random() < 0.8 ? 'gold' : 'silver';
  if (type === 'crackle') palName = wpick([['gold', 3], ['orange', 2], ['silver', 2]]);
  if (type === 'strobe') palName = wpick([['silver', 4], ['gold', 1], ['blue', 1]]);
  let innerName = wpick(PAL_ITEMS);
  if (innerName === palName) innerName = 'silver';
  const Rk = wpick([[[95, 125], 0.15], [[140, 210], 0.6], [[220, 290], 0.2], [[300, 340], 0.05]]);
  const R = Math.min(rand(Rk[0], Rk[1]) * S, W * 0.45);
  return { type, pal: PAL[palName], inner: PAL[innerName].c, R };
}

function launchRocket(opts) {
  opts = opts || {};
  const shell = opts.shell || newShell();
  const minApex = shell.R * 0.9 + 30 * S;
  let apex = opts.apexY != null ? opts.apexY : rand(H * 0.2, H * 0.55);
  if (!opts.free) apex = clamp(apex, minApex, Math.max(minApex, Y0 * 0.72));
  const h = Math.max(120 * S, Y0 - apex);
  const g = 300 * S * (opts.gMul || 1), v0 = Math.sqrt(2 * g * h);
  const x = clamp(opts.x != null ? opts.x : rand(W * 0.08, W * 0.92), W * 0.04, W * 0.96);
  rockets.push({ x, y: Y0 + 10 * S, px: x, py: Y0 + 10 * S, vx: rand(-14, 14) * S, vy: -v0, g, apex, shell, acc: 0, near: !!opts.near });
}

function tailSpark(k) {
  return {
    x: k.x, y: k.y, vx: k.vx * 0.1 + rand(-15, 15) * S, vy: rand(20, 60) * S, drag: 2, grav: 80 * S,
    life: 0, max: rand(0.35, 0.8), size: 1.1 * S, r: 255, g: 175, b: 80, r2: 0, g2: 0, b2: 0, sw: 0,
    ember: true, strobe: false, fr: 0, ph: Math.random(), white: 0.3, trail: 0.03, fade: 1.3, crk: 0
  };
}

function addBurst(x, y, T, R, cols, ember, scale, sizeMul, nBase) {
  const life = rand(T.T[0], T.T[1]);
  const v0 = R * T.k / (1 - Math.exp(-T.k * life));
  const n = Math.round(nBase * scale * rand(0.9, 1.1));
  const tilt = rand(0, TAU), sq = rand(0.88, 1.08), tx = rand(0.25, 1.25);
  const swAt = T.sw ? rand(0.45, 0.6) : 0;
  const spread = T.k > 1.6 ? [0.5, 1.05] : [0.93, 1.06];
  for (let i = 0; i < n; i++) {
    let dx, dy;
    if (T.star) {
      const j = i % 10, ang0 = -Math.PI / 2 + j * Math.PI / 5, ang1 = ang0 + Math.PI / 5, u = Math.random();
      const r0 = j % 2 ? 0.42 : 1, r1 = j % 2 ? 1 : 0.42;
      dx = lerp(Math.cos(ang0) * r0, Math.cos(ang1) * r1, u);
      dy = lerp(Math.sin(ang0) * r0, Math.sin(ang1) * r1, u);
    } else if (T.ring) {
      const a = i / n * TAU + rand(-0.02, 0.02);
      const px = Math.cos(a), py = Math.sin(a) * Math.cos(tx);
      dx = px * Math.cos(tilt) - py * Math.sin(tilt);
      dy = px * Math.sin(tilt) + py * Math.cos(tilt);
    } else {
      const z = rand(-1, 1), a = rand(0, TAU), rr = Math.sqrt(1 - z * z);
      dx = rr * Math.cos(a) * sq; dy = rr * Math.sin(a) / sq;
    }
    const sp = T.star ? v0 * rand(0.99, 1.01) : v0 * rand(spread[0], spread[1]);
    const col = cols.length > 1 ? (T.ring ? cols[i % cols.length] : pick(cols)) : cols[0];
    sparks.push({
      x, y, vx: dx * sp, vy: dy * sp, drag: T.k * rand(0.92, 1.08), grav: T.g * S * rand(0.9, 1.1),
      life: 0, max: life * rand(0.85, 1.12), size: T.size * S * sizeMul * rand(0.85, 1.15),
      r: col[0], g: col[1], b: col[2], r2: 255, g2: 200, b2: 110, sw: swAt,
      ember: !!ember, strobe: !!T.strobe, fr: rand(7, 14), ph: Math.random(), white: T.white,
      trail: T.trail, fade: T.fade, crk: T.crk || 0
    });
  }
}

function explode(x, y, shell, near) {
  const type = shell.type, R = shell.R;
  let T = type === 'double' ? TYPES.peony : TYPES[type];
  if (shell.wish) T = Object.assign({}, T, { T: [T.T[0] * 1.7, T.T[1] * 1.7], size: T.size * 1.4 });
  const scale = clamp(R / (180 * S), 0.6, shell.wish ? 3.4 : 1.5);
  if (sparks.length < 5500) {
    addBurst(x, y, T, R, shell.pal.c, shell.pal.ember || T.ember, scale, 1, T.n);
    if (shell.wish) addBurst(x, y, Object.assign({}, TYPES.peony, { T: [3, 3.8] }), R * 0.32, shell.inner, false, scale, 0.9, 90);
    if (type === 'double') addBurst(x, y, TYPES.peony, R * 0.5, shell.inner, false, scale, 0.6, 110);
  }
  if (shell.wish) { dir.hold = false; dir.phase = 'lull'; dir.phaseEnd = clock + 12; dir.next = 4; }
  const size01 = clamp(R / (300 * S), 0, 1);
  const pan = x / W * 2 - 1;
  const dist = near ? rand(0.25, 0.6) : lerp(0.3, 1.25, Math.pow(Math.random(), 0.8));
  const far = clamp((dist - 0.25) / 1.0, 0, 1);
  A.boom(dist, pan, size01, far);
  A.crackle(dist + 0.05, pan, shell.wish ? 40 : Math.round((SOUND_CRACKLE[type] || 8) * 0.35), shell.wish ? 3 : 0.7 + size01 * 1.1 + (type === 'willow' ? 1.2 : 0), far);
}

function crackleSplit(s) {
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), sp = rand(60, 140) * S;
    sparks.push({
      x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, grav: 60 * S,
      life: 0, max: rand(0.12, 0.4), size: 1.2 * S, r: 255, g: 240, b: 210, r2: 0, g2: 0, b2: 0, sw: 0,
      ember: false, strobe: true, fr: rand(14, 24), ph: Math.random(), white: 0.3, trail: 0.02, fade: 0.8, crk: 0
    });
  }
}

/* ---------- wishes ---------- */
function launchWish() {
  dir.hold = true; later.length = 0;
  const type = wpick([['peony', 1], ['chrys', 1], ['willow', 1], ['ring', 0.8], ['crackle', 0.8], ['star', 0.8], ['double', 1], ['strobe', 0.6]]);
  let palName = wpick(PAL_ITEMS);
  if (type === 'willow') palName = wpick([['gold', 3], ['silver', 1]]);
  if (type === 'crackle') palName = wpick([['gold', 3], ['orange', 2], ['silver', 1]]);
  let innerName = wpick(PAL_ITEMS);
  if (innerName === palName) innerName = 'silver';
  const R = Math.max(W, H) * rand(0.45, 0.6);
  const shell = { type, pal: PAL[palName], inner: PAL[innerName].c, R, wish: true };
  launchRocket({ shell, x: W * 0.5 + rand(-W * 0.04, W * 0.04), apexY: H * 0.4, near: true, free: true, gMul: 0.1 });
}

/* ---------- show director ---------- */
const dir = { next: 0.5, phase: 'normal', phaseEnd: 0, hold: false };
function runLater(dt) {
  for (let i = later.length - 1; i >= 0; i--) {
    later[i].t -= dt;
    if (later[i].t <= 0) { const f = later[i].fn; later.splice(i, 1); f(); }
  }
}
function volley(count) {
  const shared = count > 1 && Math.random() < 0.3 ? newShell() : null;
  let t = 0;
  for (let i = 0; i < count; i++) {
    let shell = null;
    if (shared) shell = Object.assign({}, shared, { R: shared.R * rand(0.9, 1.1) });
    t += i === 0 ? 0 : (shared ? rand(0.15, 0.35) : rand(0.05, 1.0));
    if (t === 0) launchRocket({ shell }); else later.push({ t, fn: () => launchRocket({ shell }) });
  }
}
function directorStep(dt) {
  if (dir.hold) return;
  dir.next -= dt;
  if (clock > dir.phaseEnd) {
    const r = Math.random();
    if (r < 0.18) { dir.phase = 'lull'; dir.phaseEnd = clock + rand(4, 9); }
    else if (r < 0.38) { dir.phase = 'swell'; dir.phaseEnd = clock + rand(6, 12); }
    else { dir.phase = 'normal'; dir.phaseEnd = clock + rand(8, 20); }
  }
  if (dir.next > 0) return;
  const roll = Math.random();
  let count, gap;
  if (dir.phase === 'lull') { count = roll < 0.5 ? 0 : 1; gap = rand(2.2, 5.5); }
  else if (dir.phase === 'swell') { count = roll < 0.15 ? 1 : roll < 0.4 ? 2 : roll < 0.7 ? 3 : roll < 0.9 ? 4 : 5; gap = rand(0.5, 1.8); }
  else { count = roll < 0.14 ? 0 : roll < 0.5 ? 1 : roll < 0.72 ? 2 : roll < 0.9 ? 3 : 4; gap = rand(1.0, 4.2); }
  if (count > 0 && rockets.length + count < 12 && sparks.length < 5000) volley(count);
  else if (count === 0 && Math.random() < 0.5) A.boom(rand(0, 0.8), rand(-1, 1), 0.3, 1, 0.35);
  dir.next = gap + count * 0.2;
}

/* ---------- frame ---------- */
function twinkle(t) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < starsBright.length; i++) {
    const s = starsBright[i];
    const a = s.a * (0.7 + 0.3 * Math.sin(t * s.f + s.ph));
    ctx.fillStyle = 'rgba(255,250,240,' + a.toFixed(3) + ')';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

function frame(now) {
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016) || 0.016;
  last = now; clock += dt;
  directorStep(dt); runLater(dt);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(skyC, 0, 0);
  twinkle(clock);

  /* sparks and rockets draw into a persistent layer that fades, which makes the trails */
  fxX.globalCompositeOperation = 'destination-out';
  fxX.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-dt / 0.14)).toFixed(3) + ')';
  fxX.fillRect(0, 0, W, H);
  fxX.globalCompositeOperation = 'lighter';
  fxX.lineCap = 'round';

  for (let i = rockets.length - 1; i >= 0; i--) {
    const k = rockets[i];
    k.vy += k.g * dt; k.px = k.x; k.py = k.y; k.x += k.vx * dt; k.y += k.vy * dt;
    k.acc += dt * 150;
    while (k.acc >= 1) { k.acc -= 1; if (sparks.length < 6500) sparks.push(tailSpark(k)); }
    if (k.shell.wish) { fxX.strokeStyle = 'rgba(255,190,100,0.5)'; fxX.lineWidth = 7 * S; fxX.beginPath(); fxX.moveTo(k.px, k.py); fxX.lineTo(k.x, k.y); fxX.stroke(); }
    fxX.strokeStyle = 'rgba(255,225,170,0.95)'; fxX.lineWidth = 2.2 * S;
    fxX.beginPath(); fxX.moveTo(k.px, k.py); fxX.lineTo(k.x, k.y); fxX.stroke();
    if (k.vy > -26 * S || k.y <= k.apex) { rockets.splice(i, 1); explode(k.x, k.y, k.shell, k.near); }
  }

  if (spk.on) {
    spk.acc += dt * 70;
    while (spk.acc >= 1) {
      spk.acc -= 1;
      if (sparks.length > 5200) break;
      const a = rand(0, TAU), sp = rand(40, 190) * S;
      const hot = Math.random() < 0.35;
      sparks.push({
        x: spk.x + rand(-1, 1) * S, y: spk.y + rand(-1, 1) * S, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * S, drag: 3.2, grav: 160 * S,
        life: 0, max: rand(0.25, 0.7), size: (hot ? 1.8 : 1.2) * S, r: 255, g: hot ? 240 : 200, b: hot ? 200 : 110, r2: 0, g2: 0, b2: 0, sw: 0,
        ember: !hot, strobe: false, fr: 0, ph: Math.random(), white: 0.3, trail: 0.03, fade: 1, crk: 0
      });
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.max) {
      if (s.crk) crackleSplit(s);
      sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue;
    }
    const e = Math.exp(-s.drag * dt);
    s.vx *= e; s.vy = s.vy * e + s.grav * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    const t = s.life / s.max;
    let r = s.r, g = s.g, b = s.b;
    if (s.sw && t > s.sw) { const m = smooth(s.sw, s.sw + 0.1, t); r = lerp(r, s.r2, m); g = lerp(g, s.g2, m); b = lerp(b, s.b2, m); }
    if (s.ember) { const m = smooth(0.5, 1, t); r = lerp(r, 215, m); g = lerp(g, 75, m); b = lerp(b, 25, m); }
    const wm = 1 - smooth(0, s.white, t);
    r += (255 - r) * wm; g += (255 - g) * wm; b += (255 - b) * wm;
    let a = Math.pow(1 - t, s.fade);
    if (s.strobe) { const ph = (s.life * s.fr + s.ph) % 1; a *= ph < 0.3 ? 1 : 0.04; }
    else a *= 0.78 + 0.22 * Math.sin(s.ph * 40 + s.life * 38);
    if (a < 0.02) continue;
    const tr = Math.max(s.trail, dt);
    fxX.strokeStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + Math.min(1, a).toFixed(3) + ')';
    fxX.lineWidth = s.size * (1 - t * 0.45);
    fxX.beginPath(); fxX.moveTo(s.x - s.vx * tr, s.y - s.vy * tr); fxX.lineTo(s.x, s.y); fxX.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(fxC, 0, 0);
  blAX.clearRect(0, 0, blA.width, blA.height);
  blAX.drawImage(fxC, 0, 0, blA.width, blA.height);
  blBX.clearRect(0, 0, blB.width, blB.height);
  blBX.drawImage(blA, 0, 0, blB.width, blB.height);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.25; ctx.drawImage(blA, 0, 0, W, H);
  ctx.globalAlpha = 1;

  if (spk.on) {
    const L = 70 * S, ex = spk.x + L * 0.3, ey = spk.y + L * 0.95;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    const gr = ctx.createLinearGradient(spk.x, spk.y, ex, ey);
    gr.addColorStop(0, '#3a2a22'); gr.addColorStop(0.25, '#8d939e'); gr.addColorStop(1, '#4a4f58');
    ctx.strokeStyle = gr; ctx.lineWidth = 2.4 * S;
    ctx.beginPath(); ctx.moveTo(spk.x, spk.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.8 + 0.2 * Math.sin(clock * 40);
    const rg = ctx.createRadialGradient(spk.x, spk.y, 0, spk.x, spk.y, 34 * S);
    rg.addColorStop(0, 'rgba(255,240,200,' + (0.9 * fl).toFixed(3) + ')');
    rg.addColorStop(0.3, 'rgba(255,170,70,' + (0.4 * fl).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = rg; ctx.fillRect(spk.x - 34 * S, spk.y - 34 * S, 68 * S, 68 * S);
    ctx.globalCompositeOperation = 'source-over';
  }

  requestAnimationFrame(frame);
}

/* ---------- interaction ---------- */
const hint = document.getElementById('hint');
let hintTimer = 0, lastTap = 0;

function startAudio() { A.init(); }
function fadeHintSoon() {
  if (hintTimer) return;
  hintTimer = setTimeout(() => hint.classList.add('gone'), 2500);
}
function trackSpk(e) {
  const rect = cv.getBoundingClientRect();
  spk.x = (e.clientX - rect.left) / rect.width * W;
  spk.y = (e.clientY - rect.top) / rect.height * H;
  spk.on = true;
}
document.addEventListener('pointermove', (e) => { if (e.target.closest && e.target.closest('#wishPanel')) spk.on = false; else trackSpk(e); });
document.addEventListener('pointerleave', () => { spk.on = false; });
cv.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') spk.on = false; });
cv.addEventListener('pointerdown', (e) => {
  trackSpk(e);
  e.preventDefault();
  startAudio(); fadeHintSoon();
  const nowT = performance.now();
  if (nowT - lastTap < 110) return;
  lastTap = nowT;
  const rect = cv.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  let y = (e.clientY - rect.top) / rect.height * H;
  if (y > Y0 * 0.93) y = Y0 * 0.5;
  if (!dir.hold && rockets.length < 14) launchRocket({ x, apexY: y, near: true });
});
document.addEventListener('pointerdown', startAudio);
document.addEventListener('keydown', startAudio);
cv.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startAudio(); fadeHintSoon(); launchRocket({ near: true }); }
});

const wishBtn = document.getElementById('wishBtn');
const wishPanel = document.getElementById('wishPanel');
const wishText = document.getElementById('wishText');
function openWish() { wishPanel.hidden = true; wishPanel.hidden = false; wishBtn.hidden = true; hint.classList.add('gone'); setTimeout(() => wishText.focus(), 30); }
function closeWish() { wishPanel.hidden = true; wishBtn.hidden = false; }
wishBtn.addEventListener('click', () => { startAudio(); openWish(); });
document.getElementById('wishCancel').addEventListener('click', closeWish);
wishPanel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWish(); });
function sendWish() {
  const text = wishText.value.trim();
  if (!text) { wishText.focus(); return; }
  closeWish(); wishText.value = '';
  startAudio();
  launchWish();
}
document.getElementById('wishSend').addEventListener('click', (e) => { e.preventDefault(); sendWish(); });
wishPanel.addEventListener('submit', (e) => { e.preventDefault(); });
wishText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWish(); } });

let rsz = 0;
window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(resize, 120); });

resize();
requestAnimationFrame(frame);
})();
