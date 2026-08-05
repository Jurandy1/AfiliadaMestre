"use strict";

/**
 * Detecta e remove produtos duplicados na vitrine.
 * Critérios (mesmo grupo = duplicata):
 *  1) mesmo shop_id + nome normalizado (idêntico)
 *  2) mesmo item_id real extraído do product_link / offer_link
 *  3) mesmo product_link canônico (sem query string)
 *
 * NÃO agrupa por loja sozinha — bug antigo extraía shop_id da URL
 * como se fosse item_id e juntava a loja inteira num único cluster.
 *
 * Mantém o melhor: tem shortlink > maior moneyScore > mais vendas > mais recente.
 */

const { supabaseRequest, deleteOfertasByIds } = require("./supabase");
const { parseSalesCount, computeMoneyScore } = require("./shopee");

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai o item_id real de URLs Shopee.
 * Formatos: ...-i.{shopId}.{itemId} | /product/{shopId}/{itemId} | itemid=
 * Nunca retorna o shopId no lugar do item.
 */
function extractItemIdFromUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;

  // Nome-do-Produto-i.{shopId}.{itemId}
  let m = s.match(/-i\.(\d+)\.(\d+)/i);
  if (m) {
    const itemId = Number(m[2]);
    return Number.isSafeInteger(itemId) && itemId > 0 ? itemId : null;
  }

  // /product/{shopId}/{itemId}
  m = s.match(/\/product\/(\d+)\/(\d+)/i);
  if (m) {
    const itemId = Number(m[2]);
    return Number.isSafeInteger(itemId) && itemId > 0 ? itemId : null;
  }

  // query/fragment explícito
  m = s.match(/[?&#](?:item[_-]?id|itemid)=(\d{6,})/i);
  if (m) {
    const itemId = Number(m[1]);
    return Number.isSafeInteger(itemId) && itemId > 0 ? itemId : null;
  }

  return null;
}

function canonicalizeProductUrl(url) {
  const s = String(url || "").trim();
  if (!s || /^https?:\/\/s\.shopee\./i.test(s) || /shope\.ee\//i.test(s)) {
    // shortlinks são únicos por destino — não servem para dedupe entre linhas
    return "";
  }
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    if (!host || !path || path === "/") return "";
    return `${host}${path}`;
  } catch {
    return s.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  }
}

function scoreRow(row) {
  const money = computeMoneyScore({
    commissionRate: row.commission_rate,
    sales: row.sales,
    ratingStar: row.rating_star,
  });
  const hasShort = row.short_link ? 1_000_000 : 0;
  const sales = parseSalesCount(row.sales);
  const updated = Date.parse(row.updated_at || 0) || 0;
  return hasShort + money * 1000 + Math.log10(sales + 1) * 10 + updated / 1e13;
}

function dupeKeysFor(row) {
  const keys = [];
  const name = normalizeText(row.product_name);
  const shopId = row.shop_id != null && Number(row.shop_id) > 0 ? Number(row.shop_id) : null;

  // 1) Mesma loja + nome idêntico (título completo)
  if (shopId && name.length >= 16) {
    keys.push(`shop:${shopId}|name:${name}`);
  }

  // 2) Mesmo produto na URL (item_id real — nunca shop_id)
  const fromProduct = extractItemIdFromUrl(row.product_link);
  const fromOffer = extractItemIdFromUrl(row.offer_link);
  const urlItem = fromProduct || fromOffer;
  if (urlItem) {
    keys.push(`urlitem:${urlItem}`);
  }

  // 3) Mesmo link de produto canônico (sem shortlink)
  const canon = canonicalizeProductUrl(row.product_link);
  if (canon.length >= 24) {
    keys.push(`link:${canon}`);
  }

  return keys;
}

async function listAllOffersLite({ max = 5000 } = {}) {
  const pageSize = 200;
  const all = [];
  let offset = 0;
  const cap = Math.min(Math.max(Number(max) || 5000, 100), 10000);

  while (all.length < cap) {
    const limit = Math.min(pageSize, cap - all.length);
    const rows = await supabaseRequest(
      `/ofertas?select=item_id,product_name,shop_id,shop_name,image_url,product_link,offer_link,sales,commission_rate,rating_star,short_link,updated_at,price_min,category&order=updated_at.desc&limit=${limit}&offset=${offset}`,
      { method: "GET", useService: true }
    );
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    offset += rows.length;
    if (rows.length < limit) break;
  }
  return all;
}

function findDuplicateGroups(rows = []) {
  const groups = new Map(); // key -> item_ids[]
  const byId = new Map();

  for (const row of rows) {
    if (!row?.item_id) continue;
    const id = String(row.item_id);
    byId.set(id, row);
    for (const key of dupeKeysFor(row)) {
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(id);
    }
  }

  const parent = new Map();
  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const ids of groups.values()) {
    if (ids.size < 2) continue;
    const list = [...ids];
    for (let i = 1; i < list.length; i += 1) union(list[0], list[i]);
  }

  const clusters = new Map();
  for (const id of byId.keys()) {
    if (!parent.has(id)) continue;
    const root = find(id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root).add(id);
  }

  const result = [];
  for (const ids of clusters.values()) {
    if (ids.size < 2) continue;
    const members = [...ids].map((id) => byId.get(id)).filter(Boolean);
    members.sort((a, b) => scoreRow(b) - scoreRow(a));
    const keep = members[0];
    const remove = members.slice(1);
    result.push({
      keep: {
        itemId: keep.item_id,
        title: keep.product_name,
        shopName: keep.shop_name || "",
        category: keep.category || "",
        shortLink: !!keep.short_link,
        score: Math.round(scoreRow(keep) * 100) / 100,
      },
      remove: remove.map((r) => ({
        itemId: r.item_id,
        title: r.product_name,
        shopName: r.shop_name || "",
        category: r.category || "",
        shortLink: !!r.short_link,
      })),
      count: members.length,
    });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

async function scanDuplicates({ max = 5000 } = {}) {
  const rows = await listAllOffersLite({ max });
  const groups = findDuplicateGroups(rows);
  const toRemove = groups.reduce((n, g) => n + g.remove.length, 0);
  return {
    scanned: rows.length,
    groups: groups.length,
    toRemove,
    duplicates: groups.slice(0, 50),
  };
}

async function removeDuplicates({ max = 5000, dryRun = false } = {}) {
  const rows = await listAllOffersLite({ max });
  const groups = findDuplicateGroups(rows);
  const ids = [];
  for (const g of groups) {
    for (const r of g.remove) ids.push(r.itemId);
  }
  const uniqueIds = [...new Set(ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned: rows.length,
      groups: groups.length,
      toRemove: uniqueIds.length,
      duplicates: groups.slice(0, 50),
    };
  }

  let removed = 0;
  const CHUNK = 50;
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);
    const n = await deleteOfertasByIds(chunk);
    removed += Number(n) || chunk.length;
  }

  return {
    ok: true,
    dryRun: false,
    scanned: rows.length,
    groups: groups.length,
    removed,
    kept: rows.length - removed,
    duplicates: groups.slice(0, 30),
  };
}

module.exports = {
  scanDuplicates,
  removeDuplicates,
  findDuplicateGroups,
  normalizeText,
  extractItemIdFromUrl,
  canonicalizeProductUrl,
};
