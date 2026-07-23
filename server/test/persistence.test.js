const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SupabasePersistence } = require("../persistence");

function fakeSupabase(initialRow = null) {
  const state = { row: initialRow, files: new Map() };
  return {
    state,
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: state.row, error: null }; },
          async upsert(row) { state.row = JSON.parse(JSON.stringify(row)); return { error: null }; },
        };
      },
      storage: {
        from() {
          return {
            async upload(objectPath, body, options) {
              state.files.set(objectPath, { body: Buffer.from(body), type: options.contentType });
              return { error: null };
            },
            async download(objectPath) {
              const file = state.files.get(objectPath);
              if (!file) return { data: null, error: new Error("not found") };
              return { data: new Blob([file.body], { type: file.type }), error: null };
            },
            async remove(paths) { paths.forEach((p) => state.files.delete(p)); return { error: null }; },
          };
        },
      },
    },
  };
}

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SUPABASE_BUCKET: "receipt-images",
  SUPABASE_STATE_ID: "main",
};

test("Supabase가 비어 있으면 현재 상태를 최초 시드로 저장한다", async () => {
  const fake = fakeSupabase({ data: {}, revision: 0, updated_at: null });
  const persistence = new SupabasePersistence({ env, client: fake.client });
  const db = { receipts: [{ id: "rcpt_101" }], transactions: [] };
  await persistence.initialize(db, () => assert.fail("빈 상태를 복원하면 안 됨"));
  assert.equal(persistence.status().mode, "supabase");
  assert.deepEqual(fake.state.row.data.receipts, db.receipts);
});

test("저장된 app_state가 있으면 서버 메모리에 복원하고 변경을 다시 저장한다", async () => {
  const saved = { receipts: [{ id: "rcpt_777" }], transactions: [] };
  const fake = fakeSupabase({ data: saved, revision: 4, updated_at: "2026-07-23T00:00:00Z" });
  const persistence = new SupabasePersistence({ env, client: fake.client });
  let restored = null;
  const db = { receipts: [] };
  await persistence.initialize(db, (value) => { restored = value; Object.assign(db, value); });
  assert.deepEqual(restored, saved);
  db.receipts.push({ id: "rcpt_778" });
  await persistence.persist(db);
  assert.equal(fake.state.row.revision, 5);
  assert.equal(fake.state.row.data.receipts.at(-1).id, "rcpt_778");
});

test("비공개 Storage에 올린 영수증을 다시 내려받는다", async () => {
  const fake = fakeSupabase({ data: { receipts: [] }, revision: 1, updated_at: null });
  const persistence = new SupabasePersistence({ env, client: fake.client });
  await persistence.initialize({ receipts: [] }, () => undefined);
  const temp = path.join(os.tmpdir(), `receipt-${process.pid}-${Date.now()}.jpg`);
  fs.writeFileSync(temp, Buffer.from("receipt-image"));
  try {
    const stored = await persistence.uploadReceiptFile("rcpt_900", "original", {
      path: temp,
      originalname: "receipt.jpg",
      mimetype: "image/jpeg",
    });
    const downloaded = await persistence.downloadReceiptFile(stored.path);
    assert.equal(downloaded.contentType, "image/jpeg");
    assert.equal(downloaded.buffer.toString(), "receipt-image");
  } finally {
    fs.unlinkSync(temp);
  }
});
