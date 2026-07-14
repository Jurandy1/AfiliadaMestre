"use strict";

// Remove o fundo preto da logo e gera um PNG com transparência real.
// Uso: node scripts/make-logo-transparent.js

const path = require("path");
const { Jimp } = require("jimp");

const SRC = path.join(__dirname, "..", "uploads", "logo.png");
const OUT = path.join(__dirname, "..", "uploads", "logo.png");

// Pixels cujos 3 canais forem abaixo deste valor viram transparentes.
const THRESHOLD = 45;

(async () => {
  const image = await Jimp.read(SRC);
  const { width, height, data } = image.bitmap;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD) {
      data[i + 3] = 0; // alpha = transparente
    }
  }

  await image.write(OUT);
  console.log(`OK: fundo removido em ${width}x${height} -> ${OUT}`);
})().catch((e) => {
  console.error("Falha:", e.message);
  process.exit(1);
});
