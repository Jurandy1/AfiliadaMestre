"use strict";

// Alimentação automática — fila de cobertura 95% feminino / 5% geral.
// Alterna coverage ↔ refresh-top; bias listType 1; minCommissionPct.

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
const { refreshTopOffers, DEFAULT_MIN_COMMISSION_PCT } = require("./quality");

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

const FEMALE_PERCENT = clampNum(process.env.AUTO_SYNC_FEMALE_PERCENT, DEFAULT_FEMALE_PERCENT, 80, 99);
const MIN_COMMISSION_PCT = clampNum(
  process.env.SYNC_MIN_COMMISSION_PCT,
  DEFAULT_MIN_COMMISSION_PCT,
  0,
  50
);

/** Bias: mais ciclos de maior comissão (listType 1). */
const BIASED_ROTATION = [
  SYNC_ROTATION.find((m) => m.listType === 1) || SYNC_ROTATION[0],
  SYNC_ROTATION.find((m) => m.listType === 1) || SYNC_ROTATION[0],
  SYNC_ROTATION.find((m) => m.listType === 2) || SYNC_ROTATION[1],
  SYNC_ROTATION.find((m) => m.listType === 1) || SYNC_ROTATION[0],
  SYNC_ROTATION.find((m) => m.listType === 0) || SYNC_ROTATION[2],
].filter(Boolean);

const config = {
  enabled: /^(1|true|on|yes)$/i.test(String(process.env.AUTO_SYNC ?? "0")),
  intervalMin: clampNum(process.env.AUTO_SYNC_INTERVAL_MIN, 90, 15, 1440),
  batch: clampNum(process.env.AUTO_SYNC_BATCH, 5, 1, 20),
  limit: clampNum(process.env.AUTO_SYNC_LIMIT, 20, 5, 50),
  pruneDays: clampNum(process.env.AUTO_PRUNE_DAYS, 60, 0, 365),
  requestGapMs: clampNum(process.env.AUTO_SYNC_GAP_MS, 400, 100, 5000),
  shortlinkBackfillPerRun: clampNum(process.env.AUTO_SYNC_SHORTLINKS, 50, 0, 200),
  refreshTopPerRun: clampNum(process.env.AUTO_SYNC_REFRESH_TOP, 40, 0, 80),
  femalePercent: FEMALE_PERCENT,
  minCommissionPct: MIN_COMMISSION_PCT,
};

const state = {
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastPruneAt: null,
  cursor: 0,
  rotationCursor: 0,
  queue: [],
  priorityQueue: [],
  queueBuiltAt: 0,
  runs: 0,
  totalUpserts: 0,
  lastResult: null,
  lastError: null,
  lastPhase: null,
};

let timer = null;

function credsReady() {
  const shopee = !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);
  const supa = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY));
  return shopee && supa;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextMode() {
  const modes = BIASED_ROTATION.length ? BIASED_ROTATION : SYNC_ROTATION;
  const mode = modes[state.rotationCursor % modes.length];
  state.rotationCursor = (state.rotationCursor + 1) % modes.length;
  return mode;
}

function prioritizeJobs(jobs = []) {
  const cleaned = (Array.isArray(jobs) ? jobs : [])
    .map((j) => ({
      keyword: String(j.keyword || "").trim(),
      category: j.category || null,
      subcategory: j.subcategory || null,
      audience: j.audience || "feminino",
      source: j.source || "conversion",
      gap: Number(j.gap) || 0,
    }))
    .filter((j) => j.keyword);
  if (!cleaned.length) return { added: 0, queueSize: state.priorityQueue.length };
  const seen = new Set(state.priorityQueue.map((j) => `${j.category}:${j.subcategory}:${j.keyword}`));
  let added = 0;
  for (const j of cleaned) {
    const key = `${j.category}:${j.subcategory}:${j.keyword}`;
    if (seen.has(key)) continue;
    seen.add(key);
    state.priorityQueue.push(j);
    added += 1;
  }
  if (state.priorityQueue.length > 40) {
    state.priorityQueue = state.priorityQueue.slice(-40);
  }
  return { added, queueSize: state.priorityQueue.length };
}

async function ensureQueue(force = false) {
  const stale = Date.now() - state.queueBuiltAt > 30 * 60 * 1000;
  if (!force && state.queue.length && !stale && state.cursor < state.queue.length) {
    return state.queue;
  }
  const { queue } = await buildCoverageQueue({ femalePercent: config.femalePercent });
  state.queue = [...state.priorityQueue, ...queue];
  state.priorityQueue = [];
  state.queueBuiltAt = Date.now();
  state.cursor = 0;
  return state.queue;
}

async function runRefreshTopPhase() {
  if (!config.refreshTopPerRun) return null;
  try {
    const result = await refreshTopOffers({
      limit: config.refreshTopPerRun,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
      minCommissionPct: config.minCommissionPct,
    });
    console.log(
      `[autosync] refresh-top updated=${result.updated} purged=${result.purged} requested=${result.requested}`
    );
    return result;
  } catch (e) {
    console.warn("[autosync] refresh-top falhou:", e.message);
    return { ok: false, error: e.message };
  }
}

async function runOnce({ manual = false, forceMode = null, forcePhase = null } = {}) {
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
  let refreshTop = null;

  const phase =
    forcePhase
    || (state.runs % 2 === 1 && config.refreshTopPerRun > 0 ? "refresh-top" : "coverage");
  state.lastPhase = phase;

  try {
    if (phase === "refresh-top") {
      refreshTop = await runRefreshTopPhase();
      state.runs += 1;
      state.lastRunAt = startedAt.toISOString();
      state.lastError = null;
      state.lastResult = {
        ok: true,
        manual,
        phase: "refresh-top",
        refreshTop,
        durationMs: Date.now() - startedAt.getTime(),
      };
      return state.lastResult;
    }

    const mode = forceMode || nextMode();
    const queue = await ensureQueue(manual);
    if (!queue.length) {
      refreshTop = await runRefreshTopPhase();
      state.lastError = null;
      state.lastResult = {
        ok: true,
        processed: [],
        upserts: 0,
        note: "fila vazia",
        refreshTop,
        phase: "coverage",
      };
      return state.lastResult;
    }

    for (let i = 0; i < config.batch; i++) {
      if (!queue.length) break;
      const idx = state.cursor % queue.length;
      const job = queue[idx];
      state.cursor = (state.cursor + 1) % Math.max(1, queue.length);
      const { keyword, category, subcategory } = job;
      const gapPages = Number(job.gap) >= 20 ? 2 : 1;
      try {
        let pageNodes = [];
        for (let page = 1; page <= gapPages; page += 1) {
          const offer = await fetchProductOffers({
            keyword,
            limit: config.limit,
            page,
            listType: mode.listType,
            sortType: mode.sortType,
            minRating: MIN_RATING,
            minSales: MIN_SALES,
            requireCommission: true,
            minCommissionPct: mode.listType === 1 ? config.minCommissionPct : 0,
          });
          pageNodes = pageNodes.concat(offer.nodes || []);
          if (!offer.hasNextPage) break;
          if (page < gapPages) await sleep(config.requestGapMs);
        }
        const rows = pageNodes
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
          pages: gapPages,
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

    if (config.shortlinkBackfillPerRun > 0) {
      try {
        const missing = await listOffersMissingShortlink({ limit: config.shortlinkBackfillPerRun });
        if (Array.isArray(missing) && missing.length) {
          const extra = await generateShortlinksForRows(missing, { gapMs: 100 });
          shortlinksGenerated += extra.generated || 0;
          shortlinksFailed += extra.failed || 0;
        }
      } catch (e) {
        console.warn("[autosync] backfill shortlink falhou:", e.message);
      }
    }

    // Invariante B — heartbeat: reverifica sales/rating de ~20 items por ciclo.
    try {
      const { refreshStaleMetrics } = require("./metricsRefresh");
      const metrics = await refreshStaleMetrics({ batch: 20, staleHours: 12 });
      if (metrics.refreshed) {
        console.log(`[autosync] metrics-refresh refreshed=${metrics.refreshed} hidden=${metrics.hidden}`);
      }
    } catch (e) {
      // Coluna sales_verified_at pode não existir ainda — não bloqueia o loop.
      console.warn("[autosync] metrics-refresh falhou:", e.message);
    }

    // Invariante A — retenta shortlinks pending do ciclo anterior
    try {
      const { retryPendingShortlinks } = require("./linking");
      const retry = await retryPendingShortlinks({ limit: 30 });
      if (retry.generated) {
        console.log(`[autosync] retry-pending generated=${retry.generated} pending=${retry.pending}`);
      }
    } catch (e) {
      console.warn("[autosync] retry-pending falhou:", e.message);
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
      phase: "coverage",
      mode: mode.label,
      listType: mode.listType,
      sortType: mode.sortType,
      minCommissionPct: config.minCommissionPct,
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
      `[autosync] ${mode.label} upserts=${upserts} shortlinks=${shortlinksGenerated} batch=${processed.length}`
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
    forcePhase: "coverage",
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
    refreshTopPerRun: config.refreshTopPerRun,
    minCommissionPct: config.minCommissionPct,
    femalePercentTarget: config.femalePercent,
    feedMode: "coverage-95-5",
    homePolicy: "100% feminino",
    lastPhase: state.lastPhase,
    priorityQueueSize: state.priorityQueue.length,
    queueSize: state.queue.length,
    cursor: state.cursor,
    runs: state.runs,
    totalUpserts: state.totalUpserts,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastPruneAt: state.lastPruneAt,
    lastError: state.lastError,
    lastResult: state.lastResult,
    modes: BIASED_ROTATION,
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
  console.log(
    `[autosync] ativo a cada ${config.intervalMin}min · batch=${config.batch} · refreshTop=${config.refreshTopPerRun} · minComm=${config.minCommissionPct}%`
  );
  scheduleNext();
}

module.exports = {
  config,
  start,
  runOnce,
  runTopPerformance,
  getStatus,
  prioritizeJobs,
  ensureQueue,
};
