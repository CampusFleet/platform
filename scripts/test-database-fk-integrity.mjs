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

async function testIntegrity() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("=== CHECKING ORPHANED ROWS ON ALL FOREIGN KEYS ===");
  const fks = await client.query(`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
  `);

  let orphanCount = 0;
  for (const fk of fks.rows) {
    try {
      const orphanCheck = await client.query(`
        SELECT COUNT(*) AS count
        FROM public."${fk.from_table}" t1
        LEFT JOIN public."${fk.to_table}" t2 ON t1."${fk.from_column}" = t2."${fk.to_column}"
        WHERE t1."${fk.from_column}" IS NOT NULL AND t2."${fk.to_column}" IS NULL;
      `);
      const cnt = parseInt(orphanCheck.rows[0].count, 10);
      if (cnt > 0) {
        console.error(`[ORPHAN DETECTED] ${fk.from_table}.${fk.from_column} -> ${fk.to_table}.${fk.to_column}: ${cnt} orphans!`);
        orphanCount++;
      }
    } catch (err) {
      console.warn(`Could not check ${fk.from_table}.${fk.from_column}:`, err.message);
    }
  }

  if (orphanCount === 0) {
    console.log("✅ All existing foreign keys have 0 orphaned rows! Referential integrity is intact across existing FKs.");
  }

  console.log("\n=== INSPECTING CURRENT transport_settings ROW ===");
  const ts = await client.query(`SELECT * FROM transport_settings;`);
  console.log("Row:", ts.rows[0]);

  await client.end();
}

testIntegrity().catch(console.error);
