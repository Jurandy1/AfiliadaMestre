"use strict";

// Categoria canônica -> lista de keywords que a alimentam.
// Mantém em sincronia com o array `CATEGORIES` do frontend.
const CATEGORIAS = [
  {
    id: "eletronicos",
    label: "Eletrônicos",
    icon: "fa-laptop",
    color: "blue",
    keywords: [
      "fone bluetooth",
      "smartwatch",
      "caixa de som bluetooth",
      "projetor",
      "carregador",
      "cabo tipo c",
      "mouse gamer",
      "teclado mecanico",
    ],
  },
  {
    id: "celular",
    label: "Celular",
    icon: "fa-mobile-alt",
    color: "cyan",
    keywords: [
      "capinha celular",
      "pelicula 3d",
      "power bank",
      "suporte celular",
      "adaptador usb c",
    ],
  },
  {
    id: "casa",
    label: "Casa",
    icon: "fa-couch",
    color: "amber",
    keywords: [
      "umidificador",
      "organizador",
      "luminaria led",
      "panela eletrica",
      "aspirador portatil",
      "ventilador usb",
    ],
  },
  {
    id: "moda",
    label: "Moda",
    icon: "fa-tshirt",
    color: "pink",
    keywords: [
      "leging",
      "calca jeans",
      "camiseta oversized",
      "vestido feminino",
      "tenis feminino",
      "tenis masculino",
    ],
  },
  {
    id: "beleza",
    label: "Beleza",
    icon: "fa-spa",
    color: "purple",
    keywords: [
      "perfume feminino",
      "batom",
      "kit skincare",
      "secador de cabelo",
      "chapinha",
      "pincel maquiagem",
    ],
  },
  {
    id: "utilidades",
    label: "Utilidades",
    icon: "fa-tools",
    color: "teal",
    keywords: [
      "garrafa termica",
      "kit ferramentas",
      "furadeira",
      "balanca digital",
      "mochila",
    ],
  },
  {
    id: "acessorios",
    label: "Acessórios",
    icon: "fa-clock",
    color: "yellow",
    keywords: [
      "relogio masculino",
      "relogio feminino",
      "oculos de sol",
      "colar feminino",
      "carteira masculina",
    ],
  },
  {
    id: "automotivo",
    label: "Automotivo",
    icon: "fa-car",
    color: "slate",
    keywords: [
      "aspirador automotivo",
      "suporte celular carro",
      "camera automotiva",
      "cera automotiva",
    ],
  },
  {
    id: "fitness",
    label: "Fitness",
    icon: "fa-dumbbell",
    color: "emerald",
    keywords: [
      "corda de pular",
      "halter ajustavel",
      "faixa elastica",
      "tapete yoga",
    ],
  },
  {
    id: "infantil",
    label: "Infantil",
    icon: "fa-child",
    color: "rose",
    keywords: [
      "brinquedo educativo",
      "lego montar",
      "boneca",
      "carrinho de brinquedo",
    ],
  },
];

// Índice keyword (lowercased) -> id categoria
const KEYWORD_TO_CATEGORY = (() => {
  const map = new Map();
  for (const cat of CATEGORIAS) {
    for (const kw of cat.keywords) map.set(kw.toLowerCase().trim(), cat.id);
  }
  return map;
})();

function categoryForKeyword(keyword) {
  const kw = String(keyword || "").toLowerCase().trim();
  if (!kw) return "todos";
  if (KEYWORD_TO_CATEGORY.has(kw)) return KEYWORD_TO_CATEGORY.get(kw);
  // fallback heurístico por termo
  for (const [key, catId] of KEYWORD_TO_CATEGORY.entries()) {
    if (kw.includes(key) || key.includes(kw)) return catId;
  }
  return "todos";
}

function allKeywords() {
  return CATEGORIAS.flatMap((c) => c.keywords.map((kw) => ({ keyword: kw, category: c.id })));
}

function metaOnly() {
  return CATEGORIAS.map(({ keywords, ...m }) => m);
}

module.exports = {
  CATEGORIAS,
  categoryForKeyword,
  allKeywords,
  metaOnly,
};
