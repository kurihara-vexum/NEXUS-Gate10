import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDatabase,
  createOpportunity,
  getOpportunity,
  listOpportunities,
  listPhases,
  listUsers,
  updateOpportunityProgress,
} from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("リクエストが大きすぎます。");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("JSONの形式が正しくありません。");
  }
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}を入力してください。`);
  }
  return value.trim();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label}を選択してください。`);
  }
  return number;
}

function opportunityId(pathname) {
  const match = pathname.match(/^\/api\/opportunities\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(publicDir, `.${requested}`);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(filePath)) {
    sendError(response, 404, "ページが見つかりません。");
    return;
  }
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
}

export function createAppServer({ databasePath } = {}) {
  const db = createDatabase(databasePath);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const id = opportunityId(url.pathname);

    try {
      if (request.method === "GET" && url.pathname === "/api/opportunities") {
        sendJson(response, 200, listOpportunities(db));
        return;
      }
      if (request.method === "GET" && id !== null) {
        const opportunity = getOpportunity(db, id);
        if (!opportunity) return sendError(response, 404, "商談が見つかりません。");
        sendJson(response, 200, opportunity);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/users") {
        sendJson(response, 200, listUsers(db));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/phases") {
        sendJson(response, 200, listPhases(db));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/opportunities") {
        const input = await readJson(request);
        const opportunity = createOpportunity(db, {
          deal_name: requiredText(input.deal_name, "商談名"),
          customer_name: requiredText(input.customer_name, "顧客名"),
          user_id: positiveInteger(input.user_id, "担当者"),
          phase_id: positiveInteger(input.phase_id, "フェーズ"),
          expected_close_date: requiredText(input.expected_close_date, "受注予定日"),
          next_action: typeof input.next_action === "string" ? input.next_action.trim() : "",
        });
        sendJson(response, 201, opportunity);
        return;
      }
      if (request.method === "PATCH" && id !== null) {
        const input = await readJson(request);
        const opportunity = updateOpportunityProgress(db, id, {
          phase_id: positiveInteger(input.phase_id, "フェーズ"),
          next_action: requiredText(input.next_action, "次回アクション"),
        });
        if (!opportunity) return sendError(response, 404, "商談が見つかりません。");
        sendJson(response, 200, opportunity);
        return;
      }
      if (request.method === "GET") {
        serveStatic(response, url.pathname);
        return;
      }
      sendError(response, 404, "APIが見つかりません。");
    } catch (error) {
      sendError(response, 400, error.message || "処理に失敗しました。");
    }
  });

  server.on("close", () => db.close());
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createAppServer({ databasePath: process.env.DATABASE_PATH });
  server.listen(port, () => {
    console.log(`Gate10 CRM: http://localhost:${port}`);
  });
}
