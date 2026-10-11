import type { TrainingMode } from "@/lib/settings";

interface Props {
  value: TrainingMode;
  onChange: (value: TrainingMode) => void;
}

const OPTIONS: { value: TrainingMode; label: string; description: string }[] = [
  { value: "punches", label: "Single punches", description: "One punch per call, picked at random." },
  { value: "combos", label: "Combos", description: "A whole combination per call, with extra time to throw it." },
];

export function TrainingModeSelector({ value, onChange }: Props) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <section className="card" aria-labelledby="training-heading">
      <div className="card-head">
        <h2 id="training-heading">Training</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby="training-heading">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "is-on" : ""}
            onClick={() => onChange(o.value)}
          >
            {value === o.value && <span aria-hidden="true">✓ </span>}
            {o.label}
          </button>
        ))}
      </div>
      <p className="muted small">{current.description}</p>
    </section>
  );
}
