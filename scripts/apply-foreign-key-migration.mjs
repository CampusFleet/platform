import fs from "fs";
import pg from "pg";

const envLines = fs.readFileSync(".env.local", "utf-8").split("\n");
const env = {};
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx !== -1) {
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^["']|["']$/g, "");
  }
}

const connectionString = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL;

async function applyMigration() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Applying migration 20261109_foreign_key_integrations_and_integrity_fixes.sql...");
  const sql = fs.readFileSync("supabase/migrations/20261109_foreign_key_integrations_and_integrity_fixes.sql", "utf-8");

  await client.query("BEGIN;");
  try {
    await client.query(sql);
    await client.query("COMMIT;");
    console.log("✅ Successfully applied foreign key integrations and integrity fixes to database!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed, rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

applyMigration().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
