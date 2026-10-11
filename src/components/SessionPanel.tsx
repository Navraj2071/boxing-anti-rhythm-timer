import { getPunch } from "@/lib/punches";
import type { SessionSnapshot } from "@/lib/session";
import { formatClock } from "@/lib/workout";

interface Props {
  snapshot: SessionSnapshot;
}

const STATUS_LABEL = {
  idle: { icon: "○", text: "Ready" },
  running: { icon: "●", text: "Running" },
  paused: { icon: "❚❚", text: "Paused" },
} as const;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionPanel({ snapshot }: Props) {
  const { status, phase, cueCount, counts, lastCue, elapsedMs, completed } = snapshot;
  const label = completed ? { icon: "✓", text: "Done" } : STATUS_LABEL[status];
  const isCombo = lastCue !== null && lastCue.punches.length > 1;
  const resting = phase?.kind === "rest";

  return (
    <section className={`card session status-${status} ${resting ? "is-rest" : ""}`} aria-label="Session status">
      <div className="session-top">
        <p className="status-pill">
          <span aria-hidden="true">{label.icon}</span> {label.text}
        </p>
        <dl className="stats">
          <div>
            <dt>Time</dt>
            <dd>{formatElapsed(elapsedMs)}</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd>{cueCount}</dd>
          </div>
        </dl>
      </div>

      {phase && phase.totalSets !== null && phase.remainingMs !== null && (
        <div className="phase-banner">
          <p className="phase-name">
            {resting ? `Rest · next set ${phase.set + 1} of ${phase.totalSets}` : `Set ${phase.set} of ${phase.totalSets}`}
          </p>
          <p className="phase-clock" aria-label={`${formatClock(phase.remainingMs / 1000)} remaining`}>
            {formatClock(Math.ceil(phase.remainingMs / 1000))}
          </p>
        </div>
      )}

      {/* Keyed so screen readers announce each new call even if it repeats. */}
      <p className="last-punch" aria-live="polite" key={cueCount}>
        {resting ? (
          "Rest"
        ) : lastCue ? (
          isCombo ? (
            <>
              <span className="last-combo">{lastCue.label}</span>
              <span className="last-combo-names">{lastCue.punches.map((p) => getPunch(p).name).join(" · ")}</span>
            </>
          ) : (
            <>
              <span className="last-num">{getPunch(lastCue.punches[0]).number}</span> {lastCue.label}
            </>
          )
        ) : status === "running" ? (
          "Get ready…"
        ) : (
          "—"
        )}
      </p>

      {cueCount > 0 && (
        <ul className="count-list" aria-label="Calls per punch or combination">
          {counts.map((c) => (
            <li key={c.id}>
              {c.label} <strong>{c.count}</strong>{" "}
              <span className="muted">({Math.round((c.count / cueCount) * 100)}%)</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
