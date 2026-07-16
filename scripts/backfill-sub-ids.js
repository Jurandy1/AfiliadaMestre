"use strict";

/**
 * Preenche sub_ids nos produtos que ainda não têm.
 * Rode: node scripts/backfill-sub-ids.js
 * (requer sql/migration_sub_ids.sql no Supabase)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { buildProductSubIds } = require("../server/tracking");

async function main() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_KEY no .env");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  let offset = 0;
  const page = 200;
  let updated = 0;

  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/ofertas?select=item_id,category,sub_ids&order=item_id.asc&limit=${page}&offset=${offset}`,
      { headers }
    );
    const rows = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(rows));
    if (!Array.isArray(rows) || !rows.length) break;

    for (const row of rows) {
      if (Array.isArray(row.sub_ids) && row.sub_ids.length) continue;
      const sub_ids = buildProductSubIds(row.category, row.item_id);
      const patch = await fetch(
        `${url}/rest/v1/ofertas?item_id=eq.${encodeURIComponent(row.item_id)}`,
        { method: "PATCH", headers, body: JSON.stringify({ sub_ids }) }
      );
      if (!patch.ok) {
        const err = await patch.text();
        console.warn("falha", row.item_id, err);
        continue;
      }
      updated += 1;
    }

    offset += rows.length;
    console.log(`lidos ${offset} · atualizados ${updated}`);
    if (rows.length < page) break;
  }

  console.log(`OK: ${updated} produtos com sub_ids`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
