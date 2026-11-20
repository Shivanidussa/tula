// Turns the numbers typed by the user into the same keys Open Food Facts uses.
// Indian packs list sodium in mg, so we convert it to grams and to salt.

function read(values, key) {
  const raw = String((values && values[key]) ?? "").replace(",", ".").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : null;
}

export function buildNutriments(values) {
  const out = {};
  const energy = read(values, "energy");
  const sugar = read(values, "sugar");
  const satFat = read(values, "satFat");
  const sodium = read(values, "sodium");
  const fibre = read(values, "fibre");
  const protein = read(values, "protein");

  if (energy !== null) out["energy-kcal_100g"] = energy;
  if (sugar !== null) out["sugars_100g"] = sugar;
  if (satFat !== null) out["saturated-fat_100g"] = satFat;
  if (sodium !== null) {
    out["sodium_100g"] = sodium / 1000; // mg -> g
    out["salt_100g"] = Math.round(sodium * 2.5) / 1000; // salt = sodium x 2.5
  }
  if (fibre !== null) out["fiber_100g"] = fibre;
  if (protein !== null) out["proteins_100g"] = protein;
  return out;
}