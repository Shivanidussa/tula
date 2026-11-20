const { INGREDIENT_RULES, NUTRITION_RULES } = require("./rules");

const MAX_BONUS = 20; // bonuses can never add more than this in total

// "Wheat flour (maida), Sugar, Edible Oil (Palm), INS 621" -> small clean pieces
function parseIngredients(text) {
  if (typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/^\s*ingredients?\s*[:\-]?/, "")
    .replace(/[\[\]\(\)\{\}]/g, ",")
    .replace(/\d+(\.\d+)?\s?%/g, " ")
    .split(/[,;\n&]+|\sand\s/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1 && !/^(contains|may contain)\b/.test(t));
}

// Ingredients are listed by quantity, so earlier = bigger effect
function positionWeight(index) {
  if (index < 3) return 1;
  if (index < 6) return 0.6;
  return 0.3;
}

function bandFor(score) {
  if (score >= 80) return { band: "good", label: "Good" };
  if (score >= 50) return { band: "okay", label: "Okay" };
  return { band: "poor", label: "Poor" };
}

function scoreIngredients(ingredientsText) {
  const tokens = parseIngredients(ingredientsText);
  const reasons = [];
  const used = new Set(); // each rule counts once per product

  tokens.forEach((token, index) => {
    const groupsUsed = new Set(); // one rule per group per ingredient
    for (const rule of INGREDIENT_RULES) {
      if (used.has(rule.id) || groupsUsed.has(rule.group)) continue;
      if (!rule.pattern.test(token)) continue;
      if (rule.exclude && rule.exclude.test(token)) continue;

      const weight = rule.weighted === false ? 1 : positionWeight(index);
      const points = Math.round(rule.points * weight);
      if (points === 0) continue;

      used.add(rule.id);
      groupsUsed.add(rule.group);
      reasons.push({
        source: "ingredient",
        type: points < 0 ? "penalty" : "bonus",
        label: rule.label,
        points,
        detail: rule.detail,
        position: index + 1,
        matched: token,
      });
    }
  });

  return { tokens, reasons };
}

function scoreNutrition(nutriments, isBeverage) {
  const reasons = [];
  if (!nutriments || typeof nutriments !== "object") return { reasons, available: false };

  let available = false;
  for (const rule of NUTRITION_RULES) {
    const value = rule.read(nutriments);
    if (value === null) continue;
    available = true;
    const tiers = isBeverage && rule.beverageTiers ? rule.beverageTiers : rule.tiers;
    const tier = tiers.find((t) => value >= t.min);
    if (!tier) continue;
    reasons.push({
      source: "nutrition",
      type: tier.points < 0 ? "penalty" : "bonus",
      label: rule.label,
      points: tier.points,
      detail: `${tier.text[0].toUpperCase()}${tier.text.slice(1)}: ${Math.round(value * 10) / 10} ${rule.unit} per 100 ${isBeverage ? "ml" : "g"}.`,
    });
  }
  return { reasons, available };
}

// Open Food Facts' own ratings keep Tula honest:
// a product they rate Nutri-Score E or NOVA 4 can never be called "Good".
const NUTRI_CAPS = { e: 45, d: 64, c: 79 };
const NOVA4_CAP = 69;

function findCap({ nutriscore, nova }) {
  let best = null;
  const grade = typeof nutriscore === "string" ? nutriscore.toLowerCase() : "";
  if (NUTRI_CAPS[grade] !== undefined) {
    best = { cap: NUTRI_CAPS[grade], label: `Nutri-Score ${grade.toUpperCase()}` };
  }
  if (Number(nova) === 4 && (!best || NOVA4_CAP < best.cap)) {
    best = { cap: NOVA4_CAP, label: "NOVA 4 (ultra-processed)" };
  }
  return best;
}

// An ingredient list has separators (commas, &, "and"). One long run of words
// with no separator is usually text that was read wrongly from a photo.
function looksLikeIngredientList(tokens) {
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return tokens[0].split(" ").length <= 5;
  return true;
}

// With only half the data we can not be sure, so the score never goes above this
const PARTIAL_DATA_CAP = 85;

function scoreProduct({ ingredients, nutriments, nutriscore, nova, isBeverage } = {}) {
  const ing = scoreIngredients(ingredients);
  const nut = scoreNutrition(nutriments, Boolean(isBeverage));

  const readable = looksLikeIngredientList(ing.tokens);
  const hasIngredients = readable;
  const hasNutrition = nut.available;
  const ingredientReasons = readable ? ing.reasons : [];

  // Not enough data -> do NOT guess a number
  if (!hasIngredients && !hasNutrition) {
    return {
      score: null,
      band: null,
      label: "Not enough data",
      confidence: "none",
      estimate: false,
      reasons: [],
      ingredientsList: [],
      message:
        ing.tokens.length > 0
          ? "That text does not look like an ingredient list. Please check it, separate the ingredients with commas, and try again."
          : "We could not find ingredients or nutrition data. Please scan the ingredients label.",
    };
  }

  const all = [...ingredientReasons, ...nut.reasons];
  const penalties = all.filter((r) => r.points < 0);
  const bonusTotal = Math.min(
    MAX_BONUS,
    all.filter((r) => r.points > 0).reduce((s, r) => s + r.points, 0)
  );
  const penaltyTotal = penalties.reduce((s, r) => s + r.points, 0);

  let score = Math.max(0, Math.min(100, Math.round(100 + penaltyTotal + bonusTotal)));

  // Apply the Open Food Facts safety cap
  const capInfo = findCap({ nutriscore, nova });
  if (capInfo && score > capInfo.cap) {
    all.push({
      source: "openfoodfacts",
      type: "penalty",
      label: `Open Food Facts: ${capInfo.label}`,
      points: capInfo.cap - score,
      detail: `Open Food Facts rates this product ${capInfo.label}, so Tula keeps the score at ${capInfo.cap} or below.`,
    });
    score = capInfo.cap;
  }

  // Partial data: show an estimate, never a perfect 100
  const estimate = !(hasIngredients && hasNutrition);
  if (estimate && score > PARTIAL_DATA_CAP) score = PARTIAL_DATA_CAP;

  const { band, label } = bandFor(score);

  // Worst problems first, then bonuses
  all.sort((a, b) => a.points - b.points);

  return {
    score,
    band,
    label,
    confidence: estimate ? "medium" : "high",
    estimate,
    reasons: all,
    ingredientsList: readable ? ing.tokens : [],
    message: estimate
      ? "This is an estimate based on partial data. Add the nutrition numbers (per 100 g) for a more accurate score."
      : null,
  };
}
module.exports = { scoreProduct, parseIngredients };