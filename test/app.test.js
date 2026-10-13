import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createDatabase, listOpportunities } from "../src/database.js";
import { createAppServer } from "../src/server.js";

describe("Gate10 CRM database", () => {
  test("20件以上のダミー商談と停滞案件を投入する", () => {
    const db = createDatabase(":memory:");
    const opportunities = listOpportunities(db);
    assert.ok(opportunities.length >= 20);
    assert.ok(opportunities.filter((item) => item.is_stalled).length >= 3);
    assert.ok(opportunities.some((item) => item.result_type === "WON"));
    assert.ok(opportunities.some((item) => item.result_type === "LOST"));
    db.close();
  });
});

describe("Gate10 CRM API", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createAppServer({ databasePath: ":memory:" });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("商談一覧を取得できる", async () => {
    const response = await fetch(`${baseUrl}/api/opportunities`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.length >= 20);
  });

  test("商談を登録して詳細を取得できる", async () => {
    const response = await fetch(`${baseUrl}/api/opportunities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deal_name: "テスト商談",
        customer_name: "テスト株式会社",
        user_id: 3,
        phase_id: 1,
        expected_close_date: "2026-11-30",
        next_action: "初回面談の日程調整",
      }),
    });
    const created = await response.json();
    assert.equal(response.status, 201);
    assert.equal(created.deal_name, "テスト商談");

    const detailResponse = await fetch(`${baseUrl}/api/opportunities/${created.id}`);
    const detail = await detailResponse.json();
    assert.equal(detail.customer_name, "テスト株式会社");
  });

  test("フェーズと次回アクションを更新できる", async () => {
    const response = await fetch(`${baseUrl}/api/opportunities/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase_id: 5, next_action: "受注処理を完了" }),
    });
    const updated = await response.json();
    assert.equal(response.status, 200);
    assert.equal(updated.phase_name, "受注");
    assert.equal(updated.next_action, "受注処理を完了");
    assert.equal(updated.is_stalled, 0);
  });

  test("静的な一覧画面を返す", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Gate10 CRM/);
  });
});
