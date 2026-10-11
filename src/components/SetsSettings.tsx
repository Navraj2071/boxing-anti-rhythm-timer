import {
  clampSetValue,
  formatClock,
  formatDuration,
  QUICK_PICKS,
  SETS_LIMITS,
  totalWorkoutSec,
  type SetsConfig,
} from "@/lib/workout";

interface Props {
  value: SetsConfig;
  onChange: (value: SetsConfig) => void;
  /** Sets are fixed once a session starts. */
  locked: boolean;
}

type Key = "count" | "workSec" | "restSec";

const ROWS: { key: Key; label: string; format: (v: number) => string; chip: (v: number) => string }[] = [
  { key: "count", label: "Sets", format: String, chip: String },
  { key: "workSec", label: "Set length", format: formatClock, chip: (v) => (v < 60 ? `${v}s` : `${v / 60}m`) },
  { key: "restSec", label: "Rest between", format: formatClock, chip: (v) => (v % 60 ? `${v}s` : `${v / 60}m`) },
];

export function SetsSettings({ value, onChange, locked }: Props) {
  const set = (key: Key, v: number) => onChange({ ...value, [key]: clampSetValue(key, v) });

  return (
    <section className="card" aria-labelledby="sets-heading">
      <div className="card-head">
        <h2 id="sets-heading">Sets</h2>
        {value.enabled && (
          <span className="muted">
            Total {formatClock(totalWorkoutSec(value))}
          </span>
        )}
      </div>
      <fieldset className="plain-fieldset" disabled={locked}>
        <div className="segmented" role="radiogroup" aria-labelledby="sets-heading">
          {[false, true].map((enabled) => (
            <button
              key={String(enabled)}
              type="button"
              role="radio"
              aria-checked={value.enabled === enabled}
              className={value.enabled === enabled ? "is-on" : ""}
              onClick={() => onChange({ ...value, enabled })}
            >
              {value.enabled === enabled && <span aria-hidden="true">✓ </span>}
              {enabled ? "Sets" : "Continuous"}
            </button>
          ))}
        </div>

        {!value.enabled && <p className="muted small">Keeps going until you press Stop.</p>}

        {value.enabled && (
          <div className="sets-rows">
            {ROWS.map(({ key, label, format, chip }) => {
              const v = value[key];
              const { min, max, step } = SETS_LIMITS[key];
              return (
                <div key={key} className="sets-row">
                  <div className="sets-row-main">
                    <span className="sets-label" id={`sets-${key}`}>
                      {label}
                    </span>
                    <div className="stepper" role="group" aria-labelledby={`sets-${key}`}>
                      <button
                        type="button"
                        aria-label={`Decrease ${label.toLowerCase()}`}
                        onClick={() => set(key, v - step)}
                        disabled={v <= min}
                      >
                        −
                      </button>
                      <output className="sets-value" aria-live="polite">
                        {format(v)}
                      </output>
                      <button
                        type="button"
                        aria-label={`Increase ${label.toLowerCase()}`}
                        onClick={() => set(key, v + step)}
                        disabled={v >= max}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="chips" role="group" aria-label={`${label} quick picks`}>
                    {QUICK_PICKS[key].map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={`chip ${v === q ? "is-on" : ""}`}
                        aria-pressed={v === q}
                        onClick={() => set(key, q)}
                      >
                        {chip(q)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="muted small">
              {value.count} × {formatDuration(value.workSec)}
              {value.count > 1 && value.restSec > 0 ? ` with ${formatDuration(value.restSec)} rest` : ""}. A bell
              starts and ends each set, with a double clap 10 s before the end.
            </p>
          </div>
        )}
        {locked && <p className="muted small">Stop the session to change sets.</p>}
      </fieldset>
    </section>
  );
}
