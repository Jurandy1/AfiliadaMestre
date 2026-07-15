"use strict";

// Categoria → subcategorias agrupadas (cada subcategoria tem 1+ keywords de busca).
// Mantém em sincronia com o frontend da vitrine.
const CATEGORIAS = [
  {
    id: "eletronicos",
    label: "Eletrônicos",
    icon: "fa-laptop",
    color: "blue",
    subcategories: [
      { id: "audio", label: "Áudio", keywords: ["fone bluetooth", "caixa de som bluetooth"] },
      { id: "wearables", label: "Relógios & Wearables", keywords: ["smartwatch"] },
      { id: "informatica", label: "Informática", keywords: ["mouse gamer", "teclado mecanico", "carregador", "cabo tipo c"] },
      { id: "video", label: "Vídeo & Projeção", keywords: ["projetor"] },
    ],
  },
  {
    id: "celular",
    label: "Celular",
    icon: "fa-mobile-alt",
    color: "cyan",
    subcategories: [
      { id: "protecao", label: "Proteção", keywords: ["capinha celular", "pelicula 3d"] },
      { id: "energia", label: "Energia & Cabos", keywords: ["power bank", "carregador rapido", "cabo carregador iphone", "adaptador usb c"] },
      { id: "acessorios_cel", label: "Acessórios", keywords: ["suporte celular", "fone de ouvido com fio"] },
    ],
  },
  {
    id: "casa",
    label: "Casa",
    icon: "fa-couch",
    color: "amber",
    subcategories: [
      { id: "cozinha", label: "Cozinha", keywords: ["panela eletrica", "air fryer", "kit cozinha"] },
      { id: "decoracao", label: "Decoração", keywords: ["luminaria led", "cortina", "tapete sala", "jogo de cama", "difusor aromatizador"] },
      { id: "organizacao", label: "Organização", keywords: ["organizador", "umidificador"] },
      { id: "limpeza", label: "Limpeza & Clima", keywords: ["aspirador portatil", "ventilador usb"] },
    ],
  },
  {
    id: "moda",
    label: "Moda Feminina",
    icon: "fa-tshirt",
    color: "pink",
    subcategories: [
      { id: "vestidos", label: "Vestidos & Saias", keywords: ["vestido feminino", "saia feminina"] },
      { id: "calcas", label: "Calças & Leggings", keywords: ["calca jeans feminina", "legging feminina", "short feminino"] },
      { id: "tops", label: "Tops & Blusas", keywords: ["camiseta feminina", "blusa feminina", "conjunto feminino"] },
      { id: "calcados", label: "Calçados", keywords: ["tenis feminino"] },
      { id: "bolsas", label: "Bolsas", keywords: ["bolsa feminina"] },
    ],
  },
  {
    id: "beleza",
    label: "Beleza",
    icon: "fa-spa",
    color: "purple",
    subcategories: [
      { id: "maquiagem", label: "Maquiagem", keywords: ["batom", "base maquiagem", "mascara de cilios", "maquiagem feminina", "pincel maquiagem"] },
      { id: "cabelo", label: "Cabelo", keywords: ["secador de cabelo", "chapinha"] },
      { id: "pele", label: "Skincare", keywords: ["kit skincare", "hidratante corporal feminino"] },
      { id: "perfumes", label: "Perfumes", keywords: ["perfume feminino"] },
      { id: "unhas", label: "Unhas", keywords: ["kit unha gel"] },
    ],
  },
  {
    id: "utilidades",
    label: "Utilidades",
    icon: "fa-tools",
    color: "teal",
    subcategories: [
      { id: "ferramentas", label: "Ferramentas", keywords: ["kit ferramentas", "furadeira"] },
      { id: "dia_a_dia", label: "Dia a dia", keywords: ["garrafa termica", "balanca digital", "mochila", "guarda chuva", "necessaire"] },
      { id: "organizacao_util", label: "Organização", keywords: ["kit organizador banheiro"] },
    ],
  },
  {
    id: "acessorios",
    label: "Acessórios",
    icon: "fa-clock",
    color: "yellow",
    subcategories: [
      { id: "joias", label: "Joias", keywords: ["colar feminino", "brinco feminino", "pulseira feminina"] },
      { id: "relogios", label: "Relógios", keywords: ["relogio feminino"] },
      { id: "oculos", label: "Óculos", keywords: ["oculos de sol feminino"] },
      { id: "bolsas_acessorios", label: "Bolsas & Carteiras", keywords: ["carteira feminina", "bolsa transversal feminina"] },
      { id: "cabelo_acessorios", label: "Cabelo", keywords: ["presilha cabelo"] },
    ],
  },
  {
    id: "automotivo",
    label: "Automotivo",
    icon: "fa-car",
    color: "slate",
    subcategories: [
      { id: "limpeza_auto", label: "Limpeza", keywords: ["aspirador automotivo", "cera automotiva"] },
      { id: "tecnologia_auto", label: "Tecnologia", keywords: ["camera automotiva", "suporte celular carro"] },
      { id: "conforto_auto", label: "Conforto", keywords: ["organizador porta malas", "capa de banco automotivo", "aromatizante carro"] },
    ],
  },
  {
    id: "fitness",
    label: "Fitness",
    icon: "fa-dumbbell",
    color: "emerald",
    subcategories: [
      { id: "roupa_fitness", label: "Roupas", keywords: ["roupa academia feminina", "legging academia feminina", "top academia feminino"] },
      { id: "equipamentos", label: "Equipamentos", keywords: ["faixa elastica fitness", "tapete yoga feminino", "kit fitness feminino"] },
    ],
  },
  {
    id: "infantil",
    label: "Infantil",
    icon: "fa-child",
    color: "rose",
    subcategories: [
      { id: "brinquedos", label: "Brinquedos", keywords: ["brinquedo educativo", "lego montar", "boneca", "carrinho de brinquedo", "pelucia"] },
      { id: "roupa_infantil", label: "Roupas & Calçados", keywords: ["roupa infantil menina", "tenis infantil"] },
      { id: "escola", label: "Escola", keywords: ["mochila escolar infantil"] },
    ],
  },
];

const FEMININE_CATEGORY_IDS = new Set(["moda", "beleza", "acessorios", "fitness"]);

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
  return "todos";
}

function subcategoryForKeyword(keyword) {
  const kw = String(keyword || "").toLowerCase().trim();
  if (!kw) return null;
  if (KEYWORD_TO_SUBCATEGORY.has(kw)) return KEYWORD_TO_SUBCATEGORY.get(kw);
  for (const [key, subId] of KEYWORD_TO_SUBCATEGORY.entries()) {
    if (kw.includes(key) || key.includes(kw)) return subId;
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
  subcategoriesFor,
  metaOnly,
};
