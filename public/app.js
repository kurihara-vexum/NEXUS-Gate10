const app = document.querySelector("#app");
const state = { users: [], phases: [] };

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value));
}

function phaseClass(resultType) {
  if (resultType === "WON") return "won";
  if (resultType === "LOST") return "lost";
  return "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "処理に失敗しました。");
  return data;
}

async function loadMasters() {
  if (state.users.length && state.phases.length) return;
  [state.users, state.phases] = await Promise.all([api("/api/users"), api("/api/phases")]);
}

function showLoading() {
  app.replaceChildren(document.querySelector("#loading-template").content.cloneNode(true));
}

function optionTags(records, selectedId, label) {
  return records.map((record) => `
    <option value="${record.id}" ${Number(selectedId) === record.id ? "selected" : ""}>
      ${escapeHtml(label(record))}
    </option>
  `).join("");
}

async function renderList() {
  showLoading();
  const opportunities = await api("/api/opportunities");
  const rows = opportunities.map((opportunity) => `
    <tr class="${opportunity.is_stalled ? "stalled" : ""}" data-id="${opportunity.id}" tabindex="0" aria-label="${escapeHtml(opportunity.deal_name)}の詳細を開く">
      <td>
        <span class="deal-name">${escapeHtml(opportunity.deal_name)}</span>
        <span class="subtext">${escapeHtml(opportunity.customer_name)}</span>
      </td>
      <td>${escapeHtml(opportunity.user_name)}</td>
      <td><span class="badge ${phaseClass(opportunity.result_type)}">${escapeHtml(opportunity.phase_name)}</span></td>
      <td>${formatDate(opportunity.expected_close_date)}</td>
      <td>
        ${formatDate(opportunity.last_updated_at)}
        ${opportunity.is_stalled ? '<span class="subtext"><span class="badge danger">14日以上停滞</span></span>' : ""}
      </td>
      <td>${escapeHtml(opportunity.next_action || "未設定")}</td>
    </tr>
  `).join("");

  app.innerHTML = `
    <section>
      <div class="page-heading">
        <div>
          <p class="eyebrow">Opportunity list</p>
          <h1>商談一覧</h1>
          <p class="lead">${opportunities.length}件の商談。更新から14日以上経過した進行中案件を強調しています。</p>
        </div>
        <a class="button primary" href="#/new">新規登録</a>
      </div>
      <div class="table-frame">
        <table>
          <thead>
            <tr>
              <th>商談 / 顧客</th>
              <th>担当者</th>
              <th>フェーズ</th>
              <th>受注予定日</th>
              <th>最終更新</th>
              <th>次回アクション</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;

  for (const row of app.querySelectorAll("tbody tr")) {
    const open = () => { window.location.hash = `#/opportunities/${row.dataset.id}`; };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
}

async function renderNew() {
  showLoading();
  await loadMasters();
  app.innerHTML = `
    <section>
      <div class="page-heading">
        <div>
          <p class="eyebrow">New opportunity</p>
          <h1>商談登録</h1>
          <p class="lead">進捗管理に必要な項目だけを登録します。</p>
        </div>
      </div>
      <form id="create-form" class="panel">
        <div class="form-grid">
          <div class="field full">
            <label for="deal-name">商談名 <span class="required">必須</span></label>
            <input id="deal-name" name="deal_name" required maxlength="100" />
          </div>
          <div class="field">
            <label for="customer-name">顧客名 <span class="required">必須</span></label>
            <input id="customer-name" name="customer_name" required maxlength="100" />
          </div>
          <div class="field">
            <label for="user-id">担当者 <span class="required">必須</span></label>
            <select id="user-id" name="user_id" required>
              ${optionTags(state.users, 3, (user) => `${user.name}（${user.role}）`)}
            </select>
          </div>
          <div class="field">
            <label for="phase-id">フェーズ <span class="required">必須</span></label>
            <select id="phase-id" name="phase_id" required>
              ${optionTags(state.phases, 1, (phase) => phase.name)}
            </select>
          </div>
          <div class="field">
            <label for="expected-close-date">受注予定日 <span class="required">必須</span></label>
            <input id="expected-close-date" name="expected_close_date" type="date" required />
          </div>
          <div class="field full">
            <label for="next-action">次回アクション</label>
            <textarea id="next-action" name="next_action" maxlength="300" placeholder="例：10月20日に見積書への回答を確認"></textarea>
          </div>
        </div>
        <p id="form-error" class="form-error" role="alert" hidden></p>
        <div class="form-actions">
          <a class="button" href="#/">キャンセル</a>
          <button class="button primary" type="submit">登録して一覧へ戻る</button>
        </div>
      </form>
    </section>
  `;

  app.querySelector("#create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const error = form.querySelector("#form-error");
    button.disabled = true;
    error.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await api("/api/opportunities", { method: "POST", body: JSON.stringify(values) });
      window.location.hash = "#/";
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
      button.disabled = false;
    }
  });
}

async function renderDetail(id) {
  showLoading();
  await loadMasters();
  const opportunity = await api(`/api/opportunities/${id}`);
  app.innerHTML = `
    <section>
      <div class="page-heading">
        <div>
          <p class="eyebrow">Opportunity detail</p>
          <h1>${escapeHtml(opportunity.deal_name)}</h1>
          <p class="lead">${escapeHtml(opportunity.customer_name)}</p>
        </div>
        <a class="button" href="#/">一覧へ戻る</a>
      </div>
      <div class="panel">
        ${opportunity.is_stalled ? '<p class="notice">この商談は最終更新から14日以上経過しています。</p>' : ""}
        <dl class="detail-grid">
          <div class="detail-item"><dt>担当者</dt><dd>${escapeHtml(opportunity.user_name)}</dd></div>
          <div class="detail-item"><dt>現在のフェーズ</dt><dd><span class="badge ${phaseClass(opportunity.result_type)}">${escapeHtml(opportunity.phase_name)}</span></dd></div>
          <div class="detail-item"><dt>受注予定日</dt><dd>${formatDate(opportunity.expected_close_date)}</dd></div>
          <div class="detail-item"><dt>最終更新日</dt><dd>${formatDate(opportunity.last_updated_at)}</dd></div>
        </dl>

        <form id="progress-form" class="progress-editor">
          <h2>進捗を更新</h2>
          <div class="form-grid">
            <div class="field">
              <label for="detail-phase-id">フェーズ <span class="required">必須</span></label>
              <select id="detail-phase-id" name="phase_id" required>
                ${optionTags(state.phases, opportunity.phase_id, (phase) => phase.name)}
              </select>
            </div>
            <div class="field full">
              <label for="detail-next-action">次回アクション <span class="required">必須</span></label>
              <textarea id="detail-next-action" name="next_action" required maxlength="300">${escapeHtml(opportunity.next_action)}</textarea>
            </div>
          </div>
          <p id="form-error" class="form-error" role="alert" hidden></p>
          <div class="form-actions">
            <a class="button" href="#/">キャンセル</a>
            <button class="button primary" type="submit">保存して一覧へ戻る</button>
          </div>
        </form>
      </div>
    </section>
  `;

  app.querySelector("#progress-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const error = form.querySelector("#form-error");
    button.disabled = true;
    error.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(`/api/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(values) });
      window.location.hash = "#/";
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
      button.disabled = false;
    }
  });
}

async function route() {
  const hash = window.location.hash || "#/";
  try {
    if (hash === "#/new") return await renderNew();
    const match = hash.match(/^#\/opportunities\/(\d+)$/);
    if (match) return await renderDetail(Number(match[1]));
    await renderList();
  } catch (error) {
    app.innerHTML = `<div class="panel empty"><p>${escapeHtml(error.message)}</p><a class="button" href="#/">一覧へ戻る</a></div>`;
  }
}

window.addEventListener("hashchange", route);
route();
