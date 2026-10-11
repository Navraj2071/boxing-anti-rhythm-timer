/**
 * Generates the six "trainer voice" call-outs as WAV files using a small
 * hand-written formant speech synthesiser (Klatt-style source/filter model).
 * No speech models, TTS engines or libraries: just oscillators, noise and
 * resonant filters driven by hand-tuned phonetic parameters.
 *
 *   node scripts/generate-voice.mjs
 *
 * Output: public/audio/voice/<punchId>.wav (24 kHz, 16-bit mono)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 24000;
/** Noise levels relative to voicing (calibrated against spectrograms). */
const FRIC_GAIN = 0.45;
const ASP_GAIN = 0.5;
/** Global pitch scale; < 1 gives a deeper, barking trainer voice. */
const PITCH_SCALE = Number(process.env.PITCH_SCALE ?? 0.78);
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio", "voice");

// ---------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------

/** Deterministic PRNG so regenerated files are identical. */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Klatt digital resonator (unity gain at DC); used for vocal-tract formants. */
class Resonator {
  y1 = 0;
  y2 = 0;
  process(x, f, bw) {
    const c = -Math.exp((-2 * Math.PI * bw) / SR);
    const b = 2 * Math.exp((-Math.PI * bw) / SR) * Math.cos((2 * Math.PI * f) / SR);
    const a = 1 - b - c;
    const y = a * x + b * this.y1 + c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** RBJ biquad (band-pass with 0 dB peak, or high-pass), recomputed per sample. */
class Biquad {
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  process(x, type, f, q) {
    const w0 = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0, b1, b2;
    if (type === "bp") {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    } else {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    }
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    const y = (b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2) / a0;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Peaking EQ biquad with fixed coefficients. */
function peakingEq(samples, f, q, gainDb) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = 1 + alpha * A, b1 = -2 * cos, b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A, a1 = -2 * cos, a2 = 1 - alpha / A;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return samples.map((x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  });
}

/**
 * Derivative of a Rosenberg glottal pulse (flow derivative already includes
 * lip radiation). A short open quotient gives the bright, pressed quality of
 * a shouted voice.
 */
function glottalFlow(phase, openQuotient) {
  const tp = openQuotient * 0.68;
  if (phase < tp) return 0.5 * (1 - Math.cos((Math.PI * phase) / tp));
  if (phase < openQuotient) return Math.cos(((Math.PI / 2) * (phase - tp)) / (openQuotient - tp));
  return 0;
}

// ---------------------------------------------------------------------------
// Phonetic inventory (male voice, shouted: raised F1, pressed phonation)
// ---------------------------------------------------------------------------

const B = [90, 110, 160, 250];
const PLACE = {
  ae: [820, 1720, 2480, 3500], // "jab"
  ao: [690, 1060, 2520, 3400], // "cross"
  eh: [620, 1820, 2560, 3500], // "left"
  uh: [480, 1160, 2320, 3400], // "hook"
  ah: [640, 1300, 2550, 3500], // "UPpercut", "cut"
  aiA: [800, 1260, 2500, 3500], // "right" (start of diphthong)
  aiI: [440, 1980, 2640, 3500], // "right" (end of diphthong)
  er: [480, 1300, 1520, 3200], // "uppER"
  r: [400, 950, 1450, 3300],
  l: [380, 1020, 2760, 3400],
  dzh: [300, 1900, 2600, 3500],
  lab: [320, 1050, 2250, 3400],
  vel: [360, 1650, 2300, 3400],
  alv: [360, 1750, 2620, 3500],
};

const DEFAULT_FRIC = [
  [3000, 1500],
  [5000, 2500],
];

/**
 * A segment holds target parameters; the renderer glides from the previous
 * segment's values over `tf` ms (formants) and `ta` ms (amplitudes).
 *   av voicing, ah aspiration, af frication amplitude
 *   fr two frication band-pass [Hz, bandwidth], hp optional frication high-pass
 *   p  pitch target (Hz) at the segment's midpoint
 */
function seg(d, place, o = {}) {
  return {
    d,
    f: PLACE[place],
    b: o.b ?? B,
    av: o.av ?? 0,
    ah: o.ah ?? 0,
    af: o.af ?? 0,
    fr: o.fr ?? DEFAULT_FRIC,
    hp: o.hp ?? 0,
    p: o.p,
    tf: o.tf ?? 40,
    ta: o.ta ?? 10,
  };
}

const sil = (d, place) => seg(d, place, { ta: 12 });

// Consonant helpers ---------------------------------------------------------
const FR_T = [[4200, 1600], [6200, 2600]];
const FR_K = [[1850, 380], [2700, 700]];
const FR_P = [[1000, 1800], [2600, 2400]];
const FR_S = [[5200, 1700], [7300, 2600]];
const FR_F = [[2600, 3200], [6500, 4000]];
const FR_DZH = [[2700, 800], [3900, 1400]];

const stopT = (aspPlace, asp = 25) => [
  seg(42, "alv", { ta: 8 }),
  seg(6, "alv", { af: 0.3, fr: FR_T, hp: 2500, ta: 1 }),
  seg(asp, aspPlace, { ah: 0.2, af: 0.04, fr: FR_T, ta: 6, tf: 15 }),
];
const stopK = (aspPlace, { voiceBar = 0.05, asp = 35, closure = 45 } = {}) => [
  seg(closure, "vel", { av: voiceBar, tf: 30, ta: 12 }),
  seg(14, "vel", { af: 0.6, fr: FR_K, ta: 1 }),
  seg(asp, aspPlace, { ah: 0.7, af: 0.2, fr: FR_K, ta: 6, tf: 20 }),
];
const hookTail = () => [
  seg(70, "uh", { ah: 0.45, ta: 25, tf: 8 }), // h (soft onset, no burst)
  seg(75, "uh", { av: 1, ah: 0.05, p: 240, tf: 10, ta: 15 }), // HOO-
  seg(85, "uh", { av: 0.95, ah: 0.05, p: 175, tf: 0 }), // -ook (falling shout)
  ...stopK("vel", { voiceBar: 0.04, asp: 45, closure: 50 }),
  sil(30, "vel"),
];
const uppercutTail = () => [
  seg(80, "ah", { av: 1, ah: 0.06, p: 240, tf: 20, ta: 12 }), // UP
  seg(45, "lab", { tf: 30, ta: 10 }), // p closure
  seg(8, "lab", { af: 0.4, fr: FR_P, ta: 1 }),
  seg(28, "er", { ah: 0.45, af: 0.06, fr: FR_P, ta: 6, tf: 15 }),
  seg(70, "er", { av: 0.9, ah: 0.04, p: 195, tf: 25 }), // -er-
  ...stopK("ah", { voiceBar: 0.03, asp: 50, closure: 38 }),
  seg(85, "ah", { av: 0.95, ah: 0.05, p: 165, tf: 30 }), // -cut
  seg(45, "alv", { tf: 25, ta: 10 }),
  seg(7, "alv", { af: 0.3, fr: FR_T, hp: 2500, ta: 1 }),
  seg(30, "alv", { ah: 0.1, ta: 15 }),
  sil(25, "alv"),
];
const left = () => [
  sil(20, "l"),
  seg(65, "l", { av: 0.8, ah: 0.03, p: 175, ta: 18 }),
  seg(105, "eh", { av: 1, ah: 0.05, p: 195, tf: 45 }),
  seg(85, "lab", { af: 0.2, fr: FR_F, ta: 12, tf: 20 }), // f
];
const right = () => [
  sil(20, "r"),
  seg(65, "r", { av: 0.8, ah: 0.03, p: 180, ta: 18 }),
  seg(95, "aiA", { av: 1, ah: 0.05, p: 200, tf: 45 }),
  seg(85, "aiI", { av: 0.95, ah: 0.05, p: 185, tf: 85 }),
];

// The six call-outs ----------------------------------------------------------
const WORDS = {
  jab: [
    sil(20, "dzh"),
    seg(35, "dzh", { av: 0.06, ta: 6 }), // closure + voice bar
    seg(8, "dzh", { af: 1, fr: FR_DZH, ta: 1 }), // release burst
    seg(55, "dzh", { af: 0.45, av: 0.35, fr: FR_DZH, p: 205, ta: 6, tf: 15 }),
    seg(90, "ae", { av: 1, ah: 0.05, p: 225, tf: 55 }),
    seg(125, "ae", { av: 0.95, ah: 0.06, p: 170, tf: 0 }),
    seg(55, "lab", { av: 0.1, tf: 30, ta: 15 }),
    seg(10, "lab", { af: 0.18, av: 0.05, fr: FR_P, ta: 1 }),
    seg(40, "lab", { ah: 0.05, ta: 15 }),
    sil(25, "lab"),
  ],
  cross: [
    sil(25, "vel"),
    seg(14, "vel", { af: 0.6, fr: FR_K, ta: 1 }),
    seg(50, "r", { ah: 0.75, af: 0.25, fr: FR_K, ta: 6, tf: 20 }),
    seg(70, "r", { av: 0.85, ah: 0.05, p: 205, tf: 15 }),
    seg(90, "ao", { av: 1, ah: 0.05, p: 225, tf: 65 }),
    seg(95, "ao", { av: 0.95, ah: 0.06, p: 165, tf: 0 }),
    seg(25, "alv", { av: 0.5, af: 0.35, fr: FR_S, hp: 3800, p: 160, ta: 8, tf: 20 }), // vowel→s overlap
    seg(160, "alv", { af: 0.65, fr: FR_S, hp: 3800, ta: 10, tf: 10 }), // s
    seg(40, "alv", { ta: 40 }),
  ],
  leftHook: [...left(), seg(30, "alv", { ta: 15 }), ...hookTail()],
  rightHook: [...right(), seg(30, "alv", { ta: 15 }), ...hookTail()],
  leftUppercut: [...left(), ...stopT("ah", 12), ...uppercutTail()],
  rightUppercut: [...right(), ...stopT("ah", 12), ...uppercutTail()],
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;

function render(segments, seed) {
  const rng = mulberry32(seed);
  const noise = () => rng() * 2 - 1;

  // Pitch track: linear interpolation between segment-midpoint targets.
  const pitchPts = [];
  let t = 0;
  for (const s of segments) {
    if (s.p) pitchPts.push([t + s.d / 2, s.p * PITCH_SCALE]);
    t += s.d;
  }
  const totalMs = t;
  const pitchAt = (ms) => {
    if (ms <= pitchPts[0][0]) return pitchPts[0][1];
    for (let i = 1; i < pitchPts.length; i++) {
      if (ms <= pitchPts[i][0]) {
        const [t0, p0] = pitchPts[i - 1];
        const [t1, p1] = pitchPts[i];
        return lerp(p0, p1, (ms - t0) / (t1 - t0));
      }
    }
    return pitchPts[pitchPts.length - 1][1];
  };

  const n = Math.round((totalMs / 1000) * SR);
  const out = new Float64Array(n);
  const formants = [new Resonator(), new Resonator(), new Resonator(), new Resonator(), new Resonator()];
  const fricBp = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
  const fricHp = new Biquad();
  const aspLp = new Resonator();

  let phase = 0;
  let periodJitter = 1;
  let periodShimmer = 1;
  let prevFlow = 0;
  let tilt1 = 0;
  const TILT_K = 1 - Math.exp((-2 * Math.PI * 2000) / SR);
  // Smoothed amplitudes (one-pole) avoid clicks between segments.
  let av = 0, ah = 0, af = 0;

  let segIdx = 0;
  let segStart = 0;
  let prev = segments[0];
  for (let i = 0; i < n; i++) {
    const ms = (i / SR) * 1000;
    while (segIdx < segments.length - 1 && ms >= segStart + segments[segIdx].d) {
      prev = segments[segIdx];
      segStart += segments[segIdx].d;
      segIdx++;
    }
    const s = segments[segIdx];
    const local = ms - segStart;
    const kf = s.tf > 0 ? Math.min(1, local / s.tf) : 1;
    const ease = kf * kf * (3 - 2 * kf);
    const f = s.f.map((v, k) => lerp(prev.f[k], v, ease));
    const bw = s.b.map((v, k) => lerp(prev.b[k], v, ease));
    const fr = s.fr.map((band, k) => [lerp(prev.fr[k][0], band[0], ease), lerp(prev.fr[k][1], band[1], ease)]);
    const hp = lerp(prev.hp, s.hp, ease);

    const coeff = 1 - Math.exp(-1 / ((Math.max(s.ta, 0.5) / 1000) * SR * 0.35));
    av += (s.av - av) * coeff;
    ah += (s.ah - ah) * coeff;
    af += (s.af - af) * coeff;

    // Glottal source with slight jitter/shimmer for a less mechanical voice.
    const f0 = pitchAt(ms) * periodJitter;
    phase += f0 / SR;
    if (phase >= 1) {
      phase -= 1;
      periodJitter = 1 + (rng() - 0.5) * 0.02;
      periodShimmer = 1 + (rng() - 0.5) * 0.08;
    }
    const flow = glottalFlow(phase, 0.5);
    const dFlow = (flow - prevFlow) * (SR / 600);
    prevFlow = flow;
    // Gentle spectral tilt (one-pole low-pass) so the voice is bright but not buzzy.
    tilt1 += (dFlow - tilt1) * TILT_K;
    const voice = (0.25 * dFlow + tilt1) * av * periodShimmer;

    // Aspiration: noise, louder during the open phase when voiced (breathy shout).
    const aspNoise = aspLp.process(noise(), 3000, 4000) * 2.2;
    const asp = aspNoise * ah * ASP_GAIN * (av > 0.2 ? 0.4 + 0.6 * flow : 1);

    // Cascade vocal tract: F1-F4 time-varying, F5 fixed.
    let v = voice + asp;
    for (let k = 0; k < 4; k++) v = formants[k].process(v, f[k], bw[k]);
    v = formants[4].process(v, 4300, 300);

    // Frication branch (parallel band-passes, optional high-pass).
    const fn = noise();
    const q0 = fr[0][0] / fr[0][1];
    const q1 = fr[1][0] / fr[1][1];
    let fric =
      fricBp[2].process(fricBp[0].process(fn, "bp", fr[0][0], q0), "bp", fr[0][0], q0) * Math.sqrt(q0) +
      0.7 * fricBp[3].process(fricBp[1].process(fn, "bp", fr[1][0], q1), "bp", fr[1][0], q1) * Math.sqrt(q1);
    if (hp > 50) fric = fricHp.process(fric, "hp", hp, 0.707);
    out[i] = v + fric * af * FRIC_GAIN;
  }
  return out;
}

/** Shout character + loudness: presence boost, gentle saturation, normalise, fades. */
function master(samples) {
  let x = Array.from(samples);
  // Remove DC / rumble.
  let prevIn = 0, prevOut = 0;
  const r = 1 - (2 * Math.PI * 70) / SR;
  x = x.map((v) => {
    const y = v - prevIn + r * prevOut;
    prevIn = v;
    prevOut = y;
    return y;
  });
  x = peakingEq(x, 2600, 1.0, 4); // presence / "bark"
  x = peakingEq(x, 250, 0.8, -2); // less boom
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const drive = 1.3;
  x = x.map((v) => Math.tanh((v / peak) * drive) / Math.tanh(drive));
  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < fade; i++) {
    x[i] *= i / fade;
    x[x.length - 1 - i] *= i / fade;
  }
  const peak2 = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return x.map((v) => (v / peak2) * 0.89);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(OUT_DIR, { recursive: true });
let seed = 1;
for (const [id, segments] of Object.entries(WORDS)) {
  const samples = master(render(segments, seed++));
  writeFileSync(join(OUT_DIR, `${id}.wav`), wav(samples));
  console.log(`${id}.wav  ${Math.round((samples.length / SR) * 1000)} ms`);
}
