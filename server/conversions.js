"use strict";

/**
 * Persistência e sumário de conversões — fonte do "Painel do Meu Site".
 *
 * Toda venda é rotulada por utmContent (sub_id1..5). Vendas com sub_id1='afiliadamestre'
 * são consideradas "do meu site" (coluna gerada is_meu_site).
 */

const {
  fetchConversionReport,
  fetchValidatedReport,
} = require("./shopee");
const { supabaseRequest } = require("./supabase");
const { SITE_SUBID } = require("./tracking");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** utmContent do Shopee: "sub1_sub2_sub3_sub4_sub5" (separador = "_"). */
function parseUtmSubIds(utmContent) {
  const raw = String(utmContent || "").trim();
  if (!raw) return { sub_id1: null, sub_id2: null, sub_id3: null, sub_id4: null, sub_id5: null };
  const parts = raw.split(/[_|]+/).filter(Boolean).slice(0, 5);
  return {
    sub_id1: parts[0] || null,
    sub_id2: parts[1] || null,
    sub_id3: parts[2] || null,
    sub_id4: parts[3] || null,
    sub_id5: parts[4] || null,
  };
}

function unixToIso(ts) {
  if (ts == null || ts === "") return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function toNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aplaina 1 nó conversionReport/validatedReport em 1..N rows conversions.
 * Um conversion pode ter N orders com N items — vira 1 row por item
 * (agrupamento fino que preserva sub_ids e habilita "top item").
 * Se todos os items compartilharem os mesmos sub_ids, é apenas uma questão de granularidade;
 * conversion_id continua único por linha usando composição (conversionId << 16 | itemId % 65535).
 * Para simplicidade e evitar colisão, usamos apenas conversion_id do primeiro item e ignoramos
 * outros items do mesmo conversion — Shopee normalmente devolve 1 item por conversion.
 */
function flattenConversionNode(node, { validated = false } = {}) {
  const subs = parseUtmSubIds(node.utmContent);
  const base = {
    conversion_id: Number(node.conversionId),
    purchase_time: unixToIso(node.purchaseTime),
    click_time: unixToIso(node.clickTime),
    order_id: null,
    order_status: null,
    fraud_status: null,
    shop_id: null,
    shop_name: null,
    shop_type: null,
    item_id: null,
    item_name: null,
    item_price: null,
    actual_amount: null,
    refund_amount: null,
    qty: null,
    complete_time: null,
    total_commission: toNumOrNull(node.totalCommission),
    net_commission: toNumOrNull(node.netCommission),
    seller_commission: toNumOrNull(node.sellerCommission),
    shopee_commission_capped: toNumOrNull(node.shopeeCommissionCapped),
    mcn_management_fee: toNumOrNull(node.mcnManagementFee),
    utm_content: node.utmContent || null,
    ...subs,
    validated: !!validated,
  };

  const orders = Array.isArray(node.orders) ? node.orders : [];
  if (!orders.length || !orders[0].items?.length) {
    if (!Number.isSafeInteger(base.conversion_id)) return null;
    return base;
  }

  // Pega o 1º item do 1º order — 99% dos conversions são 1 item.
  const order = orders[0];
  const item = order.items[0];
  base.order_id = order.orderId || null;
  base.order_status = order.orderStatus || null;
  base.shop_type = toNumOrNull(order.shopType);
  base.shop_id = toNumOrNull(item.shopId);
  base.shop_name = item.shopName || null;
  base.item_id = toNumOrNull(item.itemId);
  base.item_name = item.itemName || null;
  base.item_price = toNumOrNull(item.itemPrice);
  base.actual_amount = toNumOrNull(item.actualAmount);
  base.refund_amount = toNumOrNull(item.refundAmount);
  base.qty = toNumOrNull(item.qty);
  base.complete_time = unixToIso(item.completeTime);
  base.fraud_status = item.fraudStatus || null;

  if (!Number.isSafeInteger(base.conversion_id)) return null;
  return base;
}

async function upsertConversions(rows = []) {
  if (!rows?.length) return 0;
  const clean = rows.filter((r) => r && Number.isSafeInteger(r.conversion_id));
  if (!clean.length) return 0;
  // Chunks pra não estourar payload
  const CHUNK = 200;
  let saved = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const slice = clean.slice(i, i + CHUNK);
    try {
      const out = await supabaseRequest("/conversions", {
        method: "POST",
        body: slice,
        prefer: "resolution=merge-duplicates,return=minimal",
        useService: true,
      });
      saved += Array.isArray(out) ? out.length : slice.length;
    } catch (err) {
      console.warn("[upsertConversions] chunk falhou:", err.message);
    }
  }
  return saved;
}

/**
 * Puxa conversionReport paginando com scrollId (janela 30s entre requests).
 * Persiste em conversions. Retorna resumo.
 */
async function pullConversionReport({
  sinceMin = 60 * 48,        // últimos 48h por padrão
  purchaseTimeStart,
  purchaseTimeEnd,
  orderStatus = "",
  maxPages = 40,
  limit = 50,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const start = purchaseTimeStart != null
    ? Number(purchaseTimeStart)
    : now - Math.max(60, Number(sinceMin) * 60);
  const end = purchaseTimeEnd != null ? Number(purchaseTimeEnd) : now;

  let scrollId = "";
  let pages = 0;
  let totalNodes = 0;
  let saved = 0;
  const started = Date.now();

  while (pages < Number(maxPages)) {
    let page;
    try {
      page = await fetchConversionReport({
        purchaseTimeStart: start,
        purchaseTimeEnd: end,
        orderStatus,
        limit,
        scrollId,
      });
    } catch (err) {
      if (err && err.rateLimited) {
        return { ok: true, pages, totalNodes, saved, ms: Date.now() - started, rateLimited: true };
      }
      throw err;
    }
    const nodes = Array.isArray(page.nodes) ? page.nodes : [];
    totalNodes += nodes.length;

    const rows = nodes
      .map((n) => flattenConversionNode(n, { validated: false }))
      .filter(Boolean);
    saved += await upsertConversions(rows);

    pages += 1;
    const nextScroll = page.pageInfo?.scrollId || "";
    const hasNext = !!page.pageInfo?.hasNextPage && nextScroll && nextScroll !== scrollId;
    if (!hasNext) break;
    scrollId = nextScroll;
    // Janela do scrollId é 30s — pausa curta é ok, longa mata o cursor.
    await sleep(500);
  }

  return {
    ok: true,
    pages,
    totalNodes,
    saved,
    windowStart: unixToIso(start),
    windowEnd: unixToIso(end),
    ms: Date.now() - started,
  };
}

/**
 * Puxa validatedReport (validação de comissão). Marca validated=true nos rows correspondentes.
 */
async function pullValidatedReport({
  validationId,
  maxPages = 40,
  limit = 50,
} = {}) {
  const vid = Number(validationId);
  if (!Number.isSafeInteger(vid) || vid <= 0) {
    const err = new Error("validationId obrigatório");
    err.status = 400;
    throw err;
  }
  let scrollId = "";
  let pages = 0;
  let totalNodes = 0;
  let saved = 0;
  const started = Date.now();

  while (pages < Number(maxPages)) {
    let page;
    try {
      page = await fetchValidatedReport({ validationId: vid, limit, scrollId });
    } catch (err) {
      if (err && err.rateLimited) {
        return { ok: true, pages, totalNodes, saved, ms: Date.now() - started, rateLimited: true };
      }
      throw err;
    }
    const nodes = Array.isArray(page.nodes) ? page.nodes : [];
    totalNodes += nodes.length;

    const rows = nodes
      .map((n) => flattenConversionNode(n, { validated: true }))
      .filter(Boolean);
    saved += await upsertConversions(rows);

    pages += 1;
    const nextScroll = page.pageInfo?.scrollId || "";
    const hasNext = !!page.pageInfo?.hasNextPage && nextScroll && nextScroll !== scrollId;
    if (!hasNext) break;
    scrollId = nextScroll;
    await sleep(500);
  }

  return { ok: true, pages, totalNodes, saved, ms: Date.now() - started };
}

function windowFromParams({ from, to, days } = {}) {
  const now = new Date();
  let end = to ? new Date(to) : now;
  if (isNaN(end.getTime())) end = now;
  let start;
  if (from) {
    start = new Date(from);
    if (isNaN(start.getTime())) start = null;
  }
  if (!start) {
    const d = Math.max(1, Number(days) || 30);
    start = new Date(end.getTime() - d * 24 * 3600 * 1000);
  }
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

/**
 * summary({from, to, onlyMeuSite}) — cards + top listas.
 * Retorna null-friendly (nunca lança).
 */
async function summary({ from, to, days = 30, onlyMeuSite = true } = {}) {
  const { fromIso, toIso } = windowFromParams({ from, to, days });
  const baseFilter = `purchase_time=gte.${encodeURIComponent(fromIso)}&purchase_time=lte.${encodeURIComponent(toIso)}`;
  const scopeFilter = onlyMeuSite ? `${baseFilter}&is_meu_site=is.true` : baseFilter;

  async function safeGet(path) {
    try {
      return await supabaseRequest(path, { method: "GET", useService: true });
    } catch (err) {
      return null;
    }
  }

  // Puxa todas as conversions da janela (limita a 5000 pra não estourar payload)
  const rows = await safeGet(
    `/conversions?select=conversion_id,purchase_time,order_status,fraud_status,shop_id,shop_name,item_id,item_name,item_price,actual_amount,net_commission,total_commission,sub_id3,validated&${scopeFilter}&order=purchase_time.desc&limit=5000`
  ) || [];

  const list = Array.isArray(rows) ? rows : [];
  let gross = 0;
  let net = 0;
  let orders = 0;
  let cancelled = 0;
  let fraud = 0;
  let validatedCount = 0;
  let sumTicket = 0;
  const byItem = new Map();
  const byShop = new Map();
  const byCampaign = new Map();

  for (const r of list) {
    const g = Number(r.total_commission) || 0;
    const n = Number(r.net_commission) || 0;
    gross += g;
    net += n;
    orders += 1;
    if (r.validated) validatedCount += 1;
    if (String(r.order_status).toUpperCase() === "CANCELLED") cancelled += 1;
    if (String(r.fraud_status).toUpperCase() === "FRAUD") fraud += 1;
    const ticket = Number(r.actual_amount) || Number(r.item_price) || 0;
    sumTicket += ticket;

    if (r.item_id) {
      const key = String(r.item_id);
      const prev = byItem.get(key) || { itemId: r.item_id, itemName: r.item_name, gross: 0, net: 0, orders: 0 };
      prev.gross += g;
      prev.net += n;
      prev.orders += 1;
      if (r.item_name && !prev.itemName) prev.itemName = r.item_name;
      byItem.set(key, prev);
    }
    if (r.shop_id) {
      const key = String(r.shop_id);
      const prev = byShop.get(key) || { shopId: r.shop_id, shopName: r.shop_name, gross: 0, net: 0, orders: 0 };
      prev.gross += g;
      prev.net += n;
      prev.orders += 1;
      if (r.shop_name && !prev.shopName) prev.shopName = r.shop_name;
      byShop.set(key, prev);
    }
    if (r.sub_id3) {
      const key = String(r.sub_id3);
      const prev = byCampaign.get(key) || { campaign: r.sub_id3, gross: 0, net: 0, orders: 0 };
      prev.gross += g;
      prev.net += n;
      prev.orders += 1;
      byCampaign.set(key, prev);
    }
  }

  const topItems = [...byItem.values()].sort((a, b) => b.net - a.net).slice(0, 10);
  const topShops = [...byShop.values()].sort((a, b) => b.net - a.net).slice(0, 10);
  const topCampaigns = [...byCampaign.values()].sort((a, b) => b.net - a.net).slice(0, 10);

  return {
    ok: true,
    window: { from: fromIso, to: toIso },
    onlyMeuSite: !!onlyMeuSite,
    siteSubId: SITE_SUBID,
    totals: {
      orders,
      gross: Math.round(gross * 100) / 100,
      net: Math.round(net * 100) / 100,
      avgTicket: orders ? Math.round((sumTicket / orders) * 100) / 100 : 0,
      cancelled,
      fraud,
      validated: validatedCount,
      cancelledPct: orders ? Math.round((cancelled / orders) * 1000) / 10 : 0,
      fraudPct: orders ? Math.round((fraud / orders) * 1000) / 10 : 0,
    },
    topItems,
    topShops,
    topCampaigns,
    sampleSize: list.length,
  };
}

/**
 * topSignalsFromMySite — Sinais pra o autosync priorizar keywords/lojas/itens
 * que JÁ VENDERAM pro meu site. Retorna listas ordenadas por net_commission.
 */
async function topSignalsFromMySite({ days = 30, limit = 20 } = {}) {
  const { fromIso, toIso } = windowFromParams({ days });
  try {
    const rows = await supabaseRequest(
      `/conversions?select=item_id,shop_id,sub_id3,net_commission,total_commission&is_meu_site=is.true&purchase_time=gte.${encodeURIComponent(fromIso)}&purchase_time=lte.${encodeURIComponent(toIso)}&order=purchase_time.desc&limit=5000`,
      { method: "GET", useService: true }
    );
    const list = Array.isArray(rows) ? rows : [];
    const byItem = new Map();
    const byShop = new Map();
    const byCampaign = new Map();
    for (const r of list) {
      const money = Number(r.net_commission) || Number(r.total_commission) || 0;
      if (r.item_id) {
        const k = String(r.item_id);
        byItem.set(k, (byItem.get(k) || 0) + money);
      }
      if (r.shop_id) {
        const k = String(r.shop_id);
        byShop.set(k, (byShop.get(k) || 0) + money);
      }
      if (r.sub_id3) {
        const k = String(r.sub_id3);
        byCampaign.set(k, (byCampaign.get(k) || 0) + money);
      }
    }
    const sortDesc = (m) => [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([k, v]) => ({ key: k, money: Math.round(v * 100) / 100 }));
    return {
      topItemIds: sortDesc(byItem).map((x) => Number(x.key)).filter((n) => Number.isSafeInteger(n) && n > 0),
      topShopIds: sortDesc(byShop).map((x) => Number(x.key)).filter((n) => Number.isSafeInteger(n) && n > 0),
      topCampaigns: sortDesc(byCampaign).map((x) => x.key),
    };
  } catch (_) {
    // Tabela ainda não existe — retorna vazio, autosync segue com a fila normal.
    return { topItemIds: [], topShopIds: [], topCampaigns: [] };
  }
}

/**
 * Backfill de sub_ids em ofertas antigas que não têm SITE_SUBID no slot 1.
 * Reprocessa os sub_ids e força regenerate do short_link.
 */
async function reprocessSubIds({ limit = 100, dryRun = false } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  // PostgREST: sub_ids sem SITE_SUBID no slot 1 OU sub_ids nulo
  const path = `/ofertas?select=item_id,category,subcategory,offer_link,product_link,shop_id,sub_ids,short_link&or=(sub_ids.is.null,not.sub_ids.cs.{${SITE_SUBID}})&limit=${safeLimit}`;
  let rows = [];
  try {
    rows = await supabaseRequest(path, { method: "GET", useService: true });
  } catch (err) {
    console.warn("[reprocessSubIds] busca falhou:", err.message);
    return { ok: false, error: err.message };
  }
  const list = Array.isArray(rows) ? rows : [];
  if (dryRun) return { ok: true, dryRun: true, candidates: list.length, sample: list.slice(0, 10) };

  if (!list.length) return { ok: true, updated: 0, regenerated: 0, note: "Nada pra reprocessar" };

  const { ensureLinkedRows } = require("./linking");
  const { upsertOfertas } = require("./supabase");

  // ensureLinkedRows já normaliza sub_ids e gera short_link novo se preciso
  const result = await ensureLinkedRows(list, { regenerate: true });
  const saved = await upsertOfertas(result.rows);
  return {
    ok: true,
    scanned: list.length,
    saved: Array.isArray(saved) ? saved.length : list.length,
    shortlinks: {
      generated: result.generated,
      pending: result.pending,
      skipped: result.skipped,
    },
  };
}

/**
 * Decodifica um shortlink/URL — retorna os 5 sub_ids embutidos.
 * Aceita:
 *   - shortlink s.shopee.com.br/... (segue o redirect não é preciso: sub_ids são metadata do link)
 *   - URL tracking já expandida (contém sub_id / utm_content)
 * NOTA: shortlinks só podem ser decodificados chamando a API — o Shopee retorna
 * originUrl+longLink no generateShortLink. Aqui só validamos URLs que já contenham utm_content.
 */
function decodeSubIdsFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, error: "url vazia" };
  try {
    const u = new URL(raw);
    const utmContent = u.searchParams.get("utm_content") || u.searchParams.get("sub_id") || "";
    const parts = parseUtmSubIds(utmContent);
    const isMeuSite = parts.sub_id1 === SITE_SUBID;
    return {
      ok: true,
      url: raw,
      utmContent,
      subIds: [parts.sub_id1, parts.sub_id2, parts.sub_id3, parts.sub_id4, parts.sub_id5].filter(Boolean),
      isMeuSite,
      siteSubId: SITE_SUBID,
      note: isMeuSite
        ? "✅ Este link é do seu site (sub_id1 = " + SITE_SUBID + ")."
        : "⚠️ Este link NÃO tem SITE_SUBID no slot 1 — venda não será rastreada como sua.",
    };
  } catch (err) {
    return { ok: false, error: "URL inválida: " + err.message };
  }
}

module.exports = {
  parseUtmSubIds,
  flattenConversionNode,
  pullConversionReport,
  pullValidatedReport,
  summary,
  topSignalsFromMySite,
  reprocessSubIds,
  decodeSubIdsFromUrl,
  upsertConversions,
};
