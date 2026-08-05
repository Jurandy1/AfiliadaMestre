"use strict";

/**
 * Shortlinks obrigatórios + anti-duplicação:
 * produto já postado (mesmo item_id) não é regravado no sync.
 *
 * NOTA: a geração de link+sub_ids foi centralizada em server/linking.js (Invariante A).
 * Este arquivo é apenas o adaptador para o fluxo "salvar novo produto" (skip existing).
 */

const {
  resolveProductOriginUrl,
} = require("./shopee");
const {
  upsertOfertas,
  updateShortLink,
  getOffersByItemIds,
  supabaseRequest,
} = require("./supabase");
const { buildProductSubIds, SITE_SUBID } = require("./tracking");
const { ensureLinkedRows } = require("./linking");

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
    if (copy.sub_ids[0] !== SITE_SUBID) {
      copy.sub_ids = [SITE_SUBID, ...copy.sub_ids].slice(0, 5);
    }
    byId.set(id, copy);
  }
  return [...byId.values()];
}

/**
 * Gera shortlinks shope.ee + persiste em cada row. Delega em ensureLinkedRows (Invariante A).
 */
async function generateShortlinksForRows(rows = [], { gapMs = 400 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { generated: 0, failed: 0, skipped: 0 };

  const result = await ensureLinkedRows(list, { regenerate: false, gapMs });

  // Persiste short_link em cada row que foi resolvido.
  let generated = 0;
  let failed = 0;
  for (const row of result.rows) {
    if (row.short_link && row.item_id) {
      try {
        await updateShortLink(row.item_id, row.short_link);
        // Limpa flag pending se existia
        if (row.short_link_pending === false) {
          await supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(row.item_id)}`, {
            method: "PATCH",
            body: { short_link_pending: false },
            prefer: "return=minimal",
            useService: true,
          }).catch(() => {});
        }
        generated += 1;
      } catch (_) {
        failed += 1;
      }
    }
  }

  return {
    generated,
    failed: failed + result.failed,
    skipped: result.skipped,
    pending: result.pending,
    rateLimited: result.rateLimited || false,
  };
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
            category: prev.category || row.category,
          });
        }
      } else {
        toInsert.push(row);
      }
    }
  }

  // Invariante A — antes de gravar novos, garante short_link. Pending vira flag no row.
  let shortlinks = { generated: 0, failed: 0, skipped: 0, pending: 0 };
  if (withShortlinks && toInsert.length) {
    const result = await ensureLinkedRows(toInsert, { regenerate: false, gapMs });
    shortlinks.generated += result.generated;
    shortlinks.failed += result.failed;
    shortlinks.skipped += result.skipped;
    shortlinks.pending += result.pending;
    if (result.rateLimited) shortlinks.rateLimited = true;
  }

  let saved = 0;
  if (toInsert.length) {
    const result = await upsertOfertas(toInsert);
    saved = Array.isArray(result) ? result.length : toInsert.length;
  }

  // Backfill de shortlink para existentes que estavam sem
  if (withShortlinks && existingMissingShortlink.length) {
    const extra = await generateShortlinksForRows(existingMissingShortlink, { gapMs });
    shortlinks.generated += extra.generated;
    shortlinks.failed += extra.failed;
    shortlinks.skipped += extra.skipped;
    if (extra.rateLimited) shortlinks.rateLimited = true;
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
