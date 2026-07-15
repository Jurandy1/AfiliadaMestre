"use strict";

const { fetchProductOffers, mapOfferToRow } = require("./shopee");
const { upsertOfertas, clearAllOfertas } = require("./supabase");
const { prioritizedKeywords, roundRobinKeywords, allKeywords } = require("./categorias");

const SITE_SUBID = "afiliada_mestre";

/**
 * Limpa (opcional) e realimenta a vitrine via API Shopee.
 * @param {object} opts
 * @param {boolean} [opts.clear=true]
 * @param {number} [opts.limit=50] itens por página na API
 * @param {number} [opts.pages=2] páginas por keyword
 * @param {number} [opts.maxItems=0] para ao atingir N itens únicos (0 = sem limite)
 * @param {number} [opts.gapMs=250] intervalo entre requisições
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
  const keywords = cap > 0 ? roundRobinKeywords() : allKeywords();
  const report = [];
  const map = new Map();
  const byCategory = {};
  let keywordsRun = 0;
  let stoppedEarly = false;

  for (const { keyword, category } of keywords) {
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
          listType: 0,
          sortType: 2,
        });
        const nodes = offer.nodes || [];
        const rows = nodes
          .map((n) => mapOfferToRow(n, keyword, 0))
          .filter((r) => r.item_id && r.offer_link)
          .map((r) => ({ ...r, short_link: null }));

        if (rows.length) {
          await upsertOfertas(rows);
          rows.forEach((r) => map.set(String(r.item_id), r));
          kwCount += rows.length;
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
    maxItems: cap || null,
    stoppedEarly,
    keywordsRun,
    keywordsTotal: keywords.length,
    byCategory,
    siteSubId: SITE_SUBID,
  };
}

module.exports = { refillVitrine };
