const { scoreProduct } = require("./scoreProduct");

const cases = {
  "Nutella (partial data)": {
    ingredients: "sugar, palm oil",
    nutriments: { "sugars_100g": 56.3, "saturated-fat_100g": 10.6, "salt_100g": 0.107, "fiber_100g": 0, "proteins_100g": 6.3 },
  },
  "Maida biscuit": {
    ingredients:
      "Refined Wheat Flour (Maida) (58%), Sugar, Edible Vegetable Oil (Palm), Invert Syrup, Raising Agents (INS 500(ii), INS 503(ii)), Salt, Emulsifier (INS 322), Artificial Flavour, Colour (INS 150d)",
    nutriments: { "sugars_100g": 22, "saturated-fat_100g": 8, "salt_100g": 0.9, "fiber_100g": 1.5, "proteins_100g": 6 },
  },
  "Oats + nuts": {
    ingredients: "Rolled oats (70%), almonds, raisins, flax seeds",
    nutriments: { "sugars_100g": 9, "saturated-fat_100g": 1.2, "salt_100g": 0.02, "fiber_100g": 9, "proteins_100g": 12 },
  },
  "No data": {},
};

for (const [name, input] of Object.entries(cases)) {
  const r = scoreProduct(input);
  console.log(`\n=== ${name}: ${r.score} (${r.label})`);
  r.reasons.forEach((x) => console.log(`  ${x.points > 0 ? "+" : ""}${x.points}  ${x.label}`));
}