"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const {
  fetchProductOffers,
  generateShortLink,
  mapOfferToProduct,
  mapOfferToRow,
} = require("./shopee");
const {
  upsertOfertas,
  listOfertas,
  countByCategory,
  rowToProduct,
  getConfig,
} = require("./supabase");
const { CATEGORIAS, allKeywords, metaOnly } = require("./categorias");
const autosync = require("./autosync");

const app = express();
const PORT = Number(process.env.PORT) || 3789;
const ROOT = path.join(__dirname, "..");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
 * Query: keyword, limit, page, sync=1 (grava no Supabase)
 */
app.get("/api/ofertas", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "oferta").trim();
    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;
    const sync = req.query.sync === "1" || req.query.sync === "true";

    const offer = await fetchProductOffers({ keyword, limit, page });
    const nodes = offer.nodes || [];
    const products = nodes.map((n) => mapOfferToProduct(n, keyword));

    let saved = 0;
    if (sync && nodes.length) {
      const rows = nodes.map((n) => mapOfferToRow(n, keyword)).filter((r) => r.item_id);
      const result = await upsertOfertas(rows);
      saved = Array.isArray(result) ? result.length : rows.length;
    }

    res.json({
      source: "shopee",
      keyword,
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
 * Lê ofertas já salvas no Supabase (cache da vitrine).
 * Query: keyword, category, limit, offset
 */
app.get("/api/ofertas/db", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    const category = String(req.query.category || "").trim();
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const rows = await listOfertas({ keyword, category, limit, offset });
    const list = Array.isArray(rows) ? rows : [];
    res.json({
      source: "supabase",
      count: list.length,
      offset,
      limit,
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
 * Devolve as categorias configuradas + contagem de itens no Supabase.
 */
app.get("/api/categorias", async (_req, res) => {
  try {
    let counts = {};
    try {
      counts = await countByCategory();
    } catch (e) {
      console.warn("[/api/categorias] Supabase indisponível:", e.message);
    }
    const categories = metaOnly().map((c) => ({
      ...c,
      count: counts[c.id] || 0,
    }));
    categories.unshift({
      id: "todos",
      label: "Tudo",
      icon: "fa-border-all",
      color: "orange",
      count: counts.total || 0,
    });
    res.json({ categories, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sincroniza keywords → Shopee → Supabase.
 * Body: { keywords?: string[], category?: string, limit?: number }
 *  - Sem body: usa TODAS as keywords do dicionário CATEGORIAS (varredura completa).
 *  - Com category: só as keywords daquela categoria.
 *  - Com keywords: usa a lista fornecida (categoria inferida).
 */
app.post("/api/sync", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 5), 50);
    let plano;

    if (Array.isArray(req.body?.keywords) && req.body.keywords.length) {
      plano = req.body.keywords.map((k) => ({ keyword: String(k), category: null }));
    } else if (req.body?.category) {
      const target = String(req.body.category).trim();
      const cat = CATEGORIAS.find((c) => c.id === target);
      plano = (cat?.keywords || []).map((k) => ({ keyword: k, category: cat.id }));
    } else {
      plano = allKeywords();
    }

    if (!plano.length) {
      return res.status(400).json({ error: "Nenhuma keyword para sincronizar" });
    }

    const allProducts = [];
    const report = [];

    for (const { keyword, category } of plano) {
      try {
        const offer = await fetchProductOffers({ keyword, limit, page: 1 });
        const nodes = offer.nodes || [];
        const rows = nodes.map((n) => mapOfferToRow(n, keyword)).filter((r) => r.item_id);
        if (rows.length) await upsertOfertas(rows);
        const products = nodes.map((n) => mapOfferToProduct(n, keyword));
        allProducts.push(...products);
        report.push({ keyword, category, ok: true, count: nodes.length });
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
      report,
      count: map.size,
      products: [...map.values()],
    });
  } catch (err) {
    console.error("[/api/sync]", err.message);
    res.status(500).json({ error: err.message, details: err.payload || null });
  }
});

/**
 * Atalho GET para sincronizar todas as keywords de uma categoria.
 * Ex.: GET /api/sync/categoria/eletronicos?limit=25
 */
app.get("/api/sync/categoria/:id", async (req, res) => {
  try {
    const catId = String(req.params.id || "").trim();
    const cat = CATEGORIAS.find((c) => c.id === catId);
    if (!cat) return res.status(404).json({ error: `Categoria desconhecida: ${catId}` });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);
    const all = [];
    const report = [];
    for (const kw of cat.keywords) {
      try {
        const offer = await fetchProductOffers({ keyword: kw, limit, page: 1 });
        const nodes = offer.nodes || [];
        const rows = nodes.map((n) => mapOfferToRow(n, kw)).filter((r) => r.item_id);
        if (rows.length) await upsertOfertas(rows);
        all.push(...nodes.map((n) => mapOfferToProduct(n, kw)));
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
      keywordsRun: cat.keywords.length,
      count: map.size,
      report,
      products: [...map.values()],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Status do alimentador automático (para o painel admin). */
app.get("/api/auto/status", (_req, res) => {
  res.json(autosync.status());
});

/** Dispara manualmente um lote do auto-sync (admin). */
app.post("/api/auto/run", async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result, status: autosync.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint para Cron (ex.: Vercel Cron chama via GET).
 * Em ambientes serverless o setInterval não roda, então a alimentação
 * automática acontece por aqui, agendada externamente.
 */
app.get("/api/cron/sync", async (_req, res) => {
  try {
    const result = await autosync.runOnce({ manual: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/shortlink", async (req, res) => {
  try {
    const originUrl = String(req.body?.originUrl || "").trim();
    if (!originUrl) return res.status(400).json({ error: "originUrl obrigatório" });
    const subIds = Array.isArray(req.body?.subIds) ? req.body.subIds.map(String) : ["vitrine", "afiliado_mestre"];
    const shortLink = await generateShortLink(originUrl, subIds);
    res.json({ shortLink });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.payload || null });
  }
});

// Arquivos estáticos do projeto
app.use(express.static(ROOT));
app.use("/uploads", express.static(path.join(ROOT, "uploads")));

app.get("/", (_req, res) => {
  res.redirect("/uploads/painel_e_vitrine_afiliado_mestre.html");
});

// Servidor contínuo (local, Render, Railway, VPS...). Em serverless (Vercel)
// o arquivo é importado como handler e este bloco não executa.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Afiliado Mestre rodando em http://localhost:${PORT}`);
    console.log(`Vitrine: http://localhost:${PORT}/uploads/painel_e_vitrine_afiliado_mestre.html`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    autosync.start();
  });
}

module.exports = app;
