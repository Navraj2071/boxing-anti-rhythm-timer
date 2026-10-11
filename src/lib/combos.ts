import { getPunch, type PunchId } from "./punches.ts";

/**
 * Common boxing combinations using the standard numbering
 * (1 jab, 2 cross, 3 lead hook, 4 rear hook, 5 lead uppercut, 6 rear uppercut).
 * Compiled from basic-combination guides by ExpertBoxing
 * (expertboxing.com/7-basic-boxing-combinations) and Evolve MMA
 * (evolve-mma.com/blog/15-basic-boxing-combinations-you-should-master-first).
 */
export interface Combo {
  id: string;
  punches: PunchId[];
  /** Short coaching note shown in the picker. */
  note: string;
}

const P: Record<number, PunchId> = {
  1: "jab",
  2: "cross",
  3: "leftHook",
  4: "rightHook",
  5: "leftUppercut",
  6: "rightUppercut",
};

function combo(numbers: string, note: string): Combo {
  return { id: numbers, punches: numbers.split("-").map((n) => P[Number(n)]), note };
}

export const COMBOS: readonly Combo[] = [
  combo("1-2", "The basic one-two"),
  combo("1-1-2", "Double jab, then the cross"),
  combo("1-2-3", "One-two, finish with the hook"),
  combo("2-3-2", "Close range, no jab"),
  combo("1-2-3-2", "Jab, then three power shots"),
  combo("1-2-5-2", "Uppercut lifts the guard for the cross"),
  combo("1-6-3-2", "Rear uppercut inside the jab"),
  combo("5-2-3", "Lead uppercut to open up"),
  combo("6-3", "Rear uppercut, lead hook"),
  combo("3-4-2", "Hook, hook, cross"),
];

export const COMBO_IDS: readonly string[] = COMBOS.map((c) => c.id);

export const DEFAULT_COMBOS: readonly string[] = ["1-2", "1-1-2", "1-2-3", "2-3-2", "1-2-5-2"];

const BY_ID = new Map(COMBOS.map((c) => [c.id, c]));

export function getCombo(id: string): Combo | undefined {
  return BY_ID.get(id);
}

export function comboNames(c: Combo): string {
  return c.punches.map((p) => getPunch(p).name).join(" · ");
}
