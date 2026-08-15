/* Telecast — Telegram media streaming service worker.
 *
 * The <video> element issues standard HTTP range requests against
 * /tg-stream/<id> URLs we hand it. This SW intercepts those requests and asks
 * the main thread (which owns the gramjs client + auth session) for the
 * requested byte range. Main thread does MTProto upload.getFile via
 * client.iterDownload(), posts the bytes back. SW returns a 206 Partial
 * Content response so the video element can seek/scrub like normal HTTP.
 *
 * This matches what Telegram Web K does. Without it, video elements would
 * have to wait for the full file to download before starting playback.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const pending = new Map();
let nextReqId = 1;

self.addEventListener("message", (e) => {
  const data = e.data;
  if (data?.type !== "tg-chunk-response") return;
  const p = pending.get(data.requestId);
  if (!p) return;
  pending.delete(data.requestId);
  if (data.error) p.reject(new Error(data.error));
  else p.resolve(data);
});

async function askMain(streamId, offset, length) {
  const requestId = nextReqId++;
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  if (!clients.length) throw new Error("No client to fetch from");
  // Round-robin not needed; any controlled window holds the same gramjs.
  const client = clients[0];
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    client.postMessage({ type: "tg-chunk-request", requestId, streamId, offset, length });
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error("Chunk request timeout"));
      }
    }, 60_000);
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith("/tg-stream/")) return;
  const id = url.pathname.slice("/tg-stream/".length);
  e.respondWith(handleStream(e.request, id));
});

async function handleStream(request, streamId) {
  // First call asks for metadata (size + mime type).
  let meta;
  try {
    meta = await askMain(streamId, -1, 0);
  } catch (err) {
    return new Response(`stream not registered: ${err.message}`, { status: 404 });
  }
  const totalSize = meta.size;
  const mimeType = meta.mimeType || "video/mp4";

  const rangeHeader = request.headers.get("Range");
  let start = 0;
  let end = totalSize - 1;
  let isPartial = false;
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      start = parseInt(m[1], 10);
      end = m[2] ? parseInt(m[2], 10) : totalSize - 1;
      isPartial = true;
    }
  }
  const length = end - start + 1;

  // Stream chunks from main thread into the Response body.
  const CHUNK_BYTES = 512 * 1024; // 512 KB per round-trip
  const stream = new ReadableStream({
    async pull(controller) {
      // Implemented in start() with a loop instead — pull is a no-op.
    },
    async start(controller) {
      let pos = start;
      while (pos <= end) {
        const want = Math.min(CHUNK_BYTES, end - pos + 1);
        try {
          const resp = await askMain(streamId, pos, want);
          const buf = resp.buffer;
          if (!buf || buf.byteLength === 0) break;
          controller.enqueue(new Uint8Array(buf));
          pos += buf.byteLength;
        } catch (err) {
          controller.error(err);
          return;
        }
      }
      controller.close();
    },
    cancel() {
      // Best-effort: nothing to clean up on this side; main thread aborts on
      // navigate via the AbortController it owns per stream.
    },
  });

  return new Response(stream, {
    status: isPartial ? 206 : 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(length),
      "Accept-Ranges": "bytes",
      // Belt-and-braces: some Fire OS WebViews treat SW-served responses as
      // opaque/cross-origin unless these headers are present, which can
      // cause the video frames to be dropped (audio still plays).
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      ...(isPartial && { "Content-Range": `bytes ${start}-${end}/${totalSize}` }),
    },
  });
}
