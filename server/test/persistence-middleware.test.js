const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createPersistenceMiddleware } = require("../persistence-middleware");

function response(done) {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(body) {
    this.body = body;
    queueMicrotask(() => { this.emit("finish"); done(); });
    return this;
  };
  return res;
}

test("성공 응답 전에 변경 상태를 영구 저장한다", async () => {
  const db = { receipts: [] };
  let saved = null;
  const persistence = {
    isCloudEnabled: () => true,
    persist: async (value) => { saved = JSON.parse(JSON.stringify(value)); },
  };
  await new Promise((resolve, reject) => {
    const res = response(resolve);
    const middleware = createPersistenceMiddleware({ db, replaceState: () => undefined, persistence });
    middleware({ method: "POST" }, res, () => {
      db.receipts.push({ id: "rcpt_111" });
      res.status(201).json({ ok: true });
    });
    res.on("error", reject);
  });
  assert.equal(saved.receipts[0].id, "rcpt_111");
});

test("영구 저장 실패 시 메모리 변경을 되돌리고 503을 반환한다", async () => {
  const db = { receipts: [{ id: "seed" }] };
  const persistence = {
    isCloudEnabled: () => true,
    persist: async () => { throw new Error("database offline"); },
  };
  await new Promise((resolve) => {
    const res = response(resolve);
    const middleware = createPersistenceMiddleware({
      db,
      replaceState: (saved) => { db.receipts = saved.receipts; },
      persistence,
    });
    middleware({ method: "PATCH" }, res, () => {
      db.receipts.push({ id: "not-saved" });
      res.json({ ok: true });
    });
  });
  assert.deepEqual(db.receipts, [{ id: "seed" }]);
});
