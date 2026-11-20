import ScoreRing from "./ScoreRing";

const NUTRI = { a: "#038141", b: "#85bb2f", c: "#fecb02", d: "#ee8100", e: "#e63e11" };
const NOVA_TEXT = {
  1: "Unprocessed or minimally processed",
  2: "Processed ingredients",
  3: "Processed food",
  4: "Ultra-processed food",
};
const NOVA_COLOR = { 1: "#038141", 2: "#85bb2f", 3: "#ee8100", 4: "#e63e11" };

function fmt(value, unit) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 10) / 10}${unit ? ` ${unit}` : ""}`;
}

function NutriScore({ grade }) {
  const g = typeof grade === "string" ? grade.toLowerCase() : "";
  if (!NUTRI[g]) return null;
  return (
    <div className="badge-box">
      <div className="badge-title">Nutri-Score</div>
      <div className="nutri-strip">
        {Object.keys(NUTRI).map((letter) => (
          <span
            key={letter}
            className={letter === g ? "nutri-letter active" : "nutri-letter"}
            style={{ background: NUTRI[letter] }}
          >
            {letter.toUpperCase()}
          </span>
        ))}
      </div>
      <div className="badge-note">From Open Food Facts</div>
    </div>
  );
}

function Nova({ group }) {
  const g = Number(group);
  if (!NOVA_TEXT[g]) return null;
  return (
    <div className="badge-box">
      <div className="badge-title">NOVA group</div>
      <div className="nova-row">
        <span className="nova-num" style={{ background: NOVA_COLOR[g] }}>{g}</span>
        <span className="nova-text">{NOVA_TEXT[g]}</span>
      </div>
      <div className="badge-note">From Open Food Facts</div>
    </div>
  );
}

export default function ResultView({ data, onReset }) {
  const { product, score, barcode, source } = data;
  const n = product.nutriments || {};
  const reasons = Array.isArray(score.reasons) ? score.reasons : [];

  return (
    <div className="stack">
      <section className="card product-card">
        {product.image ? (
          <img className="product-img" src={product.image} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-img placeholder" aria-hidden="true">🛒</div>
        )}
        <div>
          <h2 className="product-name">{product.name}</h2>
          {product.brand && <div className="muted">{product.brand}</div>}
          <div className="muted small">
            {[product.quantity, barcode && `Barcode ${barcode}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </section>

      <section className="card center">
        <ScoreRing score={score.score} band={score.band} label={score.label} />
        {score.message && <p className="notice notice-info">{score.message}</p>}
        <div className="badges">
          <NutriScore grade={product.nutriscore} />
          <Nova group={product.nova} />
        </div>
      </section>

      {reasons.length > 0 && (
        <section className="card">
          <h3>Why this score</h3>
          <ul className="reasons">
            {reasons.map((r, i) => (
              <li key={`${r.label}-${i}`} className="reason">
                <span className={r.points < 0 ? "pts pts-bad" : "pts pts-good"}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </span>
                <div>
                  <div className="reason-label">{r.label}</div>
                  <div className="muted small">{r.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Nutrition per 100 {product.isBeverage ? "ml" : "g"}</h3>
        <div className="nutri-grid">
          <div><span>Energy</span><b>{fmt(n["energy-kcal_100g"], "kcal")}</b></div>
          <div><span>Sugar</span><b>{fmt(n["sugars_100g"], "g")}</b></div>
          <div><span>Saturated fat</span><b>{fmt(n["saturated-fat_100g"], "g")}</b></div>
          <div><span>Salt</span><b>{fmt(n["salt_100g"], "g")}</b></div>
          <div><span>Fibre</span><b>{fmt(n["fiber_100g"], "g")}</b></div>
          <div><span>Protein</span><b>{fmt(n["proteins_100g"], "g")}</b></div>
        </div>
      </section>

      <section className="card">
        <h3>Ingredients</h3>
        <p className="ingredients">{product.ingredients || "Not available."}</p>
      </section>

      <button className="btn btn-primary" onClick={onReset}>Scan another product</button>

      <footer className="footer">
        {source === "Open Food Facts" && (
          <p>
            Product data: © <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> contributors (ODbL).
          </p>
        )}
        <p>The Tula score is a guide based on ingredients and nutrition. It is not medical advice.</p>
      </footer>
    </div>
  );
}