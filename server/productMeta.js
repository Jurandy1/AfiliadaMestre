"use strict";

const { CATEGORIAS, subcategoryForKeyword } = require("./categorias");

const SIZE_TOKENS = new Set([
  "pp", "p", "m", "g", "gg", "xg", "xxg", "xxxg", "plus", "unico", "único",
]);

const VOLTAGE_RE = /\b(110\s*v|127\s*v|220\s*v|240\s*v|bivolt)\b/gi;
const SIZE_LIST_RE = /\b(pp|p|m|g|gg|xg|xxg|xxxg)\b/gi;
const SIZE_RANGE_RE = /\b(\d{2})\s*(?:ao|a|-|\/)\s*(\d{2})\b/i;
const SHOE_SIZE_RE = /\b(?:n[º°]?\s*)?(\d{2,3})(?:\s*(?:br|brasil))?\b/gi;

const STOP_TOKENS = new Set([
  "feminino", "feminina", "mulher", "para", "com", "kit", "tipo", "modelo", "novo", "nova",
  "vestido", "longo", "midi", "saia", "roupa", "conjunto", "blusa", "camiseta", "moda",
]);

const SUB_TITLE_RULES = {
  plus_size: (title) => /\b(plus\s*size|tam(?:anho)?\s*g{2,}|\bxg\b|\bxxg\b|4[6-9]|5[0-4])\b/i.test(title),
  lingerie: (title) => /\b(lingerie|calcinha|sutiã|sutia|cinta\s*modeladora)\b/i.test(title),
  praia: (title) => /\b(biqu[ií]ni|maiô|maio|sa[ií]da\s*de\s*praia|sunga)\b/i.test(title),
  calcas: (title) => /\b(cal[cç]a|jeans|legging|pantalona|alfaiataria|linho)\b/i.test(title),
  calcados: (title) => /\b(sand[aá]lia|t[eê]nis|bota|chinelo|scarpin|salto)\b/i.test(title),
  moda_fria: (title) => /\b(jaquet|casaco|moletom|blusa\s*de\s*frio|oversized)\b/i.test(title),
  casa_moda: (title) => /\b(pijama|robe|camisola|roup[aã]o)\b/i.test(title),
  tops: (title) => /\b(cropped|macac[aã]o|conjunto|blusa|camiseta|regata)\b/i.test(title),
  vestidos: (title) => /\b(vestido|saia)\b/i.test(title),
};

function keywordTitleScore(keyword, title) {
  const lowerTitle = String(title || "").toLowerCase();
  const tokens = String(keyword || "").toLowerCase().split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_TOKENS.has(t));
  if (!tokens.length) return 0;
  const hits = tokens.filter((tok) => lowerTitle.includes(tok));
  if (!hits.length) return 0;
  const longest = Math.max(...hits.map((h) => h.length));
  return hits.length >= 2 ? longest + hits.length : longest;
}

function uniqueList(items) {
  return [...new Set(items.map((s) => String(s).trim()).filter(Boolean))];
}

function extractProductOptions(title = "", priceMin = 0, priceMax = 0) {
  const text = String(title || "");
  const lower = text.toLowerCase();
  const sizes = [];
  const voltages = uniqueList((text.match(VOLTAGE_RE) || []).map((v) => v.replace(/\s+/g, "").toUpperCase()));

  let match;
  const sizeList = text.match(SIZE_LIST_RE) || [];
  for (const s of sizeList) {
    const token = s.toLowerCase();
    if (SIZE_TOKENS.has(token)) sizes.push(token.toUpperCase());
  }

  const range = lower.match(SIZE_RANGE_RE);
  if (range) sizes.push(`${range[1]} ao ${range[2]}`);

  const shoeMatches = [...lower.matchAll(SHOE_SIZE_RE)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 20 && n <= 50);
  if (shoeMatches.length) {
    sizes.push(...shoeMatches.map((n) => `Nº ${n}`));
  }

  const hasPriceRange = Number(priceMax) > Number(priceMin) * 1.02 && Number(priceMin) > 0;
  const normalizedSizes = uniqueList(sizes);

  const hints = [];
  if (normalizedSizes.length) hints.push(`Tamanhos: ${normalizedSizes.join(", ")}`);
  if (voltages.length) hints.push(`Voltagem: ${voltages.join(", ")}`);
  if (hasPriceRange) {
    hints.push(`Variações na Shopee (R$ ${Number(priceMin).toFixed(2)} – R$ ${Number(priceMax).toFixed(2)})`);
  } else if (normalizedSizes.length || voltages.length) {
    hints.push("Escolha a variação na página da Shopee");
  }

  return {
    sizes: normalizedSizes,
    voltages,
    hasVariants: hasPriceRange || normalizedSizes.length > 1 || voltages.length > 1,
    hint: hints.join(" · "),
    labels: [...normalizedSizes, ...voltages],
  };
}

function inferSubcategory(categoryId, keyword = "", title = "") {
  const cat = CATEGORIAS.find((c) => c.id === categoryId);
  if (!cat || !Array.isArray(cat.subcategories)) return subcategoryForKeyword(keyword);

  const lowerTitle = String(title || "").toLowerCase();
  const lowerKw = String(keyword || "").toLowerCase().trim();

  let best = subcategoryForKeyword(keyword);
  let bestScore = best ? 8 : 0;

  for (const sub of cat.subcategories) {
    for (const kw of sub.keywords || []) {
      const k = String(kw).toLowerCase().trim();
      if (!k) continue;
      if (lowerKw === k) {
        return sub.id;
      }
      const score = keywordTitleScore(k, lowerTitle);
      if (score > bestScore) {
        bestScore = score;
        best = sub.id;
      }
    }
  }

  return bestScore >= 5 ? best : (best || null);
}

function productMatchesSubcategory(product, categoryId, subcategoryId) {
  if (!subcategoryId) return true;
  const sub = String(subcategoryId).trim();
  if (!sub) return true;

  if (String(product.subcategory || "") === sub) return true;

  const cat = CATEGORIAS.find((c) => c.id === categoryId);
  const meta = (cat?.subcategories || []).find((s) => s.id === sub);
  const keywords = (meta?.keywords || []).map((k) => String(k).toLowerCase().trim());
  const kw = String(product.keyword || "").toLowerCase().trim();
  if (keywords.includes(kw)) return true;

  const title = String(product.title || product.product_name || "").toLowerCase();
  const rule = SUB_TITLE_RULES[sub];
  if (rule && rule(title)) return true;
  return keywords.some((k) => keywordTitleScore(k, title) >= 5);
}

module.exports = {
  extractProductOptions,
  inferSubcategory,
  productMatchesSubcategory,
};
