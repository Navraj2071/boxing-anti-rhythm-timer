/**
 * Centralised timing configuration. Tweak these values after testing in a
 * real session; everything else derives from them.
 *
 * The gap is the quiet time between the end of one call and the start of the
 * next. It must cover reaction time (~0.2-0.3 s), the punch itself and the
 * return to guard, so even the fastest speed keeps a 0.9 s minimum.
 */
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface TimingRange {
  /** Shortest allowed gap (ms). */
  minMs: number;
  /** Longest allowed gap (ms). */
  maxMs: number;
}

export interface DifficultyPreset {
  label: string;
  description: string;
  /** Position on the speed slider. */
  speed: number;
}

export const SPEED_MIN = 1;
export const SPEED_MAX = 10;
export const SPEED_STEP = 0.5;

/** Speed level → gap range. Levels between anchors are interpolated. */
const SPEED_ANCHORS: readonly (TimingRange & { level: number })[] = [
  { level: 1, minMs: 3500, maxMs: 6500 },
  { level: 3, minMs: 2500, maxMs: 5000 },
  { level: 6, minMs: 1600, maxMs: 3400 },
  { level: 9, minMs: 1000, maxMs: 2300 },
  { level: 10, minMs: 900, maxMs: 1900 },
];

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  beginner: { label: "Beginner", description: "Slow pace with time to reset", speed: 3 },
  intermediate: { label: "Intermediate", description: "Moderate pace, quicker reactions", speed: 6 },
  advanced: { label: "Advanced", description: "Fast pace, sharp reactions", speed: 9 },
};

export const DIFFICULTIES: readonly Difficulty[] = ["beginner", "intermediate", "advanced"];

export const DEFAULT_SPEED = DIFFICULTY_PRESETS.beginner.speed;

/** Delay before the first call after Start or Resume, giving time to get into stance. */
export const GET_READY_RANGE: TimingRange = { minMs: 2000, maxMs: 4000 };

/** Share of intervals drawn from a centre-weighted (triangular) distribution; the rest are uniform. */
export const CENTRE_WEIGHTED_SHARE = 0.7;

/** Re-roll an interval that lands within this fraction of the range from the previous one. */
export const MIN_VARIATION_FRACTION = 0.12;

/**
 * If a scheduled cue fires this late, the browser throttled or suspended the
 * page. The cue is skipped (never burst-played) and the session resynchronises.
 */
export const LATE_CUE_THRESHOLD_MS = 1200;

/** Extra recovery added to the gap for every punch after the first in a combo. */
export const COMBO_EXTRA_GAP_PER_PUNCH_MS = 350;

/** With sets: a warning clap this long before each set ends (skipped for very short sets). */
export const SET_WARNING_BEFORE_END_MS = 10_000;

/** No call may still be sounding this close to the end-of-set bell. */
export const SET_END_MARGIN_MS = 500;

/**
 * How far ahead calls are scheduled on the audio clock. Short in the
 * foreground so settings changes apply quickly; long in the background,
 * where browsers may run timers only about once a minute.
 */
export const FOREGROUND_LOOKAHEAD_MS = 1500;
export const BACKGROUND_LOOKAHEAD_MS = 75_000;

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && Object.hasOwn(DIFFICULTY_PRESETS, value);
}

export function clampSpeed(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_SPEED;
  const stepped = Math.round(level / SPEED_STEP) * SPEED_STEP;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, stepped));
}

/** Gap range for a speed level (rounded to 50 ms). */
export function rangeForSpeed(level: number): TimingRange {
  const s = clampSpeed(level);
  let i = 1;
  while (i < SPEED_ANCHORS.length - 1 && s > SPEED_ANCHORS[i].level) i++;
  const a = SPEED_ANCHORS[i - 1];
  const b = SPEED_ANCHORS[i];
  const t = (s - a.level) / (b.level - a.level);
  const round = (v: number) => Math.round(v / 50) * 50;
  return { minMs: round(a.minMs + (b.minMs - a.minMs) * t), maxMs: round(a.maxMs + (b.maxMs - a.maxMs) * t) };
}

/** The preset sitting exactly at this speed, if any. */
export function presetForSpeed(level: number): Difficulty | null {
  return DIFFICULTIES.find((d) => DIFFICULTY_PRESETS[d].speed === level) ?? null;
}

function sample({ minMs, maxMs }: TimingRange, rng: () => number): number {
  // Mix a triangular distribution (mean of two uniforms, peaks mid-range)
  // with plain uniform draws so the extremes still turn up occasionally.
  const t = rng() < CENTRE_WEIGHTED_SHARE ? (rng() + rng()) / 2 : rng();
  return minMs + t * (maxMs - minMs);
}

/**
 * Random gap until the next cue, always within [minMs, maxMs]. Avoids
 * drawing nearly the same gap twice in a row so no rhythm emerges.
 */
export function nextInterval(range: TimingRange, previousMs: number | null, rng: () => number = Math.random): number {
  const tolerance = (range.maxMs - range.minMs) * MIN_VARIATION_FRACTION;
  let value = sample(range, rng);
  for (let attempt = 0; attempt < 3 && previousMs !== null && Math.abs(value - previousMs) < tolerance; attempt++) {
    value = sample(range, rng);
  }
  return Math.round(Math.min(range.maxMs, Math.max(range.minMs, value)));
}

export function getReadyDelay(rng: () => number = Math.random): number {
  return nextInterval(GET_READY_RANGE, null, rng);
}
