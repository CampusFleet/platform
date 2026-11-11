#!/usr/bin/env node
/**
 * Gate simulator: posts signed captures to /api/gate/captures exactly like the bus device.
 *
 *   CF_API_BASE=https://campusfleet.vercel.app \
 *   CF_DEVICE_MAC=D8:3A:DD:12:34:56 CF_DEVICE_KEY=<key from pairing> \
 *   node scripts/gate-sim.mjs --door IN --image face.jpg [--lat 29.35 --lng 79.55] [--heartbeat]
 *
 * Re-running with the same --key demonstrates idempotency (returns duplicate: true).
 */
import crypto from "node:crypto";
import fs from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "true" : arr[i + 1]]] : acc), [])
);
const base = (process.env.CF_API_BASE || "http://localhost:3000").replace(/\/$/, "");
const mac = process.env.CF_DEVICE_MAC;
const key = process.env.CF_DEVICE_KEY;
if (!mac || !key) {
  console.error("Set CF_DEVICE_MAC and CF_DEVICE_KEY (from Transport Admin pairing).");
  process.exit(1);
}

function signed(path, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const sig = crypto.createHmac("sha256", key).update(`${ts}\n${nonce}\nPOST\n${path}\n${bodyHash}`).digest("hex");
  return fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cf-device": mac, "x-cf-timestamp": ts, "x-cf-nonce": nonce, "x-cf-signature": sig },
    body,
  });
}

if (args.heartbeat) {
  const r = await signed("/api/gate/heartbeat", { firmware: "gate-sim/1.0", queueDepth: 0, cameras: { in: true, out: true }, gps: { fix: true, satellites: 9 } });
  console.log("heartbeat", r.status, JSON.stringify(await r.json(), null, 2));
}

if (args.image) {
  const capture = {
    idempotencyKey: args.key || `sim-${crypto.randomUUID()}`,
    door: (args.door || "IN").toUpperCase(),
    capturedAt: args.at || new Date().toISOString(),
    latitude: args.lat ? Number(args.lat) : null,
    longitude: args.lng ? Number(args.lng) : null,
    gpsAccuracyM: 8,
    trackId: "sim",
    image: fs.readFileSync(args.image).toString("base64"),
  };
  const r = await signed("/api/gate/captures", { captures: [capture] });
  console.log("captures", r.status, JSON.stringify(await r.json(), null, 2));
}
