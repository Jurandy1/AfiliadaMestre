"use strict";

function getConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url) {
    const err = new Error("Configure SUPABASE_URL no .env");
    err.code = "SUPABASE_MISSING";
    throw err;
  }
  return { url, serviceKey, anonKey, rest: `${url}/rest/v1` };
}

async function supabaseRequest(path, { method = "GET", body, prefer, useService = true } = {}) {
  const { rest, serviceKey, anonKey } = getConfig();
  const key = useService ? serviceKey : anonKey;
  if (!key) {
    const err = new Error(useService ? "Configure SUPABASE_SERVICE_KEY no .env" : "Configure SUPABASE_ANON_KEY no .env");
    err.code = "SUPABASE_MISSING";
    throw err;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${rest}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`Supabase HTTP ${res.status}: ${typeof json === "object" ? JSON.stringify(json) : text}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

/** Upsert em lote na tabela ofertas */
async function upsertOfertas(rows) {
  if (!rows?.length) return [];
  return supabaseRequest("/ofertas", {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
    useService: true,
  });
}

/** Lista ofertas do banco (mais recentes) */
async function listOfertas({ limit = 60, offset = 0, keyword = "", category = "" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  let path = `/ofertas?select=*&order=updated_at.desc&limit=${safeLimit}&offset=${safeOffset}`;
  const kw = String(keyword || "").trim();
  const cat = String(category || "").trim();
  if (cat && cat !== "todos") {
    path += `&category=eq.${encodeURIComponent(cat)}`;
  }
  if (kw) {
    path += `&or=(product_name.ilike.*${encodeURIComponent(kw)}*,keyword.ilike.*${encodeURIComponent(kw)}*)`;
  }
  return supabaseRequest(path, { method: "GET", useService: true });
}

/** Conta ofertas por categoria (agrupamento no cliente, sem RPC) */
async function countByCategory() {
  const rows = await supabaseRequest(
    "/ofertas?select=category&limit=5000",
    { method: "GET", useService: true }
  );
  const counts = {};
  for (const r of rows || []) {
    const c = r.category || "todos";
    counts[c] = (counts[c] || 0) + 1;
  }
  counts.total = (rows || []).length;
  return counts;
}

/** Remove ofertas não atualizadas há mais de X dias (mantém o banco enxuto no free tier) */
async function pruneOlderThan(days = 60) {
  const d = Number(days) || 60;
  const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
  const path = `/ofertas?updated_at=lt.${encodeURIComponent(cutoff)}`;
  const removed = await supabaseRequest(path, {
    method: "DELETE",
    prefer: "return=representation",
    useService: true,
  });
  return Array.isArray(removed) ? removed.length : 0;
}

/** Conta total de linhas na tabela ofertas (via header Content-Range) */
async function countOfertas() {
  const counts = await countByCategory();
  return counts.total || 0;
}

function rowToProduct(row) {
  const priceMin = Number(row.price_min) || 0;
  const priceMax = Number(row.price_max) || priceMin;
  let discountPct = 0;
  if (row.price_discount_rate != null && row.price_discount_rate !== "") {
    const n = Number(String(row.price_discount_rate).replace("%", ""));
    discountPct = Number.isFinite(n) ? Math.round(n > 1 ? n : n * 100) : 0;
  } else if (priceMax > priceMin && priceMax > 0) {
    discountPct = Math.round(((priceMax - priceMin) / priceMax) * 100);
  }
  const commissionRateNum = Number(String(row.commission_rate || "0").replace("%", ""));
  const ratePct = Number.isFinite(commissionRateNum)
    ? (commissionRateNum <= 1 ? commissionRateNum * 100 : commissionRateNum)
    : 0;
  const sales = row.sales != null ? String(row.sales) : "";
  const salesLabel = sales && !/vendid/i.test(sales) ? `${sales} vendidos` : sales;

  const shop = row.shop_name ? String(row.shop_name).trim() : "";
  const descParts = [];
  if (discountPct > 0) descParts.push(`Oferta com ${discountPct}% de desconto`);
  else descParts.push("Oferta selecionada");
  if (salesLabel && salesLabel !== "—") descParts.push(`${salesLabel}`);
  descParts.push("frete grátis para itens elegíveis");
  if (shop) descParts.push(`vendido por ${shop} na Shopee`);
  const desc = descParts.join(" · ") + ".";

  return {
    id: Number(row.item_id),
    itemId: row.item_id,
    title: row.product_name || "Produto",
    category: row.category || "todos",
    oldPrice: priceMax || priceMin,
    newPrice: priceMin,
    discount: discountPct ? `${discountPct}%` : "0%",
    stars: Number(row.rating_star) || 4.5,
    reviews: 0,
    sales: salesLabel || "—",
    image: row.image_url || "",
    affiliateLink: row.offer_link || row.product_link || "#",
    productLink: row.product_link || "",
    isFlashSale: discountPct >= 40,
    flashStock: discountPct >= 40 ? Math.min(99, 20 + discountPct) : 0,
    commissionRate: `${ratePct.toFixed(1)}%`,
    sellerCommission: row.seller_commission_rate || "—",
    shopeeCommission: row.shopee_commission_rate || "—",
    totalCommission: row.commission != null ? `R$ ${row.commission}` : "—",
    shopName: row.shop_name || "",
    shopId: row.shop_id,
    keyword: row.keyword || "",
    desc,
  };
}

module.exports = {
  getConfig,
  upsertOfertas,
  listOfertas,
  countByCategory,
  countOfertas,
  pruneOlderThan,
  rowToProduct,
};
