// Helpers that read an Open Food Facts product safely.

// "en:palm-oil" -> "palm oil" (language-neutral names, only English ones)
function tagsToText(tags) {
  if (!Array.isArray(tags)) return "";
  return tags
    .filter((t) => typeof t === "string" && t.startsWith("en:"))
    .map((t) => t.slice(3).replace(/-/g, " "))
    .join(", ");
}

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

// display = what the user reads, forScoring = what the scoring engine reads.
// Many Indian and European packs are stored in another language, so for scoring
// we prefer the English text, then Open Food Facts' English tags, then the raw text.
function pickIngredientTexts(p) {
  const en = clean(p.ingredients_text_en);
  const raw = clean(p.ingredients_text);
  const fromTags = tagsToText(p.ingredients_tags);

  const display = en || raw || fromTags;
  const forScoring = en || fromTags || raw;
  return { display, forScoring };
}

function isBeverageProduct(p) {
  const tags = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  if (tags.includes("en:beverages")) return true;
  return /\d\s?(ml|cl|l|litre|liter)\b/i.test(clean(p.quantity));
}

module.exports = { pickIngredientTexts, isBeverageProduct, tagsToText };