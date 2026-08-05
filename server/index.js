"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const {
  fetchProductOffers,
  fetchProductOffersBatch,
  fetchProductDetailsByIds,
  fetchShopeeOffers,
  generateShortLink,
  generateBatchShortLink,
  resolveProductOriginUrl,
  mapOfferToProduct,
  mapOfferToRow,
  mapCampaignNode,
  fetchConversionReport,
  listTypeLabel,
  sortTypeLabel,
  LIST_TYPE_LABELS,
  SORT_TYPE_LABELS,
  MIN_RATING,
  MIN_SALES,
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
  listOffersMissingShortlink,
  countShortlinkStatus,
} = require("./supabase");
const { CATEGORIAS, categoryForKeyword, weightedKeywords, allKeywords, metaOnly, sortCategoriesForHome, DEFAULT_FEMALE_PERCENT, normalizeKeywordEntry, isFemaleAudience } = require("./categorias");
const { buildCoverageReport, buildCoverageQueue } = require("./coverage");
const { refillVitrine } = require("./refillVitrine");
const { scanDuplicates, removeDuplicates } = require("./duplicates");
const {
  scanWeakOffers,
  purgeWeakOffers,
  refreshTopOffers,
  DEFAULT_MIN_COMMISSION_PCT,
} = require("./quality");
const { productMatchesSubcategory } = require("./productMeta");
const { SITE_SUBID, buildProductSubIds, buildTrackedSubIds, sanitizeSubId } = require("./tracking");
const {
  generateShortlinksForRows,
  saveOffersWithShortlinks,
} = require("./shortlinks");
const autosync = require("./autosync");

const app = express();
const PORT = Number(process.env.PORT) || 3789;
const ROOT = path.join(__dirname, "..");
const VITRINE_HTML = path.join(ROOT, "uploads", "painel_e_vitrine_afiliado_mestre.html");
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function extractAdminToken(req) {
  const header = String(req.headers["x-admin-token"] || "").trim();
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return header || bearer || String(req.query.adminToken || "").trim();
}

function adminEmailAllowed(email) {
  return ADMIN_EMAILS.size > 0 && ADMIN_EMAILS.has(String(email || "").toLowerCase());
}

async function supabaseAuth(pathname, { method = "POST", body, accessToken } = {}) {
  const { url, anonKey } = getConfig();
  if (!anonKey) {
    const err = new Error("Configure SUPABASE_ANON_KEY para usar o login.");
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${url}/auth/v1${pathname}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken || anonKey}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.msg || data?.message || data?.error_description || "Falha na autenticação.");
    err.status = response.status;
    throw err;
  }
  return data;
}

const adminAuthCache = new Map();
async function getAdminUser(accessToken) {
  if (!accessToken) return null;
  const cached = adminAuthCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const user = await supabaseAuth("/user", { method: "GET", accessToken });
  if (!adminEmailAllowed(user?.email)) return null;
  adminAuthCache.set(accessToken, { user, expiresAt: Date.now() + 2 * 60 * 1000 });
  if (adminAuthCache.size > 100) adminAuthCache.clear();
  return user;
}

/** Protege as rotas do painel com uma sessão emitida pelo Supabase Auth. */
async function requireAdmin(req, res, next) {
  if (!ADMIN_EMAILS.size) {
    return res.status(503).json({
      error: "Configure ADMIN_EMAIL no servidor.",
      code: "ADMIN_AUTH_CONFIG",
    });
  }
  try {
    const user = await getAdminUser(extractAdminToken(req));
    if (user) {
      req.adminUser = user;
      return next();
    }
  } catch (_) {}
  return res.status(401).json({ error: "Sessão inválida ou expirada.", code: "ADMIN_AUTH" });
}

app.post("/api/admin/login", async (req, res) => {
  const email = String(req.body?.email || req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha.", code: "ADMIN_AUTH" });
  }
  if (!adminEmailAllowed(email)) {
    return res.status(401).json({ error: "E-mail sem acesso ao painel.", code: "ADMIN_AUTH" });
  }
  try {
    const session = await supabaseAuth("/token?grant_type=password", {
      body: { email, password },
    });
    if (!adminEmailAllowed(session?.user?.email)) {
      return res.status(401).json({ error: "E-mail sem acesso ao painel.", code: "ADMIN_AUTH" });
    }
    return res.json({
      ok: true,
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      user: session.user?.email,
    });
  } catch (err) {
    return res.status(err.status === 400 ? 401 : (err.status || 500)).json({
      error: err.status === 400 ? "E-mail ou senha incorretos." : err.message,
      code: "ADMIN_AUTH",
    });
  }
});

app.post("/api/admin/refresh", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "").trim();
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token ausente.", code: "ADMIN_AUTH" });
  }
  try {
    const session = await supabaseAuth("/token?grant_type=refresh_token", {
      body: { refresh_token: refreshToken },
    });
    if (!adminEmailAllowed(session?.user?.email)) {
      return res.status(401).json({ error: "E-mail sem acesso ao painel.", code: "ADMIN_AUTH" });
    }
    return res.json({
      ok: true,
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      user: session.user?.email,
    });
  } catch (err) {
    return res.status(401).json({ error: "Sessão expirada. Entre novamente.", code: "ADMIN_AUTH" });
  }
});

app.get("/api/admin/me", async (req, res) => {
  try {
    const user = await getAdminUser(extractAdminToken(req));
    if (user) return res.json({ ok: true, user: user.email, authRequired: true });
  } catch (_) {
    // A resposta abaixo mantém os detalhes da autenticação fora do cliente.
  }
  return res.status(401).json({ ok: false, authRequired: true, code: "ADMIN_AUTH" });
});

app.post("/api/admin/logout", async (req, res) => {
  const token = extractAdminToken(req);
  adminAuthCache.delete(token);
  if (token) {
    await supabaseAuth("/logout", { accessToken: token }).catch(() => {});
  }
  res.json({ ok: true });
});

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
const OFERTAS_TTL_MS = 150 * 1000;
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
    const minCommissionPct = req.query.minCommissionPct != null ? Number(req.query.minCommissionPct) : 0;
    const matchId = req.query.matchId != null ? Number(req.query.matchId) : null;
    const shopId = req.query.shopId != null ? Number(req.query.shopId) : null;

    const offer = await fetchProductOffers({
      keyword,
      limit,
      page,
      listType,
      sortType,
      matchId,
      shopId,
      minRating,
      minSales,
      requireCommission,
      minCommissionPct,
    });
    const nodes = offer.nodes || [];
    const products = nodes.map((n) => mapOfferToProduct(n, keyword, offer.listType));

    let saved = 0;
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
    if (sync && nodes.length) {
      const rows = nodes.map((n) => mapOfferToRow(n, keyword, offer.listType)).filter((r) => r.item_id && r.offer_link);
      const out = await saveOffersWithShortlinks(rows);
      saved = out.saved;
      skippedExisting = out.skippedExisting || 0;
      shortlinks = out.shortlinks;
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
      skippedExisting,
      shortlinks,
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
    const minCommissionPct = body.minCommissionPct != null ? Number(body.minCommissionPct) : 0;
    const matchId = body.matchId != null ? Number(body.matchId) : null;
    const shopId = body.shopId != null ? Number(body.shopId) : null;
    const sync = body.sync === true || body.sync === 1 || body.sync === "1";
    const gapMs = body.gapMs != null ? Number(body.gapMs) : DEFAULT_BATCH_GAP_MS;

    const cleaned = keywords.map((k) => String(k || "").trim()).filter(Boolean);
    const hasMatch = Number.isFinite(matchId) && matchId > 0;
    const hasShop = Number.isFinite(shopId) && shopId > 0;
    if (!cleaned.length && !hasMatch && !hasShop) {
      return res.status(400).json({
        error: "Informe keyword(s), ou matchId (coleção/categoria), ou shopId (loja)",
        code: "NO_KEYWORDS",
      });
    }

    const batch = await fetchProductOffersBatch({
      keywords: cleaned,
      pages,
      pageStart,
      limit,
      listType,
      sortType,
      matchId: hasMatch ? matchId : null,
      shopId: hasShop ? shopId : null,
      minRating,
      minSales,
      requireCommission,
      minCommissionPct,
      gapMs,
    });

    let saved = 0;
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
    if (sync && batch.nodes?.length) {
      const kwById = new Map(batch.products.map((p) => [String(p.itemId || p.id), p.keyword || ""]));
      const rows = batch.nodes
        .map((n) => mapOfferToRow(n, kwById.get(String(n.itemId)) || cleaned[0], batch.listType))
        .filter((r) => r.item_id && r.offer_link);
      const out = await saveOffersWithShortlinks(rows);
      saved = out.saved;
      skippedExisting = out.skippedExisting || 0;
      shortlinks = out.shortlinks;
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
      skippedExisting,
      shortlinks,
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

    const withShortlinks = body.withShortlinks !== false;
    const out = await saveOffersWithShortlinks(rows, { withShortlinks });
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();

    res.json({
      ok: true,
      requested: products.length + nodes.length,
      unique: rows.length,
      saved: out.saved,
      skippedExisting: out.skippedExisting || 0,
      count: out.saved,
      shortlinks: out.shortlinks,
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
      minSales: MIN_SALES,
      gapMs: DEFAULT_BATCH_GAP_MS,
    },
  });
});

/**
 * Lê ofertas do Supabase.
 * Query: keyword, category, limit, offset, sort=money|recent|sales|discount|rating|ending
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
    // Home / catálogo geral: moneyScore. Categorias específicas mantêm recent se não pedirem sort.
    const sortRaw = String(req.query.sort || "").trim();
    const sort = sortRaw || (!category || category === "todos" ? "money" : "recent");

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
      setCacheHeaders(res, { maxAge: 45, sMaxAge: 120, swr: 600 });
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

    setCacheHeaders(res, { maxAge: 45, sMaxAge: 120, swr: 600 });
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
    const offer = await fetchShopeeOffers({ sortType: 1, page: 1, limit: Math.max(limit, 20) });
    const FEMALE_OFFER_RE = /women|woman|fashion|beauty|moda|beleza|feminin|accessories|saúde|saude|health|vestuario|roupa/i;
    let campaigns = (offer.nodes || [])
      .map(mapCampaignNode)
      .filter((c) => c.affiliateLink && c.affiliateLink !== "#" && c.isActive);
    campaigns.sort((a, b) => {
      const af = FEMALE_OFFER_RE.test(a.title || "") ? 1 : 0;
      const bf = FEMALE_OFFER_RE.test(b.title || "") ? 1 : 0;
      return bf - af;
    });
    // Prioriza moda/beleza no topo; mantém as demais depois
    const femaleFirst = campaigns.filter((c) => FEMALE_OFFER_RE.test(c.title || ""));
    const rest = campaigns.filter((c) => !FEMALE_OFFER_RE.test(c.title || ""));
    campaigns = [...femaleFirst, ...rest].slice(0, limit);
    const payload = {
      source: "shopee",
      count: campaigns.length,
      femaleFocused: femaleFirst.length,
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

/** Importa itens de coleção/categoria oficial (listType 6 ou 4 + matchId). */
app.post("/api/campanhas/import-products", requireAdmin, async (req, res) => {
  try {
    const collectionId = req.body?.collectionId != null ? Number(req.body.collectionId) : null;
    const categoryId = req.body?.categoryId != null ? Number(req.body.categoryId) : null;
    const limit = Math.min(Math.max(Number(req.body?.limit) || 30, 5), 50);
    const keyword = String(req.body?.keyword || "oficial").trim();
    const forceCategory = String(req.body?.forceCategory || "").trim() || null;

    let listType = 0;
    let matchId = null;
    if (collectionId && Number.isFinite(collectionId) && collectionId > 0) {
      listType = 6;
      matchId = collectionId;
    } else if (categoryId && Number.isFinite(categoryId) && categoryId > 0) {
      listType = 4;
      matchId = categoryId;
    } else {
      return res.status(400).json({ error: "Informe collectionId ou categoryId" });
    }

    const offer = await fetchProductOffers({
      listType,
      matchId,
      limit,
      page: 1,
      sortType: 5,
      requireCommission: true,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
    });

    const rows = (offer.nodes || [])
      .map((n) =>
        mapOfferToRow(n, keyword, listType, {
          forceCategory: forceCategory || undefined,
        })
      )
      .filter((r) => r.item_id && r.offer_link);

    let saved = 0;
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
    if (rows.length) {
      const out = await saveOffersWithShortlinks(rows);
      saved = out.saved;
      skippedExisting = out.skippedExisting || 0;
      shortlinks = out.shortlinks;
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    res.json({
      ok: true,
      listType,
      matchId,
      raw: offer.rawCount,
      saved,
      skippedExisting,
      shortlinks,
    });
  } catch (err) {
    console.error("[/api/campanhas/import-products]", err.message);
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

    const categories = sortCategoriesForHome(
      metas.map((c, idx) => ({
        ...c,
        count: counts[c.id] || 0,
        subcategories: (c.subcategories || []).map((sub) => ({
          ...sub,
          count: subCountsList[idx][sub.id] || 0,
        })),
      }))
    );

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
    const listType = req.body?.listType != null ? Number(req.body.listType) : 1;
    const sortType = req.body?.sortType != null ? Number(req.body.sortType) : 5;
    const minRating = req.body?.minRating != null ? Number(req.body.minRating) : MIN_RATING;
    const minSales = req.body?.minSales != null ? Number(req.body.minSales) : MIN_SALES;
    const requireCommission = req.body?.requireCommission !== false;
    const pages = Math.min(Math.max(Number(req.body?.pages) || 1, 1), 5);
    let plano;

    if (Array.isArray(req.body?.keywords) && req.body.keywords.length) {
      plano = req.body.keywords.map((k) => ({ keyword: String(k), category: null }));
    } else if (req.body?.category) {
      const target = String(req.body.category).trim();
      const cat = CATEGORIAS.find((c) => c.id === target);
      plano = (cat?.subcategories || []).flatMap((sub) =>
        (sub.keywords || []).map((raw) => {
          const { keyword } = normalizeKeywordEntry(raw);
          return { keyword, category: cat.id, subcategory: sub.id };
        })
      );
    } else {
      // Lote ~95% feminino / 5% geral (até 40 buscas).
      plano = weightedKeywords({ femalePercent: DEFAULT_FEMALE_PERCENT }).slice(0, 40);
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
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
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
        const out = await saveOffersWithShortlinks(rows);
        saved = out.saved;
        skippedExisting = out.skippedExisting || 0;
        shortlinks = out.shortlinks;
      }
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }

    res.json({
      ok: true,
      femalePercentTarget: DEFAULT_FEMALE_PERCENT,
      keywordsRun: keywords.length,
      pages,
      listType: batch.listType,
      sortType: batch.sortType,
      listTypeLabel: batch.listTypeLabel,
      sortTypeLabel: batch.sortTypeLabel,
      filteredOut: batch.filteredOut,
      hasNextPage: batch.hasNextPage,
      saved,
      skippedExisting,
      shortlinks,
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
    const keywords = [];
    const subByKeyword = new Map();
    for (const sub of cat.subcategories || []) {
      for (const raw of sub.keywords || []) {
        const { keyword } = normalizeKeywordEntry(raw);
        if (!keyword) continue;
        keywords.push(keyword);
        subByKeyword.set(keyword.toLowerCase().trim(), sub.id);
      }
    }
    const listType = req.query.listType != null ? Number(req.query.listType) : 1;
    const sortType = req.query.sortType != null ? Number(req.query.sortType) : 5;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);
    const pages = Math.min(Math.max(Number(req.query.pages) || 1, 1), 5);
    const minRating = req.query.minRating != null ? Number(req.query.minRating) : MIN_RATING;
    const minSales = req.query.minSales != null ? Number(req.query.minSales) : MIN_SALES;
    const requireCommission =
      req.query.requireCommission == null
        ? true
        : req.query.requireCommission === "1" || req.query.requireCommission === "true";

    if (!keywords.length) {
      return res.status(400).json({ error: "Categoria sem keywords" });
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
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
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
        const out = await saveOffersWithShortlinks(rows);
        saved = out.saved;
        skippedExisting = out.skippedExisting || 0;
        shortlinks = out.shortlinks;
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
      skippedExisting,
      shortlinks,
      count: batch.count,
      report: batch.report,
      products: batch.products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let coverageCache = { at: 0, data: null };
const COVERAGE_TTL_MS = 60 * 1000;

/** Snapshot de cobertura (leitura) — sem token, como /api/status/shortlinks. */
app.get("/api/coverage", async (_req, res) => {
  try {
    if (coverageCache.data && Date.now() - coverageCache.at < COVERAGE_TTL_MS) {
      return res.json({ ...coverageCache.data, cached: true });
    }
    const report = await buildCoverageReport();
    coverageCache = { at: Date.now(), data: report };
    res.json({ ...report, cached: false });
  } catch (err) {
    console.error("[/api/coverage]", err.message);
    if (coverageCache.data) {
      return res.json({ ...coverageCache.data, cached: true, stale: true, error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message || "Falha ao calcular cobertura" });
  }
});

app.post("/api/sync/coverage", requireAdmin, async (req, res) => {
  try {
    const batchSize = Math.min(Math.max(Number(req.body?.batch) || 12, 1), 40);
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 5), 50);
    const pages = Math.min(Math.max(Number(req.body?.pages) || 1, 1), 3);
    const onlyCategory = req.body?.category ? String(req.body.category).trim() : "";
    const rotation = [
      { listType: 1, sortType: 5 },
      { listType: 2, sortType: 2 },
    ];
    const modeIdx = Number(req.body?.mode) || 0;
    const mode = rotation[modeIdx % rotation.length];
    const listType = req.body?.listType != null ? Number(req.body.listType) : mode.listType;
    const sortType = req.body?.sortType != null ? Number(req.body.sortType) : mode.sortType;

    const { queue, report } = await buildCoverageQueue({ femalePercent: DEFAULT_FEMALE_PERCENT });
    let jobs = onlyCategory ? queue.filter((j) => j.category === onlyCategory) : queue;
    jobs = jobs.slice(0, batchSize);

    if (!jobs.length) {
      return res.json({
        ok: true,
        saved: 0,
        processed: [],
        shortlinks: { generated: 0 },
        message: "Nenhum buraco na cobertura — fila vazia.",
        coverage: report,
      });
    }

    const keywords = jobs.map((j) => j.keyword);
    const batch = await fetchProductOffersBatch({
      keywords,
      pages,
      pageStart: 1,
      limit,
      listType,
      sortType,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
      requireCommission: true,
      minCommissionPct: DEFAULT_MIN_COMMISSION_PCT,
      gapMs: DEFAULT_BATCH_GAP_MS,
    });

    const planByKw = new Map(jobs.map((j) => [String(j.keyword).toLowerCase().trim(), j]));
    const kwById = new Map(
      (batch.products || []).map((p) => [String(p.itemId || p.id), p.keyword || ""])
    );

    let saved = 0;
    let skippedExisting = 0;
    let shortlinks = { generated: 0, failed: 0, skipped: 0 };
    if (batch.nodes?.length) {
      const rows = batch.nodes
        .map((n) => {
          const kw = kwById.get(String(n.itemId)) || keywords[0];
          const plan = planByKw.get(String(kw).toLowerCase().trim());
          return mapOfferToRow(n, kw, batch.listType, {
            forceCategory: plan?.category || null,
            forceSubcategory: plan?.subcategory || null,
          });
        })
        .filter((r) => r.item_id && r.offer_link);
      if (rows.length) {
        const out = await saveOffersWithShortlinks(rows);
        saved = out.saved;
        skippedExisting = out.skippedExisting || 0;
        shortlinks = out.shortlinks;
      }
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
      coverageCache = { at: 0, data: null };
    }

    const coverageAfter = await buildCoverageReport().catch(() => report);
    coverageCache = { at: Date.now(), data: coverageAfter };
    res.json({
      ok: true,
      femalePercentTarget: DEFAULT_FEMALE_PERCENT,
      listType,
      sortType,
      jobsRun: jobs.length,
      saved,
      skippedExisting,
      shortlinks,
      filteredOut: batch.filteredOut,
      processed: jobs.map((j) => ({
        keyword: j.keyword,
        category: j.category,
        subcategory: j.subcategory,
        audience: j.audience,
      })),
      coverage: coverageAfter,
    });
  } catch (err) {
    console.error("[/api/sync/coverage]", err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

app.get("/api/auto/status", (_req, res) => {
  res.json(autosync.getStatus());
});

app.post("/api/auto/run", requireAdmin, async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result, status: autosync.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Popular destaques (Top Performance). */
app.post("/api/auto/top-performance", requireAdmin, async (_req, res) => {
  try {
    const result = await autosync.runTopPerformance();
    res.json({ ok: true, result, status: autosync.getStatus() });
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

/** Força refresh dos top moneyScore (cron/manual). */
app.get("/api/cron/refresh-top", async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true, forcePhase: "refresh-top" });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Invariante B — reverifica sales/rating/comissão dos produtos com metricas antigas. */
app.get("/api/cron/refresh-metrics", async (req, res) => {
  try {
    const { refreshStaleMetrics } = require("./metricsRefresh");
    const { retryPendingShortlinks } = require("./linking");
    const batch = Math.min(Math.max(Number(req.query.batch) || 60, 5), 200);
    const staleHours = Math.min(Math.max(Number(req.query.staleHours) || 12, 1), 168);
    const metrics = await refreshStaleMetrics({ batch, staleHours });
    // Aproveita a janela pra retry dos shortlinks pending
    const links = await retryPendingShortlinks({ limit: 50 }).catch(() => null);
    res.json({ ok: true, metrics, links });
  } catch (err) {
    console.error("[/api/cron/refresh-metrics]", err.message);
    res.status(500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

/**
 * Admin — adiciona 1 produto manual à vitrine.
 * Recebe URL Shopee (obrigatória) OU { shopId, itemId }.
 * Puxa dados reais da API (comissão/sales/rating/preço), depois passa por
 * saveOffersWithShortlinks (Invariante A → SITE_SUBID no slot 1 + short_link real).
 * Overrides opcionais: category, subcategory (senão usa taxonomia automática).
 */
app.post("/api/admin/produto-manual", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    let itemId = Number(body.itemId);
    let shopId = Number(body.shopId);

    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      const raw = String(body.sourceUrl || body.url || "").trim();
      if (!raw) {
        return res.status(400).json({ error: "URL Shopee do produto é obrigatória (ex: shopee.com.br/product/SHOPID/ITEMID)" });
      }
      // shopee.com.br/product/{shop}/{item} ou shopee.com.br/{slug}-i.{shop}.{item}
      const m1 = raw.match(/shopee\.com\.br\/product\/(\d+)\/(\d+)/i);
      const m2 = raw.match(/-i\.(\d+)\.(\d+)/i);
      if (m1) { shopId = Number(m1[1]); itemId = Number(m1[2]); }
      else if (m2) { shopId = Number(m2[1]); itemId = Number(m2[2]); }
      else {
        return res.status(400).json({
          error: "URL não reconhecida. Use o formato: https://shopee.com.br/product/SHOPID/ITEMID ou https://shopee.com.br/produto-i.SHOPID.ITEMID",
        });
      }
    }
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: "item_id inválido" });
    }

    // Puxa dados reais da Shopee — comissão, sales, rating, preço, imagem
    const nodes = await fetchProductDetailsByIds([itemId]);
    const node = Array.isArray(nodes) && nodes.length ? nodes[0] : null;
    if (!node || !node.offerLink) {
      return res.status(404).json({
        error: "Shopee não retornou este produto — verifique se o link é público, se o produto ainda está ativo e se sua conta de afiliada tem acesso.",
      });
    }

    const keyword = String(body.keyword || node.productName || "").trim().toLowerCase().slice(0, 80);
    const forceCategory = body.category && String(body.category) !== "todos" ? String(body.category) : null;
    const forceSubcategory = body.subcategory ? String(body.subcategory) : null;
    const row = mapOfferToRow(node, keyword, body.listType != null ? Number(body.listType) : null, {
      forceCategory,
      forceSubcategory: forceCategory ? forceSubcategory : null,
    });
    // Overrides opcionais do admin (imagem custom / preço promocional que o admin quer destacar)
    if (body.imageUrl && /^https?:/i.test(String(body.imageUrl))) {
      row.image_url = String(body.imageUrl).trim();
    }

    if (!row.item_id || !row.offer_link) {
      return res.status(500).json({ error: "Dados incompletos da Shopee — não foi possível criar a oferta" });
    }

    // Passa por saveOffersWithShortlinks → ensureLinkedRows → SITE_SUBID + shortlink garantidos
    const out = await saveOffersWithShortlinks([row], { withShortlinks: true, skipExisting: false, gapMs: 100 });
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();

    res.json({
      ok: true,
      itemId: row.item_id,
      shopId: row.shop_id,
      saved: out.saved,
      alreadyExisted: out.skippedExisting > 0,
      shortLink: out.rows?.[0]?.short_link || null,
      subIds: out.rows?.[0]?.sub_ids || null,
      product: {
        title: row.product_name,
        image: row.image_url,
        priceMin: row.price_min,
        priceMax: row.price_max,
        commissionRate: row.commission_rate,
        sales: row.sales,
        ratingStar: row.rating_star,
        shopName: row.shop_name,
        category: row.category,
        subcategory: row.subcategory,
      },
    });
  } catch (err) {
    console.error("[/api/admin/produto-manual]", err.message);
    res.status(err.status || 500).json({
      error: err.message,
      rateLimited: !!err.rateLimited,
      details: err.payload || null,
    });
  }
});

/** Admin — reverifica UM item específico (venda/nota errada). */
app.post("/api/admin/reverify", requireAdmin, async (req, res) => {
  try {
    const { reverifyItem } = require("./metricsRefresh");
    const itemId = Number(req.body?.itemId || req.query?.itemId);
    const result = await reverifyItem(itemId);
    ofertasCache.clear();
    res.json(result);
  } catch (err) {
    console.error("[/api/admin/reverify]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Cron — puxa conversionReport das últimas 48h. */
app.get("/api/cron/conversions", async (req, res) => {
  try {
    const { pullConversionReport } = require("./conversions");
    const sinceMin = Math.min(Math.max(Number(req.query.sinceMin) || 60 * 48, 15), 60 * 24 * 30);
    const result = await pullConversionReport({ sinceMin });
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/conversions]", err.message);
    res.status(500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

/** Cron — puxa validatedReport (precisa validationId). */
app.post("/api/cron/validated", requireAdmin, async (req, res) => {
  try {
    const { pullValidatedReport } = require("./conversions");
    const validationId = Number(req.body?.validationId || req.query?.validationId);
    const result = await pullValidatedReport({ validationId });
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/validated]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Admin — Painel do Meu Site. onlyMeuSite=true por padrão (filtro SITE_SUBID). */
app.get("/api/admin/meu-site/summary", requireAdmin, async (req, res) => {
  try {
    const { summary } = require("./conversions");
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const onlyMeuSite = String(req.query.onlyMeuSite ?? "true") !== "false";
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const result = await summary({ from, to, days, onlyMeuSite });
    res.json(result);
  } catch (err) {
    console.error("[/api/admin/meu-site/summary]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Admin — reprocessa sub_ids de ofertas antigas sem SITE_SUBID no slot 1. */
app.post("/api/admin/meu-site/reprocess-subids", requireAdmin, async (req, res) => {
  try {
    const { reprocessSubIds } = require("./conversions");
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 500);
    const dryRun = !!req.body?.dryRun;
    const result = await reprocessSubIds({ limit, dryRun });
    ofertasCache.clear();
    res.json(result);
  } catch (err) {
    console.error("[/api/admin/meu-site/reprocess-subids]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Cron — feed FULL (1x/dia). Varre catálogo aprovado em páginas de 500. */
app.get("/api/cron/feed-full", async (req, res) => {
  try {
    const { runFullFeedSync } = require("./feedSync");
    const force = String(req.query.force || "").trim() === "1";
    const result = await runFullFeedSync({ forceReprocess: force });
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/feed-full]", err.message);
    res.status(500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

/** Cron — feed DELTA (1x/h). NEW/UPDATE upsert; DELETE marca hidden. */
app.get("/api/cron/feed-delta", async (req, res) => {
  try {
    const { runDeltaFeedSync } = require("./feedSync");
    const force = String(req.query.force || "").trim() === "1";
    const result = await runDeltaFeedSync({ forceReprocess: force });
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/feed-delta]", err.message);
    res.status(500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

/** Admin — decodifica um shortlink/URL Shopee e diz se é do meu site. */
app.get("/api/admin/link/decode", requireAdmin, async (req, res) => {
  try {
    const { decodeSubIdsFromUrl } = require("./conversions");
    const url = String(req.query?.url || "").trim();
    if (!url) return res.status(400).json({ error: "url obrigatório" });
    res.json(decodeSubIdsFromUrl(url));
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
    const { SITE_SUBID } = require("./tracking");
    let subIds = Array.isArray(req.body?.subIds) && req.body.subIds.length
      ? req.body.subIds.map(String)
      : buildProductSubIds("geral", req.body?.itemId);
    // Invariante A: slot 1 sempre SITE_SUBID — mesmo quando cliente manda subIds custom.
    if (subIds[0] !== SITE_SUBID) {
      subIds = [SITE_SUBID, ...subIds].slice(0, 5);
    }
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
 * Backfill de shortlinks: gera shope.ee para ofertas sem short_link cacheado.
 * all=true → continua até zerar a fila, rate-limit, ou teto de tempo (~45s, seguro no Vercel).
 */
async function backfillShortlinks({ limit = 50, gapMs = 400, all = false } = {}) {
  const batchSize = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let generated = 0;
  let failed = 0;
  let skipped = 0;
  let rounds = 0;
  const maxRounds = all ? 400 : 1;
  const started = Date.now();
  const timeBudgetMs = all ? 45000 : 55000;

  while (rounds < maxRounds) {
    if (Date.now() - started > timeBudgetMs) {
      return {
        ok: true,
        generated,
        failed,
        skipped,
        rounds,
        all,
        timedOut: true,
        message: "Parou no limite de tempo — clique de novo para continuar o restante.",
      };
    }
    rounds += 1;
    const rows = await listOffersMissingShortlink({ limit: batchSize });
    if (!Array.isArray(rows) || !rows.length) break;

    const result = await generateShortlinksForRows(rows, { gapMs: 0 });
    generated += result.generated;
    failed += result.failed;
    skipped += result.skipped;

    if (result.rateLimited) {
      return {
        ok: true,
        generated,
        failed,
        skipped,
        rounds,
        all,
        rateLimited: true,
        message: "Rate-limit da Shopee — rode de novo em alguns segundos para continuar.",
      };
    }
    if (!all) break;
    if (rounds < maxRounds) await sleep(gapMs);
  }

  return { ok: true, generated, failed, skipped, rounds, all, done: true };
}

app.get("/api/status/shortlinks", async (_req, res) => {
  try {
    const status = await countShortlinkStatus();
    res.json({ ...status, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[/api/status/shortlinks]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/shortlinks/backfill", requireAdmin, async (req, res) => {
  try {
    const all = req.body?.all !== false; // padrão: gera tudo que falta
    const limit = Number(req.body?.limit) || 50;
    const result = await backfillShortlinks({ limit, all });
    const status = await countShortlinkStatus().catch(() => null);
    res.json({ ...result, status });
  } catch (err) {
    console.error("[/api/shortlinks/backfill]", err.message);
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
      // Reconhece ambas as formas do marcador (com/sem underscore) —
      // histórico usava "afiliada_mestre"; novo padrão é "afiliadamestre".
      const markerCompact = marker.replace(/[^a-z0-9]/g, "");
      const markerLegacy = "afiliada_mestre";
      nodes = nodes.filter((conversion) => {
        const utm = String(conversion.utmContent || "").toLowerCase();
        return utm.includes(markerCompact) || utm.includes(markerLegacy);
      });
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
 * Agrupa conversões por canal (utmContent Sub ID slot 2) e por item.
 * Útil para decidir onde investir tráfego.
 */
app.get("/api/conversions/summary", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const now = Math.floor(Date.now() / 1000);
    const report = await fetchConversionReport({
      purchaseTimeStart: now - days * 24 * 3600,
      purchaseTimeEnd: now,
      limit: 50,
    });
    let nodes = Array.isArray(report.nodes) ? report.nodes : [];
    const marker = SITE_SUBID.toLowerCase();
    nodes = nodes.filter((c) => String(c.utmContent || "").toLowerCase().includes(marker));

    const byChannel = new Map();
    const byItem = new Map();
    for (const c of nodes) {
      const parts = String(c.utmContent || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const channel = (parts[1] || "organico").toLowerCase();
      const commission = Number(String(c.totalCommission || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      const ch = byChannel.get(channel) || { channel, conversions: 0, commission: 0 };
      ch.conversions += 1;
      ch.commission += commission;
      byChannel.set(channel, ch);

      for (const order of c.orders || []) {
        for (const item of order.items || []) {
          const id = String(item.itemId || "");
          if (!id) continue;
          const prev = byItem.get(id) || {
            itemId: id,
            itemName: item.itemName || "",
            qty: 0,
            commission: 0,
          };
          prev.qty += Number(item.qty) || 1;
          prev.commission += Number(item.itemTotalCommission) || 0;
          if (!prev.itemName && item.itemName) prev.itemName = item.itemName;
          byItem.set(id, prev);
        }
      }
    }

    const channels = [...byChannel.values()].sort((a, b) => b.commission - a.commission);
    const topItems = [...byItem.values()].sort((a, b) => b.commission - a.commission).slice(0, 30);
    res.json({
      ok: true,
      days,
      channels,
      topItems,
      conversions: nodes.length,
    });
  } catch (err) {
    console.error("[/api/conversions/summary]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * Lê winners do conversionReport e empurra keywords para a fila prioritária do autosync.
 */
app.post("/api/conversions/prioritize", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 90);
    const now = Math.floor(Date.now() / 1000);
    const report = await fetchConversionReport({
      purchaseTimeStart: now - days * 24 * 3600,
      purchaseTimeEnd: now,
      orderStatus: "COMPLETED",
      limit: 50,
    });
    let nodes = Array.isArray(report.nodes) ? report.nodes : [];
    const marker = SITE_SUBID.toLowerCase();
    nodes = nodes.filter((c) => String(c.utmContent || "").toLowerCase().includes(marker));

    const jobs = [];
    const seen = new Set();
    for (const c of nodes) {
      for (const order of c.orders || []) {
        for (const item of order.items || []) {
          const name = String(item.itemName || "").trim();
          if (!name) continue;
          const cat = categoryForKeyword(name) || "todos";
          // Usa as 4 primeiras palavras do nome como keyword de reforço
          const keyword = name.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
          const key = `${cat}::${keyword}`;
          if (seen.has(key) || keyword.length < 8) continue;
          seen.add(key);
          jobs.push({
            keyword,
            category: cat !== "todos" ? cat : null,
            subcategory: null,
            audience: "feminino",
            source: "conversion",
            gap: 25,
          });
        }
      }
    }

    const result = autosync.prioritizeJobs(jobs.slice(0, 25));
    res.json({
      ok: true,
      days,
      fromConversions: nodes.length,
      jobsQueued: result.added,
      priorityQueueSize: result.queueSize,
      samples: jobs.slice(0, 10),
    });
  } catch (err) {
    console.error("[/api/conversions/prioritize]", err.message);
    res.status(err.status || 500).json({ error: err.message });
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
    // Invariante A: garante sub_ids[0] = SITE_SUBID e short_link antes do upsert.
    const { ensureLinkedRows } = require("./linking");
    const linkResult = await ensureLinkedRows(rows, { regenerate: false });
    const saved = await upsertOfertas(linkResult.rows);
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    res.json({
      ok: true,
      requested: ids.length,
      saved: Array.isArray(saved) ? saved.length : rows.length,
      shortlinks: {
        generated: linkResult.generated,
        pending: linkResult.pending,
        skipped: linkResult.skipped,
      },
    });
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

/** Preview de duplicados (loja+nome idêntico / mesmo item ou link Shopee). */
app.get("/api/ofertas/duplicates", requireAdmin, async (req, res) => {
  try {
    const max = Math.min(Math.max(Number(req.query.max) || 5000, 100), 10000);
    const report = await scanDuplicates({ max });
    res.json({ ok: true, ...report });
  } catch (err) {
    console.error("[/api/ofertas/duplicates]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Remove duplicados — mantém o melhor de cada grupo (shortlink + score). */
app.post("/api/ofertas/duplicates/remove", requireAdmin, async (req, res) => {
  try {
    const max = Math.min(Math.max(Number(req.body?.max) || 5000, 100), 10000);
    const dryRun = req.body?.dryRun === true;
    const result = await removeDuplicates({ max, dryRun });
    if (!dryRun && result.removed) {
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
    }
    res.json(result);
  } catch (err) {
    console.error("[/api/ofertas/duplicates/remove]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Preview de ofertas fracas (nota/vendas/comissão abaixo do filtro). */
app.get("/api/ofertas/weak", requireAdmin, async (req, res) => {
  try {
    const max = Math.min(Math.max(Number(req.query.max) || 5000, 100), 10000);
    const report = await scanWeakOffers({
      max,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
    });
    res.json({ ok: true, ...report });
  } catch (err) {
    console.error("[/api/ofertas/weak]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Remove ofertas fracas do catálogo legado. */
app.post("/api/ofertas/purge-weak", requireAdmin, async (req, res) => {
  try {
    const max = Math.min(Math.max(Number(req.body?.max) || 5000, 100), 10000);
    const dryRun = !!req.body?.dryRun;
    const result = await purgeWeakOffers({
      max,
      dryRun,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
    });
    if (!dryRun && result.removed) {
      categoriasCache = { at: 0, data: null };
      ofertasCache.clear();
      coverageCache = { at: 0, data: null };
    }
    res.json(result);
  } catch (err) {
    console.error("[/api/ofertas/purge-weak]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Reconsulta top moneyScore na Shopee e atualiza (bypass skipExisting). */
app.post("/api/ofertas/refresh-top", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 40, 10), 80);
    const result = await refreshTopOffers({
      limit,
      minRating: MIN_RATING,
      minSales: MIN_SALES,
      minCommissionPct: req.body?.minCommissionPct != null
        ? Number(req.body.minCommissionPct)
        : DEFAULT_MIN_COMMISSION_PCT,
    });
    categoriasCache = { at: 0, data: null };
    ofertasCache.clear();
    coverageCache = { at: 0, data: null };
    res.json(result);
  } catch (err) {
    console.error("[/api/ofertas/refresh-top]", err.message);
    res.status(err.status || 500).json({ error: err.message, rateLimited: !!err.rateLimited });
  }
});

/**
 * Landing page ultra-leve do produto — abre o "popup" ANTES da vitrine carregar.
 * Usada em links de campanha compartilhados no Facebook/Instagram/WhatsApp.
 *   /p/:itemId?utm_campaign=...&utm_source=...&utm_medium=...
 *
 * Fluxo: HTML < 8KB → imagem+preço+CTA imediato → click sai para shope.ee com Sub IDs.
 * Vitrine completa carrega em segundo plano (defer) para quem fechar o popup.
 */
app.get("/p/:itemId", async (req, res) => {
  const itemId = Number(String(req.params.itemId).replace(/[^\d]/g, ""));
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    return res.redirect(302, "/");
  }
  const q = req.query || {};
  const attribution = {
    channel: String(q.utm_source || q.canal || q.source || q.ref || "organico"),
    campaign: String(q.utm_campaign || q.campanha || q.campaign || "vitrine"),
    medium: String(q.utm_medium || q.medium || "social"),
  };

  try {
    const rows = await getOffersByItemIds([itemId], { full: true });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      const back = new URLSearchParams({
        produto: String(itemId),
        utm_campaign: attribution.campaign,
        utm_source: attribution.channel,
        utm_medium: attribution.medium,
      }).toString();
      return res.redirect(302, `/?${back}`);
    }
    const product = rowToProduct(row);
    // Para generateShortLink precisamos do URL "cru" (shopee.com.br/product/...);
    // affiliateLink já vem encurtado (s.shopee.com.br) e o Shopee rejeita.
    const rawOrigin = product.productLink && /shopee\.com\.br\/(product|(?:i\/)?[^\/]+\/[^\/]+)/i.test(product.productLink)
      ? product.productLink
      : (product.affiliateLink && product.affiliateLink !== "#" ? product.affiliateLink : "");
    const buyFallback = product.affiliateLink && product.affiliateLink !== "#"
      ? product.affiliateLink
      : (product.productLink || "");

    let shortLink = product.shortLink || null;
    const isDefaultAttribution =
      attribution.channel === "organico" &&
      attribution.campaign === "vitrine";
    // Gera shortlink com Sub IDs da campanha (ou usa o cacheado quando é orgânico)
    if (rawOrigin && (!shortLink || !isDefaultAttribution)) {
      try {
        const subIds = buildTrackedSubIds(
          product.category,
          itemId,
          product.subcategory,
          attribution
        );
        const generated = await generateShortLink(rawOrigin, subIds);
        if (generated) {
          shortLink = generated;
          if (isDefaultAttribution) {
            // Só cacheia o link "orgânico" — links de campanha são efêmeros
            updateShortLink(itemId, generated).catch(() => {});
          }
        }
      } catch (linkErr) {
        console.warn("[/p/:itemId] shortlink falhou:", linkErr.message);
      }
    }

    const buyHref = shortLink || buyFallback || "#";
    const priceNew = Number(product.newPrice) || 0;
    const priceOld = Number(product.oldPrice) || 0;
    const brl = (n) => "R$ " + n.toFixed(2).replace(".", ",");
    const oldPriceHtml = priceOld > priceNew
      ? `<div class="old-price">De: ${brl(priceOld)}</div>` : "";
    const discountHtml = product.discountPct
      ? `<span class="discount-badge">-${product.discountPct}%</span>` : "";
    const shopHtml = product.shopName
      ? `<div class="shop">Vendido por <strong>${escapeHtmlSSR(product.shopName)}</strong></div>` : "";
    const backHref = "/?" + new URLSearchParams({
      utm_campaign: attribution.campaign,
      utm_source: attribution.channel,
      utm_medium: attribution.medium,
    }).toString();

    res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=1800");
    res.send(renderFastPopup({
      product,
      buyHref,
      backHref,
      oldPriceHtml,
      discountHtml,
      shopHtml,
      priceNewFmt: brl(priceNew),
      attribution,
    }));
  } catch (err) {
    console.error("[/p/:itemId]", err.message);
    return res.redirect(302, "/");
  }
});

function escapeHtmlSSR(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFastPopup({ product, buyHref, backHref, oldPriceHtml, discountHtml, shopHtml, priceNewFmt, attribution }) {
  const title = escapeHtmlSSR(product.title || "Oferta Shopee");
  const image = escapeHtmlSSR(product.image || "");
  const category = escapeHtmlSSR(product.category || "");
  const desc = escapeHtmlSSR(product.desc || "");
  const stars = Math.max(1, Math.min(5, Math.round(Number(product.stars) || 4)));
  const salesTxt = escapeHtmlSSR(product.sales || "");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,follow">
<title>${title} — Afiliada Mestre</title>
<meta property="og:title" content="${title}">
<meta property="og:image" content="${image}">
<meta property="og:type" content="product">
<link rel="preconnect" href="https://shope.ee">
<link rel="preconnect" href="https://s.shopee.com.br">
<link rel="preconnect" href="https://cf.shopee.com.br">
<link rel="dns-prefetch" href="https://shopee.com.br">
${image ? `<link rel="preload" as="image" href="${image}">` : ""}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a}
body{background:#f8fafc;overflow:hidden}
.store-bg{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:0;background:#f8fafc}
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10;display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.card{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:16px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(15,23,42,.35);overflow:hidden;animation:pop .18s ease-out;z-index:11}
@keyframes pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
.head{background:#fff;color:#0f172a;padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0}
.head span{color:#475569}
.close{background:#f1f5f9;border:0;color:#475569;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;text-decoration:none;display:flex;align-items:center;justify-content:center;transition:background .12s}
.close:hover{background:#e2e8f0;color:#0f172a}
.img-wrap{position:relative;aspect-ratio:1;background:#f8fafc;overflow:hidden}
.img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.discount-badge{position:absolute;top:12px;right:12px;background:#ee4d2d;color:#fff;padding:5px 10px;border-radius:8px;font-weight:700;font-size:12px;letter-spacing:.3px}
.body{padding:18px}
.cat{display:inline-block;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-bottom:10px;letter-spacing:.4px}
h1{font-size:15px;line-height:1.4;margin-bottom:8px;font-weight:600;color:#0f172a}
.stars{color:#f59e0b;font-size:12px;margin-bottom:10px;letter-spacing:1px}
.stars span{color:#94a3b8;margin-left:6px;letter-spacing:0}
.price-box{background:#fafafa;border:1px solid #f1f5f9;border-radius:10px;padding:10px 12px;margin-bottom:10px}
.old-price{font-size:11px;color:#94a3b8;text-decoration:line-through}
.new-price{font-size:26px;font-weight:800;color:#ee4d2d;line-height:1.1;margin-top:2px}
.desc{font-size:12px;color:#475569;line-height:1.55;padding:9px 11px;border-left:3px solid #e2e8f0;margin-bottom:12px}
.shop{font-size:11px;color:#64748b;margin-bottom:12px}
.shop strong{color:#0f172a;font-weight:600}
.cta{display:block;width:100%;background:#ee4d2d;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:.4px;transition:background .12s;border:0;cursor:pointer}
.cta:hover{background:#d94220}
.cta:active{transform:translateY(1px)}
.more{display:block;text-align:center;margin-top:12px;color:#64748b;font-size:11px;text-decoration:none;padding:6px;cursor:pointer;background:none;border:0;width:100%}
.more:hover{color:#ee4d2d}
.foot{padding:8px 16px 14px;font-size:10px;color:#94a3b8;text-align:center;line-height:1.5;border-top:1px solid #f1f5f9}
</style>
</head>
<body>
<iframe class="store-bg" src="${escapeHtmlSSR(backHref)}" title="Vitrine Afiliada Mestre" loading="eager" referrerpolicy="no-referrer"></iframe>
<div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-labelledby="p-title">
  <main class="card" role="main">
    <header class="head">
      <span>Oferta selecionada</span>
      <a class="close" href="${backHref}" id="btn-close" aria-label="Fechar">&times;</a>
    </header>
    <div class="img-wrap">
      ${image ? `<img src="${image}" alt="${title}" fetchpriority="high">` : ""}
      ${discountHtml}
    </div>
    <div class="body">
      ${category ? `<div class="cat">${category}</div>` : ""}
      <h1 id="p-title">${title}</h1>
      <div class="stars">${"★".repeat(stars)}${"☆".repeat(5 - stars)} ${salesTxt ? `<span>(${salesTxt})</span>` : ""}</div>
      <div class="price-box">
        ${oldPriceHtml}
        <div class="new-price">${priceNewFmt}</div>
      </div>
      ${desc ? `<div class="desc">${desc}</div>` : ""}
      ${shopHtml}
      <a class="cta" href="${escapeHtmlSSR(buyHref)}" target="_blank" rel="nofollow sponsored noopener">Comprar na Shopee</a>
      <button type="button" class="more" id="btn-more">Ver mais ofertas</button>
    </div>
    <div class="foot">Link de afiliada. Ao comprar você apoia o site sem custo extra.</div>
  </main>
</div>
<script>
(function(){
  // Fecha overlay in-page — a vitrine já está carregada atrás no iframe,
  // então basta esconder o overlay pra o cliente enxergar a home pronta.
  function closeOverlay(){
    var ov = document.getElementById('overlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
  var btnClose = document.getElementById('btn-close');
  var btnMore  = document.getElementById('btn-more');
  var overlay  = document.getElementById('overlay');
  if (btnClose) btnClose.addEventListener('click', function(e){ e.preventDefault(); closeOverlay(); });
  if (btnMore)  btnMore.addEventListener('click',  function(e){ e.preventDefault(); closeOverlay(); });
  if (overlay)  overlay.addEventListener('click',  function(e){ if (e.target === overlay) closeOverlay(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeOverlay(); });
})();
</script>
</body>
</html>`;
}

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
  // 0.0.0.0 é obrigatório no Railway/Docker — sem isso o healthcheck não alcança o app.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Afiliado Mestre rodando em http://0.0.0.0:${PORT}`);
    console.log(`Vitrine: http://localhost:${PORT}/`);
    console.log(`Admin:   http://localhost:${PORT}/admin`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    autosync.start();
  });
}

module.exports = app;
