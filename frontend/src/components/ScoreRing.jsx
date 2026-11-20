import { useEffect, useState } from "react";

const COLORS = { good: "#16a34a", okay: "#f59e0b", poor: "#dc2626", none: "#94a3b8" };
const RADIUS = 70;
const CIRC = 2 * Math.PI * RADIUS;

export default function ScoreRing({ score, band, label }) {
  const hasScore = typeof score === "number";
  const [shown, setShown] = useState(0);

  // Animate the ring and the number from 0 up to the score
  useEffect(() => {
    if (!hasScore) return undefined;
    let frame;
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, hasScore]);

  const color = COLORS[band] || COLORS.none;
  const offset = CIRC * (1 - (hasScore ? shown : 0) / 100);

  return (
    <div className="ring" role="img" aria-label={hasScore ? `Tula score ${score} out of 100, ${label}` : "Not enough data"}>
      <svg viewBox="0 0 180 180" width="190" height="190">
        <circle cx="90" cy="90" r={RADIUS} className="ring-track" />
        <circle
          cx="90"
          cy="90"
          r={RADIUS}
          className="ring-value"
          stroke={color}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="ring-center">
        <div className="ring-number" style={{ color }}>{hasScore ? shown : "?"}</div>
        <div className="ring-out">{hasScore ? "out of 100" : "no score"}</div>
      </div>
      <div className="ring-label" style={{ background: color }}>{label || "Not enough data"}</div>
    </div>
  );
}