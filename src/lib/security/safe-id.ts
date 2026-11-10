/**
 * Guards for values that get interpolated into PostgREST filter strings
 * (e.g. `.or(\`id.eq.${value},user_id.eq.${value}\`)`).
 *
 * PostgREST treats `,` `(` `)` `.` `:` and quotes as syntax inside `or=`/`and=`
 * filters, so an unchecked value can inject extra filter clauses. Every ID in
 * this project (UUIDs, `st-…`, `att-…`, roll numbers, RFID UIDs, MACs) fits the
 * conservative pattern below; anything else is rejected.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_\-]{1,128}$/;

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

/** Device IDs additionally allow `:` for MAC addresses (AA:BB:CC:DD:EE:FF). */
const SAFE_DEVICE_ID_PATTERN = /^[A-Za-z0-9_\-:]{1,64}$/;

export function isSafeDeviceId(value: unknown): value is string {
  return typeof value === "string" && SAFE_DEVICE_ID_PATTERN.test(value);
}

/**
 * Builds an `or` filter matching `value` against several columns, or returns
 * null when the value is not a safe identifier.
 */
export function orEqFilter(columns: string[], value: unknown): string | null {
  if (!isSafeId(value)) return null;
  return columns.map((c) => `${c}.eq.${value}`).join(",");
}
