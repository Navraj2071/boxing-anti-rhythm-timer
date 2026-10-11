import type { CueStyle } from "@/lib/audio";

interface Props {
  value: CueStyle;
  onChange: (value: CueStyle) => void;
}

const OPTIONS: { value: CueStyle; label: string; description: string }[] = [
  { value: "tones", label: "Tones", description: "Short beeps, a different one for each punch." },
  { value: "voice", label: "Voice", description: "A trainer shouts each punch: “Jab!”, “Left hook!”" },
];

export function CueStyleSelector({ value, onChange }: Props) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <section className="card" aria-labelledby="cue-heading">
      <div className="card-head">
        <h2 id="cue-heading">Cue sound</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby="cue-heading">
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
