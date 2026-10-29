import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../api.js", import.meta.url), "utf8");
const context = { window: {}, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source, context);
const create = context.window.createMoyuApi;
const snapshot = {
  round: 1,
  count: 5,
  target: 10000,
  mine: 2,
  participants: 3,
  canChoose: false,
  winnerName: null,
  dish: null,
  history: [],
  autoReleased: false,
  choiceRemaining: null,
};
const response = (body = snapshot) => ({
  ok: true,
  json: async () => structuredClone(body),
});

test("default connection reads shared state with session cookies and no caching", async () => {
  let request;
  const api = create({}, async (url, options) => {
    request = { url, options };
    return response();
  });
  assert.deepEqual(await api.getState(), snapshot);
  assert.equal(request.url, "/api/state");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.body, undefined);
});

test("configured server receives all four operations with exact event and round", async () => {
  const calls = [];
  const api = create(
    { apiBaseUrl: "https://api.example.com/api/" },
    async (url, options) => {
      calls.push({ url, options });
      return response({ ...snapshot, accepted: true });
    },
  );
  await api.getState();
  await api.touch({ round: 7, event: "same-retry-event", name: "王总" });
  await api.cook({ round: 7, dish: "放生", name: "王总" });
  await api.next({ round: 7, name: "王总" });
  assert.deepEqual(
    calls.map((c) => c.url),
    ["state", "touch", "cook", "next"].map(
      (p) => "https://api.example.com/api/" + p,
    ),
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    round: 7,
    event: "same-retry-event",
    name: "王总",
  });
  assert.equal(JSON.parse(calls[2].options.body).dish, "放生");
  assert.ok(calls.every((c) => c.options.credentials === "include"));
});

test("network and 404 failures never return fabricated or solo game progress", async () => {
  const offline = create({}, async () => {
    throw new TypeError("network down");
  });
  await assert.rejects(offline.getState(), /network down/);
  const notFound = create({}, async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: "未找到" }),
  }));
  await assert.rejects(notFound.getState(), (e) => e.status === 404);
});

test("malformed server payloads cannot become the current game", async () => {
  for (const body of [
    null,
    {},
    { ...snapshot, count: 10001 },
    { ...snapshot, canChoose: "true" },
    { ...snapshot, mine: 6 },
    { ...snapshot, history: [{ dish: "unknown" }] },
  ]) {
    await assert.rejects(create({}, async () => response(body)).getState());
  }
});

test("timeouts abort the request and invalid URL schemes are rejected", async () => {
  const api = create(
    { requestTimeoutMs: 1000 },
    (_url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  await assert.rejects(api.getState(), /aborted/);
  assert.throws(() => create({ apiBaseUrl: "javascript:alert(1)" }, () => {}));
});
