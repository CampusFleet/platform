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

async function run() {
  console.log("Connecting to Postgres...");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected successfully!");

  const sql = fs.readFileSync("supabase/migrations/20261102_staff_payroll_and_salary_automation.sql", "utf-8");
  console.log("Applying migration 20261102_staff_payroll_and_salary_automation.sql...");
  await client.query(sql);
  console.log("Migration applied successfully!");

  // Verify created tables and view
  const resTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('role_salary_defaults', 'staff_salary_configs', 'staff_salary_payouts');
  `);
  console.log("Verified tables:", resTables.rows.map(r => r.table_name));

  const resView = await client.query(`SELECT COUNT(*) FROM public.staff_payroll_full;`);
  console.log("Staff in staff_payroll_full view:", resView.rows[0].count);

  const sampleStaff = await client.query(`
    SELECT staff_id, full_name, role, base_salary, payment_frequency, bank_account_masked 
    FROM public.staff_payroll_full 
    LIMIT 5;
  `);
  console.log("Sample rows from staff_payroll_full:\n", sampleStaff.rows);

  await client.end();
}

run().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
