import { COMBOS, comboNames } from "@/lib/combos";

interface Props {
  selected: readonly string[];
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  /** Previews are disabled during a running session so they never overlap real calls. */
  previewDisabled: boolean;
}

export function ComboSelector({ selected, onToggle, onPreview, previewDisabled }: Props) {
  return (
    <section className="card" aria-labelledby="combos-heading">
      <div className="card-head">
        <h2 id="combos-heading">Combinations</h2>
        <span className="muted">
          {selected.length} of {COMBOS.length} selected
        </span>
      </div>
      <p className="muted small">1 Jab · 2 Cross · 3 Left Hook · 4 Right Hook · 5 Left Uppercut · 6 Right Uppercut</p>
      <ul className="punch-grid combo-grid">
        {COMBOS.map((c) => {
          const on = selected.includes(c.id);
          return (
            <li key={c.id} className={`punch ${on ? "is-on" : ""}`}>
              <button type="button" className="punch-toggle" aria-pressed={on} onClick={() => onToggle(c.id)}>
                <span className="check" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span className="punch-text">
                  <span className="punch-name">
                    <span className="combo-id">{c.id}</span> <span className="combo-names">{comboNames(c)}</span>
                  </span>
                  <span className="punch-hint">{c.note}</span>
                </span>
              </button>
              <button
                type="button"
                className="preview"
                onClick={() => onPreview(c.id)}
                disabled={previewDisabled}
                aria-label={`Play ${c.id} call`}
                title={`Play ${c.id} call`}
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
          Select at least one combination to train.
        </p>
      )}
    </section>
  );
}
