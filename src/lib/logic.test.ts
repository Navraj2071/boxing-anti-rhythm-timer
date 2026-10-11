import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWeights, equalSplit, pickItem, validateCustom } from "./distribution.ts";
import { PUNCH_IDS, type PunchId } from "./punches.ts";
import { COMBOS } from "./combos.ts";
import { TrainingSession, type SessionPlan, type SignalKind } from "./session.ts";
import {
  clampSpeed,
  DIFFICULTY_PRESETS,
  COMBO_EXTRA_GAP_PER_PUNCH_MS,
  GET_READY_RANGE,
  nextInterval,
  presetForSpeed,
  rangeForSpeed,
  SPEED_MAX,
  SPEED_MIN,
} from "./timing.ts";
import type { Workout } from "./workout.ts";

function frequencies(picks: PunchId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of picks) out[p] = (out[p] ?? 0) + 1;
  for (const k in out) out[k] /= picks.length;
  return out;
}

function simulate(weights: ReturnType<typeof buildWeights>, mode: "equal" | "custom", n: number): PunchId[] {
  const history: PunchId[] = [];
  for (let i = 0; i < n; i++) history.push(pickItem(weights, mode, history.slice(-8)));
  return history;
}

test("equal mode is approximately uniform and limits runs", () => {
  const selected: PunchId[] = ["jab", "cross", "leftHook"];
  const picks = simulate(buildWeights(selected, "equal", equalSplit(selected)), "equal", 60000);
  const f = frequencies(picks);
  for (const id of selected) assert.ok(Math.abs(f[id] - 1 / 3) < 0.015, `${id}: ${f[id]}`);
  let run = 1;
  for (let i = 1; i < picks.length; i++) {
    run = picks[i] === picks[i - 1] ? run + 1 : 1;
    assert.ok(run <= 2, "no more than two in a row");
  }
});

test("custom mode respects percentages and never plays unselected punches", () => {
  const selected: PunchId[] = ["jab", "cross"];
  const pct = { ...equalSplit([]), jab: 70, cross: 30, leftHook: 50 };
  const picks = simulate(buildWeights(selected, "custom", pct), "custom", 60000);
  const f = frequencies(picks);
  assert.ok(Math.abs(f.jab - 0.7) < 0.015, `jab ${f.jab}`);
  assert.ok(Math.abs(f.cross - 0.3) < 0.015, `cross ${f.cross}`);
  assert.equal(f.leftHook, undefined);
});

test("custom percentages are validated", () => {
  assert.equal(validateCustom(["jab", "cross"], { ...equalSplit([]), jab: 70, cross: 30 }).valid, true);
  assert.equal(validateCustom(["jab", "cross"], { ...equalSplit([]), jab: 70, cross: 20 }).valid, false);
  assert.equal(validateCustom(["jab"], { ...equalSplit([]), jab: 100.5 }).valid, false);
  const split = equalSplit(PUNCH_IDS);
  assert.equal(PUNCH_IDS.reduce((s, id) => s + split[id], 0), 100);
});

test("speed slider maps to sensible ranges that tighten as speed rises", () => {
  assert.deepEqual(rangeForSpeed(DIFFICULTY_PRESETS.beginner.speed), { minMs: 2500, maxMs: 5000 });
  assert.deepEqual(rangeForSpeed(DIFFICULTY_PRESETS.intermediate.speed), { minMs: 1600, maxMs: 3400 });
  assert.deepEqual(rangeForSpeed(DIFFICULTY_PRESETS.advanced.speed), { minMs: 1000, maxMs: 2300 });
  let prev = rangeForSpeed(SPEED_MIN);
  for (let level = SPEED_MIN + 0.5; level <= SPEED_MAX; level += 0.5) {
    const r = rangeForSpeed(level);
    assert.ok(r.minMs <= prev.minMs && r.maxMs <= prev.maxMs && r.minMs < r.maxMs, `level ${level}`);
    assert.ok(r.minMs >= 900, "always physically achievable");
    prev = r;
  }
  assert.equal(clampSpeed(42), SPEED_MAX);
  assert.equal(clampSpeed(NaN), DIFFICULTY_PRESETS.beginner.speed);
  assert.equal(presetForSpeed(6), "intermediate");
  assert.equal(presetForSpeed(6.5), null);
});

test("intervals stay within each speed's limits and faster speeds are faster", () => {
  let prevMean = Infinity;
  for (let level = SPEED_MIN; level <= SPEED_MAX; level++) {
    const preset = rangeForSpeed(level);
    let prev: number | null = null;
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = nextInterval(preset, prev);
      assert.ok(v >= preset.minMs && v <= preset.maxMs);
      sum += v;
      prev = v;
    }
    const mean = sum / 20000;
    assert.ok(mean < prevMean, `speed ${level} should be faster than the previous level`);
    prevMean = mean;
  }
});

const CUE_MS = 200;
const CONTINUOUS: Workout = { sets: null, workMs: Infinity, restMs: 0 };

/**
 * Deterministic fake clock, timers and audio for the session engine.
 * Calls are "heard" only if their scheduled time has passed and they were not
 * silenced beforehand (silence cancels everything still in the future).
 */
function harness(plan: SessionPlan | null) {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const cues: { at: number; punches: PunchId[]; cancelled: boolean }[] = [];
  const signals: { at: number; kind: SignalKind; cancelled: boolean }[] = [];
  let audioOk = true;
  const state = { plan };
  const session = new TrainingSession({
    getPlan: () => state.plan,
    cueDuration: (punches) => CUE_MS * punches.length,
    playCue: (punches, at) => {
      if (!audioOk) return false;
      cues.push({ at, punches, cancelled: false });
      return true;
    },
    playSignal: (kind, at) => signals.push({ at, kind, cancelled: false }),
    silence: () => {
      for (const c of cues) if (c.at > now) c.cancelled = true;
      for (const g of signals) if (g.at > now) g.cancelled = true;
    },
    onChange: () => {},
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id as number),
  });
  return {
    session,
    state,
    now: () => now,
    heard: () => cues.filter((c) => !c.cancelled && c.at <= now),
    scheduled: () => cues.filter((c) => !c.cancelled),
    signals: () => signals.filter((g) => !g.cancelled && g.at <= now),
    pendingTimers: () => timers.size,
    setAudio: (ok: boolean) => (audioOk = ok),
    /** Advance time, running timers in order. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
      }
      now = end;
    },
    /** Jump time without running timers (simulates a frozen or throttled tab). */
    freeze(ms: number) {
      now += ms;
    },
  };
}

const PLAN: SessionPlan = {
  items: [
    { id: "jab", label: "Jab", punches: ["jab"], weight: 1 },
    { id: "cross", label: "Cross", punches: ["cross"], weight: 1 },
  ],
  mode: "equal",
  timing: { minMs: 1000, maxMs: 2300 },
};

function gapsBetween(cues: { at: number; punches: PunchId[] }[]): number[] {
  return cues.slice(1).map((c, i) => c.at - cues[i].at - CUE_MS * cues[i].punches.length);
}

test("continuous session: get-ready delay, then gaps within limits after each call", () => {
  const h = harness(PLAN);
  h.session.start(CONTINUOUS);
  h.advance(GET_READY_RANGE.minMs - 1);
  assert.equal(h.heard().length, 0);
  h.advance(60000);
  const heard = h.heard();
  assert.ok(heard.length >= 60000 / 2500 && heard.length <= 60000 / 1200, `calls: ${heard.length}`);
  for (const g of gapsBetween(heard)) assert.ok(g >= 1000 && g <= 2300, `gap ${g}`);
  assert.equal(h.pendingTimers(), 1);
  assert.equal(h.session.getSnapshot().cueCount, heard.length);
});

test("foreground look-ahead is short; background look-ahead covers throttled timers", () => {
  const h = harness(PLAN);
  h.session.start(CONTINUOUS);
  h.advance(10000);
  assert.ok(Math.max(...h.scheduled().map((c) => c.at)) <= h.now() + 1500 + 2300 + CUE_MS);
  h.session.setBackground(true);
  assert.ok(Math.max(...h.scheduled().map((c) => c.at)) >= h.now() + 60000, "queued at least a minute ahead");
  // Timers then fire only once a minute: calls still arrive with normal spacing.
  const before = h.heard().length;
  for (let i = 0; i < 5; i++) {
    h.freeze(60000);
    h.advance(1);
  }
  const heard = h.heard().slice(before);
  assert.ok(heard.length > 300 / 2.5, `calls in background: ${heard.length}`);
  for (const g of gapsBetween(heard)) assert.ok(g >= 1000 && g <= 2300, `gap ${g}`);
  // UI stats catch up with what played.
  assert.equal(h.session.getSnapshot().cueCount, h.heard().length);
});

test("pause, stop and rapid restarts never leave extra timers or queued calls", () => {
  const h = harness(PLAN);
  for (let i = 0; i < 20; i++) {
    h.session.start(CONTINUOUS);
    h.session.start(CONTINUOUS);
    h.session.pause();
    h.session.resume();
  }
  assert.equal(h.pendingTimers(), 1);
  h.session.pause();
  assert.equal(h.pendingTimers(), 0);
  h.advance(30000);
  assert.equal(h.heard().length, 0, "no calls while paused");
  h.session.resume();
  h.advance(GET_READY_RANGE.minMs - 1);
  assert.equal(h.heard().length, 0, "resume does not fire immediately");
  h.advance(5000);
  const n = h.heard().length;
  h.session.stop();
  assert.equal(h.pendingTimers(), 0);
  h.advance(30000);
  assert.equal(h.heard().length, n, "no calls after stop");
});

test("a frozen foreground tab does not trigger a burst of overdue calls", () => {
  const h = harness(PLAN);
  h.session.start(CONTINUOUS);
  h.advance(10000);
  h.freeze(60000);
  h.advance(20000);
  for (const g of gapsBetween(h.heard())) assert.ok(g >= 1000, `gap ${g}`);
});

test("sets: bells, warning, rest without calls, then the workout completes", () => {
  const h = harness(PLAN);
  const workout: Workout = { sets: 2, workMs: 30000, restMs: 10000 };
  h.session.start(workout);
  h.advance(35000);
  const snap = h.session.getSnapshot();
  assert.equal(snap.phase?.kind, "rest");
  assert.equal(snap.phase?.set, 1);
  assert.ok(Math.abs((snap.phase?.remainingMs ?? 0) - 5300) < 50, `rest left ${snap.phase?.remainingMs}`);

  h.advance(60000);
  const end = h.session.getSnapshot();
  assert.equal(end.status, "idle");
  assert.equal(end.completed, true);
  assert.match(end.message ?? "", /Workout complete: 2 sets/);
  assert.equal(h.pendingTimers(), 0);

  const sig = h.signals().map((g) => `${g.kind}@${Math.round(g.at)}`);
  assert.deepEqual(sig, [
    "setStart@300",
    "warning@20300",
    "setEnd@30300",
    "setStart@40300",
    "warning@60300",
    "setEnd@70300",
  ]);
  for (const c of h.heard()) {
    const inSet1 = c.at >= 300 && c.at + CUE_MS <= 30300 - 500;
    const inSet2 = c.at >= 40300 && c.at + CUE_MS <= 70300 - 500;
    assert.ok(inSet1 || inSet2, `call at ${c.at} outside a set`);
  }
  assert.ok(h.heard().some((c) => c.at > 40300), "calls resume in set 2");
});

test("pausing during rest keeps the remaining rest time", () => {
  const h = harness(PLAN);
  h.session.start({ sets: 2, workMs: 30000, restMs: 20000 });
  h.advance(35300); // 5 s into rest
  h.session.pause();
  h.advance(60000);
  assert.ok(Math.abs((h.session.getSnapshot().phase?.remainingMs ?? 0) - 15000) < 50);
  h.session.resume();
  h.advance(15100);
  assert.equal(h.session.getSnapshot().phase?.kind, "work");
  assert.equal(h.session.getSnapshot().phase?.set, 2);
});

test("combos: whole combination per call with extra recovery time", () => {
  const items = COMBOS.slice(0, 4).map((c) => ({ id: c.id, label: c.id, punches: c.punches, weight: 1 }));
  const h = harness({ items, mode: "equal", timing: { minMs: 1000, maxMs: 2300 } });
  h.session.start(CONTINUOUS);
  h.advance(120000);
  const heard = h.heard();
  assert.ok(heard.length > 20);
  assert.ok(heard.every((c) => items.some((i) => i.punches.join() === c.punches.join())));
  gapsBetween(heard).forEach((g, i) => {
    const extra = (heard[i].punches.length - 1) * COMBO_EXTRA_GAP_PER_PUNCH_MS;
    assert.ok(g >= 1000 + extra && g <= 2300 + extra, `gap ${g}`);
  });
  assert.equal(h.session.getSnapshot().counts.reduce((s, c) => s + c.count, 0), heard.length);
});

test("invalid settings or lost audio pause the session", () => {
  const h = harness(PLAN);
  h.session.start(CONTINUOUS);
  h.state.plan = null;
  h.advance(10000);
  assert.equal(h.session.getSnapshot().status, "paused");
  assert.equal(h.pendingTimers(), 0);

  h.state.plan = PLAN;
  h.session.resume();
  h.setAudio(false);
  h.advance(10000);
  assert.equal(h.session.getSnapshot().status, "paused");
  assert.equal(h.pendingTimers(), 0);
});

test("elapsed time excludes paused time", () => {
  const h = harness(PLAN);
  h.session.start(CONTINUOUS);
  h.advance(5000);
  h.session.pause();
  h.advance(20000);
  assert.equal(h.session.getSnapshot().elapsedMs, 5000);
});
