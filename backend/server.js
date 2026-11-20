require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { scoreProduct } = require("./scoring/scoreProduct");
const { pickIngredientTexts, isBeverageProduct } = require("./scoring/ingredientText");

const app = express();
// In production, only the Tula website (CLIENT_ORIGIN) may call this API
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 5000;
const USER_AGENT =
  process.env.OFF_USER_AGENT || "Tula/1.0 (contact@example.com)";

const FIELDS = [
  "product_name",
  "brands",
  "quantity",
  "ingredients_text",
  "ingredients_text_en",
  "ingredients_tags",
  "categories_tags",
  "nutriments",
  "image_front_url",
  "nutriscore_grade",
  "nova_group",
].join(",");

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Tula" });
});

// Barcode lookup + score
app.get("/api/product/:barcode", async (req, res) => {
  const { barcode } = req.params;

  // 1. Validate input
  if (!/^\d{8,14}$/.test(barcode)) {
    return res.status(400).json({
      found: false,
      error: "INVALID_BARCODE",
      message: "Barcode must be 8 to 14 digits.",
    });
  }

  try {
    // 2. Call Open Food Facts (with User-Agent and timeout)
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      {
        headers: { "User-Agent": USER_AGENT },
        params: { fields: FIELDS },
        timeout: 8000,
      }
    );

    // 3. Product not in database
    if (data.status !== 1 || !data.product) {
      return res.status(404).json({
        found: false,
        error: "NOT_FOUND",
        message: "Product not found. Please scan the ingredients label.",
      });
    }

        const p = data.product;
    const { display, forScoring } = pickIngredientTexts(p);
    const nutriments = p.nutriments || {};
    const isBeverage = isBeverageProduct(p);

    // 4. Success: attach the Tula score
    return res.json({
      found: true,
      barcode,
      hasIngredients: display.length > 0,
      product: {
        name: p.product_name || "Unknown product",
        brand: p.brands || "",
        quantity: p.quantity || "",
        image: p.image_front_url || "",
        ingredients: display,
        nutriments,
        nutriscore: p.nutriscore_grade || null,
        nova: p.nova_group || null,
        isBeverage,
      },
      score: scoreProduct({
        ingredients: forScoring,
        nutriments,
        nutriscore: p.nutriscore_grade,
        nova: p.nova_group,
        isBeverage,
      }),
    });   

  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({
        found: false,
        error: "NOT_FOUND",
        message: "Product not found. Please scan the ingredients label.",
      });
    }
    console.error("Lookup failed:", err.message);
    return res.status(502).json({
      found: false,
      error: "SERVICE_UNAVAILABLE",
      message: "Could not reach the food database. Please try again.",
    });
  }
});

// Score any ingredients text (used later by the photo fallback and the edit box)
app.post("/api/score", (req, res) => {
  const { ingredients, nutriments } = req.body || {};

  if (typeof ingredients !== "string" || ingredients.trim().length < 3) {
    return res.status(400).json({
      error: "INVALID_INGREDIENTS",
      message: "Please send the ingredients as text.",
    });
  }

    if (ingredients.length > 3000) {
    return res.status(400).json({
      error: "INVALID_INGREDIENTS",
      message: "That text is too long to be an ingredient list.",
    });
  }

  const scored = scoreProduct({ ingredients, nutriments });
  if (scored.score === null) {
    return res.status(422).json({ error: "UNREADABLE_INGREDIENTS", message: scored.message });
  }

  return res.json({ score: scored });
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found." });
});

// Last safety net: never crash on unexpected errors
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "BAD_JSON", message: "Request body is not valid JSON." });
  }
  console.error("Unexpected error:", err.message);
  res.status(500).json({ error: "SERVER_ERROR", message: "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`Tula backend running on http://localhost:${PORT}`);
});