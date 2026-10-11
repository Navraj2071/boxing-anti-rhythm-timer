"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  audioWasSuspended,
  AudioUnavailableError,
  cueDuration,
  playCue,
  playSignal,
  prepareVoice,
  stopAllCues,
  unlockAudio,
  type CueStyle,
} from "@/lib/audio";
import { TrainingSession, type SessionPlan, type SessionSnapshot } from "@/lib/session";
import type { Workout } from "@/lib/workout";
import { acquireWakeLock, releaseWakeLock } from "@/lib/wakeLock";

const INITIAL_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  phase: null,
  cueCount: 0,
  counts: [],
  lastCue: null,
  elapsedMs: 0,
  completed: false,
  message: null,
};

const CLOCK_TICK_MS = 250;

/**
 * Connects the TrainingSession engine to React, the audio layer, page
 * visibility and the screen wake lock. `plan` and `cueStyle` are read live,
 * so changing them mid-session affects the next call. `workout` (sets) is
 * read when a session starts.
 */
export function useTrainingSession(
  plan: SessionPlan | null,
  planError: string | null,
  cueStyle: CueStyle,
  workout: Workout,
) {
  const planRef = useRef(plan);
  planRef.current = plan;
  const styleRef = useRef(cueStyle);
  styleRef.current = cueStyle;
  const workoutRef = useRef(workout);
  workoutRef.current = workout;

  const sessionRef = useRef<TrainingSession | null>(null);
  // Increments on every user action so an async Start/Resume that finishes
  // after a later Stop does not resurrect the session.
  const actionSeq = useRef(0);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(INITIAL_SNAPSHOT);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    const session = new TrainingSession({
      getPlan: () => planRef.current,
      cueDuration: (punches) => cueDuration(punches, styleRef.current),
      playCue: (punches, at) => playCue(punches, styleRef.current, at),
      playSignal,
      silence: stopAllCues,
      onChange: setSnapshot,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      sessionRef.current = null;
      void releaseWakeLock();
    };
  }, []);

  const status = snapshot.status;

  // Clock display tick; only while running.
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (s) setSnapshot(s.getSnapshot());
    }, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [status]);

  // Background: queue calls far ahead on the audio clock so they keep playing
  // where the browser allows background audio (Android Chrome, desktop).
  // Foreground again: if the device suspended audio meanwhile (iOS), the
  // queued calls are stale, so pause instead of playing them late.
  useEffect(() => {
    const onVisibility = () => {
      const s = sessionRef.current;
      if (!s) return;
      if (document.visibilityState === "hidden") {
        s.setBackground(true);
        return;
      }
      s.setBackground(false);
      if (s.getSnapshot().status === "running") {
        if (audioWasSuspended()) {
          s.pause("Paused: your device suspended audio while the app was in the background. Tap Resume.");
        } else {
          void acquireWakeLock();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (status === "running") void acquireWakeLock();
    else void releaseWakeLock();
  }, [status]);

  // Switching to voice mid-session: decode the clips in the background
  // (tones are used until they are ready).
  useEffect(() => {
    if (cueStyle === "voice") prepareVoice();
  }, [cueStyle]);

  // Settings edited mid-session into an unusable state: pause right away.
  useEffect(() => {
    if (status === "running" && !plan) {
      sessionRef.current?.pause(`Paused: ${planError ?? "check your settings."}`);
    }
  }, [status, plan, planError]);

  const withAudio = useCallback(async (action: (s: TrainingSession) => void) => {
    const seq = ++actionSeq.current;
    try {
      await unlockAudio(styleRef.current);
      setAudioError(null);
    } catch (err) {
      setAudioError(
        err instanceof AudioUnavailableError ? err.message : "Could not start audio. Tap the button again.",
      );
      return;
    }
    if (seq !== actionSeq.current) return;
    const s = sessionRef.current;
    if (s) action(s);
  }, []);

  const start = useCallback(() => withAudio((s) => s.start(workoutRef.current)), [withAudio]);
  const restart = start;
  const resume = useCallback(() => withAudio((s) => s.resume()), [withAudio]);
  const pause = useCallback(() => {
    actionSeq.current++;
    sessionRef.current?.pause();
  }, []);
  const stop = useCallback(() => {
    actionSeq.current++;
    sessionRef.current?.stop();
  }, []);

  return { snapshot, audioError, start, pause, resume, stop, restart };
}
