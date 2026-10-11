import { pickItem, type DistributionMode } from "./distribution.ts";
import type { PunchId } from "./punches.ts";
import {
  BACKGROUND_LOOKAHEAD_MS,
  COMBO_EXTRA_GAP_PER_PUNCH_MS,
  FOREGROUND_LOOKAHEAD_MS,
  getReadyDelay,
  LATE_CUE_THRESHOLD_MS,
  nextInterval,
  SET_END_MARGIN_MS,
  SET_WARNING_BEFORE_END_MS,
  type TimingRange,
} from "./timing.ts";
import type { Workout } from "./workout.ts";

export type SessionStatus = "idle" | "running" | "paused";
export type SignalKind = "setStart" | "setEnd" | "warning";

/** Something the trainer can call: a single punch or a combination. */
export interface CueItem {
  id: string;
  label: string;
  punches: PunchId[];
  weight: number;
}

/** What the session should call next; re-read before every call so live setting changes apply. */
export interface SessionPlan {
  items: CueItem[];
  mode: DistributionMode;
  timing: TimingRange;
}

export interface PhaseInfo {
  kind: "work" | "rest";
  /** 1-based set number (for rest: the set just finished). */
  set: number;
  /** null when running without sets. */
  totalSets: number | null;
  /** null when running without sets. */
  remainingMs: number | null;
}

export interface SessionSnapshot {
  status: SessionStatus;
  phase: PhaseInfo | null;
  cueCount: number;
  /** Calls per item id, in first-played order. */
  counts: { id: string; label: string; count: number }[];
  lastCue: { id: string; label: string; punches: PunchId[] } | null;
  elapsedMs: number;
  completed: boolean;
  /** Explains an automatic pause or a problem; null when there is nothing to say. */
  message: string | null;
}

export interface SessionDeps {
  /** Returns null when the current configuration cannot produce calls. */
  getPlan(): SessionPlan | null;
  /** How long the call for these punches lasts (ms). */
  cueDuration(punches: PunchId[]): number;
  /** Schedules a call at `atMs` (same clock as `now`); false if audio is unavailable. */
  playCue(punches: PunchId[], atMs: number): boolean;
  playSignal(kind: SignalKind, atMs: number): void;
  /** Silences anything sounding or scheduled. */
  silence(): void;
  onChange(snapshot: SessionSnapshot): void;
  now?: () => number;
  rng?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

interface Phase {
  kind: "work" | "rest";
  set: number;
  startAt: number;
  /** Infinity when running without sets. */
  endAt: number;
}

interface PendingEvent {
  at: number;
  apply: () => void;
}

const HISTORY_LENGTH = 8;
const PUMP_INTERVAL_MS = 250;

/**
 * Framework-independent session engine.
 *
 * Calls are scheduled slightly ahead of time on the audio clock (a
 * look-ahead scheduler), so timing stays tight even when JavaScript timers
 * are delayed. In the background the look-ahead grows, which lets audio keep
 * playing on browsers that throttle background timers but keep audio alive.
 * UI state (counts, last call, set changes) is committed when each event's
 * time actually arrives.
 *
 * One pump timer exists at a time; every state change cancels it and bumps a
 * token, so a stale callback is ignored.
 */
export class TrainingSession {
  private readonly deps: Required<SessionDeps>;
  private status: SessionStatus = "idle";
  private workout: Workout = { sets: null, workMs: Infinity, restMs: 0 };
  private timer: unknown = null;
  private token = 0;
  private background = false;

  /** Phase at the scheduling cursor (may be ahead of `shown`). */
  private planned: Phase | null = null;
  /** Phase the user is in right now. */
  private shown: Phase | null = null;
  private nextCueAt: number | null = null;
  private warningDone = false;
  private scheduleDone = false;
  private pending: PendingEvent[] = [];
  private pausedAt = 0;

  private cueCount = 0;
  private counts = new Map<string, { label: string; count: number }>();
  private history: string[] = [];
  private lastCue: SessionSnapshot["lastCue"] = null;
  private previousGapMs: number | null = null;
  private accumulatedMs = 0;
  private runStartedAt = 0;
  private completed = false;
  private message: string | null = null;

  constructor(deps: SessionDeps) {
    this.deps = {
      now: () => performance.now(),
      rng: Math.random,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...deps,
    };
  }

  getSnapshot(): SessionSnapshot {
    const now = this.deps.now();
    const running = this.status === "running";
    let phase: PhaseInfo | null = null;
    if (this.shown && this.status !== "idle") {
      const finite = Number.isFinite(this.shown.endAt);
      const ref = running ? now : this.pausedAt;
      phase = {
        kind: this.shown.kind,
        set: this.shown.set,
        totalSets: this.workout.sets,
        remainingMs: finite ? Math.max(0, this.shown.endAt - ref) : null,
      };
    }
    return {
      status: this.status,
      phase,
      cueCount: this.cueCount,
      counts: [...this.counts].map(([id, v]) => ({ id, ...v })),
      lastCue: this.lastCue,
      elapsedMs: this.accumulatedMs + (running ? now - this.runStartedAt : 0),
      completed: this.completed,
      message: this.message,
    };
  }

  /** Begins a fresh session (also used for Restart). */
  start(workout: Workout): void {
    this.cancelTimer();
    this.deps.silence();
    this.workout = workout;
    this.pending = [];
    this.cueCount = 0;
    this.counts = new Map();
    this.history = [];
    this.lastCue = null;
    this.previousGapMs = null;
    this.accumulatedMs = 0;
    this.completed = false;
    this.message = null;
    this.scheduleDone = false;
    if (!this.deps.getPlan()) {
      this.status = "idle";
      this.shown = this.planned = null;
      this.message = "Check your settings before starting.";
      this.emit();
      return;
    }
    const now = this.deps.now();
    this.status = "running";
    this.runStartedAt = now;
    if (workout.sets === null) {
      this.enterWork({ kind: "work", set: 1, startAt: now, endAt: Infinity }, false);
    } else {
      // Small lead so the opening bell is scheduled in the future, not the past.
      const t0 = now + 300;
      this.enterWork({ kind: "work", set: 1, startAt: t0, endAt: t0 + workout.workMs }, true);
    }
    this.shown = { ...this.planned! };
    this.pump();
    this.emit();
  }

  pause(message: string | null = null): void {
    if (this.status !== "running") return;
    this.cancelTimer();
    this.deps.silence();
    const now = this.deps.now();
    this.commitDue(now);
    // Anything scheduled beyond "now" was just silenced; rewind the cursor.
    this.pending = [];
    this.planned = this.shown ? { ...this.shown } : null;
    this.nextCueAt = null;
    this.scheduleDone = false;
    this.accumulatedMs += now - this.runStartedAt;
    this.pausedAt = now;
    this.status = "paused";
    this.message = message;
    this.emit();
  }

  /** Resumes after a fresh get-ready delay, so no call ever fires immediately. */
  resume(): void {
    if (this.status !== "paused" || !this.shown) return;
    if (!this.deps.getPlan()) {
      this.message = "Check your settings before resuming.";
      this.emit();
      return;
    }
    this.cancelTimer();
    const now = this.deps.now();
    const shift = now - this.pausedAt;
    this.shown = { ...this.shown, startAt: this.shown.startAt + shift, endAt: this.shown.endAt + shift };
    this.planned = { ...this.shown };
    this.warningDone = this.shown.endAt - now <= SET_WARNING_BEFORE_END_MS;
    this.nextCueAt = this.shown.kind === "work" ? now + getReadyDelay(this.deps.rng) : null;
    this.status = "running";
    this.message = null;
    this.runStartedAt = now;
    this.pump();
    this.emit();
  }

  stop(): void {
    if (this.status === "idle") return;
    this.cancelTimer();
    this.deps.silence();
    if (this.status === "running") this.accumulatedMs += this.deps.now() - this.runStartedAt;
    this.pending = [];
    this.status = "idle";
    this.message = null;
    this.emit();
  }

  /**
   * In the background, schedule far ahead so audio continues even if timers
   * are throttled. Back in the foreground, keep the window short.
   */
  setBackground(background: boolean): void {
    this.background = background;
    if (this.status === "running") this.pump();
  }

  /** Cancels everything without notifying; call on unmount. */
  dispose(): void {
    this.cancelTimer();
    this.deps.silence();
    this.status = "idle";
  }

  // -------------------------------------------------------------------------

  private cancelTimer(): void {
    this.token++;
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private schedulePump(): void {
    const token = this.token;
    this.timer = this.deps.setTimer(() => {
      if (token !== this.token) return;
      this.timer = null;
      this.pump();
    }, PUMP_INTERVAL_MS);
  }

  private enterWork(phase: Phase, withBell: boolean): void {
    this.planned = phase;
    this.warningDone = phase.endAt - phase.startAt <= SET_WARNING_BEFORE_END_MS * 2;
    this.nextCueAt = phase.startAt + getReadyDelay(this.deps.rng);
    if (withBell && this.isOnTime(phase.startAt)) this.deps.playSignal("setStart", phase.startAt);
  }

  private isOnTime(at: number): boolean {
    return at >= this.deps.now() - LATE_CUE_THRESHOLD_MS;
  }

  /** Schedules everything up to the look-ahead horizon, then re-arms the timer. */
  private pump(): void {
    if (this.status !== "running") return;
    const now = this.deps.now();
    const changed = this.commitDue(now);
    if (this.status !== "running") {
      this.emit(); // the workout just completed
      return;
    }
    const horizon = now + (this.background ? BACKGROUND_LOOKAHEAD_MS : FOREGROUND_LOOKAHEAD_MS);

    for (let guard = 0; guard < 1000 && !this.scheduleDone && this.planned; guard++) {
      const ph = this.planned;

      if (ph.kind === "rest") {
        if (ph.endAt > horizon) break;
        const next: Phase = { kind: "work", set: ph.set + 1, startAt: ph.endAt, endAt: ph.endAt + this.workout.workMs };
        this.enterWork(next, true);
        this.enqueue(next.startAt, () => (this.shown = { ...next }));
        continue;
      }

      // Warning clap before the end of a set.
      if (!this.warningDone) {
        const wAt = ph.endAt - SET_WARNING_BEFORE_END_MS;
        if (wAt <= horizon) {
          if (this.isOnTime(wAt)) this.deps.playSignal("warning", wAt);
          this.warningDone = true;
          continue;
        }
      }

      if (this.nextCueAt !== null && this.nextCueAt < ph.endAt && this.nextCueAt <= horizon) {
        if (!this.isOnTime(this.nextCueAt)) {
          // Timers stalled (page frozen); resynchronise instead of bursting.
          this.nextCueAt = now + getReadyDelay(this.deps.rng);
          continue;
        }
        if (!this.scheduleCue(ph)) return;
        continue;
      }

      if (ph.endAt <= horizon) {
        this.endSet(ph);
        continue;
      }
      break;
    }

    if (changed) this.emit();
    this.schedulePump();
  }

  /** Schedules one call at nextCueAt. Returns false if the session paused. */
  private scheduleCue(ph: Phase): boolean {
    const at = this.nextCueAt!;
    const plan = this.deps.getPlan();
    if (!plan || plan.items.length === 0) {
      this.pause("Paused: check your punch or combo selection to continue.");
      return false;
    }
    const id = pickItem(
      plan.items.map((i) => ({ id: i.id, weight: i.weight })),
      plan.mode,
      this.history,
      this.deps.rng,
    );
    const item = plan.items.find((i) => i.id === id)!;
    const duration = this.deps.cueDuration(item.punches);

    // Don't let a call run into the end-of-set bell or the warning clap.
    if (at + duration > ph.endAt - SET_END_MARGIN_MS) {
      this.nextCueAt = null;
      return true;
    }
    const wAt = ph.endAt - SET_WARNING_BEFORE_END_MS;
    if (Number.isFinite(wAt) && at < wAt + 600 && at + duration > wAt - 200) {
      this.nextCueAt = wAt + 600;
      return true;
    }

    if (!this.deps.playCue(item.punches, at)) {
      this.pause("Paused: audio was interrupted by the device. Tap Resume to continue.");
      return false;
    }
    this.history.push(item.id);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();
    const cue = { id: item.id, label: item.label, punches: item.punches };
    this.enqueue(at, () => {
      this.cueCount++;
      const entry = this.counts.get(cue.id) ?? { label: cue.label, count: 0 };
      entry.count++;
      this.counts.set(cue.id, entry);
      this.lastCue = cue;
    });

    // The gap starts when the call finishes; combos get extra recovery time.
    const gap = nextInterval(plan.timing, this.previousGapMs, this.deps.rng);
    this.previousGapMs = gap;
    this.nextCueAt = at + duration + gap + (item.punches.length - 1) * COMBO_EXTRA_GAP_PER_PUNCH_MS;
    return true;
  }

  private endSet(ph: Phase): void {
    const at = ph.endAt;
    if (this.isOnTime(at)) this.deps.playSignal("setEnd", at);
    const sets = this.workout.sets ?? Infinity;
    if (ph.set >= sets) {
      this.scheduleDone = true;
      this.enqueue(at, () => this.finish(at));
      return;
    }
    const rest: Phase = { kind: "rest", set: ph.set, startAt: at, endAt: at + this.workout.restMs };
    this.planned = rest;
    this.nextCueAt = null;
    this.enqueue(at, () => (this.shown = { ...rest }));
  }

  private finish(at: number): void {
    this.cancelTimer();
    this.pending = [];
    this.accumulatedMs += at - this.runStartedAt;
    this.status = "idle";
    this.completed = true;
    const sets = this.workout.sets ?? 0;
    this.message = `Workout complete: ${sets} ${sets === 1 ? "set" : "sets"}, ${this.cueCount} calls.`;
    // Note: the final bell is left ringing on purpose.
  }

  private enqueue(at: number, apply: () => void): void {
    this.pending.push({ at, apply });
    this.pending.sort((a, b) => a.at - b.at);
  }

  /** Applies UI events whose time has come. Returns true if anything changed. */
  private commitDue(now: number): boolean {
    let changed = false;
    while (this.pending.length > 0 && this.pending[0].at <= now) {
      this.pending.shift()!.apply();
      changed = true;
      if (this.status !== "running") break;
    }
    return changed;
  }

  private emit(): void {
    this.deps.onChange(this.getSnapshot());
  }
}
