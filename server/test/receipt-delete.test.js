const assert = require("node:assert/strict");
const test = require("node:test");

process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";
const { app } = require("../index");
const { db, reset } = require("../store");

test("선택 영수증을 삭제하면 연결 카드내역도 미매칭으로 돌아간다", async () => {
  reset();
  const receipt = db.receipts.find((item) => item.matchedTxId);
  assert.ok(receipt, "매칭된 시드 영수증 필요");
  const tx = db.transactions.find((item) => item.id === receipt.matchedTxId);
  assert.equal(tx.matchedReceiptId, receipt.id);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/receipts/bulk`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [receipt.id] }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.deletedIds, [receipt.id]);
    assert.equal(db.receipts.some((item) => item.id === receipt.id), false);
    assert.equal(tx.status, "unmatched");
    assert.equal(tx.matchedReceiptId, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    reset();
  }
});

test("전표가 참조하는 영수증은 삭제하지 않는다", async () => {
  reset();
  const receipt = db.receipts[0];
  db.vouchers.push({
    id: "vch_delete_guard",
    status: "submitted",
    lines: [{ receiptId: receipt.id, txId: receipt.matchedTxId }],
  });

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/receipts/bulk`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [receipt.id] }),
    });
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.deepEqual(body.protectedIds, [receipt.id]);
    assert.equal(db.receipts.some((item) => item.id === receipt.id), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    reset();
  }
});
