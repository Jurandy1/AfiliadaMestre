"use strict";

// Alimentação automática — fila de cobertura 95% feminino / 5% geral.
// Prioriza buracos em moda/beleza e listType comissão + top performance.

const {
  fetchProductOffers,
  mapOfferToRow,
  SYNC_ROTATION,
  generateShortLink,
} = require("./shopee");
const {
  upsertOfertas,
  pruneOlderThan,
  listOffersMissingShortlink,
  updateShortLink,
} = require("./supabase");
const { buildProductSubIds } = require("./tracking");
const { buildCoverageQueue, DEFAULT_FEMALE_PERCENT } = require("./coverage");
const { resolveProductOriginUrl } = require("./shopee");

const FEMALE_PERCENT = clampNum(process.env.AUTO_SYNC_FEMALE_PERCENT, DEFAULT_FEMALE_PERCENT, 80, 99);

const config = {
  enabled: /^(1|true|on|yes)$/i.test(String(process.env.AUTO_SYNC ?? "0")),
  intervalMin: clampNum(process.env.AUTO_SYNC_INTERVAL_MIN, 90, 15, 1440),
  batch: clampNum(process.env.AUTO_SYNC_BATCH, 5, 1, 20),
  limit: clampNum(process.env.AUTO_SYNC_LIMIT, 20, 5, 50),
  pruneDays: clampNum(process.env.AUTO_PRUNE_DAYS, 60, 0, 365),
  requestGapMs: clampNum(process.env.AUTO_SYNC_GAP_MS, 400, 100, 5000),
  shortlinkBackfillPerRun: clampNum(process.env.AUTO_SYNC_SHORTLINKS, 15, 0, 100),
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
          minRating: 4,
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

        if (rows.length) {
          await upsertOfertas(rows);
          upserts += rows.length;
          state.totalUpserts += rows.length;
        }
        processed.push({
          keyword,
          category,
          subcategory,
          audience: job.audience,
          ok: true,
          count: rows.length,
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

    let shortlinksGenerated = 0;
    if (config.shortlinkBackfillPerRun > 0) {
      try {
        const missing = await listOffersMissingShortlink({ limit: config.shortlinkBackfillPerRun });
        for (const row of Array.isArray(missing) ? missing : []) {
          const origin = resolveProductOriginUrl(row) || row.product_link || row.offer_link;
          if (!origin) continue;
          try {
            const subIds = buildProductSubIds(row.category, row.item_id, row.subcategory);
            const shortLink = await generateShortLink(origin, subIds);
            if (shortLink) {
              await updateShortLink(row.item_id, shortLink);
              shortlinksGenerated += 1;
            }
          } catch (linkErr) {
            if (linkErr.rateLimited) break;
          }
          await sleep(config.requestGapMs);
        }
        if (shortlinksGenerated) {
          console.log(`[autosync] shortlinks gerados: ${shortlinksGenerated}`);
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
      queueSize: queue.length,
      cursor: state.cursor,
      durationMs: Date.now() - startedAt.getTime(),
    };
    console.log(
      `[autosync] ${mode.label} upserts=${upserts} batch=${processed.length} female%=${config.femalePercent}`
    );
    return state.lastResult;
  } catch (err) {
    state.lastError = err.message;
    state.lastResult = { ok: false, error: err.message };
    throw err;
  } finally {
    state.running = false;
    if (config.enabled) {
      state.nextRunAt = new Date(Date.now() + config.intervalMin * 60 * 1000).toISOString();
    }
  }
}

async function runTopPerformance() {
  return runOnce({
    manual: true,
    forceMode: { listType: 2, sortType: 2, label: "top_performance" },
  });
}

function getStatus() {
  return {
    enabled: config.enabled,
    running: state.running,
    intervalMin: config.intervalMin,
    batch: config.batch,
    limit: config.limit,
    femalePercentTarget: config.femalePercent,
    feedMode: "coverage-95-5",
    homePolicy: "100% feminino",
    queueSize: state.queue.length,
    cursor: state.cursor,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastPruneAt: state.lastPruneAt,
    runs: state.runs,
    totalUpserts: state.totalUpserts,
    lastError: state.lastError,
    lastResult: state.lastResult,
  };
}

function start() {
  if (!config.enabled) {
    console.log("[autosync] desativado (AUTO_SYNC=0)");
    return;
  }
  if (timer) return;
  const ms = config.intervalMin * 60 * 1000;
  console.log(`[autosync] ativo a cada ${config.intervalMin}min · feed ${config.femalePercent}% feminino`);
  state.nextRunAt = new Date(Date.now() + ms).toISOString();
  timer = setInterval(() => {
    runOnce().catch((e) => console.error("[autosync]", e.message));
  }, ms);
  // primeira rodada após 20s
  setTimeout(() => {
    runOnce().catch((e) => console.error("[autosync]", e.message));
  }, 20000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  config,
  start,
  stop,
  runOnce,
  runTopPerformance,
  getStatus,
  status: getStatus,
  ensureQueue,
};
