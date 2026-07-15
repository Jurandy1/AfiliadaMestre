"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { refillVitrine } = require("../server/refillVitrine");

const MAX_ITEMS = Number(process.env.DEMO_MAX_ITEMS) || 2000;

console.log(`[refill-demo] Iniciando reset com limite de ${MAX_ITEMS} itens…`);

refillVitrine({
  clear: true,
  limit: 50,
  pages: 2,
  maxItems: MAX_ITEMS,
  gapMs: 250,
})
  .then((result) => {
    console.log("[refill-demo] Concluído:");
    console.log(`  Removidos: ${result.removed}`);
    console.log(`  Novos itens: ${result.refilled}`);
    console.log(`  Keywords usadas: ${result.keywordsRun}/${result.keywordsTotal}`);
    console.log(`  Parou no limite: ${result.stoppedEarly ? "sim" : "não"}`);
    console.log("  Por categoria:", JSON.stringify(result.byCategory, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[refill-demo] Erro:", err.message);
    process.exit(1);
  });
