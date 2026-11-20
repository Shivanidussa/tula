const FIELDS = [
  { key: "energy", label: "Energy", unit: "kcal" },
  { key: "sugar", label: "Total sugars", unit: "g" },
  { key: "satFat", label: "Saturated fat", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "fibre", label: "Dietary fibre", unit: "g" },
  { key: "protein", label: "Protein", unit: "g" },
];

export default function NutritionFields({ values, onChange }) {
  return (
    <details className="nutrition-form">
      <summary>Add nutrition numbers (optional, more accurate)</summary>
      <p className="muted small">Copy these from the nutrition table on the pack, using the "per 100 g" column.</p>
      <div className="nf-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="nf-field">
            <span>{f.label} ({f.unit})</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="—"
              value={values[f.key] || ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </details>
  );
}