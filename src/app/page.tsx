"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComboSelector } from "@/components/ComboSelector";
import { CueStyleSelector } from "@/components/CueStyleSelector";
import { DistributionSettings } from "@/components/DistributionSettings";
import { PunchSelector } from "@/components/PunchSelector";
import { SessionControls } from "@/components/SessionControls";
import { SessionPanel } from "@/components/SessionPanel";
import { SetsSettings } from "@/components/SetsSettings";
import { SpeedSelector } from "@/components/SpeedSelector";
import { TrainingModeSelector } from "@/components/TrainingModeSelector";
import { useTrainingSession } from "@/hooks/useTrainingSession";
import { playCue, preloadVoice, unlockAudio, type CueStyle } from "@/lib/audio";
import { getCombo } from "@/lib/combos";
import { equalSplit, validateCustom, type DistributionMode } from "@/lib/distribution";
import type { PunchId } from "@/lib/punches";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  resolvePlan,
  saveSettings,
  sortCombos,
  sortPunches,
  type TrainerSettings,
  type TrainingMode,
} from "@/lib/settings";
import { clampSpeed } from "@/lib/timing";
import { toWorkout, type SetsConfig } from "@/lib/workout";

export default function Home() {
  const [settings, setSettings] = useState<TrainerSettings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);

  // Load saved preferences after mount (keeps static HTML and hydration in sync).
  useEffect(() => {
    // Fetch voice clips up front so sessions never wait on the network.
    preloadVoice().catch(() => {});
    const saved = loadSettings();
    if (saved) setSettings(saved);
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (loaded.current) saveSettings(settings);
  }, [settings]);

  const { plan, error: planError } = useMemo(() => resolvePlan(settings), [settings]);
  const validation = useMemo(
    () => (settings.mode === "custom" ? validateCustom(settings.selected, settings.percentages) : null),
    [settings],
  );
  const workout = useMemo(() => toWorkout(settings.sets), [settings.sets]);

  const { snapshot, audioError, start, pause, resume, stop, restart } = useTrainingSession(
    plan,
    planError,
    settings.cueStyle,
    workout,
  );

  const update = useCallback(<K extends keyof TrainerSettings>(key: K, value: TrainerSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const togglePunch = useCallback((id: PunchId) => {
    setSettings((s) => {
      const selected = s.selected.includes(id) ? s.selected.filter((x) => x !== id) : sortPunches([...s.selected, id]);
      return { ...s, selected };
    });
  }, []);

  const toggleCombo = useCallback((id: string) => {
    setSettings((s) => {
      const combos = s.combos.includes(id) ? s.combos.filter((x) => x !== id) : sortCombos([...s.combos, id]);
      return { ...s, combos };
    });
  }, []);

  const setMode = useCallback((mode: DistributionMode) => {
    setSettings((s) => {
      if (mode === "custom" && !validateCustom(s.selected, s.percentages).valid) {
        return { ...s, mode, percentages: { ...s.percentages, ...equalSplit(s.selected) } };
      }
      return { ...s, mode };
    });
  }, []);

  const setPercent = useCallback((id: PunchId, value: number) => {
    setSettings((s) => ({ ...s, percentages: { ...s.percentages, [id]: value } }));
  }, []);

  const equalize = useCallback(() => {
    setSettings((s) => ({ ...s, percentages: equalSplit(s.selected) }));
  }, []);

  const setSpeed = useCallback((speed: number) => update("speed", clampSpeed(speed)), [update]);
  const setCueStyle = useCallback((v: CueStyle) => update("cueStyle", v), [update]);
  const setTrainingMode = useCallback((v: TrainingMode) => update("trainingMode", v), [update]);
  const setSets = useCallback((v: SetsConfig) => update("sets", v), [update]);

  const [previewError, setPreviewError] = useState<string | null>(null);
  const cueStyle = settings.cueStyle;
  const preview = useCallback(
    async (punches: PunchId[]) => {
      try {
        await unlockAudio(cueStyle);
        setPreviewError(null);
        playCue(punches, cueStyle);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Audio is blocked or unavailable in this browser.");
      }
    },
    [cueStyle],
  );
  const previewPunch = useCallback((id: PunchId) => preview([id]), [preview]);
  const previewCombo = useCallback((id: string) => preview(getCombo(id)!.punches), [preview]);

  const hasSelection = settings.trainingMode === "combos" ? settings.combos.length > 0 : settings.selected.length > 0;
  const notices = [
    snapshot.message,
    audioError,
    previewError,
    snapshot.status === "idle" && hasSelection ? planError : null,
  ].filter((m): m is string => Boolean(m));

  const running = snapshot.status === "running";
  const combos = settings.trainingMode === "combos";

  return (
    <>
      <main className="app">
        <header className="app-header">
          <h1>Boxing Reflex Trainer</h1>
          <p className="muted small">Hear the call, throw the punch.</p>
        </header>

        <SessionPanel snapshot={snapshot} />

        {notices.length > 0 && (
          <div className={`notice ${snapshot.completed ? "is-success" : ""}`} role="alert">
            {notices.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}

        <TrainingModeSelector value={settings.trainingMode} onChange={setTrainingMode} />

        {combos ? (
          <ComboSelector
            selected={settings.combos}
            onToggle={toggleCombo}
            onPreview={previewCombo}
            previewDisabled={running}
          />
        ) : (
          <>
            <PunchSelector
              selected={settings.selected}
              onToggle={togglePunch}
              onPreview={previewPunch}
              previewDisabled={running}
              cueStyle={settings.cueStyle}
            />
            <DistributionSettings
              mode={settings.mode}
              selected={settings.selected}
              percentages={settings.percentages}
              validation={validation}
              onModeChange={setMode}
              onPercentChange={setPercent}
              onEqualize={equalize}
            />
          </>
        )}

        <CueStyleSelector value={settings.cueStyle} onChange={setCueStyle} />

        <SpeedSelector speed={settings.speed} onChange={setSpeed} />

        <SetsSettings value={settings.sets} onChange={setSets} locked={snapshot.status !== "idle"} />

        <footer className="muted small app-footer">
          <p>Tap the speaker icons to hear each call. Changes to punches, sound and speed apply from the next call.</p>
          <p>
            Calls are queued ahead so they can keep playing with the screen off or the app in the background, where the
            browser allows it (typically Android Chrome and desktop). If the device suspends audio (typically iPhone),
            the session pauses; tap Resume when you return.
          </p>
          <p>On iPhone, if you hear nothing, check the volume and the silent switch.</p>
        </footer>
      </main>

      <div className="controls-bar">
        <SessionControls
          status={snapshot.status}
          canRun={plan !== null}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStop={stop}
          onRestart={restart}
        />
      </div>
    </>
  );
}
