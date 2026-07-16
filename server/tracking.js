"use strict";

/** Marcador fixo deste site nas conversões Shopee (utmContent). */
const SITE_SUBID = "afiliada_mestre";

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
 * 1 site | 2 canal base | 3 campanha base | 4 categoria | 5 produto
 */
function buildProductSubIds(category, itemId) {
  return [
    SITE_SUBID,
    "organico",
    "vitrine",
    sanitizeSubId(category, "geral"),
    sanitizeSubId(itemId ? `p${itemId}` : "produto", "produto"),
  ].slice(0, 5);
}

function subIdsToText(subIds) {
  return (Array.isArray(subIds) ? subIds : []).filter(Boolean).join(" | ");
}

module.exports = {
  SITE_SUBID,
  sanitizeSubId,
  buildProductSubIds,
  subIdsToText,
};
