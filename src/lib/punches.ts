/** The six supported punches, numbered with standard boxing call numbers. */
export type PunchId =
  | "jab"
  | "cross"
  | "leftHook"
  | "rightHook"
  | "leftUppercut"
  | "rightUppercut";

export interface Punch {
  id: PunchId;
  /** Conventional boxing number (1 = jab … 6 = rear uppercut). */
  number: number;
  name: string;
  /** Short human description of the audio cue, shown in the UI. */
  cueHint: string;
}

export const PUNCHES: readonly Punch[] = [
  { id: "jab", number: 1, name: "Jab", cueHint: "1 high beep" },
  { id: "cross", number: 2, name: "Cross", cueHint: "2 mid beeps" },
  { id: "leftHook", number: 3, name: "Left Hook", cueHint: "Rising sweep" },
  { id: "rightHook", number: 4, name: "Right Hook", cueHint: "Falling sweep" },
  { id: "leftUppercut", number: 5, name: "Left Uppercut", cueHint: "1 low buzz" },
  { id: "rightUppercut", number: 6, name: "Right Uppercut", cueHint: "2 low buzzes" },
];

export const PUNCH_IDS: readonly PunchId[] = PUNCHES.map((p) => p.id);

const BY_ID = Object.fromEntries(PUNCHES.map((p) => [p.id, p])) as Record<PunchId, Punch>;

export function getPunch(id: PunchId): Punch {
  return BY_ID[id];
}

export function isPunchId(value: unknown): value is PunchId {
  return typeof value === "string" && Object.hasOwn(BY_ID, value);
}

export function emptyCounts(): Record<PunchId, number> {
  return Object.fromEntries(PUNCH_IDS.map((id) => [id, 0])) as Record<PunchId, number>;
}
