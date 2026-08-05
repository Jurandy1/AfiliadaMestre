"use strict";

/**
 * Qualidade do catálogo: purge de fracos + refresh dos top moneyScore.
 */

const { supabaseRequest, deleteOfertasByIds, getOffersByItemIds, upsertOfertas } = require("./supabase");
const {
  parseSalesCount,
  parseCommissionPct,
  computeMoneyScore,
  fetchProductDetailsByIds,
  mapOfferToRow,
  isQualityOffer,
  MIN_RATING,
  MIN_SALES,
} = require("./shopee");

const DEFAULT_MIN_COMMISSION_PCT = Number(process.env.SYNC_MIN_COMMISSION_PCT) || 5;

function isWeakRow(row, {
  minRating = MIN_RATING,
  minSales = MIN_SALES,
  requireCommission = true,
} = {}) {
  if (!row?.item_id) return true;
  const rating = Number(row.rating_star);
  if (Number.isFinite(rating) && rating > 0 && rating < minRating) return true;
  if (parseSalesCount(row.sales) < minSales) return true;
  if (requireCommission) {
    const pct = parseCommissionPct(row.commission_rate);
    if (!(pct > 0)) return true;
  }
  return false;
}

async function listAllOffersLite({ max = 5000 } = {}) {
  const pageSize = 200;
  const all = [];
  let offset = 0;
  const cap = Math.min(Math.max(Number(max) || 5000, 100), 10000);

  while (all.length < cap) {
    const limit = Math.min(pageSize, cap - all.length);
    const rows = await supabaseRequest(
      `/ofertas?select=item_id,product_name,shop_name,sales,rating_star,commission_rate,updated_at,category&order=updated_at.desc&limit=${limit}&offset=${offset}`,
      { method: "GET", useService: true }
    );
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    offset += rows.length;
    if (rows.length < limit) break;
  }
  return all;
}

async function scanWeakOffers({ max = 5000, minRating = MIN_RATING, minSales = MIN_SALES } = {}) {
  const rows = await listAllOffersLite({ max });
  const weak = rows.filter((r) => isWeakRow(r, { minRating, minSales, requireCommission: true }));
  return {
    scanned: rows.length,
    weakCount: weak.length,
    minRating,
    minSales,
    samples: weak.slice(0, 40).map((r) => ({
      itemId: r.item_id,
      title: r.product_name || "",
      shopName: r.shop_name || "",
      sales: r.sales || "",
      rating: r.rating_star,
      commission: r.commission_rate,
      category: r.category || "",
    })),
  };
}

async function purgeWeakOffers({
  max = 5000,
  dryRun = false,
  minRating = MIN_RATING,
  minSales = MIN_SALES,
} = {}) {
  const rows = await listAllOffersLite({ max });
  const weak = rows.filter((r) => isWeakRow(r, { minRating, minSales, requireCommission: true }));
  const ids = weak.map((r) => Number(r.item_id)).filter((n) => Number.isSafeInteger(n) && n > 0);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned: rows.length,
      toRemove: ids.length,
      samples: weak.slice(0, 30).map((r) => ({
        itemId: r.item_id,
        title: r.product_name || "",
        sales: r.sales || "",
        rating: r.rating_star,
      })),
    };
  }

  let removed = 0;
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    removed += Number(await deleteOfertasByIds(chunk)) || chunk.length;
  }

  return {
    ok: true,
    dryRun: false,
    scanned: rows.length,
    removed,
    kept: rows.length - removed,
  };
}

/** Lista top item_ids por moneyScore + boost de conversão real do meu site. */
async function listTopMoneyItemIds({ limit = 40 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 40, 10), 80);

  // 1. Boost: item_ids que JÁ CONVERTERAM no meu site (últimos 30d) vêm na frente.
  //    Sem esperar heurística — refresha o que está fazendo dinheiro.
  let convertedIds = [];
  try {
    const { topSignalsFromMySite } = require("./conversions");
    const signals = await topSignalsFromMySite({ days: 30, limit: Math.floor(cap / 2) });
    convertedIds = Array.isArray(signals?.topItemIds) ? signals.topItemIds : [];
  } catch (_) {
    // Tabela conversions ainda não existe → segue sem boost.
  }

  // 2. Score sintético sobre o catálogo (fallback / complemento).
  const rows = await supabaseRequest(
    `/ofertas?select=item_id,sales,rating_star,commission_rate&order=commission_rate.desc.nullslast&limit=${Math.min(cap * 4, 200)}`,
    { method: "GET", useService: true }
  );
  const scored = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      itemId: Number(r.item_id),
      score: computeMoneyScore({
        commissionRate: r.commission_rate,
        sales: r.sales,
        ratingStar: r.rating_star,
      }),
    }))
    .filter((x) => Number.isSafeInteger(x.itemId) && x.itemId > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const out = [];
  // 3. Convertidos primeiro
  for (const id of convertedIds) {
    if (Number.isSafeInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      if (out.length >= cap) return out;
    }
  }
  // 4. Depois moneyScore alto
  for (const x of scored) {
    if (seen.has(x.itemId)) continue;
    seen.add(x.itemId);
    out.push(x.itemId);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Reconsulta top ofertas na Shopee e faz upsert forçado (atualiza comissão/preço).
 * Remove os que caíram abaixo do filtro de qualidade.
 */
async function refreshTopOffers({
  limit = 40,
  minRating = MIN_RATING,
  minSales = MIN_SALES,
  minCommissionPct = DEFAULT_MIN_COMMISSION_PCT,
} = {}) {
  const ids = await listTopMoneyItemIds({ limit });
  if (!ids.length) {
    return { ok: true, requested: 0, updated: 0, purged: 0, ids: [] };
  }

  const existing = await getOffersByItemIds(ids, { full: true });
  const byId = new Map((existing || []).map((r) => [Number(r.item_id), r]));

  const details = await fetchProductDetailsByIds(ids);
  const nodes = Array.isArray(details) ? details : [];
  const toUpsert = [];
  const toPurge = [];

  for (const n of nodes) {
    const itemId = Number(n.itemId);
    const prev = byId.get(itemId);
    if (!isQualityOffer(n, { minRating, minSales, requireCommission: true, minCommissionPct })) {
      toPurge.push(itemId);
      continue;
    }
    const row = mapOfferToRow(n, prev?.keyword || "", prev?.list_type ?? null, {
      forceCategory: prev?.category && prev.category !== "todos" ? prev.category : null,
      forceSubcategory: prev?.subcategory || null,
    });
    if (prev?.sub_ids?.length) row.sub_ids = prev.sub_ids;
    if (prev?.short_link) row.short_link = prev.short_link;
    if (row.item_id && row.offer_link) toUpsert.push(row);
  }

  // Itens pedidos que a API não devolveu → candidatos a purge
  const found = new Set(nodes.map((n) => Number(n.itemId)));
  for (const id of ids) {
    if (!found.has(id)) toPurge.push(id);
  }

  let updated = 0;
  let linkStats = { generated: 0, pending: 0, skipped: 0 };
  if (toUpsert.length) {
    // Invariante A: garante SITE_SUBID + short_link antes do upsert (mesmo em refresh).
    const { ensureLinkedRows } = require("./linking");
    const linkResult = await ensureLinkedRows(toUpsert, { regenerate: false });
    linkStats = {
      generated: linkResult.generated,
      pending: linkResult.pending,
      skipped: linkResult.skipped,
    };
    const saved = await upsertOfertas(linkResult.rows);
    updated = Array.isArray(saved) ? saved.length : toUpsert.length;
  }

  let purged = 0;
  const uniquePurge = [...new Set(toPurge.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (uniquePurge.length) {
    purged = Number(await deleteOfertasByIds(uniquePurge)) || uniquePurge.length;
  }

  return {
    ok: true,
    requested: ids.length,
    updated,
    purged,
    ids,
    minCommissionPct,
    shortlinks: linkStats,
  };
}

module.exports = {
  isWeakRow,
  scanWeakOffers,
  purgeWeakOffers,
  listTopMoneyItemIds,
  refreshTopOffers,
  DEFAULT_MIN_COMMISSION_PCT,
};
