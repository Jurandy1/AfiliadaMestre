"use strict";

const crypto = require("crypto");
const { categoryForKeyword } = require("./categorias");
const { inferSubcategory, extractProductOptions } = require("./productMeta");
const { buildProductSubIds } = require("./tracking");

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

/** listType: 0=Recomendados, 1=Maior comissão, 2=Top performance */
/** sortType: 1=Relevância, 2=Vendidos, 3=Maior preço, 4=Menor preço, 5=Comissão */
const SYNC_ROTATION = [
  { listType: 0, sortType: 2, label: "recomendados_vendidos" },
  { listType: 2, sortType: 2, label: "top_performance" },
  { listType: 1, sortType: 5, label: "maior_comissao" },
];

const MIN_RATING = Number(process.env.SYNC_MIN_RATING) || 4.0;

function getCreds() {
  const appId = (process.env.SHOPEE_APP_ID || "").trim();
  const secret = (process.env.SHOPEE_SECRET || "").trim();
  if (!appId || !secret) {
    const err = new Error("Configure SHOPEE_APP_ID e SHOPEE_SECRET no arquivo .env");
    err.code = "SHOPEE_CREDS_MISSING";
    throw err;
  }
  return { appId, secret };
}

function sign(appId, timestamp, payload, secret) {
  return crypto.createHash("sha256").update(appId + timestamp + payload + secret).digest("hex");
}

async function shopeeGraphql(query, variables) {
  const { appId, secret } = getCreds();
  const bodyObj = variables ? { query, variables } : { query };
  const body = JSON.stringify(bodyObj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign(appId, timestamp, body, secret);

  const res = await fetch(SHOPEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Shopee HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  if (json.errors && json.errors.length) {
    const err = new Error(json.errors[0]?.message || "Erro GraphQL Shopee");
    err.code = json.errors[0]?.extensions?.code;
    err.payload = json;
    throw err;
  }
  return json.data;
}

function parseDiscountPct(discountRaw, priceMin, priceMax) {
  if (discountRaw != null && discountRaw !== "") {
    const n = Number(String(discountRaw).replace("%", ""));
    if (Number.isFinite(n)) return Math.round(n > 1 ? n : n * 100);
  }
  if (priceMax > priceMin && priceMax > 0) {
    return Math.round(((priceMax - priceMin) / priceMax) * 100);
  }
  return 0;
}

function parseCommissionPct(rate) {
  const n = Number(String(rate || "0").replace("%", ""));
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function toUnixSec(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function isFlashActive(periodEnd) {
  const end = toUnixSec(periodEnd);
  if (!end) return false;
  const now = Math.floor(Date.now() / 1000);
  return end > now && end - now < 72 * 3600;
}

function isQualityOffer(node) {
  if (!node || !node.offerLink) return false;
  if (!node.itemId) return false;
  const rating = Number(node.ratingStar);
  if (Number.isFinite(rating) && rating > 0 && rating < MIN_RATING) return false;
  return true;
}

function filterQualityNodes(nodes) {
  return (nodes || []).filter((n) => isQualityOffer(n));
}

/**
 * productOfferV2 — listType 0 é válido (não usar || 1).
 */
async function fetchProductOffers({
  keyword = "",
  limit = 20,
  page = 1,
  sortType = 2,
  listType = 0,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const safeList = [0, 1, 2].includes(Number(listType)) ? Number(listType) : 0;
  const safeSort = [1, 2, 3, 4, 5].includes(Number(sortType)) ? Number(sortType) : 2;
  const kw = String(keyword || "").trim();

  const args = [
    `listType: ${safeList}`,
    `sortType: ${safeSort}`,
    `page: ${safePage}`,
    `limit: ${safeLimit}`,
  ];
  if (kw) args.unshift(`keyword: ${JSON.stringify(kw)}`);

  const query = `{
    productOfferV2(${args.join(", ")}) {
      nodes {
        itemId
        productName
        productLink
        offerLink
        imageUrl
        priceMin
        priceMax
        priceDiscountRate
        sales
        ratingStar
        commissionRate
        sellerCommissionRate
        shopeeCommissionRate
        commission
        shopId
        shopName
        shopType
        periodStartTime
        periodEndTime
      }
      pageInfo { page limit hasNextPage }
    }
  }`;

  const data = await shopeeGraphql(query);
  const result = data?.productOfferV2 || { nodes: [], pageInfo: {} };
  return {
    ...result,
    nodes: filterQualityNodes(result.nodes),
    listType: safeList,
    sortType: safeSort,
  };
}

async function fetchProductDetailsByIds(itemIds = []) {
  const ids = [...new Set(
    itemIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
  )].slice(0, 20);
  if (!ids.length) return [];

  const selections = ids.map((itemId, index) => `
    item${index}: productOfferV2(itemId: ${itemId}, page: 1, limit: 1) {
      nodes {
        itemId
        productName
        imageUrl
      }
    }`).join("\n");
  const data = await shopeeGraphql(`{ ${selections} }`);
  return ids.flatMap((_itemId, index) => data?.[`item${index}`]?.nodes || []);
}

/** Campanhas / coleções oficiais (shopeeOfferV2). */
async function fetchShopeeOffers({ keyword = "", sortType = 1, page = 1, limit = 12 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const safeSort = [1, 2].includes(Number(sortType)) ? Number(sortType) : 1;
  const kw = String(keyword || "").trim();

  const args = [
    `sortType: ${safeSort}`,
    `page: ${safePage}`,
    `limit: ${safeLimit}`,
  ];
  if (kw) args.unshift(`keyword: ${JSON.stringify(kw)}`);

  const query = `{
    shopeeOfferV2(${args.join(", ")}) {
      nodes {
        commissionRate
        imageUrl
        offerLink
        originalLink
        offerName
        offerType
        categoryId
        collectionId
        periodStartTime
        periodEndTime
      }
      pageInfo { page limit hasNextPage }
    }
  }`;

  const data = await shopeeGraphql(query);
  return data?.shopeeOfferV2 || { nodes: [], pageInfo: {} };
}

function mapCampaignNode(node) {
  const rate = parseCommissionPct(node.commissionRate);
  const end = toUnixSec(node.periodEndTime);
  const start = toUnixSec(node.periodStartTime);
  return {
    id: String(node.collectionId || node.categoryId || node.offerName || Math.random()),
    title: normalizeCampaignTitle(node.offerName),
    image: node.imageUrl || "",
    affiliateLink: node.offerLink || node.originalLink || "#",
    offerType: node.offerType,
    categoryId: node.categoryId,
    collectionId: node.collectionId,
    commissionRate: rate ? `${rate.toFixed(1)}%` : "—",
    periodStart: start,
    periodEnd: end,
    isActive: !end || end > Math.floor(Date.now() / 1000),
  };
}

function normalizeCampaignTitle(rawTitle) {
  let title = String(rawTitle || "Ofertas especiais da Shopee")
    .replace(/Afiliados?\s+Gerenciados?\s*[-–—:]?\s*/gi, "")
    .replace(/Comiss[aã]o\s+Especial\s*[^-–—|]*[-–—|]?\s*/gi, "")
    .replace(/\bHealth\b/gi, "Saúde e bem-estar")
    .replace(/\bFashion Accessories\b/gi, "Acessórios femininos")
    .replace(/\bWomen['’]?s Clothing\b/gi, "Moda feminina")
    .replace(/\bBeauty\b/gi, "Beleza")
    .replace(/\bHome\s*&?\s*Living\b/gi, "Casa e decoração")
    .replace(/\bSports?\b/gi, "Esporte e bem-estar")
    .replace(/\s*[-–—|]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!title) title = "Ofertas especiais da Shopee";
  if (!/oferta|desconto|promo|moda|beleza|acessório|saúde|casa|esporte/i.test(title)) {
    title = `Ofertas de ${title}`;
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Relatório real de conversões. Os Sub IDs usados no short link aparecem
 * concatenados no campo utmContent.
 */
async function fetchConversionReport({
  purchaseTimeStart,
  purchaseTimeEnd,
  orderStatus = "",
  limit = 20,
  scrollId = "",
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const start = Math.max(1, Number(purchaseTimeStart) || now - 30 * 24 * 3600);
  const end = Math.max(start, Number(purchaseTimeEnd) || now);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const validStatuses = new Set(["UNPAID", "PENDING", "COMPLETED", "CANCELLED"]);

  const args = [
    `purchaseTimeStart: ${Math.floor(start)}`,
    `purchaseTimeEnd: ${Math.floor(end)}`,
    `limit: ${safeLimit}`,
  ];
  if (validStatuses.has(String(orderStatus).toUpperCase())) {
    args.push(`orderStatus: ${JSON.stringify(String(orderStatus).toUpperCase())}`);
  }
  if (scrollId) args.push(`scrollId: ${JSON.stringify(String(scrollId))}`);

  const query = `{
    conversionReport(${args.join(", ")}) {
      nodes {
        purchaseTime
        clickTime
        conversionId
        totalCommission
        sellerCommission
        shopeeCommissionCapped
        buyerType
        device
        utmContent
        orders {
          orderId
          orderStatus
          items {
            itemId
            itemName
            shopName
            itemPrice
            qty
            itemTotalCommission
            attributionType
          }
        }
      }
      pageInfo {
        limit
        hasNextPage
        scrollId
      }
    }
  }`;

  const data = await shopeeGraphql(query);
  return data?.conversionReport || { nodes: [], pageInfo: {} };
}

async function generateShortLink(originUrl, subIds = ["afiliada_mestre", "site", "vitrine"]) {
  const clean = (Array.isArray(subIds) ? subIds : ["vitrine"])
    .map((s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
  const query = `
    mutation GenerateShortLink($originUrl: String!, $subIds: [String!]) {
      generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
        shortLink
      }
    }
  `;
  const data = await shopeeGraphql(query, { originUrl, subIds: clean.length ? clean : ["vitrine"] });
  return data?.generateShortLink?.shortLink || null;
}

function mapOfferToProduct(node, keyword = "", listType = null) {
  const priceMin = Number(node.priceMin) || 0;
  const priceMax = Number(node.priceMax) || priceMin;
  const discountPct = parseDiscountPct(node.priceDiscountRate, priceMin, priceMax);
  const ratePct = parseCommissionPct(node.commissionRate);
  const periodStart = toUnixSec(node.periodStartTime);
  const periodEnd = toUnixSec(node.periodEndTime);
  const flash = isFlashActive(periodEnd);

  const sales = node.sales != null ? String(node.sales) : "";
  const salesLabel = sales && !/vendid/i.test(sales) ? `${sales} vendidos` : sales;

  const shop = node.shopName ? String(node.shopName).trim() : "";
  const catId = categoryForKeyword(keyword);
  const options = extractProductOptions(node.productName, priceMin, priceMax);
  const descParts = [];
  descParts.push(discountPct > 0 ? `Oferta com ${discountPct}% de desconto` : "Oferta selecionada");
  if (options.hint) descParts.push(options.hint);
  if (salesLabel && salesLabel !== "—") descParts.push(salesLabel);
  descParts.push("confira frete e prazo na Shopee");
  if (shop) descParts.push(`vendido por ${shop}`);
  const desc = descParts.join(" · ") + ".";

  const secondsLeft = flash && periodEnd ? Math.max(0, periodEnd - Math.floor(Date.now() / 1000)) : 0;

  return {
    id: Number(node.itemId) || Date.now(),
    itemId: node.itemId,
    title: node.productName || "Produto Shopee",
    category: catId,
    subcategory: inferSubcategory(catId, keyword, node.productName),
    options,
    oldPrice: priceMax || priceMin,
    newPrice: priceMin,
    discount: discountPct ? `${discountPct}%` : "0%",
    discountPct,
    stars: Number(node.ratingStar) || 4.5,
    reviews: 0,
    sales: salesLabel || "—",
    salesRaw: sales,
    image: node.imageUrl || "",
    affiliateLink: node.offerLink || node.productLink || "#",
    productLink: node.productLink || "",
    shortLink: node.shortLink || node.short_link || null,
    subIds: buildProductSubIds(catId, Number(node.itemId)),
    isFlashSale: flash,
    flashStock: flash ? Math.min(99, Math.max(5, Math.round((secondsLeft / (72 * 3600)) * 100))) : 0,
    periodStart,
    periodEnd,
    listType: listType != null ? listType : (node.listType != null ? Number(node.listType) : null),
    commissionRate: `${ratePct.toFixed(1)}%`,
    sellerCommission: node.sellerCommissionRate || "—",
    shopeeCommission: node.shopeeCommissionRate || "—",
    totalCommission: node.commission != null ? `R$ ${node.commission}` : "—",
    shopName: node.shopName || "",
    shopId: node.shopId,
    keyword: keyword || "",
    desc,
  };
}

function mapOfferToRow(node, keyword = "", listType = null) {
  const priceMin = Number(node.priceMin) || 0;
  const priceMax = Number(node.priceMax) || priceMin;
  const catId = categoryForKeyword(keyword);
  const itemId = Number(node.itemId);
  return {
    item_id: itemId,
    product_name: node.productName || "",
    image_url: node.imageUrl || null,
    price_min: node.priceMin != null ? Number(node.priceMin) : null,
    price_max: node.priceMax != null ? Number(node.priceMax) : null,
    price_discount_rate: node.priceDiscountRate != null ? String(node.priceDiscountRate) : null,
    sales: node.sales != null ? String(node.sales) : null,
    rating_star: node.ratingStar != null ? Number(node.ratingStar) : null,
    commission_rate: node.commissionRate != null ? String(node.commissionRate) : null,
    seller_commission_rate: node.sellerCommissionRate != null ? String(node.sellerCommissionRate) : null,
    shopee_commission_rate: node.shopeeCommissionRate != null ? String(node.shopeeCommissionRate) : null,
    commission: node.commission != null ? String(node.commission) : null,
    offer_link: node.offerLink || null,
    product_link: node.productLink || null,
    shop_id: node.shopId != null ? Number(node.shopId) : null,
    shop_name: node.shopName || null,
    shop_type: node.shopType != null ? Number(node.shopType) : null,
    keyword: keyword || null,
    category: catId,
    subcategory: inferSubcategory(catId, keyword, node.productName),
    product_options: extractProductOptions(node.productName, priceMin, priceMax),
    period_start: toUnixSec(node.periodStartTime),
    period_end: toUnixSec(node.periodEndTime),
    list_type: listType != null ? Number(listType) : null,
    // Identidade de rastreio do produto — gerada no sync, sem depender do clique
    sub_ids: buildProductSubIds(catId, itemId),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchProductOffers,
  fetchProductDetailsByIds,
  fetchShopeeOffers,
  fetchConversionReport,
  generateShortLink,
  mapOfferToProduct,
  mapOfferToRow,
  mapCampaignNode,
  normalizeCampaignTitle,
  filterQualityNodes,
  isQualityOffer,
  isFlashActive,
  toUnixSec,
  getCreds,
  SYNC_ROTATION,
  MIN_RATING,
};
