"use strict";

/**
 * Motor de cobertura: preenche buracos por categoria/subcategoria
 * com fila 95% feminino / 5% geral e prioridade moda/beleza.
 */

const {
  CATEGORIAS,
  FEMININE_CATEGORY_IDS,
  DEFAULT_FEMALE_PERCENT,
  isFeminineCategory,
  normalizeKeywordEntry,
  flatKeywords,
} = require("./categorias");
const { countByCategory, countBySubcategory } = require("./supabase");

const MIN_PER_SUB_FEMALE = clampNum(process.env.COVERAGE_MIN_SUB_FEMALE, 8, 2, 40);
const MIN_PER_SUB_GENERAL = clampNum(process.env.COVERAGE_MIN_SUB_GENERAL, 3, 1, 20);
const MIN_PER_CAT_FEMALE = clampNum(process.env.COVERAGE_MIN_CAT_FEMALE, 40, 8, 200);
const MIN_PER_CAT_GENERAL = clampNum(process.env.COVERAGE_MIN_CAT_GENERAL, 12, 3, 80);

const PRIORITY_CATS = ["moda", "beleza", "acessorios", "fitness", "maternidade", "saude", "casa", "presentes"];

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function targetFor(categoryId) {
  const feminine = isFeminineCategory(categoryId);
  return {
    minPerSub: feminine ? MIN_PER_SUB_FEMALE : MIN_PER_SUB_GENERAL,
    minPerCat: feminine ? MIN_PER_CAT_FEMALE : MIN_PER_CAT_GENERAL,
    feminine,
  };
}

function catPriority(categoryId) {
  const idx = PRIORITY_CATS.indexOf(categoryId);
  if (idx >= 0) return idx;
  if (FEMININE_CATEGORY_IDS.has(categoryId)) return PRIORITY_CATS.length;
  return PRIORITY_CATS.length + 10;
}

/**
 * Snapshot de cobertura: categorias → subcategorias com count/target/gap.
 * Contagens em paralelo para não estourar timeout no Vercel.
 */
async function buildCoverageReport() {
  const [catCounts, subCountsList] = await Promise.all([
    countByCategory().catch(() => ({ total: 0 })),
    Promise.all(CATEGORIAS.map((cat) => countBySubcategory(cat.id).catch(() => ({})))),
  ]);

  let gaps = 0;
  let femaleGaps = 0;
  let generalGaps = 0;

  const categories = CATEGORIAS.map((cat, idx) => {
    const targets = targetFor(cat.id);
    const subCounts = subCountsList[idx] || {};
    const subcategories = (cat.subcategories || []).map((sub) => {
      const count = Number(subCounts[sub.id]) || 0;
      const target = targets.minPerSub;
      const gap = Math.max(0, target - count);
      if (gap > 0) {
        gaps += 1;
        if (targets.feminine) femaleGaps += 1;
        else generalGaps += 1;
      }
      const entries = (sub.keywords || []).map(normalizeKeywordEntry);
      return {
        id: sub.id,
        label: sub.label,
        count,
        target,
        gap,
        ok: gap === 0,
        keywords: entries.map((e) => e.keyword),
        femaleKeywords: entries.filter((e) => e.audience === "feminino").map((e) => e.keyword),
        generalKeywords: entries.filter((e) => e.audience === "geral").map((e) => e.keyword),
      };
    });
    const count = Number(catCounts[cat.id]) || 0;
    const catGap = Math.max(0, targets.minPerCat - count);
    return {
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      color: cat.color,
      feminine: targets.feminine,
      count,
      target: targets.minPerCat,
      gap: catGap,
      ok: catGap === 0 && subcategories.every((s) => s.ok),
      priority: catPriority(cat.id),
      subcategories,
    };
  });

  categories.sort((a, b) => a.priority - b.priority || b.gap - a.gap);

  return {
    femalePercentTarget: DEFAULT_FEMALE_PERCENT,
    minPerSubFemale: MIN_PER_SUB_FEMALE,
    minPerSubGeneral: MIN_PER_SUB_GENERAL,
    gaps,
    femaleGaps,
    generalGaps,
    totalProducts: Number(catCounts.total) || 0,
    categories,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fila de keywords para preencher buracos.
 * Ordem: subs femininas com gap → cats feminizadas → 5% geral.
 */
async function buildCoverageQueue({ femalePercent = DEFAULT_FEMALE_PERCENT } = {}) {
  const report = await buildCoverageReport();
  const femaleJobs = [];
  const generalJobs = [];

  const sorted = [...report.categories].sort((a, b) => a.priority - b.priority);

  for (const cat of sorted) {
    for (const sub of cat.subcategories || []) {
      if (sub.gap <= 0) continue;
      const femKw = sub.femaleKeywords || [];
      const genKw = sub.generalKeywords || [];
      for (const keyword of femKw) {
        femaleJobs.push({
          keyword,
          category: cat.id,
          subcategory: sub.id,
          audience: "feminino",
          gap: sub.gap,
          priority: cat.priority,
        });
      }
      for (const keyword of genKw) {
        generalJobs.push({
          keyword,
          category: cat.id,
          subcategory: sub.id,
          audience: "geral",
          gap: sub.gap,
          priority: cat.priority + 100,
        });
      }
      if (!femKw.length && !genKw.length && Array.isArray(sub.keywords)) {
        for (const keyword of sub.keywords) {
          femaleJobs.push({
            keyword,
            category: cat.id,
            subcategory: sub.id,
            audience: cat.feminine ? "feminino" : "geral",
            gap: sub.gap,
            priority: cat.priority,
          });
        }
      }
    }
  }

  if (!femaleJobs.length && !generalJobs.length) {
    for (const cat of CATEGORIAS.filter((c) => FEMININE_CATEGORY_IDS.has(c.id))) {
      for (const entry of flatKeywords(cat).filter((k) => k.audience === "feminino")) {
        femaleJobs.push({
          keyword: entry.keyword,
          category: entry.category,
          subcategory: entry.subcategory,
          audience: "feminino",
          gap: 0,
          priority: catPriority(cat.id),
          reinforce: true,
        });
      }
    }
  }

  const pct = Math.min(99, Math.max(1, Number(femalePercent) || DEFAULT_FEMALE_PERCENT));
  const block = 20;
  const femaleSlots = Math.max(1, Math.round((pct / 100) * block));
  const generalSlots = Math.max(1, block - femaleSlots);
  const queue = [];
  let fi = 0;
  let gi = 0;
  const maxLen = Math.max(femaleJobs.length, generalJobs.length, 1) * block;

  while (queue.length < maxLen && (fi < femaleJobs.length * 3 || gi < generalJobs.length * 3)) {
    for (let i = 0; i < femaleSlots && queue.length < maxLen && femaleJobs.length; i += 1) {
      queue.push(femaleJobs[fi % femaleJobs.length]);
      fi += 1;
    }
    for (let i = 0; i < generalSlots && queue.length < maxLen && generalJobs.length; i += 1) {
      queue.push(generalJobs[gi % generalJobs.length]);
      gi += 1;
    }
    if (!femaleJobs.length && !generalJobs.length) break;
    if (!generalJobs.length && fi >= femaleJobs.length) break;
    if (!femaleJobs.length && gi >= generalJobs.length) break;
    if (fi >= femaleJobs.length * 2 && gi >= Math.max(1, generalJobs.length) * 2) break;
  }

  const seen = new Set();
  const deduped = [];
  for (const job of queue) {
    const key = `${job.category}:${job.subcategory}:${job.keyword}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  return { queue: deduped, report };
}

module.exports = {
  buildCoverageReport,
  buildCoverageQueue,
  targetFor,
  MIN_PER_SUB_FEMALE,
  MIN_PER_SUB_GENERAL,
  DEFAULT_FEMALE_PERCENT,
};
