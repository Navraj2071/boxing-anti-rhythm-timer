import type { CueStyle } from "@/lib/audio";
import { PUNCHES, type PunchId } from "@/lib/punches";

interface Props {
  selected: readonly PunchId[];
  onToggle: (id: PunchId) => void;
  onPreview: (id: PunchId) => void;
  /** Previews are disabled during a running session so they never overlap real cues. */
  previewDisabled: boolean;
  cueStyle: CueStyle;
}

export function PunchSelector({ selected, onToggle, onPreview, previewDisabled, cueStyle }: Props) {
  return (
    <section className="card" aria-labelledby="punches-heading">
      <div className="card-head">
        <h2 id="punches-heading">Punches</h2>
        <span className="muted">{selected.length} of 6 selected</span>
      </div>
      <ul className="punch-grid">
        {PUNCHES.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id} className={`punch ${on ? "is-on" : ""}`}>
              <button
                type="button"
                className="punch-toggle"
                aria-pressed={on}
                onClick={() => onToggle(p.id)}
              >
                <span className="check" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span className="punch-text">
                  <span className="punch-name">
                    <span className="punch-num">{p.number}</span> {p.name}
                  </span>
                  <span className="punch-hint">{cueStyle === "voice" ? `“${p.name}!”` : p.cueHint}</span>
                </span>
              </button>
              <button
                type="button"
                className="preview"
                onClick={() => onPreview(p.id)}
                disabled={previewDisabled}
                aria-label={`Play ${p.name} sound`}
                title={`Play ${p.name} sound`}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      {selected.length === 0 && (
        <p className="error" role="alert">
          Select at least one punch to train.
        </p>
      )}
    </section>
  );
}
