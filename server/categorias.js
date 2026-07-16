"use strict";

// Categoria → subcategorias agrupadas (cada subcategoria tem 1+ keywords de busca).
// Keywords baseadas no Mapa Shopee 2026 — foco 90% feminino na exibição.
// Mantém em sincronia com o fallback do frontend da vitrine.
const CATEGORIAS = [
  {
    id: "eletronicos",
    label: "Eletrônicos",
    icon: "fa-laptop",
    color: "blue",
    subcategories: [
      { id: "audio", label: "Áudio", keywords: ["fone bluetooth sem fio", "fone tws", "caixa de som bluetooth portatil", "fone esportivo"] },
      { id: "wearables", label: "Relógios & Wearables", keywords: ["smartwatch"] },
      { id: "informatica", label: "Informática", keywords: ["mouse gamer", "teclado mecanico", "carregador rapido", "cabo tipo c"] },
      { id: "video", label: "Vídeo & Projeção", keywords: ["projetor portatil"] },
      { id: "smart_home", label: "Casa Inteligente", keywords: ["lampada led wifi", "camera seguranca wifi"] },
    ],
  },
  {
    id: "celular",
    label: "Celular",
    icon: "fa-mobile-alt",
    color: "cyan",
    subcategories: [
      { id: "protecao", label: "Proteção", keywords: ["capinha celular", "pelicula vidro temperado"] },
      { id: "energia", label: "Energia & Cabos", keywords: ["power bank", "carregador rapido tipo c", "cabo carregador iphone", "adaptador usb c"] },
      { id: "acessorios_cel", label: "Acessórios", keywords: ["suporte celular carro", "suporte celular mesa"] },
    ],
  },
  {
    id: "casa",
    label: "Casa",
    icon: "fa-couch",
    color: "amber",
    subcategories: [
      { id: "cozinha", label: "Cozinha", keywords: ["air fryer", "panela antiaderente", "utensilio cozinha"] },
      { id: "decoracao", label: "Decoração", keywords: ["jogo de cama casal 400 fios", "cortina blackout", "tapete sala", "papel de parede adesivo", "vaso decorativo"] },
      { id: "organizacao", label: "Organização", keywords: ["organizador geladeira", "caixa organizadora transparente"] },
      { id: "limpeza", label: "Limpeza & Clima", keywords: ["aspirador portatil", "umidificador ultrassonico"] },
    ],
  },
  {
    id: "moda",
    label: "Moda Feminina",
    icon: "fa-tshirt",
    color: "pink",
    subcategories: [
      {
        id: "vestidos",
        label: "Vestidos & Saias",
        keywords: ["vestido longo feminino", "vestido midi feminino", "saia feminina"],
      },
      {
        id: "calcas",
        label: "Calças & Leggings",
        keywords: ["calca jeans feminina", "calca pantalona feminina", "calca linho feminina", "legging cintura alta", "short alfaiataria feminino"],
      },
      {
        id: "tops",
        label: "Tops & Blusas",
        keywords: ["cropped feminino", "conjunto feminino", "macacao feminino", "blusa feminina", "camiseta feminina"],
      },
      {
        id: "calcados",
        label: "Calçados",
        keywords: ["sandalia feminina", "tenis feminino", "bota feminina", "chinelo feminino"],
      },
      {
        id: "bolsas",
        label: "Bolsas",
        keywords: ["bolsa transversal feminina", "bolsa estruturada feminina", "bolsa tiracolo feminina"],
      },
      {
        id: "praia",
        label: "Moda Praia",
        keywords: ["biquini feminino", "maio feminino", "saida de praia feminina"],
      },
      {
        id: "plus_size",
        label: "Plus Size",
        keywords: ["vestido longo plus size", "calca jeans plus size", "roupa plus size feminina"],
      },
      {
        id: "lingerie",
        label: "Lingerie",
        keywords: ["calcinha invisivel", "lingerie feminina", "conjunto lingerie feminino"],
      },
      {
        id: "moda_fria",
        label: "Moda Fria",
        keywords: ["jaqueta oversized feminina", "casaco feminino", "conjunto moletom feminino"],
      },
      {
        id: "casa_moda",
        label: "Pijamas & Casa",
        keywords: ["pijama feminino", "conjunto pijama feminino", "robe feminino", "roupa de casa feminina"],
      },
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
          "serum vitamina c",
          "serum acido hialuronico",
          "protetor solar fps 50",
          "mascara facial hidratante",
          "tonico facial coreano",
          "kit skincare",
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
          "secador de cabelo",
          "chapinha de cabelo",
        ],
      },
      {
        id: "perfumes",
        label: "Perfumes",
        keywords: ["perfume inspirado feminino", "perfume feminino", "oleo corporal perfumado"],
      },
      { id: "unhas", label: "Unhas", keywords: ["kit unha gel"] },
      {
        id: "acessorios_beleza",
        label: "Acessórios de Beleza",
        keywords: ["boob tape", "organizador maquiagem", "espelho led maquiagem"],
      },
    ],
  },
  {
    id: "acessorios",
    label: "Acessórios",
    icon: "fa-clock",
    color: "yellow",
    subcategories: [
      {
        id: "joias",
        label: "Joias",
        keywords: ["brincos pingente dourado", "colar feminino", "conjunto brinco e colar", "pulseira feminina"],
      },
      { id: "relogios", label: "Relógios", keywords: ["relogio feminino"] },
      {
        id: "oculos",
        label: "Óculos",
        keywords: ["oculos de sol feminino", "oculos retro feminino"],
      },
      {
        id: "bolsas_acessorios",
        label: "Bolsas & Carteiras",
        keywords: ["carteira feminina", "necessaire feminina"],
      },
      {
        id: "cabelo_acessorios",
        label: "Cabelo",
        keywords: ["xuxinha meia seda kit", "scrunchie", "tiara com laco", "grampo bico de pato", "presilha cabelo"],
      },
      {
        id: "outros",
        label: "Outros",
        keywords: ["cinto feminino", "bone feminino", "chapeu bucket feminino"],
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
        label: "Maternidade",
        keywords: ["roupa gestante", "conjunto maternidade", "macacao bebe feminino"],
      },
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
        keywords: ["roupa fitness feminina", "legging fitness feminina", "top fitness feminino", "conjunto fitness feminino"],
      },
      {
        id: "equipamentos",
        label: "Equipamentos",
        keywords: ["kit elastico resistencia", "tapete yoga", "halter feminino"],
      },
      {
        id: "bem_estar",
        label: "Bem-estar",
        keywords: ["oleo essencial lavanda", "difusor ultrassonico", "colageno hidrolisado"],
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
        keywords: ["areia biodegradavel gato", "areia sanitaria gato", "racao para gatos", "brinquedo gato interativo"],
      },
      {
        id: "caes",
        label: "Cães",
        keywords: ["cama para cachorro", "coleira para cao", "antipulgas caes", "roupa para cachorro"],
      },
      {
        id: "acessorios_pet",
        label: "Acessórios Pet",
        keywords: ["comedouro elevado pet", "bebedouro automatico pet"],
      },
    ],
  },
  {
    id: "utilidades",
    label: "Utilidades",
    icon: "fa-tools",
    color: "teal",
    subcategories: [
      { id: "ferramentas", label: "Ferramentas", keywords: ["kit ferramentas", "furadeira"] },
      { id: "dia_a_dia", label: "Dia a dia", keywords: ["garrafa termica", "balanca digital", "mochila", "guarda chuva"] },
      { id: "organizacao_util", label: "Organização", keywords: ["kit organizador banheiro"] },
    ],
  },
  {
    id: "automotivo",
    label: "Automotivo",
    icon: "fa-car",
    color: "slate",
    subcategories: [
      { id: "limpeza_auto", label: "Limpeza", keywords: ["aspirador automotivo", "cera automotiva"] },
      { id: "tecnologia_auto", label: "Tecnologia", keywords: ["camera automotiva", "suporte celular carro automotivo"] },
      { id: "conforto_auto", label: "Conforto", keywords: ["organizador porta malas", "capa de banco automotivo", "aromatizante carro"] },
    ],
  },
  {
    id: "infantil",
    label: "Infantil",
    icon: "fa-child",
    color: "indigo",
    subcategories: [
      { id: "brinquedos", label: "Brinquedos", keywords: ["brinquedo educativo", "lego montar", "boneca", "carrinho de brinquedo", "pelucia"] },
      { id: "roupa_infantil", label: "Roupas & Calçados", keywords: ["roupa infantil menina", "tenis infantil"] },
      { id: "escola", label: "Escola", keywords: ["mochila escolar infantil"] },
    ],
  },
];

const FEMININE_CATEGORY_IDS = new Set(["moda", "beleza", "acessorios", "fitness", "maternidade"]);

// Índices keyword → categoria / subcategoria
const KEYWORD_TO_CATEGORY = new Map();
const KEYWORD_TO_SUBCATEGORY = new Map();
const SUBCATEGORY_INDEX = new Map();

for (const cat of CATEGORIAS) {
  for (const sub of cat.subcategories || []) {
    SUBCATEGORY_INDEX.set(`${cat.id}:${sub.id}`, { categoryId: cat.id, ...sub });
    for (const kw of sub.keywords) {
      const key = kw.toLowerCase().trim();
      KEYWORD_TO_CATEGORY.set(key, cat.id);
      KEYWORD_TO_SUBCATEGORY.set(key, sub.id);
    }
  }
}

function flatKeywords(category) {
  return (category.subcategories || []).flatMap((sub) =>
    sub.keywords.map((keyword) => ({ keyword, category: category.id, subcategory: sub.id }))
  );
}

function femaleKeywords() {
  return CATEGORIAS
    .filter((c) => FEMININE_CATEGORY_IDS.has(c.id))
    .flatMap((c) => flatKeywords(c).map((k) => ({ ...k, audience: "feminino" })));
}

function generalKeywords() {
  return CATEGORIAS
    .filter((c) => !FEMININE_CATEGORY_IDS.has(c.id))
    .flatMap((c) => flatKeywords(c).map((k) => ({ ...k, audience: "geral" })));
}

function weightedKeywords({ femalePercent = 90 } = {}) {
  const female = femaleKeywords();
  const general = generalKeywords();
  if (!female.length) return general;
  if (!general.length) return female;

  const femaleSlots = Math.min(99, Math.max(1, Math.round(femalePercent / 10)));
  const generalSlots = Math.max(1, 10 - femaleSlots);
  const total = Math.max(female.length, general.length) * 10;
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
  // Match por tokens (ex.: "vestido feminino" ↔ "vestido longo feminino")
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

function allKeywords() {
  return CATEGORIAS.flatMap((c) => flatKeywords(c));
}

function subcategoriesFor(categoryId) {
  const cat = CATEGORIAS.find((c) => c.id === categoryId);
  if (!cat) return [];
  return (cat.subcategories || []).map(({ id, label }) => ({ id, label, key: id }));
}

function metaOnly() {
  return CATEGORIAS.map(({ subcategories, ...m }) => ({
    ...m,
    subcategories: (subcategories || []).map(({ id, label, keywords }) => ({
      id,
      label,
      key: id,
      keywords: keywords || [],
    })),
  }));
}

/** Keywords únicas em ordem de prioridade (90% feminino primeiro). */
function prioritizedKeywords({ femalePercent = 90 } = {}) {
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

/** Uma keyword de cada categoria por rodada — melhor variedade em demos limitadas. */
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

module.exports = {
  CATEGORIAS,
  categoryForKeyword,
  subcategoryForKeyword,
  subcategoryMeta,
  keywordsForSubcategory,
  allKeywords,
  femaleKeywords,
  generalKeywords,
  weightedKeywords,
  prioritizedKeywords,
  roundRobinKeywords,
  subcategoriesFor,
  metaOnly,
};
