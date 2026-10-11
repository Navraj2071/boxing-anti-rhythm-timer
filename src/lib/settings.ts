import { isCueStyle, type CueStyle } from "./audio.ts";
import { COMBOS, DEFAULT_COMBOS, getCombo } from "./combos.ts";
import {
  buildWeights,
  equalSplit,
  validateCustom,
  type DistributionMode,
  type Percentages,
} from "./distribution.ts";
import { getPunch, isPunchId, PUNCH_IDS, type PunchId } from "./punches.ts";
import type { SessionPlan } from "./session.ts";
import { clampSpeed, DEFAULT_SPEED, DIFFICULTY_PRESETS, isDifficulty, rangeForSpeed } from "./timing.ts";
import { clampSetValue, DEFAULT_SETS, type SetsConfig } from "./workout.ts";

/** "punches": call single punches. "combos": call whole combinations. */
export type TrainingMode = "punches" | "combos";

export interface TrainerSettings {
  trainingMode: TrainingMode;
  selected: PunchId[];
  mode: DistributionMode;
  percentages: Percentages;
  /** Combination ids (e.g. "1-2-3"), in the order of COMBOS. */
  combos: string[];
  /** Speed slider level (SPEED_MIN-SPEED_MAX); presets are fixed points on it. */
  speed: number;
  cueStyle: CueStyle;
  sets: SetsConfig;
}

export const DEFAULT_SETTINGS: TrainerSettings = {
  trainingMode: "punches",
  selected: ["jab", "cross"],
  mode: "equal",
  percentages: equalSplit(["jab", "cross"]),
  combos: [...DEFAULT_COMBOS],
  speed: DEFAULT_SPEED,
  cueStyle: "tones",
  sets: DEFAULT_SETS,
};

/** Returns the session plan, or an error explaining why the settings cannot start a session. */
export function resolvePlan(settings: TrainerSettings): { plan: SessionPlan | null; error: string | null } {
  const timing = rangeForSpeed(settings.speed);
  if (settings.trainingMode === "combos") {
    if (settings.combos.length === 0) return { plan: null, error: "Select at least one combination." };
    const items = settings.combos.map((id) => {
      const c = getCombo(id)!;
      return { id, label: id, punches: c.punches, weight: 1 };
    });
    return { plan: { items, mode: "equal", timing }, error: null };
  }

  if (settings.selected.length === 0) return { plan: null, error: "Select at least one punch." };
  if (settings.mode === "custom") {
    const check = validateCustom(settings.selected, settings.percentages);
    if (!check.valid) return { plan: null, error: check.error };
  }
  const items = buildWeights(settings.selected, settings.mode, settings.percentages).map((w) => ({
    id: w.id,
    label: getPunch(w.id).name,
    punches: [w.id],
    weight: w.weight,
  }));
  return { plan: { items, mode: settings.mode, timing }, error: null };
}

/** Keeps selected punches in canonical order (Jab, Cross, …). */
export function sortPunches(ids: Iterable<PunchId>): PunchId[] {
  const set = new Set(ids);
  return PUNCH_IDS.filter((id) => set.has(id));
}

/** Keeps combos in list order and drops unknown ids. */
export function sortCombos(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return COMBOS.filter((c) => set.has(c.id)).map((c) => c.id);
}

const STORAGE_KEY = "boxing-reflex-trainer:settings:v1";

function loadSets(raw: unknown): SetsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_SETS;
  const r = raw as Record<string, unknown>;
  const num = (key: "count" | "workSec" | "restSec") =>
    typeof r[key] === "number" ? clampSetValue(key, r[key] as number) : DEFAULT_SETS[key];
  return { enabled: r.enabled === true, count: num("count"), workSec: num("workSec"), restSec: num("restSec") };
}

export function loadSettings(): TrainerSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const selected = Array.isArray(data.selected) ? sortPunches(data.selected.filter(isPunchId)) : null;
    const mode = data.mode === "equal" || data.mode === "custom" ? data.mode : null;
    if (!selected || !mode) return null;
    // Older saves stored only a difficulty preset.
    const speed =
      typeof data.speed === "number"
        ? clampSpeed(data.speed)
        : isDifficulty(data.difficulty)
          ? DIFFICULTY_PRESETS[data.difficulty].speed
          : DEFAULT_SPEED;
    const cueStyle = isCueStyle(data.cueStyle) ? data.cueStyle : DEFAULT_SETTINGS.cueStyle;
    const percentages = equalSplit([]);
    const stored = (data.percentages ?? {}) as Record<string, unknown>;
    for (const id of PUNCH_IDS) {
      const v = stored[id];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100) percentages[id] = v;
    }
    const trainingMode: TrainingMode = data.trainingMode === "combos" ? "combos" : "punches";
    const combos = Array.isArray(data.combos)
      ? sortCombos(data.combos.filter((c): c is string => typeof c === "string"))
      : [...DEFAULT_COMBOS];
    return { trainingMode, selected, mode, percentages, combos, speed, cueStyle, sets: loadSets(data.sets) };
  } catch {
    return null;
  }
}

export function saveSettings(settings: TrainerSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode, quota); preferences just won't persist */
  }
}
