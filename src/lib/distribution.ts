import { PUNCH_IDS, type PunchId } from "./punches.ts";

export type DistributionMode = "equal" | "custom";
export type Percentages = Record<PunchId, number>;

export interface Weighted<T extends string = PunchId> {
  id: T;
  weight: number;
}

export type WeightedPunch = Weighted<PunchId>;

/**
 * In equal mode, the punch just played gets its weight multiplied by this
 * factor for the next pick. The penalty applies identically to every punch,
 * so long-run frequencies stay uniform while back-to-back repeats get rarer.
 */
export const EQUAL_MODE_REPEAT_FACTOR = 0.35;
/** In equal mode, never play the same punch more than this many times in a row. */
export const EQUAL_MODE_MAX_RUN = 2;

/** Integer split of 100% across the selected punches (remainder goes to the first ones). */
export function equalSplit(selected: readonly PunchId[]): Percentages {
  const result = Object.fromEntries(PUNCH_IDS.map((id) => [id, 0])) as Percentages;
  if (selected.length === 0) return result;
  const base = Math.floor(100 / selected.length);
  let remainder = 100 - base * selected.length;
  for (const id of selected) {
    result[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return result;
}

export interface ValidationResult {
  valid: boolean;
  total: number;
  error: string | null;
}

export function validateCustom(selected: readonly PunchId[], percentages: Percentages): ValidationResult {
  let total = 0;
  for (const id of selected) {
    const v = percentages[id];
    if (!Number.isInteger(v) || v < 0 || v > 100) {
      return { valid: false, total: NaN, error: "Each percentage must be a whole number from 0 to 100." };
    }
    total += v;
  }
  if (total !== 100) {
    return { valid: false, total, error: `Percentages total ${total}%. They must add up to exactly 100%.` };
  }
  return { valid: true, total, error: null };
}

/** Builds the weight table for the selected punches. Unselected punches are never included. */
export function buildWeights(
  selected: readonly PunchId[],
  mode: DistributionMode,
  percentages: Percentages,
): WeightedPunch[] {
  if (mode === "equal") return selected.map((id) => ({ id, weight: 1 }));
  return selected.map((id) => ({ id, weight: percentages[id] })).filter((w) => w.weight > 0);
}

/**
 * Picks the next item (a punch or a combo) by weighted random selection.
 *
 * - Custom mode samples directly from the configured weights, so long-run
 *   frequencies match the configured percentages.
 * - Equal mode damps immediate repeats and forbids runs longer than
 *   EQUAL_MODE_MAX_RUN. The adjustment is the same for every punch, so the
 *   overall distribution stays uniform.
 */
export function pickItem<T extends string>(
  weights: readonly Weighted<T>[],
  mode: DistributionMode,
  history: readonly T[],
  rng: () => number = Math.random,
): T {
  if (weights.length === 0) throw new Error("Nothing available to pick from.");
  if (weights.length === 1) return weights[0].id;

  let adjusted = weights;
  if (mode === "equal" && history.length > 0) {
    const last = history[history.length - 1];
    let run = 0;
    for (let i = history.length - 1; i >= 0 && history[i] === last; i--) run++;
    const factor = run >= EQUAL_MODE_MAX_RUN ? 0 : EQUAL_MODE_REPEAT_FACTOR;
    adjusted = weights.map((w) => (w.id === last ? { id: w.id, weight: w.weight * factor } : w));
  }

  const total = adjusted.reduce((sum, w) => sum + w.weight, 0);
  let r = rng() * total;
  for (const w of adjusted) {
    r -= w.weight;
    if (r < 0) return w.id;
  }
  // Floating-point safety net: the last punch with a non-zero weight.
  for (let i = adjusted.length - 1; i >= 0; i--) if (adjusted[i].weight > 0) return adjusted[i].id;
  return adjusted[adjusted.length - 1].id;
}
