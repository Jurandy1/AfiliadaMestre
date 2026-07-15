"use strict";

const { isFlashActive, toUnixSec } = require("./shopee");

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

async function upsertOfertas(rows) {
  if (!rows?.length) return [];
  const cleaned = rows.map((r) => {
    const copy = { ...r };
    if (copy.short_link == null) delete copy.short_link;
    return copy;
  });
  try {
    return await supabaseRequest("/ofertas", {
      method: "POST",
      body: cleaned,
      prefer: "resolution=merge-duplicates,return=representation",
      useService: true,
    });
  } catch (err) {
    // Schema antigo (sem period_*/list_type/short_link) — grava o essencial.
    const msg = String(err.message || "");
    if (/period_start|period_end|list_type|short_link|schema cache|PGRST/i.test(msg)) {
      const legacy = cleaned.map((r) => {
        const {
          period_start, period_end, list_type, short_link, ...rest
        } = r;
        return rest;
      });
      return supabaseRequest("/ofertas", {
        method: "POST",
        body: legacy,
        prefer: "resolution=merge-duplicates,return=representation",
        useService: true,
      });
    }
    throw err;
  }
}

async function updateShortLink(itemId, shortLink) {
  if (!itemId || !shortLink) return null;
  try {
    return await supabaseRequest(`/ofertas?item_id=eq.${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: { short_link: shortLink },
      prefer: "return=representation",
      useService: true,
    });
  } catch (err) {
    console.warn("[updateShortLink] cache indisponível (rode migration):", err.message);
    return null;
  }
}

async function listOfertas({ limit = 60, offset = 0, keyword = "", category = "", sort = "recent" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  function buildPath(order) {
    let path = `/ofertas?select=*&order=${order}&limit=${safeLimit}&offset=${safeOffset}`;
    const kw = String(keyword || "").trim();
    const cat = String(category || "").trim();
    if (cat && cat !== "todos") {
      path += `&category=eq.${encodeURIComponent(cat)}`;
    }
    if (kw) {
      path += `&or=(product_name.ilike.*${encodeURIComponent(kw)}*,keyword.ilike.*${encodeURIComponent(kw)}*)`;
    }
    return path;
  }

  let order = "updated_at.desc";
  if (sort === "sales") order = "sales.desc.nullslast,updated_at.desc";
  else if (sort === "discount") order = "price_discount_rate.desc.nullslast,updated_at.desc";
  else if (sort === "rating") order = "rating_star.desc.nullslast,updated_at.desc";
  else if (sort === "ending") order = "period_end.asc.nullslast,updated_at.desc";

  try {
    return await supabaseRequest(buildPath(order), { method: "GET", useService: true });
  } catch (err) {
    // Coluna period_end pode ainda não existir
    if (sort === "ending") {
      return supabaseRequest(buildPath("updated_at.desc"), { method: "GET", useService: true });
    }
    throw err;
  }
}

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

async function countOfertas() {
  const counts = await countByCategory();
  return counts.total || 0;
}

function parseDiscountFromRow(row) {
  const priceMin = Number(row.price_min) || 0;
  const priceMax = Number(row.price_max) || priceMin;
  if (row.price_discount_rate != null && row.price_discount_rate !== "") {
    const n = Number(String(row.price_discount_rate).replace("%", ""));
    if (Number.isFinite(n)) return Math.round(n > 1 ? n : n * 100);
  }
  if (priceMax > priceMin && priceMax > 0) {
    return Math.round(((priceMax - priceMin) / priceMax) * 100);
  }
  return 0;
}

function rowToProduct(row) {
  const priceMin = Number(row.price_min) || 0;
  const priceMax = Number(row.price_max) || priceMin;
  const discountPct = parseDiscountFromRow(row);
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
  descParts.push("confira frete e prazo na Shopee");
  if (shop) descParts.push(`vendido por ${shop}`);
  const desc = descParts.join(" · ") + ".";

  const periodStart = toUnixSec(row.period_start);
  const periodEnd = toUnixSec(row.period_end);
  const flash = isFlashActive(periodEnd);
  const secondsLeft = flash && periodEnd ? Math.max(0, periodEnd - Math.floor(Date.now() / 1000)) : 0;

  return {
    id: Number(row.item_id),
    itemId: row.item_id,
    title: row.product_name || "Produto",
    category: row.category || "todos",
    oldPrice: priceMax || priceMin,
    newPrice: priceMin,
    discount: discountPct ? `${discountPct}%` : "0%",
    discountPct,
    stars: Number(row.rating_star) || 4.5,
    reviews: 0,
    sales: salesLabel || "—",
    salesRaw: sales,
    image: row.image_url || "",
    affiliateLink: row.offer_link || row.product_link || "#",
    productLink: row.product_link || "",
    shortLink: row.short_link || null,
    isFlashSale: flash,
    flashStock: flash ? Math.min(99, Math.max(5, Math.round((secondsLeft / (72 * 3600)) * 100))) : 0,
    periodStart,
    periodEnd,
    listType: row.list_type != null ? Number(row.list_type) : null,
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
  updateShortLink,
  listOfertas,
  countByCategory,
  countOfertas,
  pruneOlderThan,
  rowToProduct,
};
