"use strict";

/** Marcador fixo deste site nas conversões Shopee (utmContent). */
const SITE_SUBID = "afiliada_mestre";

/** Códigos curtos de seção da vitrine → slot 3 (campanha) no painel Shopee. */
const SECTION_CODES = {
  home: "vitrine",
  home_hero: "hh",
  flash_deals: "fl",
  top_sellers: "ts",
  big_discounts: "bd",
  top_rated: "tr",
  official_shops: "of",
  category_page: "ct",
  search_result: "sr",
  modal_direct: "md",
  destaque: "vd",
  oficial: "oficial",
};

function sanitizeSubId(value, fallback = "geral") {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return clean || fallback;
}

/**
 * Sub IDs padrão de cada produto — gravados no sync (sem chamada extra à Shopee).
 * 1 site | 2 canal base | 3 campanha base | 4 categoria[+sub] | 5 produto
 */
function buildProductSubIds(category, itemId, subcategory = null, campaign = "vitrine") {
  const catBase = sanitizeSubId(category, "geral");
  const catSlot = subcategory
    ? sanitizeSubId(`${catBase}_${subcategory}`, catBase)
    : catBase;
  return [
    SITE_SUBID,
    "organico",
    sanitizeSubId(campaign, "vitrine"),
    catSlot,
    sanitizeSubId(itemId ? `p${itemId}` : "produto", "produto"),
  ].slice(0, 5);
}

function sectionToCampaign(section) {
  if (!section) return null;
  const key = String(section).trim();
  if (SECTION_CODES[key]) return SECTION_CODES[key];
  return sanitizeSubId(key, null);
}

function subIdsToText(subIds) {
  return (Array.isArray(subIds) ? subIds : []).filter(Boolean).join(" | ");
}

module.exports = {
  SITE_SUBID,
  SECTION_CODES,
  sanitizeSubId,
  buildProductSubIds,
  sectionToCampaign,
  subIdsToText,
};
