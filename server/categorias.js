"use strict";

/**
 * Mapa de categorias — afiliada focada em público feminino.
 * Feed: ~95% keywords femininas / ~5% gerais (cobertura mínima unissex).
 * Home filtra 100% feminino via isFemaleAudience + FEMININE_CATEGORY_IDS.
 */

const DEFAULT_FEMALE_PERCENT = 95;

/** Categorias tratadas como vitrine feminina (home 100%). */
const FEMININE_CATEGORY_IDS = new Set([
  "moda",
  "beleza",
  "acessorios",
  "fitness",
  "maternidade",
  "saude",
  "casa",
  "presentes",
  "pet",
  "infantil",
]);

/** Ordem de destaque na home (femininas primeiro). */
const HOME_CATEGORY_ORDER = [
  "moda",
  "beleza",
  "acessorios",
  "fitness",
  "maternidade",
  "saude",
  "casa",
  "presentes",
  "pet",
  "infantil",
  "celular",
  "eletronicos",
  "utilidades",
  "automotivo",
];

/**
 * keywords: string = feminino (padrão)
 * { q, audience: "geral"|"feminino" } = explícito
 */
const CATEGORIAS = [
  {
    id: "moda",
    label: "Moda Feminina",
    icon: "fa-shirt",
    color: "pink",
    subcategories: [
      { id: "vestidos", label: "Vestidos & Saias", keywords: ["vestido longo feminino", "vestido midi feminino", "vestido curto feminino", "saia midi feminina", "saia plissada feminina"] },
      { id: "calcas", label: "Calças & Leggings", keywords: ["calca jeans feminina", "calca pantalona feminina", "calca linho feminina", "legging cintura alta feminina", "short alfaiataria feminino"] },
      { id: "tops", label: "Tops & Blusas", keywords: ["cropped feminino", "conjunto feminino verao", "macacao feminino", "blusa feminina", "camiseta feminina oversized"] },
      { id: "calcados", label: "Calçados", keywords: ["sandalia feminina", "tenis feminino casual", "bota feminina", "chinelo feminino", "rasteirinha feminina"] },
      { id: "bolsas", label: "Bolsas", keywords: ["bolsa transversal feminina", "bolsa estruturada feminina", "bolsa tiracolo feminina", "bolsa tote feminina"] },
      { id: "praia", label: "Moda Praia", keywords: ["biquini feminino", "maio feminino", "saida de praia feminina", "canga praia"] },
      { id: "plus_size", label: "Plus Size", keywords: ["vestido longo plus size feminino", "calca jeans plus size feminina", "roupa plus size feminina", "blusa plus size feminina"] },
      { id: "lingerie", label: "Lingerie", keywords: ["calcinha invisivel feminina", "lingerie feminina", "conjunto lingerie feminino", "sutiã sem costura"] },
      { id: "moda_fria", label: "Moda Fria", keywords: ["jaqueta oversized feminina", "casaco feminino", "conjunto moletom feminino", "cardigan feminino"] },
      { id: "casa_moda", label: "Pijamas & Casa", keywords: ["pijama feminino", "conjunto pijama feminino", "robe feminino", "camisola feminina"] },
    ],
  },
  {
    id: "beleza",
    label: "Beleza",
    icon: "fa-spa",
    color: "purple",
    subcategories: [
      {
        id: "pele",
        label: "Skincare",
        keywords: [
          "serum vitamina c facial",
          "serum acido hialuronico",
          "protetor solar facial fps 50",
          "mascara facial hidratante",
          "tonico facial coreano",
          "kit skincare feminino",
          "skincare coreano",
        ],
      },
      {
        id: "maquiagem",
        label: "Maquiagem",
        keywords: [
          "base de maquiagem",
          "lip tint",
          "batom liquido matte",
          "paleta de sombras",
          "corretivo alta cobertura",
          "primer maquiagem",
          "pincel maquiagem profissional",
        ],
      },
      {
        id: "cabelo",
        label: "Cabelo",
        keywords: [
          "mascara capilar hidratacao",
          "oleo capilar argan",
          "leave-in cacheado",
          "escova alisadora ceramica",
          "secador de cabelo profissional",
          "chapinha de cabelo",
        ],
      },
      { id: "perfumes", label: "Perfumes", keywords: ["perfume feminino", "perfume inspirado feminino", "oleo corporal perfumado feminino", "body splash feminino"] },
      { id: "unhas", label: "Unhas", keywords: ["kit unha gel", "esmalte gel", "cabine unha led"] },
      {
        id: "acessorios_beleza",
        label: "Acessórios de Beleza",
        keywords: ["boob tape", "organizador maquiagem", "espelho led maquiagem", "ring light maquiagem"],
      },
    ],
  },
  {
    id: "acessorios",
    label: "Acessórios",
    icon: "fa-gem",
    color: "yellow",
    subcategories: [
      { id: "joias", label: "Joias", keywords: ["brincos pingente dourado", "colar feminino", "conjunto brinco e colar feminino", "pulseira feminina", "anel feminino"] },
      { id: "relogios", label: "Relógios", keywords: ["relogio feminino", "relogio feminino dourado"] },
      { id: "oculos", label: "Óculos", keywords: ["oculos de sol feminino", "oculos retro feminino"] },
      { id: "bolsas_acessorios", label: "Bolsas & Carteiras", keywords: ["carteira feminina", "necessaire feminina", "porta cartao feminino"] },
      {
        id: "cabelo_acessorios",
        label: "Cabelo",
        keywords: ["xuxinha meia seda kit", "scrunchie feminino", "tiara com laco", "grampo bico de pato", "presilha cabelo"],
      },
      { id: "outros", label: "Outros", keywords: ["cinto feminino", "bone feminino", "chapeu bucket feminino", "lenco feminino"] },
    ],
  },
  {
    id: "fitness",
    label: "Fitness",
    icon: "fa-dumbbell",
    color: "emerald",
    subcategories: [
      {
        id: "roupa_fitness",
        label: "Roupas",
        keywords: ["roupa fitness feminina", "legging fitness feminina", "top fitness feminino", "conjunto fitness feminino", "short academia feminino"],
      },
      {
        id: "equipamentos",
        label: "Equipamentos",
        keywords: ["kit elastico resistencia", "tapete yoga", "halter feminino", "corda de pular"],
      },
      {
        id: "bem_estar",
        label: "Bem-estar",
        keywords: ["oleo essencial lavanda", "difusor ultrassonico", "colageno hidrolisado", "cha detox"],
      },
    ],
  },
  {
    id: "maternidade",
    label: "Mãe & Bebê",
    icon: "fa-baby",
    color: "rose",
    subcategories: [
      {
        id: "bebe_menina",
        label: "Bebê Menina",
        keywords: [
          "roupa de bebe menina",
          "vestido bebe feminino",
          "body bebe feminino",
          "tiara laco bebe",
          "kit roupas bebe menina",
        ],
      },
      {
        id: "maternidade_roupa",
        label: "Gestante",
        keywords: ["roupa gestante", "conjunto maternidade", "sutiã amamentacao", "calca gestante", "camisola amamentacao"],
      },
      {
        id: "higiene_bebe",
        label: "Higiene Bebê",
        keywords: ["fralda bebe", "lenço umedecido bebe", "pomada assadura", "shampoo bebe", "kit higiene bebe"],
      },
      {
        id: "enxoval",
        label: "Enxoval",
        keywords: ["kit enxoval bebe menina", "manta bebe", "trocador portatil", "bolsa maternidade", "macacao bebe feminino"],
      },
    ],
  },
  {
    id: "saude",
    label: "Saúde & Bem-estar",
    icon: "fa-heart-pulse",
    color: "rose",
    subcategories: [
      {
        id: "suplementos",
        label: "Suplementos",
        keywords: ["colageno hidrolisado", "vitamina c mulher", "omega 3", "multivitaminico feminino", "whey protein feminino"],
      },
      {
        id: "cuidado_pessoal",
        label: "Cuidado Pessoal",
        keywords: ["depilador feminino", "aparelho depilacao", "creme hidratante corporal", "protetor labial"],
      },
      {
        id: "higiene_intima",
        label: "Higiene Íntima",
        keywords: ["absorvente noturno", "protetor diario feminino", "sabonete intimo", "kit higiene intima"],
      },
    ],
  },
  {
    id: "casa",
    label: "Casa",
    icon: "fa-couch",
    color: "amber",
    subcategories: [
      {
        id: "cozinha",
        label: "Cozinha",
        keywords: [
          "air fryer",
          "panela antiaderente",
          "jogo de panelas",
          "utensilio cozinha silicone",
          { q: "liquidificador", audience: "geral" },
        ],
      },
      {
        id: "decoracao",
        label: "Decoração",
        keywords: [
          "jogo de cama casal 400 fios",
          "cortina blackout sala",
          "tapete sala felpudo",
          "papel de parede adesivo",
          "vaso decorativo",
          "almofada decorativa",
        ],
      },
      {
        id: "organizacao",
        label: "Organização",
        keywords: [
          "organizador geladeira",
          "caixa organizadora transparente",
          "organizador closet",
          "organizador maquiagem gaveta",
        ],
      },
      {
        id: "limpeza",
        label: "Limpeza & Clima",
        keywords: [
          "aspirador portatil",
          "umidificador ultrassonico",
          "difusor aroma casa",
          { q: "vassoura magica", audience: "geral" },
        ],
      },
    ],
  },
  {
    id: "celular",
    label: "Celular",
    icon: "fa-mobile-screen-button",
    color: "cyan",
    subcategories: [
      {
        id: "protecao",
        label: "Proteção",
        keywords: [
          "capinha celular feminina",
          "capinha celular aesthetic",
          "pelicula vidro temperado",
          "case celular com cordao",
        ],
      },
      {
        id: "energia",
        label: "Energia & Cabos",
        keywords: [
          "power bank compacto",
          "carregador rapido tipo c",
          { q: "cabo carregador iphone", audience: "geral" },
          { q: "adaptador usb c", audience: "geral" },
        ],
      },
      {
        id: "acessorios_cel",
        label: "Acessórios",
        keywords: [
          "suporte celular mesa",
          "ring light celular",
          "suporte selfie celular",
          { q: "suporte celular carro", audience: "geral" },
        ],
      },
    ],
  },
  {
    id: "eletronicos",
    label: "Eletrônicos",
    icon: "fa-laptop",
    color: "blue",
    subcategories: [
      {
        id: "audio",
        label: "Áudio",
        keywords: [
          "fone bluetooth feminino",
          "fone tws rosa",
          "fone esportivo feminino",
          "caixa de som bluetooth portatil",
        ],
      },
      {
        id: "wearables",
        label: "Relógios & Wearables",
        keywords: ["smartwatch feminino", "smartband feminino", "relogio smart feminino"],
      },
      {
        id: "informatica",
        label: "Informática",
        keywords: [
          "carregador rapido",
          "hub usb c",
          { q: "mouse sem fio", audience: "geral" },
          { q: "teclado bluetooth", audience: "geral" },
        ],
      },
      {
        id: "video",
        label: "Vídeo & Projeção",
        keywords: ["ring light tripé", "mini projetor portatil", { q: "projetor portatil", audience: "geral" }],
      },
      {
        id: "smart_home",
        label: "Casa Inteligente",
        keywords: ["lampada led wifi", "lampada rgb quarto", { q: "camera seguranca wifi", audience: "geral" }],
      },
    ],
  },
  {
    id: "pet",
    label: "Pet Shop",
    icon: "fa-paw",
    color: "orange",
    subcategories: [
      {
        id: "gatos",
        label: "Gatos",
        keywords: ["areia sanitaria gato", "brinquedo gato interativo", "cama gato", "racao umida gato"],
      },
      {
        id: "caes",
        label: "Cães",
        keywords: ["roupa para cachorro", "coleira para cao", "cama para cachorro", "antipulgas caes"],
      },
      {
        id: "acessorios_pet",
        label: "Acessórios Pet",
        keywords: ["comedouro elevado pet", "bebedouro automatico pet", "necessaire pet passeio"],
      },
    ],
  },
  {
    id: "infantil",
    label: "Infantil",
    icon: "fa-child-reaching",
    color: "indigo",
    subcategories: [
      {
        id: "brinquedos",
        label: "Brinquedos",
        keywords: ["boneca", "pelucia", "brinquedo educativo menina", { q: "lego montar", audience: "geral" }],
      },
      {
        id: "roupa_infantil",
        label: "Roupas & Calçados",
        keywords: ["roupa infantil menina", "vestido infantil menina", "tenis infantil menina"],
      },
      {
        id: "escola",
        label: "Escola",
        keywords: ["mochila escolar infantil menina", "estojo escolar menina"],
      },
    ],
  },
  {
    id: "presentes",
    label: "Presentes & Papelaria",
    icon: "fa-gift",
    color: "fuchsia",
    subcategories: [
      {
        id: "papelaria",
        label: "Papelaria Aesthetic",
        keywords: ["caderno aesthetic", "caneta gel kit", "planner feminino", "adesivo scrapbook", "washi tape kit"],
      },
      {
        id: "presentes_fem",
        label: "Presentes",
        keywords: ["kit presente feminino", "caixa presente mulher", "kit spa presente", "caneca personalizada feminina"],
      },
      {
        id: "viagem",
        label: "Viagem",
        keywords: ["necessaire viagem feminina", "organizador mala", "travesseiro viagem", "kit viagem feminino"],
      },
    ],
  },
  {
    id: "utilidades",
    label: "Utilidades",
    icon: "fa-toolbox",
    color: "teal",
    subcategories: [
      {
        id: "ferramentas",
        label: "Ferramentas",
        keywords: [
          { q: "kit ferramentas", audience: "geral" },
          { q: "furadeira", audience: "geral" },
        ],
      },
      {
        id: "dia_a_dia",
        label: "Dia a dia",
        keywords: [
          "garrafa termica feminina",
          "guarda chuva compacto",
          { q: "balanca digital", audience: "geral" },
        ],
      },
      {
        id: "organizacao_util",
        label: "Organização",
        keywords: ["kit organizador banheiro", "organizador cosmeticos", "caixa organizadora makeup"],
      },
    ],
  },
  {
    id: "automotivo",
    label: "Automotivo",
    icon: "fa-car",
    color: "slate",
    subcategories: [
      {
        id: "limpeza_auto",
        label: "Limpeza",
        keywords: ["aspirador automotivo", { q: "cera automotiva", audience: "geral" }],
      },
      {
        id: "tecnologia_auto",
        label: "Tecnologia",
        keywords: ["suporte celular carro", { q: "camera automotiva", audience: "geral" }],
      },
      {
        id: "conforto_auto",
        label: "Conforto",
        keywords: ["aromatizante carro", "organizador porta malas", "capa banco carro feminina"],
      },
    ],
  },
];

function normalizeKeywordEntry(entry) {
  if (typeof entry === "string") {
    return { keyword: entry.trim(), audience: "feminino" };
  }
  const q = String(entry?.q || entry?.keyword || "").trim();
  const audience = entry?.audience === "geral" ? "geral" : "feminino";
  return { keyword: q, audience };
}

function flatKeywords(category) {
  return (category.subcategories || []).flatMap((sub) =>
    (sub.keywords || [])
      .map(normalizeKeywordEntry)
      .filter((k) => k.keyword)
      .map((k) => ({
        keyword: k.keyword,
        category: category.id,
        subcategory: sub.id,
        audience: k.audience,
      }))
  );
}

// Índices keyword → categoria / subcategoria / audience
const KEYWORD_TO_CATEGORY = new Map();
const KEYWORD_TO_SUBCATEGORY = new Map();
const KEYWORD_TO_AUDIENCE = new Map();
const SUBCATEGORY_INDEX = new Map();

for (const cat of CATEGORIAS) {
  for (const sub of cat.subcategories || []) {
    const normalized = (sub.keywords || []).map(normalizeKeywordEntry);
    SUBCATEGORY_INDEX.set(`${cat.id}:${sub.id}`, {
      categoryId: cat.id,
      id: sub.id,
      label: sub.label,
      keywords: normalized.map((k) => k.keyword),
      keywordEntries: normalized,
    });
    for (const k of normalized) {
      const key = k.keyword.toLowerCase();
      KEYWORD_TO_CATEGORY.set(key, cat.id);
      KEYWORD_TO_SUBCATEGORY.set(key, sub.id);
      KEYWORD_TO_AUDIENCE.set(key, k.audience);
    }
  }
}

function femaleKeywords() {
  return CATEGORIAS.flatMap((c) => flatKeywords(c).filter((k) => k.audience === "feminino"));
}

function generalKeywords() {
  return CATEGORIAS.flatMap((c) => flatKeywords(c).filter((k) => k.audience === "geral"));
}

function weightedKeywords({ femalePercent = DEFAULT_FEMALE_PERCENT } = {}) {
  const female = femaleKeywords();
  const general = generalKeywords();
  if (!female.length) return general;
  if (!general.length) return female;

  // 95 → 19 female + 1 general por bloco de 20 (mais preciso que slots/10)
  const pct = Math.min(99, Math.max(1, Number(femalePercent) || DEFAULT_FEMALE_PERCENT));
  const block = 20;
  const femaleSlots = Math.max(1, Math.round((pct / 100) * block));
  const generalSlots = Math.max(1, block - femaleSlots);
  const total = Math.max(female.length, general.length) * block;
  const result = [];
  let fi = 0;
  let gi = 0;

  while (result.length < total) {
    for (let i = 0; i < femaleSlots && result.length < total; i += 1) {
      result.push(female[fi % female.length]);
      fi += 1;
    }
    for (let i = 0; i < generalSlots && result.length < total; i += 1) {
      result.push(general[gi % general.length]);
      gi += 1;
    }
  }
  return result;
}

function categoryForKeyword(keyword) {
  const kw = String(keyword || "").toLowerCase().trim();
  if (!kw) return "todos";
  if (KEYWORD_TO_CATEGORY.has(kw)) return KEYWORD_TO_CATEGORY.get(kw);
  for (const [key, catId] of KEYWORD_TO_CATEGORY.entries()) {
    if (kw.includes(key) || key.includes(kw)) return catId;
  }
  const tokens = kw.split(/\s+/).filter((t) => t.length > 3);
  if (tokens.length) {
    let best = null;
    let bestHits = 0;
    for (const [key, catId] of KEYWORD_TO_CATEGORY.entries()) {
      const hits = tokens.filter((t) => key.includes(t)).length;
      if (hits > bestHits && hits >= Math.min(2, tokens.length)) {
        bestHits = hits;
        best = catId;
      }
    }
    if (best) return best;
  }
  return "todos";
}

function subcategoryForKeyword(keyword) {
  const kw = String(keyword || "").toLowerCase().trim();
  if (!kw) return null;
  if (KEYWORD_TO_SUBCATEGORY.has(kw)) return KEYWORD_TO_SUBCATEGORY.get(kw);
  for (const [key, subId] of KEYWORD_TO_SUBCATEGORY.entries()) {
    if (kw.includes(key) || key.includes(kw)) return subId;
  }
  const tokens = kw.split(/\s+/).filter((t) => t.length > 3);
  if (tokens.length) {
    let best = null;
    let bestHits = 0;
    for (const [key, subId] of KEYWORD_TO_SUBCATEGORY.entries()) {
      const hits = tokens.filter((t) => key.includes(t)).length;
      if (hits > bestHits && hits >= Math.min(2, tokens.length)) {
        bestHits = hits;
        best = subId;
      }
    }
    if (best) return best;
  }
  return null;
}

function subcategoryMeta(categoryId, subcategoryId) {
  return SUBCATEGORY_INDEX.get(`${categoryId}:${subcategoryId}`) || null;
}

function keywordsForSubcategory(categoryId, subcategoryId) {
  const sub = subcategoryMeta(categoryId, subcategoryId);
  return sub ? sub.keywords : [];
}

function keywordEntriesForSubcategory(categoryId, subcategoryId) {
  const sub = subcategoryMeta(categoryId, subcategoryId);
  return sub ? sub.keywordEntries || [] : [];
}

function allKeywords() {
  return CATEGORIAS.flatMap((c) => flatKeywords(c));
}

function subcategoriesFor(categoryId) {
  const cat = CATEGORIAS.find((c) => c.id === categoryId);
  if (!cat) return [];
  return (cat.subcategories || []).map(({ id, label }) => ({ id, label, key: id }));
}

function metaOnly() {
  return CATEGORIAS.map((cat) => ({
    id: cat.id,
    label: cat.label,
    icon: cat.icon,
    color: cat.color,
    feminine: FEMININE_CATEGORY_IDS.has(cat.id),
    subcategories: (cat.subcategories || []).map((sub) => {
      const entries = (sub.keywords || []).map(normalizeKeywordEntry);
      return {
        id: sub.id,
        label: sub.label,
        key: sub.id,
        keywords: entries.map((e) => e.keyword),
      };
    }),
  }));
}

function sortCategoriesForHome(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  const order = new Map(HOME_CATEGORY_ORDER.map((id, i) => [id, i]));
  return arr.sort((a, b) => {
    const ai = order.has(a.id) ? order.get(a.id) : 999;
    const bi = order.has(b.id) ? order.get(b.id) : 999;
    return ai - bi;
  });
}

/** Keywords únicas em ordem de prioridade (95% feminino primeiro). */
function prioritizedKeywords({ femalePercent = DEFAULT_FEMALE_PERCENT } = {}) {
  const seen = new Set();
  const result = [];

  for (const entry of weightedKeywords({ femalePercent })) {
    if (seen.has(entry.keyword)) continue;
    seen.add(entry.keyword);
    result.push(entry);
  }
  for (const entry of allKeywords()) {
    if (seen.has(entry.keyword)) continue;
    seen.add(entry.keyword);
    result.push(entry);
  }
  return result;
}

function roundRobinKeywords() {
  const buckets = CATEGORIAS.map((cat) => flatKeywords(cat));
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  const result = [];
  for (let i = 0; i < maxLen; i += 1) {
    for (const bucket of buckets) {
      if (bucket[i]) result.push(bucket[i]);
    }
  }
  return result;
}

const FEMALE_TITLE_RE =
  /feminin|mulher|menina|gestante|matern|maquiagem|skincare|batom|vestido|saia|biquini|lingerie|suti[aã]|calcinha|bolsa femin|necessaire|cropped|pantalo|sandalia|rasteir|scrunchie|boob\s*tape|plus\s*size|amamenta/i;

/**
 * Produto é “público feminino” para home 100%.
 * Aceita row DB, product da vitrine ou objeto parcial.
 */
function isFemaleAudience(product = {}) {
  const cat = String(product.category || product.categoryId || "").toLowerCase();
  if (FEMININE_CATEGORY_IDS.has(cat)) return true;
  const kw = String(product.keyword || "").toLowerCase();
  if (kw && KEYWORD_TO_AUDIENCE.get(kw) === "feminino") return true;
  if (kw && KEYWORD_TO_AUDIENCE.get(kw) === "geral") return false;
  const blob = `${product.title || ""} ${product.productName || product.product_name || ""} ${kw} ${product.subcategory || ""}`;
  return FEMALE_TITLE_RE.test(blob);
}

function isFeminineCategory(categoryId) {
  return FEMININE_CATEGORY_IDS.has(String(categoryId || "").toLowerCase());
}

module.exports = {
  CATEGORIAS,
  FEMININE_CATEGORY_IDS,
  HOME_CATEGORY_ORDER,
  DEFAULT_FEMALE_PERCENT,
  categoryForKeyword,
  subcategoryForKeyword,
  subcategoryMeta,
  keywordsForSubcategory,
  keywordEntriesForSubcategory,
  allKeywords,
  femaleKeywords,
  generalKeywords,
  flatKeywords,
  weightedKeywords,
  prioritizedKeywords,
  roundRobinKeywords,
  subcategoriesFor,
  metaOnly,
  sortCategoriesForHome,
  isFemaleAudience,
  isFeminineCategory,
  normalizeKeywordEntry,
};
