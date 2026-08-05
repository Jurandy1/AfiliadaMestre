"use strict";

/**
 * Shortlinks obrigatórios: todo produto salvo na vitrine sai com shope.ee + Sub IDs.
 */

const {
  generateBatchShortLink,
  resolveProductOriginUrl,
} = require("./shopee");
const { upsertOfertas, updateShortLink } = require("./supabase");
const { buildProductSubIds } = require("./tracking");

function prepareOfferRows(rows = []) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.item_id || !row.offer_link) continue;
    const copy = { ...row };
    if (!copy.product_link) {
      copy.product_link = resolveProductOriginUrl(copy) || null;
    }
    if (!Array.isArray(copy.sub_ids) || copy.sub_ids.length < 5) {
      copy.sub_ids = buildProductSubIds(copy.category, copy.item_id, copy.subcategory);
    }
    out.push(copy);
  }
  return out;
}

/**
 * Gera shortlinks shope.ee com Sub IDs oficiais para uma lista de rows.
 * Usa generateBatchShortLink (até 50 por request).
 */
async function generateShortlinksForRows(rows = [], { gapMs = 400 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let generated = 0;
  let failed = 0;
  let skipped = 0;
  const list = Array.isArray(rows) ? rows : [];
  const BATCH = 50;

  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const links = [];
    for (const row of chunk) {
      if (row.short_link) {
        skipped += 1;
        continue;
      }
      const origin = resolveProductOriginUrl(row);
      if (!origin) {
        skipped += 1;
        continue;
      }
      const subIds = Array.isArray(row.sub_ids) && row.sub_ids.length
        ? row.sub_ids
        : buildProductSubIds(row.category, row.item_id, row.subcategory);
      links.push({ originUrl: origin, subIds, itemId: row.item_id });
    }
    if (!links.length) continue;

    try {
      const batch = await generateBatchShortLink(links);
      for (const item of batch.links || []) {
        if (item.success && item.shortLink && item.itemId) {
          try {
            await updateShortLink(item.itemId, item.shortLink);
            generated += 1;
          } catch (_) {
            failed += 1;
          }
        } else {
          failed += 1;
        }
      }
      if (batch.rateLimited) {
        return { generated, failed, skipped, rateLimited: true };
      }
    } catch (e) {
      failed += links.length;
      if (e.rateLimited) {
        return { generated, failed, skipped, rateLimited: true, error: e.message };
      }
    }
    if (i + BATCH < list.length) await sleep(gapMs);
  }
  return { generated, failed, skipped };
}

/**
 * Upsert + shortlinks na mesma operação — padrão para sync/autosync/cobertura/explorador.
 */
async function saveOffersWithShortlinks(rows = [], { withShortlinks = true, gapMs = 200 } = {}) {
  const prepared = prepareOfferRows(rows);
  if (!prepared.length) {
    return {
      saved: 0,
      rows: [],
      shortlinks: { generated: 0, failed: 0, skipped: 0 },
    };
  }

  const result = await upsertOfertas(prepared);
  const saved = Array.isArray(result) ? result.length : prepared.length;

  let shortlinks = { generated: 0, failed: 0, skipped: 0 };
  if (withShortlinks) {
    shortlinks = await generateShortlinksForRows(prepared, { gapMs });
  }

  return { saved, rows: prepared, shortlinks };
}

module.exports = {
  prepareOfferRows,
  generateShortlinksForRows,
  saveOffersWithShortlinks,
};
