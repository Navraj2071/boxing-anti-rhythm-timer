import type { DistributionMode, Percentages, ValidationResult } from "@/lib/distribution";
import { getPunch, type PunchId } from "@/lib/punches";

interface Props {
  mode: DistributionMode;
  selected: readonly PunchId[];
  percentages: Percentages;
  validation: ValidationResult | null;
  onModeChange: (mode: DistributionMode) => void;
  onPercentChange: (id: PunchId, value: number) => void;
  onEqualize: () => void;
}

const STEP = 5;

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function DistributionSettings({
  mode,
  selected,
  percentages,
  validation,
  onModeChange,
  onPercentChange,
  onEqualize,
}: Props) {
  return (
    <section className="card" aria-labelledby="dist-heading">
      <div className="card-head">
        <h2 id="dist-heading">Distribution</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby="dist-heading">
        {(["equal", "custom"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? "is-on" : ""}
            onClick={() => onModeChange(m)}
          >
            {mode === m && <span aria-hidden="true">✓ </span>}
            {m === "equal" ? "Equal" : "Custom %"}
          </button>
        ))}
      </div>

      {mode === "equal" && (
        <p className="muted small">Each selected punch is equally likely, with fewer back-to-back repeats.</p>
      )}

      {mode === "custom" && (
        <div className="percent-editor">
          {selected.length === 0 ? (
            <p className="muted small">Select punches to set their percentages.</p>
          ) : (
            <ul className="percent-list">
              {selected.map((id) => {
                const p = getPunch(id);
                const value = percentages[id];
                const inputId = `pct-${id}`;
                return (
                  <li key={id} className="percent-row">
                    <label htmlFor={inputId}>{p.name}</label>
                    <div className="stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${p.name} by ${STEP}%`}
                        onClick={() => onPercentChange(id, clampPercent(value - STEP))}
                        disabled={value <= 0}
                      >
                        −
                      </button>
                      <input
                        id={inputId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={value}
                        onChange={(e) => onPercentChange(id, clampPercent(e.target.valueAsNumber))}
                        onFocus={(e) => e.target.select()}
                      />
                      <span aria-hidden="true">%</span>
                      <button
                        type="button"
                        aria-label={`Increase ${p.name} by ${STEP}%`}
                        onClick={() => onPercentChange(id, clampPercent(value + STEP))}
                        disabled={value >= 100}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="percent-footer">
            <p className={validation?.valid ? "ok" : "error"} role="status" aria-live="polite">
              {validation?.valid ? "✓ Total 100%" : `✗ ${validation?.error ?? ""}`}
            </p>
            <button type="button" className="link-button" onClick={onEqualize} disabled={selected.length === 0}>
              Split evenly
            </button>
          </div>
          <p className="muted small">
            {selected.some((id) => percentages[id] === 0)
              ? "Punches set to 0% (and unselected punches) are never played."
              : "Unselected punches are never played."}
          </p>
        </div>
      )}
    </section>
  );
}
