import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { latestOpsSeq, readOpsEvents } from "@/lib/gate/ops-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STAFF = ["admin", "transport_admin", "transport_manager", "driver", "conductor"];
const STREAM_SECONDS = 50; // Vercel functions are time-boxed; EventSource reconnects automatically.

/**
 * GET /api/ops/stream?busId=… — Server-Sent Events feed of gate decisions / incidents / device health.
 * Works across devices (replaces same-browser BroadcastChannel). Supports Last-Event-ID resume.
 * Crew may filter by their bus; managers get everything.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !STAFF.includes(session.role)) return new Response("Forbidden", { status: 403 });

  const busFilter = Number(new URL(req.url).searchParams.get("busId")) || null;
  const resumeFrom = Number(req.headers.get("last-event-id"));
  let cursor = Number.isFinite(resumeFrom) && resumeFrom > 0 ? resumeFrom : await latestOpsSeq();
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      send(`retry: 3000\n: connected\n\n`);
      while (Date.now() - started < STREAM_SECONDS * 1000 && !req.signal.aborted) {
        try {
          for (const item of await readOpsEvents(cursor)) {
            cursor = Math.max(cursor, item.seq);
            if (busFilter && item.event.busId !== busFilter) continue;
            send(`id: ${item.seq}\nevent: ${item.event.type}\ndata: ${JSON.stringify({ ...item.event, at: item.at })}\n\n`);
          }
          send(`: ping\n\n`);
        } catch {
          // Redis hiccup: keep the stream alive, try again next tick
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
