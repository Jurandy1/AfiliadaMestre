"use strict";

/**
 * Orquestra sync do item feed Shopee:
 *   - runFullFeedSync(): 1x/dia — pega o FULL mais recente, varre todas as páginas.
 *   - runDeltaFeedSync(): 1x/h — pega o DELTA mais recente, aplica NEW/UPDATE/DELETE.
 *
 * DELETE nunca apaga a row (preserva sub_ids/short_link/histórico de conversão).
 * Marca hidden=true.
 */

const {
  listItemFeeds,
  getItemFeedData,
  columnsJsonToRow,
  pickLatestFeed,
  sleep,
} = require("./feed");
const {
  upsertOfertas,
  supabaseRequest,
} = require("./supabase");
const { isQualityOffer } = require("./shopee");
const { ensureLinkedRows } = require("./linking");

const PAGE_LIMIT = 500;      // limite oficial
const CHUNK_UPSERT = 100;    // chunks pra upsert (evita payload gigante)
const GAP_MS = 400;

async function wasProcessed(datafeedId) {
  try {
    const rows = await supabaseRequest(
      `/feed_syncs?select=datafeed_id&datafeed_id=eq.${encodeURIComponent(datafeedId)}&limit=1`,
      { method: "GET", useService: true }
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function markProcessed({ datafeedId, referenceId, feedMode, feedDate, totalCount, processedRows, durationMs, notes = null }) {
  try {
    return await supabaseRequest("/feed_syncs", {
      method: "POST",
      body: [{
        datafeed_id: datafeedId,
        reference_id: referenceId || null,
        feed_mode: feedMode,
        feed_date: feedDate,
        total_count: totalCount || 0,
        processed_rows: processedRows || 0,
        processed_at: new Date().toISOString(),
        duration_ms: durationMs || 0,
        notes: notes || null,
      }],
      prefer: "resolution=merge-duplicates,return=minimal",
      useService: true,
    });
  } catch (err) {
    console.warn("[feedSync.markProcessed] falhou:", err.message);
    return null;
  }
}

async function markHiddenByIds(itemIds = []) {
  const ids = [...new Set(itemIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!ids.length) return 0;
  const CHUNK = 100;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const filter = encodeURIComponent(`(${slice.join(",")})`);
    try {
      await supabaseRequest(`/ofertas?item_id=in.${filter}`, {
        method: "PATCH",
        body: { hidden: true, updated_at: new Date().toISOString() },
        prefer: "return=minimal",
        useService: true,
      });
      updated += slice.length;
    } catch (err) {
      console.warn("[markHiddenByIds] chunk falhou:", err.message);
    }
  }
  return updated;
}

/**
 * Processa 1 página de rows do feed: filtra qualidade, garante link+sub_ids, upsert.
 * Retorna contadores pro caller.
 */
async function processPage(rows, { feedMode, timeBudgetMs, started }) {
  const list = Array.isArray(rows) ? rows : [];
  const toDelete = [];
  const converted = [];
  for (const r of list) {
    if (!r?.columns) continue;
    const row = columnsJsonToRow(r.columns, r.updateType || (feedMode === "DELTA" ? "NEW" : "NEW"));
    if (!row) continue;
    if (row._feedUpdateType === "DELETE") {
      toDelete.push(row.item_id);
      continue;
    }
    // Simula "node" do productOfferV2 pra reusar isQualityOffer
    const asNode = {
      itemId: row.item_id,
      offerLink: row.offer_link,
      ratingStar: row.rating_star,
      sales: row.sales,
      commissionRate: row.commission_rate,
      commission: row.commission,
    };
    if (!isQualityOffer(asNode, { minRating: 4.3, minSales: 50, requireCommission: false, minCommissionPct: 0 })) {
      continue;
    }
    converted.push(row);
  }

  const stats = { seen: list.length, deleted: 0, quality: converted.length, saved: 0, linked: 0, pending: 0 };

  // 1. Deletes (marca hidden)
  if (toDelete.length) {
    stats.deleted = await markHiddenByIds(toDelete);
  }

  // 2. Ensure link+sub_ids em batches de 100 (ensureLinkedRows internamente faz 50)
  for (let i = 0; i < converted.length; i += CHUNK_UPSERT) {
    if (Date.now() - started > timeBudgetMs) {
      return { ...stats, timedOut: true };
    }
    const chunk = converted.slice(i, i + CHUNK_UPSERT);
    try {
      const linkResult = await ensureLinkedRows(chunk, { regenerate: false, gapMs: GAP_MS });
      stats.linked += linkResult.generated;
      stats.pending += linkResult.pending;
      // Remove o campo interno antes de gravar
      const forSave = linkResult.rows.map(({ _feedUpdateType, ...rest }) => rest);
      const saved = await upsertOfertas(forSave);
      stats.saved += Array.isArray(saved) ? saved.length : forSave.length;
      if (linkResult.rateLimited) {
        return { ...stats, rateLimited: true };
      }
    } catch (err) {
      console.warn("[feedSync.processPage] chunk falhou:", err.message);
      if (err && err.rateLimited) return { ...stats, rateLimited: true };
    }
    await sleep(GAP_MS);
  }

  return stats;
}

async function runFeedSync({
  feedMode = "FULL",
  maxPages = 200,
  timeBudgetMs = 55_000,
  forceReprocess = false,
} = {}) {
  const started = Date.now();
  const feeds = await listItemFeeds(feedMode);
  const feed = pickLatestFeed(feeds, feedMode);
  if (!feed) {
    return { ok: true, feedMode, note: "Nenhum feed disponível" };
  }
  if (!forceReprocess && await wasProcessed(feed.datafeedId)) {
    return { ok: true, feedMode, skipped: true, note: "Feed já processado", feed };
  }

  let offset = 0;
  let pages = 0;
  const acc = { seen: 0, deleted: 0, quality: 0, saved: 0, linked: 0, pending: 0 };
  let rateLimited = false;
  let timedOut = false;

  while (pages < maxPages) {
    if (Date.now() - started > timeBudgetMs) { timedOut = true; break; }
    let page;
    try {
      page = await getItemFeedData({ datafeedId: feed.datafeedId, offset, limit: PAGE_LIMIT });
    } catch (err) {
      if (err && err.rateLimited) { rateLimited = true; break; }
      console.warn("[feedSync] page fetch falhou:", err.message);
      break;
    }
    const rows = Array.isArray(page.rows) ? page.rows : [];
    if (!rows.length) break;

    const stats = await processPage(rows, { feedMode, timeBudgetMs, started });
    acc.seen += stats.seen;
    acc.deleted += stats.deleted;
    acc.quality += stats.quality;
    acc.saved += stats.saved;
    acc.linked += stats.linked;
    acc.pending += stats.pending;
    if (stats.rateLimited) { rateLimited = true; break; }
    if (stats.timedOut) { timedOut = true; break; }

    pages += 1;
    offset += rows.length;
    if (!page.pageInfo?.hasMore) break;
  }

  const durationMs = Date.now() - started;

  // Só marca como processado se completou (ou pelo menos varreu 1 pág e não deu rate-limit)
  if (!rateLimited && pages > 0 && !timedOut) {
    await markProcessed({
      datafeedId: feed.datafeedId,
      referenceId: feed.referenceId,
      feedMode: feed.feedMode || feedMode,
      feedDate: feed.date,
      totalCount: feed.totalCount,
      processedRows: acc.saved + acc.deleted,
      durationMs,
      notes: `pages=${pages} offset=${offset}`,
    });
  }

  return {
    ok: true,
    feedMode,
    feed,
    pages,
    ...acc,
    ms: durationMs,
    rateLimited,
    timedOut,
    completed: !rateLimited && !timedOut,
  };
}

async function runFullFeedSync(opts = {}) {
  return runFeedSync({ ...opts, feedMode: "FULL" });
}
async function runDeltaFeedSync(opts = {}) {
  return runFeedSync({ ...opts, feedMode: "DELTA" });
}

module.exports = {
  runFullFeedSync,
  runDeltaFeedSync,
  runFeedSync,
};
