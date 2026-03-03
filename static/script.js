/**
 * サービスマニュアル 整備情報 抽出ツール
 * フロントエンド JavaScript
 */

// ============================================================
//  状態管理
// ============================================================
let selectedFile = null;
let currentData = null;
let allSectionsExpanded = false;

// ============================================================
//  初期化
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // 印刷日を設定
  document.getElementById("printDate").textContent = new Date().toLocaleDateString("ja-JP");

  // ファイル選択
  const pdfInput = document.getElementById("pdfInput");
  pdfInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) setFile(e.target.files[0]);
  });

  // ファイル解除ボタン
  document.getElementById("clearFile").addEventListener("click", clearFile);

  // 抽出ボタン
  document.getElementById("extractBtn").addEventListener("click", startExtraction);

  // ドラッグ＆ドロップ
  const dropZone = document.getElementById("dropZone");

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      setFile(file);
    } else {
      showError("PDFファイルのみ対応しています。");
    }
  });

  // ドロップゾーンクリックでファイル選択
  dropZone.addEventListener("click", (e) => {
    if (e.target.tagName !== "LABEL" && e.target.tagName !== "INPUT") {
      pdfInput.click();
    }
  });
});

// ============================================================
//  ファイル操作
// ============================================================
function setFile(file) {
  selectedFile = file;
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("selectedFile").style.display = "flex";
  document.getElementById("extractBtn").disabled = false;
  hideError();
}

function clearFile() {
  selectedFile = null;
  document.getElementById("pdfInput").value = "";
  document.getElementById("selectedFile").style.display = "none";
  document.getElementById("extractBtn").disabled = true;
}

// ============================================================
//  PDF 抽出処理
// ============================================================
async function startExtraction() {
  if (!selectedFile) return;

  showLoading(true);
  hideError();
  document.getElementById("results").style.display = "none";

  try {
    const formData = new FormData();
    formData.append("pdf", selectedFile);

    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `サーバーエラー (${response.status})`);
    }

    currentData = data;
    renderResults(data);

  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// ============================================================
//  結果レンダリング
// ============================================================
function renderResults(data) {
  // 車両情報
  const vi = data.vehicle_info || {};
  const parts = [vi.make, vi.model, vi.year].filter(Boolean);
  document.getElementById("vehicleText").textContent =
    parts.length > 0 ? parts.join(" ／ ") : "車両情報なし";

  document.getElementById("sourceFile").textContent = data.source_filename || "";

  // 各テーブルを描画
  renderTorqueTable(data.torque_specs || []);
  renderSizesTable(data.standard_sizes || []);
  renderIntervalsTable(data.replacement_intervals || []);

  // 結果を表示
  document.getElementById("results").style.display = "block";

  // 最初のタブをアクティブに
  switchTab("torque");

  // 結果までスクロール
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 規定トルク ----------
function renderTorqueTable(specs) {
  const tbody = document.getElementById("torqueBody");
  tbody.innerHTML = "";

  if (specs.length === 0) {
    document.getElementById("torqueEmpty").style.display = "block";
    document.querySelector("#torqueTable").style.display = "none";
    return;
  }
  document.getElementById("torqueEmpty").style.display = "none";
  document.querySelector("#torqueTable").style.display = "table";

  // 箇所でグループ化
  const grouped = groupBy(specs, "location");

  for (const [location, items] of Object.entries(grouped)) {
    if (location && location !== "null" && location !== "undefined") {
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="5">📍 ${esc(location)}</td>`;
      tbody.appendChild(groupRow);
    }

    for (const item of items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(item.location || "—")}</td>
        <td>${esc(item.part_name || "—")}</td>
        <td>${formatTorque(item.torque_nm)}</td>
        <td>${esc(item.torque_kgm || "—")}</td>
        <td class="notes-cell">${esc(item.notes || "—")}</td>
      `;
      tbody.appendChild(tr);
    }
  }
}

function formatTorque(val) {
  if (!val || val === "null") return "—";
  return `<strong>${esc(String(val))}</strong>`;
}

// ---------- 標準サイズ ----------
function renderSizesTable(sizes) {
  const tbody = document.getElementById("sizesBody");
  tbody.innerHTML = "";

  if (sizes.length === 0) {
    document.getElementById("sizesEmpty").style.display = "block";
    document.querySelector("#sizesTable").style.display = "none";
    return;
  }
  document.getElementById("sizesEmpty").style.display = "none";
  document.querySelector("#sizesTable").style.display = "table";

  // カテゴリでグループ化
  const grouped = groupBy(sizes, "category");

  for (const [category, items] of Object.entries(grouped)) {
    if (category && category !== "null") {
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="4">📁 ${esc(category)}</td>`;
      tbody.appendChild(groupRow);
    }

    for (const item of items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(item.category || "—")}</td>
        <td>${esc(item.item || "—")}</td>
        <td><strong>${esc(item.specification || "—")}</strong></td>
        <td class="notes-cell">${esc(item.notes || "—")}</td>
      `;
      tbody.appendChild(tr);
    }
  }
}

// ---------- 交換時期 ----------
function renderIntervalsTable(intervals) {
  const tbody = document.getElementById("intervalsBody");
  tbody.innerHTML = "";

  if (intervals.length === 0) {
    document.getElementById("intervalsEmpty").style.display = "block";
    document.querySelector("#intervalsTable").style.display = "none";
    return;
  }
  document.getElementById("intervalsEmpty").style.display = "none";
  document.querySelector("#intervalsTable").style.display = "table";

  const grouped = groupBy(intervals, "category");

  for (const [category, items] of Object.entries(grouped)) {
    if (category && category !== "null") {
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="6">⚙️ ${esc(category)}</td>`;
      tbody.appendChild(groupRow);
    }

    for (const item of items) {
      tbody.appendChild(buildIntervalRow(item));
    }
  }
}

function buildIntervalRow(item, isManual = false) {
  const tr = document.createElement("tr");
  if (isManual) tr.className = "manual-row";

  const distBadge = item.distance_km && item.distance_km !== "null"
    ? `<span class="badge badge-blue">🛣️ ${esc(String(item.distance_km))} km</span>`
    : "—";

  const intervalBadge = formatInterval(item.interval_months);

  tr.innerHTML = `
    <td>${esc(item.category || "—")}</td>
    <td><strong>${esc(item.item || "—")}</strong></td>
    <td>${distBadge}</td>
    <td>${intervalBadge}</td>
    <td class="notes-cell">${esc(item.condition || "—")}</td>
    <td class="notes-cell">${esc(item.notes || "—")}</td>
  `;
  return tr;
}

function formatInterval(months) {
  if (!months || months === "null") return "—";
  const m = parseInt(months, 10);
  if (isNaN(m)) return `<span class="badge badge-green">${esc(String(months))}</span>`;
  if (m % 12 === 0) {
    return `<span class="badge badge-green">📅 ${m / 12}年</span>`;
  }
  return `<span class="badge badge-green">📅 ${m}ヶ月</span>`;
}

// ============================================================
//  手動行追加
// ============================================================
function addManualRow() {
  const get = (id) => document.getElementById(id).value.trim();
  const item = {
    category:       get("manualCategory") || "その他",
    item:           get("manualItem"),
    distance_km:    get("manualDistance") || null,
    interval_months:get("manualInterval") || null,
    condition:      get("manualCondition") || null,
    notes:          get("manualNotes") || null,
  };

  if (!item.item) {
    alert("部品名を入力してください。");
    return;
  }

  const tbody = document.getElementById("intervalsBody");
  tbody.appendChild(buildIntervalRow(item, true));

  // フォームをリセット
  ["manualCategory", "manualItem", "manualDistance", "manualInterval", "manualCondition", "manualNotes"]
    .forEach((id) => { document.getElementById(id).value = ""; });

  // テーブル表示確認
  document.querySelector("#intervalsTable").style.display = "table";
  document.getElementById("intervalsEmpty").style.display = "none";
}

// ============================================================
//  タブ切り替え
// ============================================================
function switchTab(tab) {
  // すべてのタブを非表示
  document.querySelectorAll(".tab-content").forEach((el) => el.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("active"));

  // 選択タブを表示
  document.getElementById(`tab-${tab}`).style.display = "block";
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
}

// ============================================================
//  全セクション展開（印刷用）
// ============================================================
function toggleAllSections() {
  // 印刷前にすべてのタブコンテンツを表示
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.style.display = "block";
  });
  document.getElementById("expandAllBtn").textContent = "✅ すべて展開中";
}

// ============================================================
//  検索フィルター
// ============================================================
function filterTable(tableId, query) {
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  const q = query.toLowerCase();

  rows.forEach((row) => {
    if (row.classList.contains("group-row")) return; // グループ行はスキップ
    const text = row.textContent.toLowerCase();
    row.classList.toggle("hidden-row", q !== "" && !text.includes(q));
  });
}

// ============================================================
//  ページリセット
// ============================================================
function resetPage() {
  clearFile();
  document.getElementById("results").style.display = "none";
  document.getElementById("uploadSection").scrollIntoView({ behavior: "smooth" });
  allSectionsExpanded = false;
  if (document.getElementById("expandAllBtn")) {
    document.getElementById("expandAllBtn").textContent = "📂 すべて展開";
  }
}

// ============================================================
//  ユーティリティ
// ============================================================

/** HTMLエスケープ */
function esc(str) {
  if (str === null || str === undefined) return "—";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 配列をキーでグループ化 */
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "その他";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/** ローディング表示切替 */
function showLoading(show) {
  document.getElementById("loading").style.display = show ? "flex" : "none";
}

/** エラー表示 */
function showError(msg) {
  const banner = document.getElementById("errorBanner");
  document.getElementById("errorMessage").textContent = msg;
  banner.style.display = "flex";
}

function hideError() {
  document.getElementById("errorBanner").style.display = "none";
}
