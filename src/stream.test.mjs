// Self-check for the service worker's chunk pipeline (public/tg-sw.js):
// bytes come out in order, and no more than INFLIGHT requests are ever open.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const src = await readFile(new URL("../public/tg-sw.js", import.meta.url), "utf8");

const SIZE = 5 * 1024 * 1024;
let open = 0, peak = 0;
const resolvers = [];

const self = {
  addEventListener() {},
  clients: {
    claim() {},
    matchAll: async () => [{ postMessage() {} }],
  },
};
// Stand in for the main thread: record concurrency, answer out of order.
const askMain = async (_id, offset, length) => {
  if (offset === -1) return { size: SIZE, mimeType: "video/mp4" };
  open++; peak = Math.max(peak, open);
  await new Promise((r) => resolvers.push(r));
  open--;
  const buf = new Uint8Array(length);
  buf.fill(Math.floor(offset / (512 * 1024)) & 0xff);
  return { buffer: buf.buffer };
};
const handleStream = new Function(
  "self",
  "__askMain",
  `${src.replace("async function askMain(", "async function _unusedAskMain(")}
   const askMain = __askMain;
   return handleStream;`,
)(self, askMain);

const resp = await handleStream({ headers: { get: () => "bytes=0-" } }, "s1");
assert.equal(resp.status, 206);

// Drain, flushing whatever is in flight as we go.
const reader = resp.body.getReader();
let got = 0, chunks = 0;
for (;;) {
  const pump = reader.read();
  while (resolvers.length) resolvers.shift()();
  const { value, done } = await pump;
  if (done) break;
  assert.equal(value[0], chunks & 0xff, "chunks arrived out of order");
  got += value.length;
  chunks++;
}
assert.equal(got, SIZE);
assert.ok(peak > 1, `expected pipelining, saw ${peak} request in flight`);
assert.ok(peak <= 4, `too many requests in flight: ${peak}`);
console.log(`stream: ok (${chunks} chunks, peak ${peak} in flight)`);
