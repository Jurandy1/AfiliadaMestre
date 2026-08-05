"use strict";

/**
 * Shortlinks obrigatórios + anti-duplicação:
 * produto já postado (mesmo item_id) não é regravado no sync.
 */

const {
  generateBatchShortLink,
  resolveProductOriginUrl,
} = require("./shopee");
const {
  upsertOfertas,
  updateShortLink,
  getOffersByItemIds,
} = require("./supabase");
const { buildProductSubIds } = require("./tracking");

function prepareOfferRows(rows = []) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.item_id || !row.offer_link) continue;
    const id = String(row.item_id);
    if (byId.has(id)) continue; // dedupe no próprio lote
    const copy = { ...row };
    if (!copy.product_link) {
      copy.product_link = resolveProductOriginUrl(copy) || null;
    }
    if (!Array.isArray(copy.sub_ids) || copy.sub_ids.length < 5) {
      copy.sub_ids = buildProductSubIds(copy.category, copy.item_id, copy.subcategory);
    }
    byId.set(id, copy);
  }
  return [...byId.values()];
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
 * Upsert + shortlinks.
 * skipExisting=true (padrão): não regrava item_id já publicado — evita duplicar na vitrine.
 * Ainda gera shortlink para existentes que estejam sem shope.ee.
 */
async function saveOffersWithShortlinks(
  rows = [],
  { withShortlinks = true, skipExisting = true, gapMs = 200 } = {}
) {
  const prepared = prepareOfferRows(rows);
  if (!prepared.length) {
    return {
      saved: 0,
      skippedExisting: 0,
      rows: [],
      shortlinks: { generated: 0, failed: 0, skipped: 0 },
    };
  }

  let toInsert = prepared;
  let skippedExisting = 0;
  let existingMissingShortlink = [];

  if (skipExisting) {
    const existingRows = await getOffersByItemIds(
      prepared.map((r) => r.item_id),
      { full: false }
    );
    const existing = new Map(
      (Array.isArray(existingRows) ? existingRows : []).map((r) => [String(r.item_id), r])
    );
    toInsert = [];
    for (const row of prepared) {
      const prev = existing.get(String(row.item_id));
      if (prev) {
        skippedExisting += 1;
        if (!prev.short_link) {
          existingMissingShortlink.push({
            ...row,
            short_link: null,
            // preserva dados de tracking já no banco quando possível
            category: prev.category || row.category,
          });
        }
      } else {
        toInsert.push(row);
      }
    }
  }

  let saved = 0;
  if (toInsert.length) {
    const result = await upsertOfertas(toInsert);
    saved = Array.isArray(result) ? result.length : toInsert.length;
  }

  let shortlinks = { generated: 0, failed: 0, skipped: 0 };
  if (withShortlinks) {
    const forLinks = [...toInsert, ...existingMissingShortlink];
    if (forLinks.length) {
      shortlinks = await generateShortlinksForRows(forLinks, { gapMs });
    }
  }

  return {
    saved,
    skippedExisting,
    rows: toInsert,
    shortlinks,
  };
}

module.exports = {
  prepareOfferRows,
  generateShortlinksForRows,
  saveOffersWithShortlinks,
};
