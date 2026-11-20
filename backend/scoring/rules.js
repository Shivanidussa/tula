// Tula scoring rules.
// - points: negative = penalty, positive = bonus
// - group: only ONE rule per group can apply to the same ingredient
// - exclude: if this pattern also matches, the rule is skipped
// - weighted: false = full effect no matter where it appears in the list (additives)

const INGREDIENT_RULES = [
  // ---------- Refined flour (maida) ----------
  {
    id: "refined-flour",
    group: "flour",
    label: "Refined flour (maida)",
    pattern: /\b(maida|refined (wheat )?flour|white flour|enriched (wheat )?flour|all[- ]purpose flour)\b/,
    points: -35,
    detail: "Refined flour has very little fibre and raises blood sugar quickly.",
  },
  {
    id: "wheat-flour",
    group: "flour",
    label: "Wheat flour (likely refined)",
    pattern: /\bwheat flour\b/,
    exclude: /whole|atta|multigrain/,
    points: -8,
    detail: "Plain 'wheat flour' on Indian packs is usually refined flour.",
  },

  // ---------- Sugars ----------
  {
    id: "added-sugar",
    group: "sugar",
    label: "Added sugar / syrup",
    pattern: /\b(sugar|sucrose|glucose|fructose|dextrose|maltodextrin|invert sugar|corn syrup|liquid glucose|syrup)\b/,
    exclude: /free|no added|sugarcane juice/,
    points: -12,
    detail: "Added sugars give calories without nutrients.",
  },

  // ---------- Fats ----------
  {
    id: "trans-fat",
    group: "fat",
    label: "Hydrogenated fat / vanaspati",
    pattern: /\b(hydrogenated|vanaspati|shortening|margarine|interesterified)\b/,
    points: -15,
    detail: "Hydrogenated fats can contain harmful trans fats.",
  },
  {
    id: "palm-oil",
    group: "fat",
    label: "Palm oil / palmolein",
    pattern: /\b(palm|palmolein|palm olein|palmoil)\b/,
    points: -10,
    detail: "Palm oil is high in saturated fat.",
  },

  // ---------- Additives ----------
  {
    id: "flavour-enhancer",
    group: "additive-enhancer",
    weighted: false,
    label: "Flavour enhancer (MSG / INS 6xx)",
    pattern: /\b(msg|monosodium glutamate|flavou?r enhancers?|disodium (inosinate|guanylate)|(ins|e)\s?-?6[2-3]\d)\b/,
    points: -8,
    detail: "Flavour enhancers make food taste stronger so you eat more of it.",
  },
  {
    id: "artificial-colour",
    group: "additive-colour",
    weighted: false,
    label: "Added colour (INS 1xx)",
    pattern: /\b(artificial colou?rs?|synthetic colou?rs?|tartrazine|sunset yellow|carmoisine|allura red|brilliant blue|ponceau|erythrosine|(ins|e)\s?-?1\d\d[a-z]?)\b/,
    points: -6,
    detail: "Synthetic colours add no nutrition.",
  },
  {
    id: "sweetener",
    group: "additive-sweetener",
    weighted: false,
    label: "Artificial sweetener",
    pattern: /\b(aspartame|acesulfame|sucralose|saccharin|(ins|e)\s?-?(950|951|954|955|962))\b/,
    points: -6,
    detail: "Artificial sweeteners are best kept occasional.",
  },
  {
    id: "preservative",
    group: "additive-preservative",
    weighted: false,
    label: "Preservative",
    pattern: /\b(preservatives?|sodium benzoate|potassium sorbate|sodium nitrite|tbhq|bha|bht|(ins|e)\s?-?2\d\d)\b/,
    points: -5,
    detail: "Chemical preservatives are a sign of heavy processing.",
  },
  {
    id: "artificial-flavour",
    group: "additive-flavour",
    weighted: false,
    label: "Artificial flavour",
    pattern: /\b(artificial flavou?rs?|artificial flavou?ring|nature[- ]identical)\b/,
    points: -4,
    detail: "Artificial flavours are used to imitate real ingredients.",
  },

  // ---------- Good stuff ----------
  {
    id: "whole-grain",
    group: "wholegrain",
    label: "Whole grain / millet",
    pattern: /\b(whole ?(wheat|grain|oats?)|wholegrain|atta|oats?|ragi|jowar|bajra|millets?|brown rice|quinoa|barley)\b/,
    points: 8,
    detail: "Whole grains provide fibre and steady energy.",
  },
  {
    id: "nuts-seeds",
    group: "nuts",
    label: "Nuts / seeds",
    pattern: /\b(almonds?|cashews?|peanuts?|walnuts?|pistachios?|hazelnuts?|nuts?|seeds?|flax|chia|sesame)\b/,
    exclude: /oil|butter flavou?r|nut free|may contain|traces/,
    points: 4,
    detail: "Nuts and seeds add healthy fats and protein.",
  },
  {
    id: "pulses",
    group: "pulses",
    label: "Pulses / legumes",
    pattern: /\b(dal|dhal|lentils?|chickpeas?|besan|gram flour|soya?|soy beans?|beans?|peas)\b/,
    exclude: /lecithin|oil|sauce/,
    points: 4,
    detail: "Pulses are a good source of protein and fibre.",
  },
];

// Nutrition thresholds, per 100 g. The first threshold that is met wins.
const NUTRITION_RULES = [
    {
    id: "energy",
    label: "Calories",
    unit: "kcal",
    read: (n) => num(n["energy-kcal_100g"]),
    tiers: [
      { min: 500, points: -8, text: "very high calories" },
      { min: 400, points: -4, text: "high calories" },
    ],
  },
  {
    id: "sugar",
    label: "Sugar",
    unit: "g",
    read: (n) => num(n["sugars_100g"]),
    beverageTiers: [
      { min: 8, points: -25, text: "very high sugar for a drink" },
      { min: 4, points: -12, text: "high sugar for a drink" },
      { min: 2, points: -5, text: "moderate sugar for a drink" },
    ],
    tiers: [
      { min: 22.5, points: -20, text: "very high sugar" },
      { min: 10, points: -12, text: "high sugar" },
      { min: 5, points: -5, text: "moderate sugar" },
    ],
  },
  {
    id: "saturated-fat",
    label: "Saturated fat",
    unit: "g",
    read: (n) => num(n["saturated-fat_100g"]),
    tiers: [
      { min: 5, points: -12, text: "high saturated fat" },
      { min: 2, points: -6, text: "moderate saturated fat" },
    ],
  },
  {
    id: "salt",
    label: "Salt",
    unit: "g",
    read: (n) => {
      const salt = num(n["salt_100g"]);
      if (salt !== null) return salt;
      const sodium = num(n["sodium_100g"]);
      return sodium !== null ? sodium * 2.5 : null;
    },
    tiers: [
      { min: 1.5, points: -12, text: "high salt" },
      { min: 0.6, points: -6, text: "moderate salt" },
    ],
  },
  {
    id: "fibre",
    label: "Fibre",
    unit: "g",
    read: (n) => num(n["fiber_100g"]),
    tiers: [
      { min: 6, points: 8, text: "high fibre" },
      { min: 3, points: 4, text: "good fibre" },
    ],
  },
  {
    id: "protein",
    label: "Protein",
    unit: "g",
    read: (n) => num(n["proteins_100g"]),
    tiers: [
      { min: 10, points: 6, text: "high protein" },
      { min: 5, points: 3, text: "good protein" },
    ],
  },
];

function num(v) {
  const x = typeof v === "string" ? parseFloat(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

module.exports = { INGREDIENT_RULES, NUTRITION_RULES };