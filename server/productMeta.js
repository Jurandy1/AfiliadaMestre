"use strict";

const { CATEGORIAS, subcategoryForKeyword, categoryForKeyword } = require("./categorias");

const SIZE_TOKENS = new Set([
  "pp", "p", "m", "g", "gg", "xg", "xxg", "xxxg", "plus", "unico", "único",
]);

const VOLTAGE_RE = /\b(110\s*v|127\s*v|220\s*v|240\s*v|bivolt)\b/gi;
const SIZE_LIST_RE = /\b(pp|p|m|g|gg|xg|xxg|xxxg)\b/gi;
const SIZE_RANGE_RE = /\b(\d{2})\s*(?:ao|a|-|\/)\s*(\d{2})\b/i;
const SHOE_SIZE_RE = /\b(?:n[º°]?\s*)?(\d{2,3})(?:\s*(?:br|brasil))?\b/gi;

const STOP_TOKENS = new Set([
  "feminino", "feminina", "mulher", "para", "com", "kit", "tipo", "modelo", "novo", "nova",
  "de", "da", "do", "das", "dos", "em", "no", "na", "um", "uma", "the", "and",
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
  audio: (title) => /\b(fone|earbud|headset|caixa\s*de\s*som|speaker)\b/i.test(title),
  wearables: (title) => /\b(smartwatch|rel[oó]gio\s*inteligente)\b/i.test(title),
  protecao: (title) => /\b(capinha|pel[ií]cula|case)\b/i.test(title),
  energia: (title) => /\b(power\s*bank|carregador|cabo)\b/i.test(title),
  cozinha: (title) => /\b(air\s*fryer|panela|utens[ií]lio|cozinha)\b/i.test(title),
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

function keywordTitleScore(keyword, title) {
  const lowerTitle = String(title || "").toLowerCase();
  const tokens = tokenize(keyword);
  if (!tokens.length) return 0;
  const hits = tokens.filter((tok) => lowerTitle.includes(tok));
  if (!hits.length) return 0;
  const longest = Math.max(...hits.map((h) => h.length));
  return hits.length >= 2 ? longest + hits.length * 2 : longest;
}

function keywordOverlapScore(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  if (!hits) return 0;
  const ratio = hits / Math.min(ta.size, tb.size);
  return hits * 3 + ratio * 5;
}

function uniqueList(items) {
  return [...new Set(items.map((s) => String(s).trim()).filter(Boolean))];
}

function extractProductOptions(title = "", priceMin = 0, priceMax = 0) {
  const text = String(title || "");
  const lower = text.toLowerCase();
  const sizes = [];
  const voltages = uniqueList((text.match(VOLTAGE_RE) || []).map((v) => v.replace(/\s+/g, "").toUpperCase()));

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
  let bestScore = best ? 10 : 0;

  for (const sub of cat.subcategories) {
    const rule = SUB_TITLE_RULES[sub.id];
    if (rule && rule(lowerTitle)) {
      const ruleScore = 12;
      if (ruleScore > bestScore) {
        bestScore = ruleScore;
        best = sub.id;
      }
    }
    for (const kw of sub.keywords || []) {
      const k = String(kw).toLowerCase().trim();
      if (!k) continue;
      if (lowerKw === k) return sub.id;
      const score =
        keywordTitleScore(k, lowerTitle) +
        keywordOverlapScore(k, lowerKw) +
        (lowerKw && (k.includes(lowerKw) || lowerKw.includes(k)) ? 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = sub.id;
      }
    }
  }

  return bestScore >= 5 ? best : (best || null);
}

/**
 * Resolve categoria + subcategoria da vitrine a partir da keyword de busca
 * e do título do produto. Usado em todo save/sync.
 */
function resolveTaxonomy(keyword = "", productName = "", opts = {}) {
  const forceCategory = opts.forceCategory && opts.forceCategory !== "todos"
    ? String(opts.forceCategory)
    : null;
  const forceSubcategory = opts.forceSubcategory ? String(opts.forceSubcategory) : null;

  if (forceCategory) {
    const sub = forceSubcategory || inferSubcategory(forceCategory, keyword, productName);
    return {
      category: forceCategory,
      subcategory: sub,
      source: forceSubcategory ? "forced" : "forced_category",
    };
  }

  const kw = String(keyword || "").toLowerCase().trim();
  const title = String(productName || "");

  let category = categoryForKeyword(kw);
  let subcategory = category !== "todos" ? inferSubcategory(category, kw, title) : null;
  let source = category !== "todos" ? "keyword" : "none";
  let score = category !== "todos" ? 10 : 0;

  let best = { category: null, subcategory: null, score: 0 };
  for (const cat of CATEGORIAS) {
    for (const sub of cat.subcategories || []) {
      const rule = SUB_TITLE_RULES[sub.id];
      if (rule && rule(title.toLowerCase())) {
        const s = 14;
        if (s > best.score) best = { category: cat.id, subcategory: sub.id, score: s };
      }
      for (const mapKw of sub.keywords || []) {
        const s =
          keywordTitleScore(mapKw, title) +
          keywordOverlapScore(mapKw, kw) +
          (kw && (String(mapKw).toLowerCase().includes(kw) || kw.includes(String(mapKw).toLowerCase())) ? 4 : 0);
        if (s > best.score) {
          best = { category: cat.id, subcategory: sub.id, score: s };
        }
      }
    }
  }

  if (best.score >= 6 && (category === "todos" || best.score > score + 2)) {
    category = best.category;
    subcategory = best.subcategory;
    source = "title";
    score = best.score;
  } else if (category !== "todos" && !subcategory && best.category === category && best.subcategory) {
    subcategory = best.subcategory;
    source = "keyword+title";
  }

  if (category && category !== "todos" && !subcategory) {
    subcategory = inferSubcategory(category, kw, title);
  }

  return {
    category: category || "todos",
    subcategory: subcategory || null,
    source,
    score,
  };
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
  resolveTaxonomy,
  productMatchesSubcategory,
};
