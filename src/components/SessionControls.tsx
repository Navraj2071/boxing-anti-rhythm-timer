import type { SessionStatus } from "@/lib/session";

interface Props {
  status: SessionStatus;
  canRun: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export function SessionControls({ status, canRun, onStart, onPause, onResume, onStop, onRestart }: Props) {
  return (
    <div className="controls" role="group" aria-label="Session controls">
      {status === "idle" && (
        <button type="button" className="btn btn-primary btn-wide" onClick={onStart} disabled={!canRun}>
          ▶ Start
        </button>
      )}
      {status === "running" && (
        <button type="button" className="btn btn-primary" onClick={onPause}>
          ❚❚ Pause
        </button>
      )}
      {status === "paused" && (
        <button type="button" className="btn btn-primary" onClick={onResume} disabled={!canRun}>
          ▶ Resume
        </button>
      )}
      {status !== "idle" && (
        <>
          <button type="button" className="btn" onClick={onRestart} disabled={!canRun}>
            ↻ Restart
          </button>
          <button type="button" className="btn btn-danger" onClick={onStop}>
            ■ Stop
          </button>
        </>
      )}
    </div>
  );
}
