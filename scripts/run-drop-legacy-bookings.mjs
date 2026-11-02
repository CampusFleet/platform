import pkg from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const { Client } = pkg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const envLocal = parseEnv(path.resolve(__dirname, "../.env.local"));
const connectionString = envLocal.POSTGRES_URL_NON_POOLING || envLocal.POSTGRES_URL || envLocal.POSTGRES_PRISMA_URL;

async function run() {
  if (!connectionString) {
    console.error("❌ No Postgres connection string found in .env.local!");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("🚀 Connecting to PostgreSQL database...");
  await client.connect();

  const migrationFile = path.resolve(__dirname, "../supabase/migrations/20261102_drop_legacy_bookings_and_promote_reservations.sql");
  const sql = fs.readFileSync(migrationFile, "utf8");

  console.log("⚡ Executing migration: 20261102_drop_legacy_bookings_and_promote_reservations.sql");
  await client.query(sql);

  console.log("✅ Successfully executed migration!");

  // Verify
  const check = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'bookings'
    ) as bookings_exists,
    EXISTS (
      SELECT FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'bookings_full'
    ) as bookings_full_exists,
    EXISTS (
      SELECT FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'bus_reservations_full'
    ) as res_full_exists;
  `);

  console.log("Verification results:", check.rows[0]);
  await client.end();
}

run().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
