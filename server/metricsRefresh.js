"use strict";

/**
 * Invariante B — sales/rating/comissão dos produtos mostrados na vitrine
 * são sempre re-verificados periodicamente contra o detalhe da Shopee.
 *
 * Motivo: o `sales` do listing (productOfferV2 por keyword) as vezes fica
 * desatualizado ou agrega diferente do detalhe. Sem isto o card mostra
 * número errado e o cliente perde confiança.
 *
 * Fluxo:
 *   1. Pega os N item_ids mais visíveis (sort=updated_at.desc, visible only)
 *      com sales_verified_at mais antigo que staleHours (ou nunca verificado).
 *   2. Chama fetchProductDetailsByIds em batches de 20.
 *   3. PATCH em cada row com sales/rating_star/commission_rate/price_min/price_max,
 *      seta sales_verified_at=now(). Se a Shopee removeu o item, marca hidden=true.
 */

const {
  fetchProductDetailsByIds,
  parseCommissionPct,
} = require("./shopee");
const { supabaseRequest } = require("./supabase");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lista item_ids que precisam de reverificação.
 * Prioriza: nunca verificados > verificados há mais tempo.
 */
async function listStaleItemIds({ limit = 60, staleHours = 12 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);
  const cutoff = new Date(Date.now() - Number(staleHours) * 3600 * 1000).toISOString();

  // 1º tenta o filtro "nunca verificado OR verificado antes do cutoff"
  const path = `/ofertas?select=item_id,sales_verified_at&hidden=is.false&or=(sales_verified_at.is.null,sales_verified_at.lt.${encodeURIComponent(cutoff)})&order=sales_verified_at.asc.nullsfirst&limit=${safeLimit}`;
  try {
    const rows = await supabaseRequest(path, { method: "GET", useService: true });
    return (Array.isArray(rows) ? rows : []).map((r) => Number(r.item_id)).filter(Boolean);
  } catch (_) {
    // Fallback: coluna sales_verified_at ainda não existe — pega os mais antigos.
    const rows = await supabaseRequest(
      `/ofertas?select=item_id&order=updated_at.asc&limit=${safeLimit}`,
      { method: "GET", useService: true }
    );
    return (Array.isArray(rows) ? rows : []).map((r) => Number(r.item_id)).filter(Boolean);
  }
}

function toRatePct(rate) {
  if (rate == null || rate === "") return null;
  const pct = parseCommissionPct(rate);
  return Number.isFinite(pct) ? pct / 100 : null;
}

async function patchOfertaMetrics(itemId, patch) {
  const body = { ...patch, sales_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  try {
    return await supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body,
      prefer: "return=minimal",
      useService: true,
    });
  } catch (err) {
    // Coluna sales_verified_at pode não existir ainda — retry sem ela
    const msg = String(err.message || "");
    if (/sales_verified_at|schema cache|PGRST/i.test(msg)) {
      const { sales_verified_at, ...rest } = body;
      return supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        body: rest,
        prefer: "return=minimal",
        useService: true,
      });
    }
    throw err;
  }
}

/**
 * refreshStaleMetrics — Job periódico de reverificação.
 * Chamado por /api/cron/refresh-metrics e por uma fase do autosync.
 */
async function refreshStaleMetrics({
  batch = 60,
  staleHours = 12,
  gapMs = 400,
} = {}) {
  const started = Date.now();
  const ids = await listStaleItemIds({ limit: batch, staleHours });
  if (!ids.length) {
    return { ok: true, requested: 0, refreshed: 0, hidden: 0, unchanged: 0, ms: 0 };
  }

  let refreshed = 0;
  let hidden = 0;
  let unchanged = 0;

  const CHUNK = 20; // limite de fetchProductDetailsByIds
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let nodes = [];
    try {
      nodes = await fetchProductDetailsByIds(slice);
    } catch (err) {
      if (err && err.rateLimited) {
        return {
          ok: true,
          requested: ids.length,
          refreshed,
          hidden,
          unchanged,
          rateLimited: true,
          ms: Date.now() - started,
        };
      }
      // Outros erros — tenta próximo chunk
      continue;
    }

    const found = new Map();
    for (const n of nodes) {
      const id = Number(n.itemId);
      if (Number.isSafeInteger(id) && id > 0) found.set(id, n);
    }

    for (const id of slice) {
      const n = found.get(id);
      if (!n) {
        // Shopee removeu / expirou — não apaga (preserva sub_ids/short_link) mas oculta.
        try {
          await patchOfertaMetrics(id, { hidden: true });
          hidden += 1;
        } catch (_) {}
        continue;
      }
      const patch = {};
      if (n.sales != null) patch.sales = String(n.sales);
      if (n.ratingStar != null) {
        const r = Number(n.ratingStar);
        if (Number.isFinite(r) && r > 0) patch.rating_star = r;
      }
      if (n.commissionRate != null) patch.commission_rate = String(n.commissionRate);
      if (n.sellerCommissionRate != null) patch.seller_commission_rate = String(n.sellerCommissionRate);
      if (n.shopeeCommissionRate != null) patch.shopee_commission_rate = String(n.shopeeCommissionRate);
      if (n.commission != null) patch.commission = String(n.commission);
      if (n.priceMin != null) {
        const p = Number(n.priceMin);
        if (Number.isFinite(p) && p > 0) patch.price_min = p;
      }
      if (n.priceMax != null) {
        const p = Number(n.priceMax);
        if (Number.isFinite(p) && p > 0) patch.price_max = p;
      }
      if (n.priceDiscountRate != null) patch.price_discount_rate = String(n.priceDiscountRate);

      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      try {
        await patchOfertaMetrics(id, patch);
        refreshed += 1;
      } catch (err) {
        // Nunca deixa 1 erro parar o job
        unchanged += 1;
      }
    }

    if (i + CHUNK < ids.length) await sleep(gapMs);
  }

  return {
    ok: true,
    requested: ids.length,
    refreshed,
    hidden,
    unchanged,
    ms: Date.now() - started,
  };
}

/**
 * Reverifica UM item específico agora (usado pelo botão "reverificar" no admin
 * ou quando o usuário reporta que o número da venda estava errado).
 */
async function reverifyItem(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const err = new Error("itemId inválido");
    err.status = 400;
    throw err;
  }
  const nodes = await fetchProductDetailsByIds([id]);
  const n = Array.isArray(nodes) && nodes.length ? nodes[0] : null;
  if (!n) {
    await patchOfertaMetrics(id, { hidden: true });
    return { ok: true, itemId: id, hidden: true, note: "Shopee não devolveu detalhe — item oculto." };
  }
  const patch = {
    sales: n.sales != null ? String(n.sales) : null,
    rating_star: n.ratingStar != null ? Number(n.ratingStar) : null,
    commission_rate: n.commissionRate != null ? String(n.commissionRate) : null,
    seller_commission_rate: n.sellerCommissionRate != null ? String(n.sellerCommissionRate) : null,
    shopee_commission_rate: n.shopeeCommissionRate != null ? String(n.shopeeCommissionRate) : null,
    commission: n.commission != null ? String(n.commission) : null,
    price_min: n.priceMin != null ? Number(n.priceMin) : null,
    price_max: n.priceMax != null ? Number(n.priceMax) : null,
    price_discount_rate: n.priceDiscountRate != null ? String(n.priceDiscountRate) : null,
  };
  Object.keys(patch).forEach((k) => (patch[k] == null || patch[k] === "") && delete patch[k]);
  await patchOfertaMetrics(id, patch);
  return { ok: true, itemId: id, patch };
}

module.exports = {
  refreshStaleMetrics,
  reverifyItem,
  listStaleItemIds,
};
