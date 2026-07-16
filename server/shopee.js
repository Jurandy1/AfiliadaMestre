"use strict";

const crypto = require("crypto");
const { extractProductOptions, resolveTaxonomy } = require("./productMeta");
const { buildProductSubIds } = require("./tracking");

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

/** listType: 0=Recomendados, 1=Maior comissão, 2=Top performance */
/** sortType: 1=Relevância, 2=Vendidos, 3=Maior preço, 4=Menor preço, 5=Comissão */
const LIST_TYPE_LABELS = {
  0: "Recomendados",
  1: "Maior comissão",
  2: "Top performance",
};

const SORT_TYPE_LABELS = {
  1: "Relevância",
  2: "Mais vendidos",
  3: "Maior preço",
  4: "Menor preço",
  5: "Maior comissão",
};

const SYNC_ROTATION = [
  { listType: 0, sortType: 2, label: "recomendados_vendidos", listTypeLabel: LIST_TYPE_LABELS[0], sortTypeLabel: SORT_TYPE_LABELS[2] },
  { listType: 2, sortType: 2, label: "top_performance", listTypeLabel: LIST_TYPE_LABELS[2], sortTypeLabel: SORT_TYPE_LABELS[2] },
  { listType: 1, sortType: 5, label: "maior_comissao", listTypeLabel: LIST_TYPE_LABELS[1], sortTypeLabel: SORT_TYPE_LABELS[5] },
];

const MIN_RATING = Number(process.env.SYNC_MIN_RATING) || 4.0;
const DEFAULT_BATCH_GAP_MS = clampNum(process.env.SHOPEE_BATCH_GAP_MS, 350, 100, 5000);

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function listTypeLabel(listType) {
  const n = Number(listType);
  return LIST_TYPE_LABELS[n] || LIST_TYPE_LABELS[0];
}

function sortTypeLabel(sortType) {
  const n = Number(sortType);
  return SORT_TYPE_LABELS[n] || SORT_TYPE_LABELS[2];
}

/** Converte "1.2k", "12 mil", "1.234", "500+" em número aproximado. */
function parseSalesCount(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/vendid[oa]s?/g, "").replace(/\+/g, "").trim();
  const milMatch = s.match(/^([\d.,]+)\s*mil\b/);
  if (milMatch) {
    const n = Number(milMatch[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  }
  const kMatch = s.match(/^([\d.,]+)\s*k\b/);
  if (kMatch) {
    const n = Number(kMatch[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  }
  const mMatch = s.match(/^([\d.,]+)\s*m\b/);
  if (mMatch) {
    const n = Number(mMatch[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
  }
  const digits = s.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function isRateLimitError(status, message) {
  if (status === 429) return true;
  const msg = String(message || "").toLowerCase();
  return /rate.?limit|too many|quota|throttl/i.test(msg);
}

async function shopeeGraphql(query, variables, { retries = 3 } = {}) {
  const { appId, secret } = getCreds();
  const bodyObj = variables ? { query, variables } : { query };
  const body = JSON.stringify(bodyObj);

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = sign(appId, timestamp, body, secret);

    let res;
    let json = {};
    try {
      res = await fetch(SHOPEE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
        },
        body,
      });
      json = await res.json().catch(() => ({}));
    } catch (netErr) {
      lastErr = netErr;
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
        continue;
      }
      throw netErr;
    }

    if (!res.ok) {
      const err = new Error(`Shopee HTTP ${res.status}`);
      err.status = res.status;
      err.payload = json;
      err.rateLimited = isRateLimitError(res.status, json?.message || json?.error);
      if (err.rateLimited && attempt < retries) {
        lastErr = err;
        await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
        continue;
      }
      throw err;
    }
    if (json.errors && json.errors.length) {
      const msg = json.errors[0]?.message || "Erro GraphQL Shopee";
      const err = new Error(msg);
      err.code = json.errors[0]?.extensions?.code;
      err.payload = json;
      err.rateLimited = isRateLimitError(null, msg);
      if (err.rateLimited && attempt < retries) {
        lastErr = err;
        await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
        continue;
      }
      throw err;
    }
    return json.data;
  }
  throw lastErr || new Error("Shopee GraphQL falhou após retries");
}

/** Desconto bruto; displayDiscountPct aplica cap de confiança (85%). */
function parseDiscountPct(discountRaw, priceMin, priceMax) {
  let raw = 0;
  if (discountRaw != null && discountRaw !== "") {
    const n = Number(String(discountRaw).replace("%", ""));
    if (Number.isFinite(n)) raw = Math.round(n > 1 ? n : n * 100);
  } else if (priceMax > priceMin && priceMax > 0) {
    raw = Math.round(((priceMax - priceMin) / priceMax) * 100);
  }
  return Math.max(0, raw);
}

function displayDiscountPct(discountRaw, priceMin, priceMax) {
  const raw = parseDiscountPct(discountRaw, priceMin, priceMax);
  if (raw < 5) return 0;
  return Math.min(raw, 85);
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

function isFlashActive(periodEnd, windowHours = 24) {
  const end = toUnixSec(periodEnd);
  if (!end) return false;
  const now = Math.floor(Date.now() / 1000);
  const hours = Number(windowHours) > 0 ? Number(windowHours) : 24;
  return end > now && end - now < hours * 3600;
}

function normalizeQualityFilters({
  minRating = MIN_RATING,
  minSales = 0,
  requireCommission = false,
} = {}) {
  const rating = Number(minRating);
  const sales = Number(minSales);
  return {
    minRating: Number.isFinite(rating) && rating > 0 ? rating : MIN_RATING,
    minSales: Number.isFinite(sales) && sales > 0 ? sales : 0,
    requireCommission: !!requireCommission,
  };
}

function isQualityOffer(node, filters = {}) {
  if (!node || !node.offerLink) return false;
  if (!node.itemId) return false;
  const { minRating, minSales, requireCommission } = normalizeQualityFilters(filters);
  const rating = Number(node.ratingStar);
  if (Number.isFinite(rating) && rating > 0 && rating < minRating) return false;
  if (minSales > 0 && parseSalesCount(node.sales) < minSales) return false;
  if (requireCommission) {
    const rate = parseCommissionPct(node.commissionRate);
    const commissionVal = Number(node.commission);
    if (!(rate > 0 || (Number.isFinite(commissionVal) && commissionVal > 0))) return false;
  }
  return true;
}

function filterQualityNodes(nodes, filters = {}) {
  const list = nodes || [];
  const kept = list.filter((n) => isQualityOffer(n, filters));
  return { nodes: kept, filteredOut: Math.max(0, list.length - kept.length) };
}

/**
 * productOfferV2 — listType 0 é válido (não usar || 1).
 * filters: { minRating, minSales, requireCommission }
 */
async function fetchProductOffers({
  keyword = "",
  limit = 20,
  page = 1,
  sortType = 2,
  listType = 0,
  minRating,
  minSales,
  requireCommission,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const safeList = [0, 1, 2].includes(Number(listType)) ? Number(listType) : 0;
  const safeSort = [1, 2, 3, 4, 5].includes(Number(sortType)) ? Number(sortType) : 2;
  const kw = String(keyword || "").trim();
  const filters = normalizeQualityFilters({ minRating, minSales, requireCommission });

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
  const { nodes, filteredOut } = filterQualityNodes(result.nodes, filters);
  const pageInfo = result.pageInfo || {};
  return {
    ...result,
    nodes,
    filteredOut,
    rawCount: (result.nodes || []).length,
    pageInfo,
    hasNextPage: !!pageInfo.hasNextPage,
    listType: safeList,
    sortType: safeSort,
    listTypeLabel: listTypeLabel(safeList),
    sortTypeLabel: sortTypeLabel(safeSort),
    filters,
  };
}

/**
 * Busca várias keywords × páginas com delay entre chamadas (rate-limit friendly).
 * Deduplica por itemId. onProgress({ done, total, keyword, page, count }) opcional.
 */
async function fetchProductOffersBatch({
  keywords = [],
  pages = 1,
  pageStart = 1,
  limit = 20,
  listType = 0,
  sortType = 2,
  minRating,
  minSales,
  requireCommission,
  gapMs = DEFAULT_BATCH_GAP_MS,
  onProgress,
  signal,
} = {}) {
  const kws = [...new Set(
    (Array.isArray(keywords) ? keywords : String(keywords || "").split(/[\n,;]+/))
      .map((k) => String(k || "").trim())
      .filter(Boolean)
  )].slice(0, 40);
  const start = Math.max(1, Number(pageStart) || 1);
  const pageCount = Math.min(Math.max(Number(pages) || 1, 1), 10);
  const pageNums = Array.from({ length: pageCount }, (_, i) => start + i);
  const total = Math.max(1, kws.length * pageNums.length);
  const byId = new Map();
  const report = [];
  let filteredOut = 0;
  let done = 0;
  let hasNextPage = false;
  let lastListType = listType;
  let lastSortType = sortType;

  for (const keyword of kws) {
    for (const page of pageNums) {
      if (signal?.aborted) {
        return {
          aborted: true,
          keywords: kws,
          pages: pageNums,
          count: byId.size,
          filteredOut,
          hasNextPage,
          listType: lastListType,
          sortType: lastSortType,
          listTypeLabel: listTypeLabel(lastListType),
          sortTypeLabel: sortTypeLabel(lastSortType),
          report,
          products: [...byId.values()],
          nodes: [...byId.values()].map((p) => p._node).filter(Boolean),
        };
      }
      try {
        const offer = await fetchProductOffers({
          keyword,
          limit,
          page,
          listType,
          sortType,
          minRating,
          minSales,
          requireCommission,
        });
        lastListType = offer.listType;
        lastSortType = offer.sortType;
        filteredOut += offer.filteredOut || 0;
        if (offer.hasNextPage) hasNextPage = true;
        const nodes = offer.nodes || [];
        let added = 0;
        for (const n of nodes) {
          const id = String(n.itemId);
          if (!id || byId.has(id)) continue;
          const product = mapOfferToProduct(n, keyword, offer.listType);
          product._node = n;
          byId.set(id, product);
          added += 1;
        }
        report.push({
          keyword,
          page,
          ok: true,
          count: nodes.length,
          added,
          filteredOut: offer.filteredOut || 0,
          hasNextPage: !!offer.hasNextPage,
        });
      } catch (e) {
        report.push({
          keyword,
          page,
          ok: false,
          error: e.message,
          code: e.code || null,
          status: e.status || null,
        });
      }
      done += 1;
      if (typeof onProgress === "function") {
        try {
          onProgress({ done, total, keyword, page, count: byId.size, filteredOut });
        } catch (_) {}
      }
      if (done < total) await sleep(gapMs);
    }
  }

  const products = [...byId.values()].map((p) => {
    const { _node, ...rest } = p;
    return rest;
  });
  const nodes = [...byId.values()].map((p) => p._node).filter(Boolean);

  return {
    aborted: false,
    keywords: kws,
    pages: pageNums,
    count: products.length,
    filteredOut,
    hasNextPage,
    listType: Number(lastListType),
    sortType: Number(lastSortType),
    listTypeLabel: listTypeLabel(lastListType),
    sortTypeLabel: sortTypeLabel(lastSortType),
    report,
    products,
    nodes,
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
        priceMin
        priceMax
        priceDiscountRate
        sales
        ratingStar
        commissionRate
        sellerCommissionRate
        shopeeCommissionRate
        commission
        offerLink
        productLink
        shopId
        shopName
        shopType
        periodStartTime
        periodEndTime
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

async function generateShortLink(originUrl, subIds = null) {
  const { SITE_SUBID, buildProductSubIds } = require("./tracking");
  const fallback = buildProductSubIds("geral", null);
  const clean = (Array.isArray(subIds) && subIds.length ? subIds : fallback)
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
  const data = await shopeeGraphql(query, {
    originUrl,
    subIds: clean.length ? clean : [SITE_SUBID, "organico", "vitrine", "geral", "produto"],
  });
  return data?.generateShortLink?.shortLink || null;
}

function mapOfferToProduct(node, keyword = "", listType = null, taxonomyOpts = null) {
  const priceMin = Number(node.priceMin) || 0;
  const priceMax = Number(node.priceMax) || priceMin;
  const discountPct = displayDiscountPct(node.priceDiscountRate, priceMin, priceMax);
  const ratePct = parseCommissionPct(node.commissionRate);
  const periodStart = toUnixSec(node.periodStartTime);
  const periodEnd = toUnixSec(node.periodEndTime);
  const flash = isFlashActive(periodEnd);

  const sales = node.sales != null ? String(node.sales) : "";
  const salesLabel = sales && !/vendid/i.test(sales) ? `${sales} vendidos` : sales;

  const shop = node.shopName ? String(node.shopName).trim() : "";
  const tax = resolveTaxonomy(keyword, node.productName, taxonomyOpts || {});
  const catId = tax.category;
  const subId = tax.subcategory;
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
    subcategory: subId,
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
    subIds: buildProductSubIds(catId, Number(node.itemId), subId),
    isFlashSale: flash,
    flashStock: flash ? Math.min(99, Math.max(5, Math.round((secondsLeft / (24 * 3600)) * 100))) : 0,
    periodStart,
    periodEnd,
    listType: listType != null ? listType : (node.listType != null ? Number(node.listType) : null),
    commissionRate: `${ratePct.toFixed(1)}%`,
    sellerCommission: node.sellerCommissionRate || "—",
    shopeeCommission: node.shopeeCommissionRate || "—",
    totalCommission: node.commission != null ? `R$ ${node.commission}` : "—",
    shopName: node.shopName || "",
    shopId: node.shopId,
    shopType: node.shopType != null ? Number(node.shopType) : null,
    keyword: keyword || "",
    taxonomySource: tax.source || null,
    desc,
  };
}

function mapOfferToRow(node, keyword = "", listType = null, taxonomyOpts = null) {
  const priceMin = Number(node.priceMin) || 0;
  const priceMax = Number(node.priceMax) || priceMin;
  const tax = resolveTaxonomy(keyword, node.productName, taxonomyOpts || {});
  const catId = tax.category;
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
    subcategory: tax.subcategory,
    product_options: extractProductOptions(node.productName, priceMin, priceMax),
    period_start: toUnixSec(node.periodStartTime),
    period_end: toUnixSec(node.periodEndTime),
    list_type: listType != null ? Number(listType) : null,
    sub_ids: buildProductSubIds(catId, itemId, tax.subcategory),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchProductOffers,
  fetchProductOffersBatch,
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
  parseSalesCount,
  parseDiscountPct,
  displayDiscountPct,
  parseCommissionPct,
  listTypeLabel,
  sortTypeLabel,
  getCreds,
  SYNC_ROTATION,
  LIST_TYPE_LABELS,
  SORT_TYPE_LABELS,
  MIN_RATING,
  DEFAULT_BATCH_GAP_MS,
};
