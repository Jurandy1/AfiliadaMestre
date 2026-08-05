"use strict";

const { fetchProductOffers, mapOfferToRow, MIN_RATING, MIN_SALES } = require("./shopee");
const { clearAllOfertas } = require("./supabase");
const { saveOffersWithShortlinks } = require("./shortlinks");
const { prioritizedKeywords, DEFAULT_FEMALE_PERCENT } = require("./categorias");

/**
 * Limpa (opcional) e realimenta a vitrine via API Shopee.
 * Usa keywords priorizadas ~95% feminino.
 * Cada lote salvo já sai com shortlink.
 */
async function refillVitrine({
  clear = true,
  limit = 50,
  pages = 2,
  maxItems = 0,
  gapMs = 250,
} = {}) {
  const syncLimit = Math.min(Math.max(Number(limit) || 50, 5), 100);
  const syncPages = Math.min(Math.max(Number(pages) || 2, 1), 5);
  const cap = Math.min(Math.max(Number(maxItems) || 0, 0), 10000);

  const removed = clear ? await clearAllOfertas() : 0;
  const keywords = prioritizedKeywords({ femalePercent: DEFAULT_FEMALE_PERCENT });
  if (cap > 0) {
    const maxKw = Math.max(20, Math.ceil(cap / Math.max(1, syncLimit)));
    if (keywords.length > maxKw) keywords.length = maxKw;
  }
  const report = [];
  const map = new Map();
  const byCategory = {};
  let keywordsRun = 0;
  let shortlinksGenerated = 0;
  let skippedExisting = 0;
  let stoppedEarly = false;

  for (const { keyword, category, subcategory } of keywords) {
    if (cap > 0 && map.size >= cap) {
      stoppedEarly = true;
      break;
    }

    keywordsRun += 1;
    let kwCount = 0;

    for (let page = 1; page <= syncPages; page += 1) {
      if (cap > 0 && map.size >= cap) {
        stoppedEarly = true;
        break;
      }

      try {
        const offer = await fetchProductOffers({
          keyword,
          limit: syncLimit,
          page,
          listType: 1,
          sortType: 5,
          minRating: MIN_RATING,
          minSales: MIN_SALES,
          requireCommission: true,
        });
        const nodes = offer.nodes || [];
        const rows = nodes
          .map((n) =>
            mapOfferToRow(n, keyword, 1, {
              forceCategory: category || null,
              forceSubcategory: subcategory || null,
            })
          )
          .filter((r) => r.item_id && r.offer_link);

        if (rows.length) {
          const out = await saveOffersWithShortlinks(rows, { gapMs: 100 });
          out.rows.forEach((r) => map.set(String(r.item_id), r));
          kwCount += out.saved;
          shortlinksGenerated += out.shortlinks?.generated || 0;
          skippedExisting += out.skippedExisting || 0;
        }
        if (!offer.pageInfo?.hasNextPage) break;
      } catch (e) {
        report.push({ keyword, category, page, ok: false, error: e.message });
      }

      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    }

    byCategory[category] = (byCategory[category] || 0) + kwCount;
    report.push({ keyword, category, ok: true, count: kwCount });
  }

  return {
    ok: true,
    removed,
    refilled: map.size,
    shortlinksGenerated,
    skippedExisting,
    maxItems: cap || null,
    stoppedEarly,
    keywordsRun,
    byCategory,
    femalePercentTarget: DEFAULT_FEMALE_PERCENT,
    report,
  };
}

module.exports = { refillVitrine };
