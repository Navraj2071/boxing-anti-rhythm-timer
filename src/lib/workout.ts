/**
 * Optional sets (rounds): N sets of fixed length with rest between them.
 * When sets are off the session runs until the user stops it.
 */
export interface SetsConfig {
  enabled: boolean;
  count: number;
  workSec: number;
  restSec: number;
}

export const SETS_LIMITS = {
  count: { min: 1, max: 20, step: 1 },
  workSec: { min: 30, max: 60 * 60, step: 30 },
  restSec: { min: 0, max: 10 * 60, step: 15 },
} as const;

export const DEFAULT_SETS: SetsConfig = { enabled: false, count: 3, workSec: 180, restSec: 60 };

/** One-tap choices shown next to the steppers. */
export const QUICK_PICKS = {
  count: [2, 3, 5, 10],
  workSec: [60, 120, 180, 300, 600],
  restSec: [30, 45, 60, 90, 120],
} as const;

/** Fixed for the duration of a session (read at Start). */
export interface Workout {
  /** null = continuous (no sets). */
  sets: number | null;
  workMs: number;
  restMs: number;
}

export function clampSetValue(key: keyof typeof SETS_LIMITS, value: number): number {
  const { min, max } = SETS_LIMITS[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function toWorkout(cfg: SetsConfig): Workout {
  return cfg.enabled
    ? { sets: cfg.count, workMs: cfg.workSec * 1000, restMs: cfg.restSec * 1000 }
    : { sets: null, workMs: Infinity, restMs: 0 };
}

/** "3:00", "10:00", "0:45" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "3 min", "1 min 30 s", "45 s" */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m && s) return `${m} min ${s} s`;
  return m ? `${m} min` : `${s} s`;
}

export function totalWorkoutSec(cfg: SetsConfig): number {
  return cfg.count * cfg.workSec + Math.max(0, cfg.count - 1) * cfg.restSec;
}
