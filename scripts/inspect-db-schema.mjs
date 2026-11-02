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

async function check() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Postgres successfully!");

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log("Tables in public schema:", tables.rows.map(r => r.table_name));

  const staffCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'staff' AND table_schema = 'public';
  `);
  console.log("Staff table columns:", staffCols.rows);

  const staffRows = await client.query(`
    SELECT id, user_id, full_name, email, role, category 
    FROM public.staff 
    LIMIT 10;
  `);
  console.log("Sample staff rows:", staffRows.rows);

  const userRoles = await client.query(`
    SELECT DISTINCT role FROM public.users;
  `);
  console.log("User roles in users table:", userRoles.rows);

  await client.end();
}

check().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
