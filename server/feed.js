"use strict";

/**
 * Ingestão em massa — Shopee Item Feeds (FULL diário + DELTA horário).
 *
 * Muito mais barato que sync por keyword:
 *   productOfferV2: 1 request / 20 produtos
 *   getItemFeedData: 1 request / 500 produtos + já vem filtrado por categoria/loja aprovada.
 */

const crypto = require("crypto");
const { resolveTaxonomy } = require("./productMeta");
const { buildProductSubIds, SITE_SUBID } = require("./tracking");

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function sign(appId, timestamp, payload, secret) {
  return crypto.createHash("sha256").update(appId + timestamp + payload + secret).digest("hex");
}

async function shopeeGraphql(query, variables = null) {
  // Reusa a mesma auth do módulo shopee.js (evita reimplementar retry)
  const { getCreds } = require("./shopee");
  const { appId, secret } = getCreds();
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(variables ? { query, variables } : { query });
  const signature = sign(appId, timestamp, payload, secret);
  const res = await fetch(SHOPEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.errors) {
    const err = new Error(data.errors?.[0]?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    err.rateLimited = res.status === 429 || /rate|quota|throttle/i.test(err.message || "");
    throw err;
  }
  return data.data || {};
}

async function listItemFeeds(feedMode = null) {
  const args = feedMode ? `(feedMode: ${feedMode})` : "";
  const query = `{
    listItemFeeds${args} {
      feeds {
        datafeedId
        referenceId
        datafeedName
        description
        totalCount
        date
        feedMode
      }
    }
  }`;
  const data = await shopeeGraphql(query);
  return data?.listItemFeeds?.feeds || [];
}

async function getItemFeedData({ datafeedId, offset = 0, limit = 500 }) {
  if (!datafeedId) {
    const err = new Error("datafeedId obrigatório");
    err.status = 400;
    throw err;
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const query = `{
    getItemFeedData(datafeedId: ${JSON.stringify(String(datafeedId))}, offset: ${safeOffset}, limit: ${safeLimit}) {
      rows {
        columns
        updateType
      }
      pageInfo {
        offset
        limit
        totalCount
        hasMore
      }
    }
  }`;
  const data = await shopeeGraphql(query);
  return data?.getItemFeedData || { rows: [], pageInfo: { hasMore: false } };
}

/**
 * columnsJsonToRow(columnsStr, updateType) — converte 1 linha do feed
 * pro shape esperado por upsertOfertas. columns vem como string JSON
 * de pares { column_name: value }.
 *
 * Campos comuns do feed (podem variar por país/versão):
 *   item_id, product_name, image_url, product_link, offer_link
 *   price, price_min, price_max, price_discount_rate, sales, rating_star
 *   commission_rate, seller_commission_rate, shopee_commission_rate
 *   shop_id, shop_name, shop_type, category_l1_name, category_l2_name
 *   period_start_time, period_end_time
 */
function columnsJsonToRow(columnsStr, updateType = "NEW") {
  let cols;
  try {
    cols = typeof columnsStr === "string" ? JSON.parse(columnsStr) : columnsStr;
  } catch (_) {
    return null;
  }
  if (!cols || typeof cols !== "object") return null;

  const pick = (...names) => {
    for (const n of names) {
      const v = cols[n] ?? cols[n?.toLowerCase()] ?? cols[n?.toUpperCase()];
      if (v != null && v !== "") return v;
    }
    return null;
  };
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v) => (v == null || v === "" ? null : String(v));

  const itemId = num(pick("item_id", "itemId", "productId"));
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return null;

  const productName = str(pick("product_name", "productName", "title", "name"));
  const category = str(pick("category_l1_name", "categoryL1Name", "category", "categoryName")) || null;
  const subcategory = str(pick("category_l2_name", "categoryL2Name", "subcategory")) || null;

  // Taxonomia (mapear pra nossas categorias fixas) — se não tiver, usa "todos"
  const tax = resolveTaxonomy("", productName, {
    forceCategory: category || null,
    forceSubcategory: subcategory || null,
  });
  const catId = tax.category || "todos";
  const subId = tax.subcategory || null;

  const priceMin = num(pick("price_min", "priceMin", "min_price", "price")) || 0;
  const priceMax = num(pick("price_max", "priceMax", "max_price", "price")) || priceMin;
  const shopId = num(pick("shop_id", "shopId"));
  const offerLink = str(pick("offer_link", "offerLink", "affiliate_link"));
  const productLinkRaw = str(pick("product_link", "productLink", "url"));
  const productLink = productLinkRaw
    || (Number.isSafeInteger(shopId) && shopId > 0
        ? `https://shopee.com.br/product/${shopId}/${itemId}`
        : null);

  return {
    item_id: itemId,
    product_name: productName || "",
    image_url: str(pick("image_url", "imageUrl", "image", "picture")),
    price_min: priceMin || null,
    price_max: priceMax || null,
    price_discount_rate: str(pick("price_discount_rate", "priceDiscountRate", "discount")),
    sales: str(pick("sales", "sold_count", "soldCount", "monthly_sold_count")),
    rating_star: num(pick("rating_star", "ratingStar", "rating")),
    commission_rate: str(pick("commission_rate", "commissionRate")),
    seller_commission_rate: str(pick("seller_commission_rate", "sellerCommissionRate")),
    shopee_commission_rate: str(pick("shopee_commission_rate", "shopeeCommissionRate")),
    commission: str(pick("commission")),
    offer_link: offerLink,
    product_link: productLink,
    shop_id: shopId,
    shop_name: str(pick("shop_name", "shopName")),
    shop_type: num(pick("shop_type", "shopType")),
    keyword: "feed",
    category: catId,
    subcategory: subId,
    period_start: num(pick("period_start_time", "periodStartTime")),
    period_end: num(pick("period_end_time", "periodEndTime")),
    list_type: null,
    sub_ids: buildProductSubIds(catId, itemId, subId), // já com SITE_SUBID no slot 1
    sales_verified_at: new Date().toISOString(), // feed é fonte primária → verificado
    updated_at: new Date().toISOString(),
    _feedUpdateType: String(updateType || "NEW").toUpperCase(),
  };
}

function pickLatestFeed(feeds = [], mode = "FULL") {
  const wanted = String(mode).toUpperCase();
  const filtered = (Array.isArray(feeds) ? feeds : []).filter(
    (f) => String(f.feedMode || "").toUpperCase() === wanted
  );
  if (!filtered.length) return null;
  return filtered.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
}

module.exports = {
  listItemFeeds,
  getItemFeedData,
  columnsJsonToRow,
  pickLatestFeed,
  sleep,
};
