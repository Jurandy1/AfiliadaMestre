"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const {
  fetchProductOffers,
  fetchProductDetailsByIds,
  fetchShopeeOffers,
  generateShortLink,
  mapOfferToProduct,
  mapOfferToRow,
  mapCampaignNode,
  fetchConversionReport,
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
} = require("./supabase");
const { CATEGORIAS, categoryForKeyword, weightedKeywords, allKeywords, metaOnly } = require("./categorias");
const { refillVitrine } = require("./refillVitrine");
const { productMatchesSubcategory } = require("./productMeta");
const autosync = require("./autosync");

const app = express();
const PORT = Number(process.env.PORT) || 3789;
const ROOT = path.join(__dirname, "..");

/** Marcador fixo nos Sub IDs deste site (aparece em utmContent da Shopee). */
const SITE_SUBID = "afiliada_mestre";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Cache leve em memória para campanhas (reduz hits Shopee/Vercel)
let campaignsCache = { at: 0, data: null };
const CAMPAIGNS_TTL_MS = 30 * 60 * 1000;

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
 * Query: keyword, limit, page, listType, sortType, sync=1
 */
app.get("/api/ofertas", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "oferta").trim();
    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;
    const listType = req.query.listType != null ? Number(req.query.listType) : 0;
    const sortType = req.query.sortType != null ? Number(req.query.sortType) : 2;
    const sync = req.query.sync === "1" || req.query.sync === "true";

    const offer = await fetchProductOffers({ keyword, limit, page, listType, sortType });
    const nodes = offer.nodes || [];
    const products = nodes.map((n) => mapOfferToProduct(n, keyword, listType));

    let saved = 0;
    if (sync && nodes.length) {
      const rows = nodes.map((n) => mapOfferToRow(n, keyword, listType)).filter((r) => r.item_id && r.offer_link);
      const result = await upsertOfertas(rows);
      saved = Array.isArray(result) ? result.length : rows.length;
    }

    res.json({
      source: "shopee",
      keyword,
      listType,
      sortType,
      count: products.length,
      saved,
      pageInfo: offer.pageInfo || {},
      products,
    });
  } catch (err) {
    console.error("[/api/ofertas]", err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || null,
      details: err.payload || null,
    });
  }
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
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const sort = String(req.query.sort || "recent").trim();
    const rows = await listOfertas({ keyword, category, subcategory, limit, offset, sort });
    const list = Array.isArray(rows) ? rows : [];
    res.json({
      source: "supabase",
      count: list.length,
      offset,
      limit,
      sort,
      products: list.map(rowToProduct),
    });
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

app.get("/api/categorias", async (_req, res) => {
  try {
    let counts = {};
    try {
      counts = await countByCategory();
    } catch (e) {
      console.warn("[/api/categorias] Supabase indisponível:", e.message);
    }
    const categories = await Promise.all(
      metaOnly().map(async (c) => {
        let subCounts = {};
        try {
          const rows = await listOfertas({ category: c.id, limit: 200, offset: 0 });
          const products = (Array.isArray(rows) ? rows : []).map(rowToProduct);
          for (const sub of c.subcategories || []) {
            subCounts[sub.id] = products.filter((p) => productMatchesSubcategory(p, c.id, sub.id)).length;
          }
        } catch (_) {
          try {
            subCounts = await countBySubcategory(c.id);
          } catch (__) {}
        }
        return {
          ...c,
          count: counts[c.id] || 0,
          subcategories: (c.subcategories || []).map((sub) => ({
            ...sub,
            count: subCounts[sub.id] || 0,
          })),
        };
      })
    );
    categories.unshift({
      id: "todos",
      label: "Tudo",
      icon: "fa-border-all",
      color: "orange",
      count: counts.total || 0,
      subcategories: [],
    });
    res.json({ categories, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 5), 50);
    const listType = req.body?.listType != null ? Number(req.body.listType) : 0;
    const sortType = req.body?.sortType != null ? Number(req.body.sortType) : 2;
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

    const allProducts = [];
    const report = [];

    for (const { keyword, category } of plano) {
      try {
        const offer = await fetchProductOffers({ keyword, limit, page: 1, listType, sortType });
        const nodes = offer.nodes || [];
        const rows = nodes.map((n) => mapOfferToRow(n, keyword, listType)).filter((r) => r.item_id && r.offer_link);
        if (rows.length) await upsertOfertas(rows);
        const products = nodes.map((n) => mapOfferToProduct(n, keyword, listType));
        allProducts.push(...products);
        report.push({ keyword, category, ok: true, count: nodes.length, listType, sortType });
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        report.push({ keyword, category, ok: false, error: e.message });
      }
    }

    const map = new Map();
    for (const p of allProducts) map.set(String(p.id), p);

    res.json({
      ok: true,
      keywordsRun: plano.length,
      listType,
      sortType,
      report,
      count: map.size,
      products: [...map.values()],
    });
  } catch (err) {
    console.error("[/api/sync]", err.message);
    res.status(500).json({ error: err.message, details: err.payload || null });
  }
});

app.get("/api/sync/categoria/:id", async (req, res) => {
  try {
    const catId = String(req.params.id || "").trim();
    const cat = CATEGORIAS.find((c) => c.id === catId);
    if (!cat) return res.status(404).json({ error: `Categoria desconhecida: ${catId}` });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);
    const listType = req.query.listType != null ? Number(req.query.listType) : 0;
    const sortType = req.query.sortType != null ? Number(req.query.sortType) : 2;
    const all = [];
    const report = [];
    const keywords = (cat.subcategories || []).flatMap((sub) => sub.keywords);
    for (const kw of keywords) {
      try {
        const offer = await fetchProductOffers({ keyword: kw, limit, page: 1, listType, sortType });
        const nodes = offer.nodes || [];
        const rows = nodes.map((n) => mapOfferToRow(n, kw, listType)).filter((r) => r.item_id && r.offer_link);
        if (rows.length) await upsertOfertas(rows);
        all.push(...nodes.map((n) => mapOfferToProduct(n, kw, listType)));
        report.push({ keyword: kw, ok: true, count: nodes.length });
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        report.push({ keyword: kw, ok: false, error: e.message });
      }
    }
    const map = new Map();
    for (const p of all) map.set(String(p.id), p);
    res.json({
      ok: true,
      category: cat.id,
      keywordsRun: keywords.length,
      listType,
      sortType,
      count: map.size,
      report,
      products: [...map.values()],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auto/status", (_req, res) => {
  res.json(autosync.status());
});

app.post("/api/auto/run", async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result, status: autosync.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Popular destaques (Top Performance). */
app.post("/api/auto/top-performance", async (_req, res) => {
  try {
    const result = await autosync.runTopPerformance({ manual: true });
    res.json({ ok: true, result, status: autosync.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cron/sync", async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const subIds = Array.isArray(req.body?.subIds)
      ? req.body.subIds.map(String)
      : [SITE_SUBID, "site", "vitrine"];
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
app.post("/api/reset-vitrine", async (req, res) => {
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

app.use(express.static(ROOT));
app.use("/uploads", express.static(path.join(ROOT, "uploads")));

app.get("/", (req, res) => {
  // Mantém ?admin=1 e outros parâmetros no redirect para a vitrine.
  const qs = new URLSearchParams(req.query).toString();
  const target = `/uploads/painel_e_vitrine_afiliado_mestre.html${qs ? `?${qs}` : ""}`;
  res.redirect(302, target);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Afiliado Mestre rodando em http://localhost:${PORT}`);
    console.log(`Vitrine: http://localhost:${PORT}/uploads/painel_e_vitrine_afiliado_mestre.html`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    autosync.start();
  });
}

module.exports = app;
