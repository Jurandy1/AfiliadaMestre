"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { supabaseRequest } = require("../server/supabase");
const { inferSubcategory, extractProductOptions } = require("../server/productMeta");

async function fetchAllRows() {
  const rows = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const batch = await supabaseRequest(
      `/ofertas?select=item_id,product_name,keyword,category,price_min,price_max&order=item_id.asc&limit=${pageSize}&offset=${offset}`,
      { method: "GET", useService: true }
    );
    if (!Array.isArray(batch) || !batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const rows = await fetchAllRows();
  console.log(`[retag] ${rows.length} produtos para atualizar`);

  let updated = 0;
  for (const row of rows) {
    const subcategory = inferSubcategory(row.category, row.keyword, row.product_name);
    const product_options = extractProductOptions(row.product_name, row.price_min, row.price_max);
    try {
      await supabaseRequest(`/ofertas?item_id=eq.${row.item_id}`, {
        method: "PATCH",
        body: { subcategory, product_options },
        prefer: "return=minimal",
        useService: true,
      });
      updated += 1;
    } catch (err) {
      if (String(err.message).includes("product_options") || String(err.message).includes("subcategory")) {
        console.error("[retag] Rode sql/migration_subcategory.sql no Supabase primeiro.");
        process.exit(1);
      }
      console.warn(`[retag] item ${row.item_id}: ${err.message}`);
    }
  }

  console.log(`[retag] Concluído: ${updated} produtos atualizados`);
}

main().catch((err) => {
  console.error("[retag] Erro:", err.message);
  process.exit(1);
});
