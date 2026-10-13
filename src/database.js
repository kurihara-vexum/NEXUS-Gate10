import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PHASES = [
  [1, "初回接触", "OPEN"],
  [2, "ヒアリング", "OPEN"],
  [3, "提案中", "OPEN"],
  [4, "見積中", "OPEN"],
  [5, "受注", "WON"],
  [6, "失注", "LOST"],
];

const USERS = [
  [1, "佐藤 美咲", "営業部長"],
  [2, "田中 健", "マネージャー"],
  [3, "鈴木 葵", "営業担当"],
  [4, "高橋 翔", "営業担当"],
  [5, "伊藤 凛", "営業担当"],
];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoDateTime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function daysFromToday(days, hour = 9) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function monthEnd(offsetMonths = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1 + offsetMonths, 0, 9);
}

function seedOpportunities() {
  const templates = [
    ["基幹システム刷新", "青葉製作所", 3, 4, monthEnd(0), "見積条件の最終回答を確認", -20],
    ["店舗DX支援", "港南リテール", 4, 3, monthEnd(0), "決裁者向け提案会を設定", -18],
    ["採用管理クラウド導入", "北斗人材サービス", 5, 2, monthEnd(0), "要件確認の日程を再調整", -16],
    ["物流可視化プロジェクト", "東亜ロジスティクス", 3, 4, monthEnd(0), "修正版見積を送付", -15],
    ["営業データ統合", "みなと商事", 4, 3, daysFromToday(12), "デモ後の質問へ回答", -2],
    ["設備保全アプリ", "新星工業", 5, 2, daysFromToday(21), "現場担当者へ追加ヒアリング", -1],
    ["顧客ポータル構築", "桜井不動産", 3, 3, daysFromToday(8), "セキュリティ資料を共有", -3],
    ["請求業務自動化", "大和サービス", 4, 4, daysFromToday(5), "契約書ドラフトを確認", -4],
    ["在庫最適化PoC", "朝日フーズ", 5, 1, daysFromToday(28), "初回打ち合わせの議題を送付", 0],
    ["問い合わせ管理改善", "中央メディア", 3, 2, daysFromToday(17), "現行フロー図を受領", -6],
    ["モバイル受発注", "西日本トレード", 4, 3, daysFromToday(25), "試作画面へのコメントを回収", -1],
    ["予算管理システム", "光洋エナジー", 5, 4, monthEnd(1), "稟議進捗を確認", -5],
    ["社内FAQ整備", "アーバンテック", 3, 2, daysFromToday(35), "対象部門を確定", -8],
    ["勤怠連携基盤", "南星ヘルスケア", 4, 3, daysFromToday(19), "API仕様書を送付", -3],
    ["データ分析研修", "清流銀行", 5, 4, daysFromToday(7), "最終参加人数を確認", -1],
    ["EC基盤リニューアル", "オリオンマーケット", 3, 5, daysFromToday(-8), "受注済み", -2],
    ["帳票電子化", "松風建設", 4, 5, daysFromToday(-14), "受注済み", -7],
    ["コールセンター統合", "つばさ通信", 5, 5, daysFromToday(-30), "受注済み", -12],
    ["需要予測モデル", "北海食品", 3, 6, daysFromToday(-12), "失注・予算見送り", -10],
    ["電子契約導入", "緑川パートナーズ", 4, 6, daysFromToday(-22), "失注・競合採用", -18],
    ["店舗スタッフ教育", "日の出ストア", 5, 1, monthEnd(1), "初回面談を実施", -2],
    ["経費精算刷新", "富士見コンサルティング", 3, 2, daysFromToday(23), "利用部門を追加確認", -5],
    ["品質検査AI検証", "瑞穂精機", 4, 3, monthEnd(1), "サンプル画像を受領", -7],
    ["予約管理改善", "あかつきクリニック", 5, 4, daysFromToday(11), "最終見積を説明", -2],
  ];

  return templates.map(([dealName, customerName, userId, phaseId, closeDate, nextAction, updatedDays]) => ({
    dealName,
    customerName,
    userId,
    phaseId,
    expectedCloseDate: isoDate(closeDate),
    nextAction,
    lastUpdatedAt: isoDateTime(daysFromToday(updatedDays, 10)),
  }));
}

export function createDatabase(databasePath = path.resolve("data/crm.sqlite")) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      result_type TEXT NOT NULL CHECK (result_type IN ('OPEN', 'WON', 'LOST'))
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      phase_id INTEGER NOT NULL REFERENCES phases(id),
      expected_close_date TEXT NOT NULL,
      next_action TEXT NOT NULL DEFAULT '',
      last_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDatabase(db);
  return db;
}

export function seedDatabase(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM opportunities").get().count;
  if (existing > 0) return;

  db.exec("BEGIN");
  try {
    const insertUser = db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?)");
    for (const user of USERS) insertUser.run(...user);

    const insertPhase = db.prepare("INSERT INTO phases (id, name, result_type) VALUES (?, ?, ?)");
    for (const phase of PHASES) insertPhase.run(...phase);

    const insertOpportunity = db.prepare(`
      INSERT INTO opportunities (
        deal_name, customer_name, user_id, phase_id,
        expected_close_date, next_action, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const opportunity of seedOpportunities()) {
      insertOpportunity.run(
        opportunity.dealName,
        opportunity.customerName,
        opportunity.userId,
        opportunity.phaseId,
        opportunity.expectedCloseDate,
        opportunity.nextAction,
        opportunity.lastUpdatedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const SELECT_OPPORTUNITY = `
  SELECT
    o.id,
    o.deal_name,
    o.customer_name,
    o.user_id,
    u.name AS user_name,
    u.role AS user_role,
    o.phase_id,
    p.name AS phase_name,
    p.result_type,
    o.expected_close_date,
    o.next_action,
    o.last_updated_at,
    o.created_at,
    CASE
      WHEN p.result_type = 'OPEN'
       AND datetime(o.last_updated_at) <= datetime('now', '-14 days')
      THEN 1 ELSE 0
    END AS is_stalled
  FROM opportunities o
  JOIN users u ON u.id = o.user_id
  JOIN phases p ON p.id = o.phase_id
`;

export function listOpportunities(db) {
  return db.prepare(`${SELECT_OPPORTUNITY}
    ORDER BY is_stalled DESC, o.last_updated_at ASC, o.id ASC
  `).all();
}

export function getOpportunity(db, id) {
  return db.prepare(`${SELECT_OPPORTUNITY} WHERE o.id = ?`).get(id);
}

export function listUsers(db) {
  return db.prepare("SELECT id, name, role FROM users ORDER BY id").all();
}

export function listPhases(db) {
  return db.prepare("SELECT id, name, result_type FROM phases ORDER BY id").all();
}

function ensureForeignKey(db, table, id, label) {
  const record = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!record) throw new Error(`${label}が見つかりません。`);
}

export function createOpportunity(db, input) {
  ensureForeignKey(db, "users", input.user_id, "担当者");
  ensureForeignKey(db, "phases", input.phase_id, "フェーズ");
  const now = isoDateTime(new Date());
  const result = db.prepare(`
    INSERT INTO opportunities (
      deal_name, customer_name, user_id, phase_id,
      expected_close_date, next_action, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.deal_name,
    input.customer_name,
    input.user_id,
    input.phase_id,
    input.expected_close_date,
    input.next_action ?? "",
    now,
  );
  return getOpportunity(db, Number(result.lastInsertRowid));
}

export function updateOpportunityProgress(db, id, input) {
  ensureForeignKey(db, "phases", input.phase_id, "フェーズ");
  const result = db.prepare(`
    UPDATE opportunities
       SET phase_id = ?, next_action = ?, last_updated_at = ?
     WHERE id = ?
  `).run(input.phase_id, input.next_action ?? "", isoDateTime(new Date()), id);
  if (result.changes === 0) return null;
  return getOpportunity(db, id);
}
