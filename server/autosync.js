"use strict";

// Alimentação automática — fila de cobertura 95% feminino / 5% geral.
// Prioriza buracos em moda/beleza e listType comissão + top performance.
// Todo produto salvo sai com shortlink shope.ee + Sub IDs.

const {
  fetchProductOffers,
  mapOfferToRow,
  SYNC_ROTATION,
  MIN_RATING,
  MIN_SALES,
} = require("./shopee");
const {
  pruneOlderThan,
  listOffersMissingShortlink,
} = require("./supabase");
const { saveOffersWithShortlinks, generateShortlinksForRows } = require("./shortlinks");
const { buildCoverageQueue, DEFAULT_FEMALE_PERCENT } = require("./coverage");

const FEMALE_PERCENT = clampNum(process.env.AUTO_SYNC_FEMALE_PERCENT, DEFAULT_FEMALE_PERCENT, 80, 99);

const config = {
  enabled: /^(1|true|on|yes)$/i.test(String(process.env.AUTO_SYNC ?? "0")),
  intervalMin: clampNum(process.env.AUTO_SYNC_INTERVAL_MIN, 90, 15, 1440),
  batch: clampNum(process.env.AUTO_SYNC_BATCH, 5, 1, 20),
  limit: clampNum(process.env.AUTO_SYNC_LIMIT, 20, 5, 50),
  pruneDays: clampNum(process.env.AUTO_PRUNE_DAYS, 60, 0, 365),
  requestGapMs: clampNum(process.env.AUTO_SYNC_GAP_MS, 400, 100, 5000),
  // Extra: limpa residual sem shortlink além dos salvos nesta rodada
  shortlinkBackfillPerRun: clampNum(process.env.AUTO_SYNC_SHORTLINKS, 50, 0, 200),
  femalePercent: FEMALE_PERCENT,
};

const state = {
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastPruneAt: null,
  cursor: 0,
  rotationCursor: 0,
  queue: [],
  queueBuiltAt: 0,
  runs: 0,
  totalUpserts: 0,
  lastResult: null,
  lastError: null,
};

let timer = null;

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function credsReady() {
  const shopee = !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);
  const supa = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY));
  return shopee && supa;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextMode() {
  const mode = SYNC_ROTATION[state.rotationCursor % SYNC_ROTATION.length];
  state.rotationCursor = (state.rotationCursor + 1) % SYNC_ROTATION.length;
  return mode;
}

async function ensureQueue(force = false) {
  const stale = Date.now() - state.queueBuiltAt > 30 * 60 * 1000;
  if (!force && state.queue.length && !stale && state.cursor < state.queue.length) {
    return state.queue;
  }
  const { queue } = await buildCoverageQueue({ femalePercent: config.femalePercent });
  state.queue = queue;
  state.queueBuiltAt = Date.now();
  state.cursor = 0;
  return state.queue;
}

async function runOnce({ manual = false, forceMode = null } = {}) {
  if (state.running) return { skipped: "already-running" };
  if (!credsReady()) {
    state.lastError = "Credenciais Shopee/Supabase ausentes";
    return { skipped: "no-creds" };
  }

  state.running = true;
  const startedAt = new Date();
  const processed = [];
  let upserts = 0;
    let shortlinksGenerated = 0;
  let shortlinksFailed = 0;
  let skippedExistingTotal = 0;
  const mode = forceMode || nextMode();

  try {
    const queue = await ensureQueue(manual);
    if (!queue.length) {
      state.lastError = null;
      state.lastResult = { ok: true, processed: [], upserts: 0, note: "fila vazia" };
      return state.lastResult;
    }

    for (let i = 0; i < config.batch; i++) {
      if (!queue.length) break;
      const idx = state.cursor % queue.length;
      const job = queue[idx];
      state.cursor = (state.cursor + 1) % Math.max(1, queue.length);
      const { keyword, category, subcategory } = job;
      try {
        const offer = await fetchProductOffers({
          keyword,
          limit: config.limit,
          page: 1,
          listType: mode.listType,
          sortType: mode.sortType,
          minRating: MIN_RATING,
          minSales: MIN_SALES,
          requireCommission: true,
        });
        const nodes = offer.nodes || [];
        const rows = nodes
          .map((n) =>
            mapOfferToRow(n, keyword, mode.listType, {
              forceCategory: category || null,
              forceSubcategory: subcategory || null,
            })
          )
          .filter((r) => r.item_id && r.offer_link);

        let saved = 0;
        let skipped = 0;
        let sl = { generated: 0, failed: 0 };
        if (rows.length) {
          const out = await saveOffersWithShortlinks(rows, { gapMs: 150 });
          saved = out.saved;
          skipped = out.skippedExisting || 0;
          sl = out.shortlinks || sl;
          upserts += saved;
          state.totalUpserts += saved;
          skippedExistingTotal += skipped;
          shortlinksGenerated += sl.generated || 0;
          shortlinksFailed += sl.failed || 0;
        }
        processed.push({
          keyword,
          category,
          subcategory,
          audience: job.audience,
          ok: true,
          count: saved,
          skippedExisting: skipped,
          shortlinks: sl.generated || 0,
          mode: mode.label,
          listType: mode.listType,
          sortType: mode.sortType,
        });
      } catch (e) {
        processed.push({
          keyword,
          category,
          subcategory,
          ok: false,
          error: e.message,
          mode: mode.label,
        });
        state.lastError = e.message;
      }
      if (i < config.batch - 1) await sleep(config.requestGapMs);
    }

    // Residual: qualquer oferta antiga ainda sem shortlink
    if (config.shortlinkBackfillPerRun > 0) {
      try {
        const missing = await listOffersMissingShortlink({ limit: config.shortlinkBackfillPerRun });
        if (Array.isArray(missing) && missing.length) {
          const extra = await generateShortlinksForRows(missing, { gapMs: 100 });
          shortlinksGenerated += extra.generated || 0;
          shortlinksFailed += extra.failed || 0;
          if (extra.generated) {
            console.log(`[autosync] shortlinks residual: ${extra.generated}`);
          }
        }
      } catch (e) {
        console.warn("[autosync] backfill shortlink falhou:", e.message);
      }
    }

    if (config.pruneDays > 0) {
      try {
        const removed = await pruneOlderThan(config.pruneDays);
        state.lastPruneAt = new Date().toISOString();
        if (removed) console.log(`[autosync] prune: ${removed} ofertas antigas`);
      } catch (e) {
        console.warn("[autosync] prune falhou:", e.message);
      }
    }

    state.runs += 1;
    state.lastRunAt = startedAt.toISOString();
    state.lastError = null;
    state.lastResult = {
      ok: true,
      manual,
      mode: mode.label,
      listType: mode.listType,
      sortType: mode.sortType,
      femalePercentTarget: config.femalePercent,
      feedMode: "coverage-95-5",
      processed,
      upserts,
      shortlinksGenerated,
      shortlinksFailed,
      skippedExisting: skippedExistingTotal,
      queueSize: queue.length,
      cursor: state.cursor,
      durationMs: Date.now() - startedAt.getTime(),
    };
    console.log(
      `[autosync] ${mode.label} upserts=${upserts} shortlinks=${shortlinksGenerated} batch=${processed.length} female%=${config.femalePercent}`
    );
    return state.lastResult;
  } catch (err) {
    state.lastError = err.message;
    throw err;
  } finally {
    state.running = false;
    scheduleNext();
  }
}

async function runTopPerformance() {
  return runOnce({
    manual: true,
    forceMode: SYNC_ROTATION.find((m) => m.listType === 2) || SYNC_ROTATION[0],
  });
}

function getStatus() {
  return {
    enabled: config.enabled,
    running: state.running,
    intervalMin: config.intervalMin,
    batch: config.batch,
    limit: config.limit,
    pruneDays: config.pruneDays,
    shortlinkBackfillPerRun: config.shortlinkBackfillPerRun,
    femalePercentTarget: config.femalePercent,
    feedMode: "coverage-95-5",
    homePolicy: "100% feminino",
    queueSize: state.queue.length,
    cursor: state.cursor,
    runs: state.runs,
    totalUpserts: state.totalUpserts,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastPruneAt: state.lastPruneAt,
    lastError: state.lastError,
    lastResult: state.lastResult,
    modes: SYNC_ROTATION,
  };
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!config.enabled) {
    state.nextRunAt = null;
    return;
  }
  const ms = config.intervalMin * 60 * 1000;
  state.nextRunAt = new Date(Date.now() + ms).toISOString();
  timer = setTimeout(() => {
    runOnce().catch((e) => {
      console.error("[autosync] erro:", e.message);
      state.lastError = e.message;
    });
  }, ms);
  if (typeof timer.unref === "function") timer.unref();
}

function start() {
  if (!config.enabled) {
    console.log("[autosync] pausado (AUTO_SYNC=0)");
    return;
  }
  if (!credsReady()) {
    console.warn("[autosync] credenciais ausentes — scheduler não iniciado");
    return;
  }
  console.log(
    `[autosync] ativo · a cada ${config.intervalMin}min · lote ${config.batch} · female ${config.femalePercent}% · shortlinks on-save`
  );
  scheduleNext();
}

module.exports = {
  config,
  start,
  runOnce,
  runTopPerformance,
  getStatus,
  ensureQueue,
};
