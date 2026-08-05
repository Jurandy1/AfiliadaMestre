"use strict";

/**
 * Detecta e remove produtos duplicados na vitrine.
 * Critérios (mesmo grupo = duplicata):
 *  1) mesmo shop_id + nome normalizado
 *  2) mesmo item_id embutido no product_link / offer_link (quando diferente do PK — raro)
 *  3) mesma image_url + prefixo do nome (quando sem shop_id)
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

function extractItemIdFromUrl(url) {
  const s = String(url || "");
  const m = s.match(/(?:i\.|product\/|item[_-]?id[=/.-])(\d{6,})/i)
    || s.match(/\.(\d{8,})(?:\?|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
  const shopId = row.shop_id != null ? Number(row.shop_id) : null;
  const img = String(row.image_url || "").split("?")[0].trim();

  if (shopId && name.length >= 12) {
    keys.push(`shop:${shopId}|name:${name}`);
  }
  const fromProduct = extractItemIdFromUrl(row.product_link);
  const fromOffer = extractItemIdFromUrl(row.offer_link);
  if (fromProduct && fromProduct !== Number(row.item_id)) {
    keys.push(`urlitem:${fromProduct}`);
  }
  if (fromOffer && fromOffer !== Number(row.item_id) && fromOffer !== fromProduct) {
    keys.push(`urlitem:${fromOffer}`);
  }
  if (!shopId && img && name.length >= 16) {
    const prefix = name.split(" ").slice(0, 6).join(" ");
    keys.push(`img:${img}|name:${prefix}`);
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
    byId.set(String(row.item_id), row);
    for (const key of dupeKeysFor(row)) {
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(String(row.item_id));
    }
  }

  // Merge overlapping groups (union-find lite)
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
};
