"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const {
  fetchProductOffers,
  fetchProductOffersBatch,
  fetchProductDetailsByIds,
  fetchShopeeOffers,
  generateShortLink,
  mapOfferToProduct,
  mapOfferToRow,
  mapCampaignNode,
  fetchConversionReport,
  listTypeLabel,
  sortTypeLabel,
  LIST_TYPE_LABELS,
  SORT_TYPE_LABELS,
  MIN_RATING,
  DEFAULT_BATCH_GAP_MS,
} = require("./shopee");
const {
  upsertOfertas,
  updateShortLink,
  listOfertas,
  getOffersByItemIds,
  countByCategory,
  countBySubcategory,
  rowToProduct,
  getConfig,
  listCampanhasRastreio,
  upsertCampanhaRastreio,
  deleteCampanhaRastreio,
  patchOferta,
  deleteOfertasByIds,
} = require("./supabase");
const { CATEGORIAS, categoryForKeyword, weightedKeywords, allKeywords, metaOnly } = require("./categorias");
const { refillVitrine } = require("./refillVitrine");
const { productMatchesSubcategory } = require("./productMeta");
const { SITE_SUBID, buildProductSubIds } = require("./tracking");
const autosync = require("./autosync");

const app = express();
const PORT = Number(process.env.PORT) || 3789;
const ROOT = path.join(__dirname, "..");
const VITRINE_HTML = path.join(ROOT, "uploads", "painel_e_vitrine_afiliado_mestre.html");
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/** Protege rotas de escrita do admin. Se ADMIN_TOKEN não estiver no .env, libera (dev local). */
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const header = String(req.headers["x-admin-token"] || "").trim();
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const token = header || bearer || String(req.query.adminToken || "").trim();
  if (token && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: "Não autorizado. Configure ADMIN_TOKEN e envie X-Admin-Token.", code: "ADMIN_AUTH" });
}

function sendVitrine(_req, res) {
  res.sendFile(VITRINE_HTML);
}

// Cache leve em memória para campanhas (reduz hits Shopee/Vercel)
let campaignsCache = { at: 0, data: null };
const CAMPAIGNS_TTL_MS = 30 * 60 * 1000;

// Cache em memória para categorias (contagens Supabase) — reduz drasticamente
// o tempo de resposta ao abrir o app e ao trocar categoria no mobile.
let categoriasCache = { at: 0, data: null };
const CATEGORIAS_TTL_MS = 5 * 60 * 1000;

// Cache pequeno para /api/ofertas/db, indexado pela query string.
// Alivia Supabase quando o usuário toca a mesma categoria repetidas vezes.
const ofertasCache = new Map();
const OFERTAS_TTL_MS = 60 * 1000;
const OFERTAS_CACHE_MAX = 40;

function setCacheHeaders(res, { maxAge = 60, sMaxAge = 300, swr = 600 } = {}) {
  res.set(
    "Cache-Control",
    `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
  );
}

app.get("/api/health", (_req, res) => {
  const hasShopee = !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);
  let supabaseOk = false;
  try {
    getConfig();
    supabaseOk = !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  } catch {
    supabaseOk = false;
  }
  res.json({
    ok: true,
    shopeeConfigured: hasShopee,
    supabaseConfigured: supabaseOk,
    time: new Date().toISOString(),
  });
});

/**
 * Busca ao vivo na Shopee (productOfferV2).
 * Query: keyword, limit, page, listType, sortType, sync=1,
 *        minRating, minSales, requireCommission
 */
app.get("/api/ofertas", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "oferta").trim();
    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;
    const listType = req.query.listType != null ? Number(req.query.listType) : 0;
    const sortType = req.query.sortType != null ? Number(req.query.sortType) : 2;
    const sync = req.query.sync === "1" || req.query.sync === "true";
    const minRating = req.query.minRating != null ? Number(req.query.minRating) : MIN_RATING;
    const minSales = req.query.minSales != null ? Number(req.query.minSales) : 0;
    const requireCommission = req.query.requireCommission === "1" || req.query.requireCommission === "true";

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
    const nodes = offer.nodes || [];
    const products = nodes.map((n) => mapOfferToProduct(n, keyword, offer.listType));

    let saved = 0;
    if (sync && nodes.length) {
      const rows = nodes.map((n) => mapOfferToRow(n, keyword, offer.listType)).filter((r) => r.item_id && r.offer_link);
      const result = await upsertOfertas(rows);
      saved = Array.isArray(result) ? result.length : rows.length;
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    res.json({
      source: "shopee",
      keyword,
      listType: offer.listType,
      sortType: offer.sortType,
      listTypeLabel: offer.listTypeLabel || listTypeLabel(offer.listType),
      sortTypeLabel: offer.sortTypeLabel || sortTypeLabel(offer.sortType),
      count: products.length,
      rawCount: offer.rawCount ?? products.length,
      filteredOut: offer.filteredOut || 0,
      saved,
      hasNextPage: !!offer.hasNextPage,
      pageInfo: offer.pageInfo || {},
      filters: offer.filters || { minRating, minSales, requireCommission },
      products,
    });
  } catch (err) {
    console.error("[/api/ofertas]", err.message);
    const status = err.status || 500;
    const rateLimited = status === 429 || /rate|limit|too many/i.test(err.message || "");
    res.status(status).json({
      error: err.message,
      code: err.code || (rateLimited ? "RATE_LIMITED" : null),
      rateLimited,
      details: err.payload || null,
    });
  }
});

/**
 * Busca em lote: várias keywords × várias páginas.
 * Body: { keywords: string[]|string, pages?, pageStart?, limit?, listType?, sortType?,
 *         minRating?, minSales?, requireCommission?, sync?, gapMs? }
 */
app.post("/api/ofertas/batch", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const keywordsRaw = body.keywords ?? body.keyword ?? "";
    const keywords = Array.isArray(keywordsRaw)
      ? keywordsRaw
      : String(keywordsRaw).split(/[\n,;]+/);
    const pages = Math.min(Math.max(Number(body.pages) || 1, 1), 10);
    const pageStart = Math.max(Number(body.pageStart) || 1, 1);
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50);
    const listType = body.listType != null ? Number(body.listType) : 0;
    const sortType = body.sortType != null ? Number(body.sortType) : 2;
    const minRating = body.minRating != null ? Number(body.minRating) : MIN_RATING;
    const minSales = body.minSales != null ? Number(body.minSales) : 0;
    const requireCommission = !!body.requireCommission;
    const sync = body.sync === true || body.sync === 1 || body.sync === "1";
    const gapMs = body.gapMs != null ? Number(body.gapMs) : DEFAULT_BATCH_GAP_MS;

    const cleaned = keywords.map((k) => String(k || "").trim()).filter(Boolean);
    if (!cleaned.length) {
      return res.status(400).json({ error: "Informe ao menos uma keyword", code: "NO_KEYWORDS" });
    }

    const batch = await fetchProductOffersBatch({
      keywords: cleaned,
      pages,
      pageStart,
      limit,
      listType,
      sortType,
      minRating,
      minSales,
      requireCommission,
      gapMs,
    });

    let saved = 0;
    if (sync && batch.nodes?.length) {
      const kwById = new Map(batch.products.map((p) => [String(p.itemId || p.id), p.keyword || ""]));
      const rows = batch.nodes
        .map((n) => mapOfferToRow(n, kwById.get(String(n.itemId)) || cleaned[0], batch.listType))
        .filter((r) => r.item_id && r.offer_link);
      const result = await upsertOfertas(rows);
      saved = Array.isArray(result) ? result.length : rows.length;
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    const failures = (batch.report || []).filter((r) => !r.ok);
    const rateLimited = failures.some((r) => r.status === 429 || /rate|limit|too many/i.test(r.error || ""));

    res.json({
      ok: true,
      source: "shopee",
      keywords: batch.keywords,
      pages: batch.pages,
      listType: batch.listType,
      sortType: batch.sortType,
      listTypeLabel: batch.listTypeLabel,
      sortTypeLabel: batch.sortTypeLabel,
      count: batch.count,
      filteredOut: batch.filteredOut,
      hasNextPage: batch.hasNextPage,
      saved,
      rateLimited,
      empty: batch.count === 0,
      report: batch.report,
      products: batch.products,
    });
  } catch (err) {
    console.error("[/api/ofertas/batch]", err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: err.message,
      code: err.code || null,
      rateLimited: status === 429,
      details: err.payload || null,
    });
  }
});

/**
 * Salva produtos já pré-visualizados (Explorador) ou nodes crus da Shopee.
 * Body: { products: [...] } e/ou { nodes: [...], keyword?, listType? }
 * Classifica category/subcategory via resolveTaxonomy (mapa da vitrine).
 */
app.post("/api/ofertas/save-bulk", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const products = Array.isArray(body.products) ? body.products : [];
    const nodes = Array.isArray(body.nodes) ? body.nodes : [];
    const defaultKeyword = String(body.keyword || "").trim();
    const defaultListType = body.listType != null ? Number(body.listType) : null;

    if (!products.length && !nodes.length) {
      return res.status(400).json({ error: "Nenhum produto para salvar", code: "NO_PRODUCTS" });
    }

    const byId = new Map();

    for (const n of nodes) {
      const itemId = Number(n.itemId ?? n.item_id);
      if (!Number.isSafeInteger(itemId) || itemId <= 0) continue;
      if (byId.has(String(itemId))) continue;
      const kw = n.keyword || defaultKeyword || "oferta";
      const lt = n.listType != null ? Number(n.listType) : defaultListType;
      const row = mapOfferToRow(n, kw, lt);
      if (row.item_id && row.offer_link) byId.set(String(itemId), row);
    }

    for (const p of products) {
      const itemId = Number(p.itemId ?? p.item_id ?? p.id);
      if (!Number.isSafeInteger(itemId) || itemId <= 0) continue;
      const offerLink = p.affiliateLink || p.offer_link || p.offerLink || p.productLink || "";
      if (!offerLink) continue;
      if (byId.has(String(itemId))) continue;

      const node = {
        itemId,
        productName: p.title || p.productName || p.product_name || "",
        imageUrl: p.image || p.imageUrl || p.image_url || "",
        priceMin: p.newPrice ?? p.price_min ?? p.priceMin,
        priceMax: p.oldPrice ?? p.price_max ?? p.priceMax,
        priceDiscountRate: p.discountPct ?? p.price_discount_rate,
        sales: p.salesRaw || p.sales || null,
        ratingStar: p.stars ?? p.rating_star ?? p.ratingStar,
        commissionRate: p.commissionRate || p.commission_rate,
        sellerCommissionRate: p.sellerCommission || p.seller_commission_rate,
        shopeeCommissionRate: p.shopeeCommission || p.shopee_commission_rate,
        commission: p.totalCommission || p.commission,
        offerLink,
        productLink: p.productLink || p.product_link || "",
        shopId: p.shopId || p.shop_id,
        shopName: p.shopName || p.shop_name || "",
        shopType: p.shopType || p.shop_type,
        periodStartTime: p.periodStart || p.period_start,
        periodEndTime: p.periodEnd || p.period_end,
      };
      const keyword = p.keyword || defaultKeyword || "";
      const listType = p.listType != null ? Number(p.listType) : defaultListType;
      // Se já veio classificado pelo explorador/batch, respeita; senão resolve pelo título+keyword
      const forceCategory = p.category && p.category !== "todos" ? p.category : null;
      const forceSubcategory = p.subcategory || null;
      byId.set(String(itemId), mapOfferToRow(node, keyword, listType, {
        forceCategory,
        forceSubcategory: forceCategory ? forceSubcategory : null,
      }));
    }

    const rows = [...byId.values()].filter((r) => r.item_id && r.offer_link);
    if (!rows.length) {
      return res.status(400).json({ error: "Nenhum produto válido (itemId + offerLink)", code: "INVALID_PRODUCTS" });
    }

    const result = await upsertOfertas(rows);
    const saved = Array.isArray(result) ? result.length : rows.length;
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();

    res.json({
      ok: true,
      requested: products.length + nodes.length,
      unique: rows.length,
      saved,
      count: saved,
    });
  } catch (err) {
    console.error("[/api/ofertas/save-bulk]", err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || null,
      details: err.payload || null,
    });
  }
});

/** Metadados de listType/sortType para o painel. */
app.get("/api/ofertas/meta", (_req, res) => {
  res.json({
    listTypes: Object.entries(LIST_TYPE_LABELS).map(([value, label]) => ({
      value: Number(value),
      label,
    })),
    sortTypes: Object.entries(SORT_TYPE_LABELS).map(([value, label]) => ({
      value: Number(value),
      label,
    })),
    defaults: {
      listType: 0,
      sortType: 2,
      minRating: MIN_RATING,
      gapMs: DEFAULT_BATCH_GAP_MS,
    },
  });
});

/**
 * Lê ofertas do Supabase.
 * Query: keyword, category, limit, offset, sort=recent|sales|discount|rating|ending
 */
app.get("/api/ofertas/db", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    const category = String(req.query.category || "").trim();
    const subcategory = String(req.query.subcategory || "").trim();
    const itemId = String(req.query.itemId || req.query.produto || "").trim();
    const itemIdsRaw = String(req.query.itemIds || req.query.produtos || "").trim();
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const sort = String(req.query.sort || "recent").trim();

    const multiIds = itemIdsRaw
      ? itemIdsRaw.split(/[,|]+/).map((s) => s.trim()).filter(Boolean)
      : (itemId ? [itemId] : []);

    if (multiIds.length) {
      const rows = await getOffersByItemIds(multiIds, { full: true });
      const list = Array.isArray(rows) ? rows : [];
      setCacheHeaders(res, { maxAge: 30, sMaxAge: 60, swr: 300 });
      return res.json({
        source: "supabase",
        count: list.length,
        offset: 0,
        limit: list.length,
        sort,
        products: list.map(rowToProduct),
      });
    }

    const cacheKey = `${keyword}|${category}|${subcategory}|${limit}|${offset}|${sort}`;
    const cached = ofertasCache.get(cacheKey);
    if (cached && Date.now() - cached.at < OFERTAS_TTL_MS) {
      setCacheHeaders(res, { maxAge: 30, sMaxAge: 60, swr: 300 });
      return res.json({ ...cached.data, cached: true });
    }

    const rows = await listOfertas({ keyword, category, subcategory, limit, offset, sort });
    const list = Array.isArray(rows) ? rows : [];
    const payload = {
      source: "supabase",
      count: list.length,
      offset,
      limit,
      sort,
      products: list.map(rowToProduct),
    };

    ofertasCache.set(cacheKey, { at: Date.now(), data: payload });
    if (ofertasCache.size > OFERTAS_CACHE_MAX) {
      const oldestKey = ofertasCache.keys().next().value;
      ofertasCache.delete(oldestKey);
    }

    setCacheHeaders(res, { maxAge: 30, sMaxAge: 60, swr: 300 });
    res.json(payload);
  } catch (err) {
    console.error("[/api/ofertas/db]", err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || null,
      details: err.payload || null,
    });
  }
});

/**
 * Campanhas oficiais Shopee (shopeeOfferV2) com cache em memória.
 */
app.get("/api/campanhas", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    if (!force && campaignsCache.data && Date.now() - campaignsCache.at < CAMPAIGNS_TTL_MS) {
      setCacheHeaders(res, { maxAge: 300, sMaxAge: 900, swr: 1800 });
      return res.json({ ...campaignsCache.data, cached: true });
    }
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const offer = await fetchShopeeOffers({ sortType: 1, page: 1, limit });
    const campaigns = (offer.nodes || [])
      .map(mapCampaignNode)
      .filter((c) => c.affiliateLink && c.affiliateLink !== "#" && c.isActive);
    const payload = {
      source: "shopee",
      count: campaigns.length,
      updatedAt: new Date().toISOString(),
      campaigns,
    };
    campaignsCache = { at: Date.now(), data: payload };
    setCacheHeaders(res, { maxAge: 300, sMaxAge: 900, swr: 1800 });
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error("[/api/campanhas]", err.message);
    // fallback cache antigo se existir
    if (campaignsCache.data) {
      return res.json({ ...campaignsCache.data, cached: true, stale: true, error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

app.get("/api/categorias", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    if (!force && categoriasCache.data && Date.now() - categoriasCache.at < CATEGORIAS_TTL_MS) {
      setCacheHeaders(res, { maxAge: 120, sMaxAge: 300, swr: 900 });
      return res.json({ ...categoriasCache.data, cached: true });
    }

    let counts = {};
    try {
      counts = await countByCategory();
    } catch (e) {
      console.warn("[/api/categorias] Supabase indisponível:", e.message);
    }

    // Contagem por subcategoria usa só HEAD queries (leves) em paralelo.
    // Evita baixar 200 rows por categoria só para contar — economiza ~90% do tempo.
    const metas = metaOnly();
    const subCountsList = await Promise.all(
      metas.map((c) => countBySubcategory(c.id).catch(() => ({})))
    );

    const categories = metas.map((c, idx) => ({
      ...c,
      count: counts[c.id] || 0,
      subcategories: (c.subcategories || []).map((sub) => ({
        ...sub,
        count: subCountsList[idx][sub.id] || 0,
      })),
    }));

    categories.unshift({
      id: "todos",
      label: "Tudo",
      icon: "fa-border-all",
      color: "orange",
      count: counts.total || 0,
      subcategories: [],
    });

    const payload = { categories, updatedAt: new Date().toISOString() };
    categoriasCache = { at: Date.now(), data: payload };
    setCacheHeaders(res, { maxAge: 120, sMaxAge: 300, swr: 900 });
    res.json({ ...payload, cached: false });
  } catch (err) {
    if (categoriasCache.data) {
      return res.json({ ...categoriasCache.data, cached: true, stale: true, error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 5), 50);
    const listType = req.body?.listType != null ? Number(req.body.listType) : 0;
    const sortType = req.body?.sortType != null ? Number(req.body.sortType) : 2;
    const minRating = req.body?.minRating != null ? Number(req.body.minRating) : MIN_RATING;
    const minSales = req.body?.minSales != null ? Number(req.body.minSales) : 0;
    const requireCommission = !!req.body?.requireCommission;
    const pages = Math.min(Math.max(Number(req.body?.pages) || 1, 1), 5);
    let plano;

    if (Array.isArray(req.body?.keywords) && req.body.keywords.length) {
      plano = req.body.keywords.map((k) => ({ keyword: String(k), category: null }));
    } else if (req.body?.category) {
      const target = String(req.body.category).trim();
      const cat = CATEGORIAS.find((c) => c.id === target);
      plano = (cat?.subcategories || []).flatMap((sub) =>
        sub.keywords.map((k) => ({ keyword: k, category: cat.id, subcategory: sub.id }))
      );
    } else {
      // Lote manual limitado: 27 buscas femininas + 3 gerais.
      plano = weightedKeywords({ femalePercent: 90 }).slice(0, 30);
    }

    if (!plano.length) {
      return res.status(400).json({ error: "Nenhuma keyword para sincronizar" });
    }

    const keywords = plano.map((p) => p.keyword);
    const batch = await fetchProductOffersBatch({
      keywords,
      pages,
      pageStart: 1,
      limit,
      listType,
      sortType,
      minRating,
      minSales,
      requireCommission,
      gapMs: DEFAULT_BATCH_GAP_MS,
    });

    let saved = 0;
    if (batch.nodes?.length) {
      const planoByKw = new Map(
        plano.map((p) => [String(p.keyword).toLowerCase().trim(), p])
      );
      const kwById = new Map(batch.products.map((p) => [String(p.itemId || p.id), p.keyword || ""]));
      const rows = batch.nodes
        .map((n) => {
          const kw = kwById.get(String(n.itemId)) || keywords[0];
          const plan = planoByKw.get(String(kw).toLowerCase().trim());
          return mapOfferToRow(n, kw, batch.listType, {
            forceCategory: plan?.category || null,
            forceSubcategory: plan?.subcategory || null,
          });
        })
        .filter((r) => r.item_id && r.offer_link);
      if (rows.length) {
        const result = await upsertOfertas(rows);
        saved = Array.isArray(result) ? result.length : rows.length;
      }
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    res.json({
      ok: true,
      keywordsRun: keywords.length,
      pages,
      listType: batch.listType,
      sortType: batch.sortType,
      listTypeLabel: batch.listTypeLabel,
      sortTypeLabel: batch.sortTypeLabel,
      filteredOut: batch.filteredOut,
      hasNextPage: batch.hasNextPage,
      saved,
      report: batch.report,
      count: batch.count,
      products: batch.products,
    });
  } catch (err) {
    console.error("[/api/sync]", err.message);
    res.status(500).json({ error: err.message, details: err.payload || null });
  }
});

app.get("/api/sync/categoria/:id", requireAdmin, async (req, res) => {
  try {
    const catId = String(req.params.id || "").trim();
    const cat = CATEGORIAS.find((c) => c.id === catId);
    if (!cat) return res.status(404).json({ error: `Categoria desconhecida: ${catId}` });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);
    const listType = req.query.listType != null ? Number(req.query.listType) : 0;
    const sortType = req.query.sortType != null ? Number(req.query.sortType) : 2;
    const pages = Math.min(Math.max(Number(req.query.pages) || 1, 1), 5);
    const minRating = req.query.minRating != null ? Number(req.query.minRating) : MIN_RATING;
    const minSales = req.query.minSales != null ? Number(req.query.minSales) : 0;
    const requireCommission = req.query.requireCommission === "1" || req.query.requireCommission === "true";
    const keywords = (cat.subcategories || []).flatMap((sub) => sub.keywords);
    const subByKeyword = new Map();
    for (const sub of cat.subcategories || []) {
      for (const kw of sub.keywords || []) {
        subByKeyword.set(String(kw).toLowerCase().trim(), sub.id);
      }
    }

    const batch = await fetchProductOffersBatch({
      keywords,
      pages,
      pageStart: 1,
      limit,
      listType,
      sortType,
      minRating,
      minSales,
      requireCommission,
      gapMs: DEFAULT_BATCH_GAP_MS,
    });

    let saved = 0;
    if (batch.nodes?.length) {
      const kwById = new Map(batch.products.map((p) => [String(p.itemId || p.id), p.keyword || ""]));
      const rows = batch.nodes
        .map((n) => {
          const kw = kwById.get(String(n.itemId)) || keywords[0];
          const forceSub = subByKeyword.get(String(kw).toLowerCase().trim()) || null;
          return mapOfferToRow(n, kw, batch.listType, {
            forceCategory: cat.id,
            forceSubcategory: forceSub,
          });
        })
        .filter((r) => r.item_id && r.offer_link);
      if (rows.length) {
        const result = await upsertOfertas(rows);
        saved = Array.isArray(result) ? result.length : rows.length;
      }
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    res.json({
      ok: true,
      category: cat.id,
      keywordsRun: keywords.length,
      pages,
      listType: batch.listType,
      sortType: batch.sortType,
      listTypeLabel: batch.listTypeLabel,
      sortTypeLabel: batch.sortTypeLabel,
      filteredOut: batch.filteredOut,
      hasNextPage: batch.hasNextPage,
      saved,
      count: batch.count,
      report: batch.report,
      products: batch.products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auto/status", (_req, res) => {
  res.json(autosync.status());
});

app.post("/api/auto/run", requireAdmin, async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result, status: autosync.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Popular destaques (Top Performance). */
app.post("/api/auto/top-performance", requireAdmin, async (_req, res) => {
  try {
    const result = await autosync.runTopPerformance({ manual: true });
    res.json({ ok: true, result, status: autosync.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cron/sync", async (_req, res) => {
  try {
    if (!autosync.config.enabled) {
      return res.json({ ok: true, skipped: "auto-sync-paused" });
    }
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Campanhas de rastreio salvas no Supabase */
app.get("/api/campanhas-rastreio", async (_req, res) => {
  try {
    const rows = await listCampanhasRastreio();
    const campaigns = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: r.id,
      channel: r.channel,
      campaign: r.campaign,
      products: r.products || [],
      links: r.links || [],
      exampleSubIds: r.example_sub_ids || [],
      createdAt: r.created_at,
    }));
    res.json({ campaigns, count: campaigns.length });
  } catch (err) {
    console.error("[/api/campanhas-rastreio]", err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

app.post("/api/campanhas-rastreio", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id || !body.campaign) {
      return res.status(400).json({ error: "id e campaign obrigatórios" });
    }
    const saved = await upsertCampanhaRastreio(body);
    res.json({ ok: true, campaign: Array.isArray(saved) ? saved[0] : saved });
  } catch (err) {
    console.error("[/api/campanhas-rastreio POST]", err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

app.delete("/api/campanhas-rastreio/:id", requireAdmin, async (req, res) => {
  try {
    await deleteCampanhaRastreio(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[/api/campanhas-rastreio DELETE]", err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

/**
 * Gera short link (com subIds) e opcionalmente cacheia no Supabase.
 * Body: { originUrl, subIds?, itemId? }
 */
app.post("/api/shortlink", async (req, res) => {
  try {
    const originUrl = String(req.body?.originUrl || "").trim();
    if (!originUrl) return res.status(400).json({ error: "originUrl obrigatório" });
    const subIds = Array.isArray(req.body?.subIds) && req.body.subIds.length
      ? req.body.subIds.map(String)
      : buildProductSubIds("geral", req.body?.itemId);
    const itemId = req.body?.itemId != null ? Number(req.body.itemId) : null;
    const shortLink = await generateShortLink(originUrl, subIds);
    if (shortLink && itemId) {
      try {
        await updateShortLink(itemId, shortLink);
      } catch (e) {
        console.warn("[/api/shortlink] cache falhou:", e.message);
      }
    }
    res.json({ shortLink, originUrl, subIds });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

/**
 * Relatório real de conversões da Shopee para o painel admin.
 * Por padrão (siteOnly=1) só retorna vendas rastreadas por este site.
 */
app.get("/api/conversions", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const now = Math.floor(Date.now() / 1000);
    const orderStatus = String(req.query.status || "").toUpperCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const scrollId = String(req.query.scrollId || "").trim();
    const siteOnly = String(req.query.siteOnly ?? "1") !== "0";
    const marker = String(req.query.marker || SITE_SUBID).toLowerCase();
    const report = await fetchConversionReport({
      purchaseTimeStart: now - days * 24 * 3600,
      purchaseTimeEnd: now,
      orderStatus,
      limit,
      scrollId,
    });
    let nodes = Array.isArray(report.nodes) ? report.nodes : [];
    const totalFromShopee = nodes.length;
    if (siteOnly) {
      nodes = nodes.filter((conversion) =>
        String(conversion.utmContent || "").toLowerCase().includes(marker)
      );
    }
    const itemIds = nodes.flatMap((conversion) =>
      (conversion.orders || []).flatMap((order) =>
        (order.items || []).map((item) => item.itemId)
      )
    );
    let offersById = new Map();
    try {
      const offers = await getOffersByItemIds(itemIds);
      offersById = new Map((offers || []).map((offer) => [String(offer.item_id), offer]));
    } catch (enrichError) {
      console.warn("[/api/conversions] detalhes Supabase indisponíveis:", enrichError.message);
    }
    const missingIds = [...new Set(itemIds.map(String))]
      .filter((itemId) => !offersById.has(itemId))
      .slice(0, 20);
    if (missingIds.length) {
      try {
        const liveProducts = await fetchProductDetailsByIds(missingIds);
        for (const product of liveProducts || []) {
          const id = String(product.itemId || "");
          if (!id) continue;
          offersById.set(id, {
            item_id: product.itemId,
            image_url: product.imageUrl || "",
            product_name: product.productName || "",
            category: categoryForKeyword(product.productName),
          });
        }
      } catch (imageError) {
        console.warn("[/api/conversions] fotos Shopee indisponíveis:", imageError.message);
      }
    }
    const conversions = nodes.map((conversion) => ({
      ...conversion,
      orders: (conversion.orders || []).map((order) => ({
        ...order,
        items: (order.items || []).map((item) => {
          const offer = offersById.get(String(item.itemId));
          return {
            ...item,
            imageUrl: offer?.image_url || "",
            category: offer?.category || categoryForKeyword(item.itemName) || "todos",
            itemName: item.itemName || offer?.product_name || `Item ${item.itemId || ""}`,
          };
        }),
      })),
    }));
    res.json({
      source: "shopee",
      days,
      siteOnly,
      siteMarker: SITE_SUBID,
      count: conversions.length,
      ignoredFromOtherChannels: siteOnly ? Math.max(0, totalFromShopee - conversions.length) : 0,
      conversions,
      pageInfo: report.pageInfo || {},
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/conversions]", err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || null,
      details: err.payload || null,
    });
  }
});

/**
 * Limpa o cache da vitrine e realimenta categorias.
 * Body: { limit?, pages?, clear?, maxItems? }
 * maxItems: para ao atingir N itens únicos (ex.: 2000 para demo).
 */
app.post("/api/reset-vitrine", requireAdmin, async (req, res) => {
  try {
    const result = await refillVitrine({
      clear: req.body?.clear !== false,
      limit: req.body?.limit,
      pages: req.body?.pages,
      maxItems: req.body?.maxItems,
      gapMs: req.body?.gapMs,
    });
    res.json(result);
  } catch (err) {
    console.error("[/api/reset-vitrine]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Atualiza preços/comissão de produtos selecionados preservando category/subcategory/sub_ids. */
app.post("/api/ofertas/refresh", requireAdmin, async (req, res) => {
  try {
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    const ids = [...new Set(itemIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 40);
    if (!ids.length) return res.status(400).json({ error: "itemIds obrigatório" });

    const existing = await getOffersByItemIds(ids, { full: true });
    const byId = new Map((existing || []).map((r) => [Number(r.item_id), r]));

    const details = await fetchProductDetailsByIds(ids);
    const nodes = Array.isArray(details) ? details : [];
    const rows = [];
    for (const n of nodes) {
      const itemId = Number(n.itemId);
      const prev = byId.get(itemId);
      const row = mapOfferToRow(n, prev?.keyword || "", prev?.list_type ?? null, {
        forceCategory: prev?.category && prev.category !== "todos" ? prev.category : null,
        forceSubcategory: prev?.subcategory || null,
      });
      if (prev?.sub_ids?.length) row.sub_ids = prev.sub_ids;
      if (prev?.short_link) row.short_link = prev.short_link;
      if (row.item_id && row.offer_link) rows.push(row);
    }
    if (!rows.length) return res.status(404).json({ error: "Nenhum produto atualizado pela Shopee" });
    const saved = await upsertOfertas(rows);
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({ ok: true, requested: ids.length, saved: Array.isArray(saved) ? saved.length : rows.length });
  } catch (err) {
    console.error("[/api/ofertas/refresh]", err.message);
    res.status(err.status || 500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

app.patch("/api/ofertas/:itemId", requireAdmin, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const body = req.body || {};
    const patch = {};
    if (body.category != null) patch.category = String(body.category);
    if (body.subcategory !== undefined) patch.subcategory = body.subcategory ? String(body.subcategory) : null;
    if (body.hidden != null) patch.hidden = !!body.hidden;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nada para atualizar" });
    const updated = await patchOferta(itemId, patch);
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({ ok: true, product: Array.isArray(updated) ? updated[0] : updated });
  } catch (err) {
    console.error("[/api/ofertas PATCH]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/ofertas", requireAdmin, async (req, res) => {
  try {
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    const removed = await deleteOfertasByIds(itemIds);
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({ ok: true, removed });
  } catch (err) {
    console.error("[/api/ofertas DELETE]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Canonical: path antigo do HTML → URL limpa (antes do static)
app.get("/uploads/painel_e_vitrine_afiliado_mestre.html", (req, res) => {
  const qs = new URLSearchParams(req.query);
  if (qs.has("admin") || qs.get("mode") === "admin") {
    qs.delete("admin");
    qs.delete("mode");
    const rest = qs.toString();
    return res.redirect(301, `/admin${rest ? `?${rest}` : ""}`);
  }
  const rest = qs.toString();
  return res.redirect(301, `/${rest ? `?${rest}` : ""}`);
});

app.use("/uploads", express.static(path.join(ROOT, "uploads")));
app.use(express.static(ROOT, { index: false }));

const APP_PAGE_RE = /^\/(categoria(\/[^/]+){0,2}|relampago|mais-vendidos|maiores-descontos|melhor-avaliados|lojas-oficiais|admin(\/[\w-]+)?)\/?$/;

app.get(["/", "/admin", "/admin/:view", "/categoria", "/categoria/:cat", "/categoria/:cat/:sub",
  "/relampago", "/mais-vendidos", "/maiores-descontos", "/melhor-avaliados", "/lojas-oficiais"], sendVitrine);

// SPA fallback: paths de app conhecidos (sem /api)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (APP_PAGE_RE.test(req.path)) return sendVitrine(req, res);
  if (req.accepts("html") && !path.extname(req.path)) return sendVitrine(req, res);
  return res.status(404).json({ error: "Não encontrado" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Afiliado Mestre rodando em http://localhost:${PORT}`);
    console.log(`Vitrine: http://localhost:${PORT}/`);
    console.log(`Admin:   http://localhost:${PORT}/admin`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    autosync.start();
  });
}

module.exports = app;
