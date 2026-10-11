import {
  DIFFICULTIES,
  DIFFICULTY_PRESETS,
  presetForSpeed,
  rangeForSpeed,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
} from "@/lib/timing";

interface Props {
  speed: number;
  onChange: (speed: number) => void;
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/** Difficulty presets as quick picks, plus a slider for fine control between them. */
export function SpeedSelector({ speed, onChange }: Props) {
  const preset = presetForSpeed(speed);
  const range = rangeForSpeed(speed);
  return (
    <section className="card" aria-labelledby="speed-heading">
      <div className="card-head">
        <h2 id="speed-heading">Speed</h2>
        <span className="muted">{preset ? DIFFICULTY_PRESETS[preset].label : "Custom"}</span>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Difficulty preset">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={preset === d}
            className={preset === d ? "is-on" : ""}
            onClick={() => onChange(DIFFICULTY_PRESETS[d].speed)}
          >
            {preset === d && <span aria-hidden="true">✓ </span>}
            {DIFFICULTY_PRESETS[d].label}
          </button>
        ))}
      </div>
      <div className="slider-row">
        <span className="muted small" aria-hidden="true">
          Slower
        </span>
        <input
          type="range"
          className="slider"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          value={speed}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          aria-label="Speed"
          aria-valuetext={`Speed ${speed} of ${SPEED_MAX}, ${seconds(range.minMs)} to ${seconds(range.maxMs)} seconds between calls`}
        />
        <span className="muted small" aria-hidden="true">
          Faster
        </span>
      </div>
      <p className="muted small">
        {preset ? `${DIFFICULTY_PRESETS[preset].description}: ` : `Speed ${speed}: `}
        {seconds(range.minMs)} to {seconds(range.maxMs)} s between calls.
      </p>
    </section>
  );
}
