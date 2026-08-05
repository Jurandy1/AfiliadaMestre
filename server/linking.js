"use strict";

/**
 * Invariante A — TODO produto que entra na base sai daqui:
 *   1. com sub_ids preenchido e slot 1 = SITE_SUBID (garantia de rastreio "meu site");
 *   2. com short_link gerado (ou short_link_pending=true em caso de rate-limit — próximo ciclo tenta).
 *
 * Todo caminho de entrada (feed full, feed delta, keyword sync, refresh-top, manual admin
 * save, explorador shopee) deve chamar ensureLinkedRows ANTES de upsertOfertas.
 */

const {
  generateBatchShortLink,
  resolveProductOriginUrl,
} = require("./shopee");
const { updateShortLink, supabaseRequest } = require("./supabase");
const { SITE_SUBID, buildProductSubIds } = require("./tracking");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Garante slot 1 = SITE_SUBID e 5 slots preenchidos (não muta o array recebido). */
function normalizeSubIds(row) {
  const fromRow = Array.isArray(row.sub_ids) ? row.sub_ids.filter(Boolean) : [];
  const base = fromRow.length
    ? fromRow.slice(0, 5)
    : buildProductSubIds(row.category, row.item_id, row.subcategory);
  if (base[0] !== SITE_SUBID) {
    base.unshift(SITE_SUBID);
    if (base.length > 5) base.length = 5;
  }
  // Completa até 5 se veio curto
  while (base.length < 5) {
    const fallback = buildProductSubIds(row.category, row.item_id, row.subcategory);
    const nextSlot = fallback[base.length] || (base.length === 4 ? "produto" : "geral");
    base.push(nextSlot);
  }
  return base.slice(0, 5);
}

/**
 * ensureLinkedRows(rows, opts) — normaliza sub_ids e garante short_link em cada row.
 *
 * @param {Array<Object>} rows — linhas prontas para upsertOfertas (item_id + offer_link obrigatórios).
 * @param {Object} opts
 * @param {boolean} opts.regenerate — se true, força regerar short_link mesmo se já existir.
 * @param {number} opts.gapMs — pausa entre batches de 50.
 * @returns {Promise<{rows, generated, failed, skipped, pending, rateLimited}>}
 */
async function ensureLinkedRows(rows = [], { regenerate = false, gapMs = 300 } = {}) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.item_id && r?.offer_link) : [];
  if (!list.length) {
    return { rows: [], generated: 0, failed: 0, skipped: 0, pending: 0, rateLimited: false };
  }

  // 1. Normaliza sub_ids em todo row (in-place, cada row fica com slot 1 = SITE_SUBID).
  for (const row of list) {
    row.sub_ids = normalizeSubIds(row);
  }

  // 2. Monta lista de rows que precisam de shortlink.
  const needsLink = [];
  let skipped = 0;
  for (const row of list) {
    if (!regenerate && row.short_link) {
      skipped += 1;
      continue;
    }
    const origin = resolveProductOriginUrl(row);
    if (!origin) {
      skipped += 1;
      continue;
    }
    needsLink.push({ origin, row });
  }

  if (!needsLink.length) {
    return { rows: list, generated: 0, failed: 0, skipped, pending: 0, rateLimited: false };
  }

  // 3. Gera em batches de 50 (limite oficial da API).
  let generated = 0;
  let failed = 0;
  let pending = 0;
  let rateLimited = false;
  const BATCH = 50;

  for (let i = 0; i < needsLink.length; i += BATCH) {
    const chunk = needsLink.slice(i, i + BATCH);
    const payload = chunk.map(({ origin, row }) => ({
      originUrl: origin,
      subIds: row.sub_ids,
      itemId: row.item_id,
    }));

    try {
      const batch = await generateBatchShortLink(payload);
      const byId = new Map();
      for (const link of batch.links || []) {
        if (link.itemId != null) byId.set(String(link.itemId), link);
      }
      for (const { row } of chunk) {
        const link = byId.get(String(row.item_id));
        if (link?.success && link.shortLink) {
          row.short_link = link.shortLink;
          row.short_link_pending = false;
          generated += 1;
        } else {
          row.short_link_pending = true;
          pending += 1;
        }
      }
      if (batch.rateLimited) {
        rateLimited = true;
        // Marca o resto do lote como pending pra ser reprocessado no próximo ciclo.
        for (let j = i + BATCH; j < needsLink.length; j++) {
          needsLink[j].row.short_link_pending = true;
          pending += 1;
        }
        break;
      }
    } catch (err) {
      failed += chunk.length;
      for (const { row } of chunk) {
        row.short_link_pending = true;
      }
      if (err && err.rateLimited) {
        rateLimited = true;
        for (let j = i + BATCH; j < needsLink.length; j++) {
          needsLink[j].row.short_link_pending = true;
          pending += 1;
        }
        break;
      }
    }
    if (i + BATCH < needsLink.length) await sleep(gapMs);
  }

  return { rows: list, generated, failed, skipped, pending, rateLimited };
}

/**
 * Retenta shortlinks marcados como pending. Chamado pelo autosync (fase de manutenção)
 * e por /api/cron/refresh-metrics.
 */
async function retryPendingShortlinks({ limit = 50, gapMs = 400 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const path = `/ofertas?select=item_id,category,subcategory,offer_link,product_link,shop_id,sub_ids,short_link&short_link_pending=eq.true&order=updated_at.desc&limit=${safeLimit}`;
  let rows = [];
  try {
    rows = await supabaseRequest(path, { method: "GET", useService: true });
  } catch (_) {
    // Coluna pode não existir ainda — fallback para "sem short_link"
    rows = await supabaseRequest(
      `/ofertas?select=item_id,category,subcategory,offer_link,product_link,shop_id,sub_ids&short_link=is.null&order=updated_at.desc&limit=${safeLimit}`,
      { method: "GET", useService: true }
    );
  }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { attempted: 0, generated: 0, pending: 0, failed: 0 };

  const result = await ensureLinkedRows(list, { regenerate: false, gapMs });

  // Persiste short_link e flag pending em cada row.
  let generated = 0;
  let pending = 0;
  let failed = 0;
  for (const row of result.rows) {
    if (row.short_link) {
      try {
        await updateShortLink(row.item_id, row.short_link);
        // Limpa a flag pending explicitamente (o supabase não retira PATCH parcial):
        await supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(row.item_id)}`, {
          method: "PATCH",
          body: { short_link_pending: false },
          prefer: "return=minimal",
          useService: true,
        }).catch(() => {});
        generated += 1;
      } catch (_) {
        failed += 1;
      }
    } else if (row.short_link_pending) {
      pending += 1;
      await supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(row.item_id)}`, {
        method: "PATCH",
        body: { short_link_pending: true },
        prefer: "return=minimal",
        useService: true,
      }).catch(() => {});
    }
  }
  return { attempted: list.length, generated, pending, failed };
}

module.exports = {
  ensureLinkedRows,
  retryPendingShortlinks,
  normalizeSubIds,
};
