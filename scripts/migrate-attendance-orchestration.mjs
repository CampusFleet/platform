import fs from "fs";
import pg from "pg";
const { Client } = pg;

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const client = new Client({
  connectionString: env.POSTGRES_PRISMA_URL || env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  console.log("Connecting to PostgreSQL...");
  await client.connect();
  console.log("Connected successfully. Running Attendance-Reconciled Orchestration DDL...");

  // 1. Add occupancy to buses if missing
  await client.query(`
    ALTER TABLE public.buses ADD COLUMN IF NOT EXISTS occupancy INTEGER DEFAULT 0;
  `);
  console.log("✓ buses table ensured occupancy column");

  // 2. Make merge_point_id nullable in bus_merge_suggestions for multi-corridor route stitching
  await client.query(`
    ALTER TABLE public.bus_merge_suggestions ALTER COLUMN merge_point_id DROP NOT NULL;
  `);
  console.log("✓ bus_merge_suggestions: merge_point_id is now nullable");

  // 3. Add orchestration columns to bus_merge_suggestions
  await client.query(`
    ALTER TABLE public.bus_merge_suggestions 
      ADD COLUMN IF NOT EXISTS orchestration_type VARCHAR(50) DEFAULT 'INTRA_CORRIDOR_DISASSEMBLY',
      ADD COLUMN IF NOT EXISTS secondary_route_id TEXT,
      ADD COLUMN IF NOT EXISTS secondary_route_name TEXT,
      ADD COLUMN IF NOT EXISTS stitched_route_id TEXT,
      ADD COLUMN IF NOT EXISTS stitched_route_name TEXT,
      ADD COLUMN IF NOT EXISTS active_stop_ids JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS bypassed_stop_ids JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS estimated_detour_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS estimated_fuel_saved_liters NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pruned_absentee_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shift_id TEXT,
      ADD COLUMN IF NOT EXISTS trip_date DATE,
      ADD COLUMN IF NOT EXISTS execution_metadata JSONB DEFAULT '{}'::jsonb;
  `);
  console.log("✓ bus_merge_suggestions: added orchestration and route stitch columns");

  // 4. Create attendance_reconciliation_runs table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.attendance_reconciliation_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reconciled_date DATE NOT NULL,
      incoming_shift_id TEXT,
      outgoing_shift_id TEXT,
      total_incoming_attendees INTEGER NOT NULL DEFAULT 0,
      total_absentees_pruned INTEGER NOT NULL DEFAULT 0,
      initial_outgoing_passengers INTEGER NOT NULL DEFAULT 0,
      reconciled_outgoing_passengers INTEGER NOT NULL DEFAULT 0,
      opportunities_detected INTEGER NOT NULL DEFAULT 0,
      executed_merges_count INTEGER NOT NULL DEFAULT 0,
      fuel_saved_liters NUMERIC(6,2) NOT NULL DEFAULT 0,
      reconciled_by TEXT DEFAULT 'ORCHESTRATION_ENGINE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ attendance_reconciliation_runs table created");

  await client.end();
  console.log("All orchestration migrations applied successfully!");
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
