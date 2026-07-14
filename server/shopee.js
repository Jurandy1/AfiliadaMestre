"use strict";

const crypto = require("crypto");
const { categoryForKeyword } = require("./categorias");

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

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

/**
 * Busca ofertas de produto (productOfferV2).
 */
async function fetchProductOffers({ keyword = "", limit = 20, page = 1, sortType = 5, listType = 1 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const kw = String(keyword || "").trim();

  const args = [
    `listType: ${Number(listType) || 1}`,
    `sortType: ${Number(sortType) || 5}`,
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
  return data?.productOfferV2 || { nodes: [], pageInfo: {} };
}

/**
 * Gera link curto afiliado.
 */
async function generateShortLink(originUrl, subIds = ["vitrine", "afiliado_mestre"]) {
  const query = `
    mutation GenerateShortLink($originUrl: String!, $subIds: [String!]) {
      generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
        shortLink
      }
    }
  `;
  const data = await shopeeGraphql(query, { originUrl, subIds });
  return data?.generateShortLink?.shortLink || null;
}

function mapOfferToProduct(node, keyword = "") {
  const priceMin = Number(node.priceMin) || 0;
  const priceMax = Number(node.priceMax) || priceMin;
  const discountRaw = node.priceDiscountRate;
  let discountPct = 0;
  if (discountRaw != null && discountRaw !== "") {
    const n = Number(String(discountRaw).replace("%", ""));
    discountPct = Number.isFinite(n) ? Math.round(n > 1 ? n : n * 100) : 0;
  } else if (priceMax > priceMin && priceMax > 0) {
    discountPct = Math.round(((priceMax - priceMin) / priceMax) * 100);
  }

  const commissionRateNum = Number(String(node.commissionRate || "0").replace("%", ""));
  const ratePct = Number.isFinite(commissionRateNum)
    ? (commissionRateNum <= 1 ? commissionRateNum * 100 : commissionRateNum)
    : 0;

  const sales = node.sales != null ? String(node.sales) : "";
  const salesLabel = sales && !/vendid/i.test(sales) ? `${sales} vendidos` : sales;

  const shop = node.shopName ? String(node.shopName).trim() : "";
  const descParts = [];
  descParts.push(discountPct > 0 ? `Oferta com ${discountPct}% de desconto` : "Oferta selecionada");
  if (salesLabel && salesLabel !== "—") descParts.push(salesLabel);
  descParts.push("frete grátis para itens elegíveis");
  if (shop) descParts.push(`vendido por ${shop} na Shopee`);
  const desc = descParts.join(" · ") + ".";

  return {
    id: Number(node.itemId) || Date.now(),
    itemId: node.itemId,
    title: node.productName || "Produto Shopee",
    category: categoryForKeyword(keyword),
    oldPrice: priceMax || priceMin,
    newPrice: priceMin,
    discount: discountPct ? `${discountPct}%` : "0%",
    stars: Number(node.ratingStar) || 4.5,
    reviews: 0,
    sales: salesLabel || "—",
    image: node.imageUrl || "",
    affiliateLink: node.offerLink || node.productLink || "#",
    productLink: node.productLink || "",
    isFlashSale: discountPct >= 40,
    flashStock: discountPct >= 40 ? Math.min(99, 20 + discountPct) : 0,
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

function mapOfferToRow(node, keyword = "") {
  return {
    item_id: Number(node.itemId),
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
    category: categoryForKeyword(keyword),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchProductOffers,
  generateShortLink,
  mapOfferToProduct,
  mapOfferToRow,
  getCreds,
};
