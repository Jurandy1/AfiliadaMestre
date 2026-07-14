"use strict";

// Alimentação automática da vitrine — leve e "free-tier friendly".
// Em vez de varrer TODAS as keywords de uma vez (pico de escrita no Supabase e
// muitas chamadas à Shopee), processamos um pequeno lote por vez (round-robin).
// Assim o banco se mantém atualizado aos poucos, sem estourar cotas gratuitas.

const { fetchProductOffers, mapOfferToRow, mapOfferToProduct } = require("./shopee");
const { upsertOfertas, pruneOlderThan } = require("./supabase");
const { allKeywords } = require("./categorias");

const KEYWORDS = allKeywords(); // [{ keyword, category }]

const config = {
  enabled: /^(1|true|on|yes)$/i.test(String(process.env.AUTO_SYNC ?? "1")),
  intervalMin: clampNum(process.env.AUTO_SYNC_INTERVAL_MIN, 90, 15, 1440),
  batch: clampNum(process.env.AUTO_SYNC_BATCH, 5, 1, 20),
  limit: clampNum(process.env.AUTO_SYNC_LIMIT, 20, 5, 50),
  pruneDays: clampNum(process.env.AUTO_PRUNE_DAYS, 60, 0, 365),
  requestGapMs: clampNum(process.env.AUTO_SYNC_GAP_MS, 400, 100, 5000),
};

const state = {
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastPruneAt: null,
  cursor: 0,
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

/** Processa um lote de keywords a partir do cursor atual. */
async function runOnce({ manual = false } = {}) {
  if (state.running) return { skipped: "already-running" };
  if (!credsReady()) {
    state.lastError = "Credenciais Shopee/Supabase ausentes";
    return { skipped: "no-creds" };
  }
  if (!KEYWORDS.length) return { skipped: "no-keywords" };

  state.running = true;
  const startedAt = new Date();
  const processed = [];
  let upserts = 0;

  try {
    for (let i = 0; i < config.batch; i++) {
      const idx = state.cursor % KEYWORDS.length;
      const { keyword, category } = KEYWORDS[idx];
      state.cursor = (state.cursor + 1) % KEYWORDS.length;
      try {
        const offer = await fetchProductOffers({ keyword, limit: config.limit, page: 1 });
        const nodes = offer.nodes || [];
        const rows = nodes.map((n) => mapOfferToRow(n, keyword)).filter((r) => r.item_id);
        if (rows.length) {
          await upsertOfertas(rows);
          upserts += rows.length;
        }
        processed.push({ keyword, category, ok: true, count: rows.length });
      } catch (e) {
        processed.push({ keyword, category, ok: false, error: e.message });
        state.lastError = e.message;
      }
      if (i < config.batch - 1) await sleep(config.requestGapMs);
    }

    // Prune ocasional (no máximo 1x/dia) para manter o Supabase enxuto.
    if (config.pruneDays > 0) {
      const dayMs = 24 * 60 * 60 * 1000;
      const canPrune = !state.lastPruneAt || Date.now() - new Date(state.lastPruneAt).getTime() > dayMs;
      if (canPrune) {
        try {
          const removed = await pruneOlderThan(config.pruneDays);
          state.lastPruneAt = new Date().toISOString();
          if (removed) console.log(`[autosync] prune: ${removed} ofertas antigas removidas`);
        } catch (e) {
          console.warn("[autosync] prune falhou:", e.message);
        }
      }
    }

    state.runs += 1;
    state.totalUpserts += upserts;
    state.lastRunAt = startedAt.toISOString();
    state.lastResult = { manual, upserts, processed };
    console.log(`[autosync] run #${state.runs}: ${upserts} upserts (${processed.length} keywords)`);
    return state.lastResult;
  } finally {
    state.running = false;
    scheduleNext();
  }
}

function scheduleNext() {
  if (!config.enabled) return;
  if (timer) clearTimeout(timer);
  const ms = config.intervalMin * 60 * 1000;
  state.nextRunAt = new Date(Date.now() + ms).toISOString();
  timer = setTimeout(() => runOnce().catch((e) => console.error("[autosync]", e.message)), ms);
}

function start() {
  if (!config.enabled) {
    console.log("[autosync] desativado (AUTO_SYNC=0)");
    return;
  }
  if (!credsReady()) {
    console.log("[autosync] aguardando credenciais no .env — não iniciado");
    return;
  }
  console.log(
    `[autosync] ativo: lote=${config.batch} keyword(s) a cada ${config.intervalMin}min ` +
    `(limit=${config.limit}, keywords=${KEYWORDS.length})`
  );
  // Primeira execução ~20s após o boot, sem travar o start do servidor.
  setTimeout(() => runOnce().catch((e) => console.error("[autosync]", e.message)), 20000);
  scheduleNext();
}

function status() {
  return {
    enabled: config.enabled,
    running: state.running,
    intervalMin: config.intervalMin,
    batch: config.batch,
    limit: config.limit,
    pruneDays: config.pruneDays,
    keywordsTotal: KEYWORDS.length,
    cursor: state.cursor,
    runs: state.runs,
    totalUpserts: state.totalUpserts,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastPruneAt: state.lastPruneAt,
    lastError: state.lastError,
    lastResult: state.lastResult,
  };
}

module.exports = { start, runOnce, status, config };
