// assets/app.js — revised
// Tambahan utama:
// - Heuristik TTS & Solved (toggleable)
// - Ambang Min N untuk Win-Rate
// - Tetap: load CSV (bootstrap + upload), ekspor PNG, unduh CSV, semua chart

/* ==========================
   KONFIG & STATE
========================== */
const COLUMN_MAP = {
  date: "date",
  model: "model",
  user_text: "user_text",
  topic: "topic",
  tts: "tts",
  is_solved: "is_solved",
  fit: "fit_score",
  // kolom opsional
  turn: "turn",
  conversation: "conversation"
};

let RAW = [];          // seluruh baris (normalized)
let FILTERED = [];     // setelah filter
let MODELS = new Set();
let TOPICS = new Set();
let DATE_MIN = null, DATE_MAX = null;

let WINRATE = [];      // dari winrate.csv (opsional)
let NGRAMS = [];       // dari ngrams.csv (opsional)

let FIT_SCALE = "0_100";
let SOLVED_THRESHOLD = 6;
let USE_HEUR = true;
let MIN_N_WR = 30;

/* ==========================
   UTIL & HELPERS
========================== */
const $ = (id) => document.getElementById(id);
const setDisabled = (el, on = true) => {
  if (!el) return;
  if (on) { el.setAttribute("aria-disabled", "true"); el.classList.add("is-disabled"); }
  else    { el.removeAttribute("aria-disabled"); el.classList.remove("is-disabled"); }
};

function parseDate(v) {
  if (!v && v !== 0) return null;
  const t = typeof v === "string" ? v.trim() : v;
  const d = dayjs(t);
  return d.isValid() ? d.toDate() : null;
}
const median = (arr) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const quantile = (arr, q) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  return a[base + 1] !== undefined ? a[base] + rest * (a[base + 1] - a[base]) : a[base];
};
const groupBy = (arr, fn) => {
  const m = new Map();
  for (const r of arr) {
    const k = fn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const toCSV = (rows) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const lines = rows.map(r => cols.map(c => {
    const v = r[c] ?? "";
    const s = ("" + v).replaceAll('"', '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(","));
  return [head, ...lines].join("\n");
};
function enableExportButtons(on) {
  document.querySelectorAll("[data-export]").forEach(b => setDisabled(b, !on));
}
function enableDownload(on) {
  setDisabled($("btnDownload"), !on);
  if (!on) $("btnDownload").removeAttribute("href");
}

/* ==========================
   HEURISTIK & NORMALISASI
========================== */
const OK_PAT = /\b(thanks|terima\s?kasi[h]?|fixed|solved|works|berhasil|mantap|sip|oke|ok)\b/i;

function parseMaybeJSONList(s) {
  if (Array.isArray(s)) return s;
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; }
    catch { return null; }
  }
  return null;
}

function estimateTurns(row) {
  // 1) turn
  const turnRaw = row[COLUMN_MAP.turn];
  const turnNum = Number((typeof turnRaw === "string") ? turnRaw.replace(",", ".") : turnRaw);
  if (Number.isFinite(turnNum) && turnNum >= 1) return turnNum;

  // 2) conversation (JSON array pesan)
  const convRaw = row[COLUMN_MAP.conversation];
  const conv = parseMaybeJSONList(convRaw);
  if (conv && conv.length) return conv.length;

  // 3) tts langsung
  let ttsRaw = row[COLUMN_MAP.tts];
  if (typeof ttsRaw === "string") ttsRaw = ttsRaw.trim().replace(/\s/g, "").replace(",", ".");
  const ttsNum = Number(ttsRaw);
  if (Number.isFinite(ttsNum) && ttsNum >= 1) return ttsNum;

  // 4) user_text JSON list → 2×len
  const ut = row[COLUMN_MAP.user_text];
  const lst = parseMaybeJSONList(ut);
  if (lst) return Math.max(2, Math.min(10, 2 * lst.length));

  // 5) proxy token length
  if (typeof ut === "string") {
    const nTok = (ut.match(/\w+/g) || []).length;
    if (nTok <= 25) return 2;
    if (nTok <= 100) return 3;
    return 4;
  }
  return null;
}

function inferSolved(row) {
  // angka eksplisit
  const isS = Number(row[COLUMN_MAP.is_solved]);
  if (!Number.isNaN(isS)) return !!isS;
  // sinyal bahasa
  const ut = (row[COLUMN_MAP.user_text] || "").toString();
  if (OK_PAT.test(ut)) return true;
  // fallback: fit >= 50 berarti solved
  let fitRaw = row[COLUMN_MAP.fit];
  if (typeof fitRaw === "string") fitRaw = fitRaw.trim().replace(/\s/g, "").replace(",", ".");
  const fitNum = Number(fitRaw);
  if (Number.isFinite(fitNum)) return fitNum >= 50;
  return false;
}

function normalizeRow(row) {
  const date = parseDate(row[COLUMN_MAP.date]);
  const model = (row[COLUMN_MAP.model] || "").toString().trim();
  const user_text = (row[COLUMN_MAP.user_text] || "").toString();
  const topic = (row[COLUMN_MAP.topic] || "").toString().trim();

  // Fit (0..100 atau 0..1 diperlakukan sama; skala di UI)
  let fitRaw = row[COLUMN_MAP.fit];
  if (typeof fitRaw === "string") fitRaw = fitRaw.trim().replace(/\s/g, "").replace(",", ".");
  const fitNum = Number(fitRaw);
  let fit = Number.isFinite(fitNum) ? fitNum : null;

  let tts = null;
  let is_solved = false;

  if (USE_HEUR) {
    tts = estimateTurns(row);
    is_solved = inferSolved(row);
  } else {
    // non-heuristik: pakai nilai eksplisit saja
    let ttsRaw = row[COLUMN_MAP.tts];
    if (typeof ttsRaw === "string") ttsRaw = ttsRaw.trim().replace(/\s/g, "").replace(",", ".");
    const ttsNum = Number(ttsRaw);
    tts = Number.isFinite(ttsNum) ? ttsNum : null;

    const isS = Number(row[COLUMN_MAP.is_solved]);
    is_solved = !Number.isNaN(isS) ? !!isS : false;
  }

  return { date, model, user_text, topic, tts, is_solved, fit };
}

/* ==========================
   INGEST, FILTER, KPI
========================== */
function ingest(rows) {
  RAW = rows.map(normalizeRow).filter(r => r.date && r.model && r.topic);
  MODELS = new Set(RAW.map(r => r.model));
  TOPICS = new Set(RAW.map(r => r.topic));
  const dates = RAW.map(r => +r.date);
  DATE_MIN = new Date(Math.min(...dates));
  DATE_MAX = new Date(Math.max(...dates));
  seedFilters(); applyFilters();
}

function seedFilters() {
  const modelSel = $("modelSelect");
  const topicSel = $("topicSelect");
  modelSel.innerHTML = [...MODELS].sort().map(m => `<option value="${m}">${m}</option>`).join("");
  topicSel.innerHTML = [...TOPICS].sort().map(t => `<option value="${t}">${t}</option>`).join("");
  $("dateStart").value = dayjs(DATE_MIN).format("YYYY-MM-DD");
  $("dateEnd").value = dayjs(DATE_MAX).format("YYYY-MM-DD");
  $("dataStamp").textContent = `Data: ${dayjs(DATE_MIN).format("DD MMM YYYY")} – ${dayjs(DATE_MAX).format("DD MMM YYYY")}`;
}

function applyFilters() {
  FIT_SCALE = $("fitScale").value;
  SOLVED_THRESHOLD = Number($("sltThreshold").value || 6);
  USE_HEUR = $("useHeuristics").checked;
  MIN_N_WR = Number($("minNWinrate").value || 30);

  const d0 = parseDate($("dateStart").value);
  const d1 = parseDate($("dateEnd").value);
  const pick = (sel) => [...sel.options].filter(o => o.selected).map(o => o.value);
  const models = new Set(pick($("modelSelect")));
  const topics = new Set(pick($("topicSelect")));

  // re-normalize jika toggle heuristik berubah
  RAW = RAW.map(r => normalizeRow(r)); // idempotent untuk field yang sama
  FILTERED = RAW.filter(r => {
    const inDate = (!d0 || r.date >= d0) && (!d1 || r.date <= dayjs(d1).endOf("day").toDate());
    const inModel = (models.size === 0) || models.has(r.model);
    const inTopic = (topics.size === 0) || topics.has(r.topic);
    return inDate && inModel && inTopic;
  });

  renderAll();

  if (FILTERED.length) { downloadCSV(FILTERED); enableDownload(true); }
  else { enableDownload(false); }
}

function downloadCSV(rows) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  $("btnDownload").href = url;
}

/* ==========================
   RENDER: KPI
========================== */
function renderKPI() {
  const total = FILTERED.length;
  const medTTS = median(FILTERED.map(r => r.tts));
  const pctSolved = total ? FILTERED.reduce((s, r) => s + (r.is_solved ? 1 : 0), 0) / total : 0;
  const fitVals = FILTERED.map(r => {
    if (r.fit == null) return null;
    return (FIT_SCALE === "0_100" ? (r.fit / 100) : r.fit);
  }).filter(x => x != null);
  const avgFit01 = fitVals.length ? fitVals.reduce((a, b) => a + b, 0) / fitVals.length : null;

  $("kpiTotal").textContent = total.toLocaleString();
  $("kpiTTS").textContent = medTTS == null ? "-" : medTTS.toFixed(2);
  $("kpiSLT").textContent = (pctSolved * 100).toFixed(1) + "%";
  $("kpiFit").textContent = avgFit01 == null ? "-" : (FIT_SCALE === "0_100" ? (avgFit01 * 100).toFixed(1) : avgFit01.toFixed(2));
  return { total, medTTS, pctSolved, avgFit01 };
}

/* ==========================
   RENDER: CHARTS
========================== */
function relayoutChart(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || 0);
  const h = vw < 540 ? 260 : 360;
  Plotly.relayout(id, { height: h });
}

function renderTrend() {
  if (!FILTERED.length) { Plotly.purge("trendChart"); return { byDay: [] }; }
  const byDay = groupBy(FILTERED, r => dayjs(r.date).format("YYYY-MM-DD"));
  const days = [...byDay.keys()].sort();
  const volumes = days.map(d => byDay.get(d).length);
  const medTTS = days.map(d => median(byDay.get(d).map(x => x.tts)));

  Plotly.newPlot("trendChart", [
    { x: days, y: volumes, type: "bar", name: "Volume" },
    { x: days, y: medTTS, type: "scatter", mode: "lines+markers", yaxis: "y2", name: "Median TTS" },
  ], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 40, r: 50, t: 10, b: 40 },
    yaxis: { title: "Volume" },
    yaxis2: { overlaying: "y", side: "right", title: "Median TTS" },
  }, { displayModeBar: true, responsive: true }).then(() => relayoutChart("trendChart"));

  $("trendCaption").textContent = "Batang = volume harian; garis = median TTS.";
  return { byDay: days.length };
}

function renderDist() {
  const vals = FILTERED.map(r => r.tts).filter(Number.isFinite);
  if (!vals.length) { Plotly.purge("distChart"); return {}; }
  const q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75);

  Plotly.newPlot("distChart", [{
    x: vals, type: "histogram", nbinsx: 20, name: "TTS"
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 40, r: 10, t: 10, b: 40 },
    xaxis: { title: "TTS" }, yaxis: { title: "Frekuensi" }
  }, { displayModeBar: true, responsive: true }).then(() => relayoutChart("distChart"));

  $("distCaption").textContent = `Sebaran TTS; Q1 ≈ ${q1?.toFixed(2) ?? "-"} • Q3 ≈ ${q3?.toFixed(2) ?? "-"}.`;
  return { q1, q3 };
}

function renderHeatmap() {
  const models = [...new Set(FILTERED.map(r => r.model))].sort();
  const topics = [...new Set(FILTERED.map(r => r.topic))].sort();
  if (!models.length || !topics.length) { Plotly.purge("heatmapChart"); return { models: [], topics: [], matrix: [] }; }

  const map = new Map();
  for (const t of topics) for (const m of models) map.set(`${t}|${m}`, []);
  for (const r of FILTERED) map.get(`${r.topic}|${r.model}`).push(r.is_solved ? 1 : 0);

  const z = topics.map(t => models.map(m => {
    const arr = map.get(`${t}|${m}`); if (!arr.length) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return (FIT_SCALE === "0_100") ? (mean * 100) : mean;
  }));

  Plotly.newPlot("heatmapChart", [{
    z, x: models, y: topics, type: "heatmap", colorscale: "Blues", hoverongaps: false,
    zmin: 0, zmax: (FIT_SCALE === "0_100") ? 100 : 1
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 120, r: 10, t: 10, b: 40 },
    xaxis: { title: "Model" }, yaxis: { title: "Topik", automargin: true }
  }, { displayModeBar: true, responsive: true }).then(() => relayoutChart("heatmapChart"));

  $("heatmapCaption").textContent = "Nilai = solved rate (proxy) per Topik × Model.";
  return { models, topics, matrix: z };
}

function renderWinRate() {
  // data prioritas: winrate.csv; jika tak ada → hitung dari FILTERED (is_solved)
  let wrRaw = (WINRATE || []).filter(r => r && r.model);
  let wr = [];

  if (wrRaw.length) {
    // normalisasi bila file punya wins/apps
    wr = wrRaw.map(r => {
      const m = (r.model || r.Model || "").toString().trim();
      const wins = Number(r.wins ?? r.Wins ?? 0);
      const apps = Number(r.apps ?? r.Apps ?? 0);
      let p = Number(r.win_rate ?? r.WinRate);
      let lo = Number(r.wr_lo ?? r.WilsonLo), hi = Number(r.wr_hi ?? r.WilsonHi);
      if (!Number.isFinite(p) && apps > 0) p = wins / apps;

      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        const Z = 1.96;
        const denom = 1 + Z * Z / apps;
        const centre = p + Z * Z / (2 * apps);
        const adj = Z * Math.sqrt((p * (1 - p) + Z * Z / (4 * apps)) / apps);
        lo = apps ? (centre - adj) / denom : 0;
        hi = apps ? (centre + adj) / denom : 0;
      }
      return { model: m, win_rate: p, wr_lo: lo, wr_hi: hi, n: apps };
    });
  } else if (FILTERED.length) {
    const by = groupBy(FILTERED, r => r.model);
    const Z = 1.96;
    wr = [...by.keys()].sort().map(m => {
      const arr = by.get(m) || [];
      const n = arr.length;
      const k = arr.reduce((s, r) => s + (r.is_solved ? 1 : 0), 0);
      const p = n ? k / n : 0;
      const denom = 1 + Z * Z / n;
      const centre = p + (Z * Z) / (2 * n);
      const adj = Z * Math.sqrt((p * (1 - p) + (Z * Z) / (4 * n)) / n);
      const lo = n ? (centre - adj) / denom : 0;
      const hi = n ? (centre + adj) / denom : 0;
      return { model: m, win_rate: p, wr_lo: lo, wr_hi: hi, n };
    });
  }

  // filter Min N
  wr = wr.filter(r => (r.n ?? 0) >= MIN_N_WR);

  if (!wr.length) { Plotly.purge("winrateChart"); return { wr: [] }; }

  const x = wr.map(r => r.model);
  const y = wr.map(r => r.win_rate);
  const errMinus = wr.map((r, i) => Math.max(0, y[i] - r.wr_lo));
  const errPlus = wr.map((r, i) => Math.max(0, r.wr_hi - y[i]));

  Plotly.newPlot("winrateChart", [{
    x, y, type: "scatter", mode: "markers", name: "Win-Rate",
    error_y: { type: "data", symmetric: false, array: errPlus, arrayminus: errMinus, visible: true }
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 40, r: 10, t: 10, b: 80 },
    xaxis: { tickangle: -30 },
    yaxis: { title: "Win-Rate", rangemode: "tozero" }
  }, { responsive: true, displayModeBar: true }).then(() => relayoutChart("winrateChart"));

  const sorted = [...wr].sort((a,b) => b.win_rate - a.win_rate);
  const best = sorted[0], second = sorted[1];
  let sigText = "";
  if (best && second) {
    const overlap = !(best.wr_lo > second.wr_hi || best.wr_hi < second.wr_lo);
    sigText = overlap ? "Perbedaan belum meyakinkan (CI overlap)." : "Unggul signifikan (CI tidak overlap).";
  }
  $("winrateCaption").innerHTML = `Titik menampilkan <b>win-rate</b> dengan <i>Wilson 95% CI</i>. Ambang <b>Min N = ${MIN_N_WR}</b>.`;
  $("winrateInsight").innerHTML = best
    ? `<b>Kesimpulan:</b> Model terbaik: <b>${best.model}</b> (WR ≈ ${(best.win_rate*100).toFixed(1)}%). ${sigText}`
    : "";

  return { wr };
}

function renderNgrams() {
  // pakai file ngrams.csv; jika tidak ada → fallback hitung cepat dari FILTERED.user_text
  let rows = (NGRAMS || []).filter(r => r && (r.term || r.Term));
  if (!rows.length && FILTERED.length) {
    const freq = new Map();
    const stop = new Set(["the","and","to","of","a","in","for","on","is","are","itu","yang","dan","di","ke"]);
    for (const r of FILTERED) {
      const txt = (r.user_text || "").toLowerCase();
      const toks = (txt.match(/\b[\p{L}\p{N}']+\b/gu) || []).filter(t => !stop.has(t));
      for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);
      // bigram sederhana
      for (let i=0;i<toks.length-1;i++) {
        const bi = toks[i] + " " + toks[i+1];
        freq.set(bi, (freq.get(bi) || 0) + 1);
      }
    }
    rows = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([term, freq]) => ({ term, freq }));
  } else {
    rows = rows.map(r => ({ term: r.term ?? r.Term, freq: Number(r.freq ?? r.Freq ?? 0) }))
               .filter(r => Number.isFinite(r.freq))
               .sort((a,b) => b.freq - a.freq).slice(0, 30);
  }

  if (!rows.length) { Plotly.purge("ngramsChart"); $("ngramsCaption").textContent = "Tidak ada n-gram untuk ditampilkan."; return {}; }

  Plotly.newPlot("ngramsChart", [{
    x: rows.map(r => r.freq),
    y: rows.map(r => r.term),
    type: "bar", orientation: "h", name: "N-gram"
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 160, r: 10, t: 10, b: 40 },
    xaxis: { title: "Frekuensi" }, yaxis: { automargin: true }
  }, { displayModeBar: true, responsive: true }).then(() => relayoutChart("ngramsChart"));

  $("ngramsCaption").innerHTML = "Batang menunjukkan <b>frekuensi</b> unigram/bigram pada <b>teks pengguna</b>.";
  const tops = rows.slice(0,5).map(r => r.term).join(", ");
  $("ngramsInsight").innerHTML = `<b>Kesimpulan:</b> Top terms: ${tops || "-"}.`;
  return { rows };
}

function renderAll() {
  const kpi = renderKPI();
  const trend = renderTrend();
  const dist = renderDist();
  const heat = renderHeatmap();
  const wrWrap = renderWinRate();
  const ngr = renderNgrams();

  // setelah semua chart siap, aktifkan tombol ekspor
  const ok = FILTERED.length > 0;
  ["trendChart","distChart","heatmapChart","winrateChart","ngramsChart"].forEach(id => setDisabled(
    document.querySelector(`[data-export="${id}"]`), !ok
  ));
}

/* ==========================
   EKSPOR GAMBAR
========================== */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-export]");
  if (!btn) return;
  const id = btn.getAttribute("data-export");
  try {
    const url = await Plotly.toImage(id, { format: "png", height: 720, width: 1280, scale: 2 });
    const a = document.createElement("a");
    a.href = url; a.download = `${id}.png`; a.click();
  } catch (err) {
    alert("Gagal mengekspor PNG: " + err);
  }
});

/* ==========================
   SIDEBAR TOGGLER (new)
========================== */
const backdropEl = document.getElementById("backdrop");
const btnOpen = document.getElementById("menuOpen");
const btnClose = document.getElementById("menuClose");

function openSidebar(){
  document.body.classList.add("show-sidebar");
  if (btnOpen) btnOpen.setAttribute("aria-expanded", "true");
}
function closeSidebar(){
  document.body.classList.remove("show-sidebar");
  if (btnOpen) btnOpen.setAttribute("aria-expanded", "false");
}

btnOpen.addEventListener("click", openSidebar);
btnClose.addEventListener("click", closeSidebar);
backdropEl?.addEventListener("click", closeSidebar);

// Tutup dengan ESC
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("show-sidebar")) {
    closeSidebar();
  }
});

// Pastikan default TERTUTUP di awal
document.addEventListener("DOMContentLoaded", () => {
  closeSidebar();
});

// Saat resize, tetap biarkan state; tidak memaksa membuka sidebar
window.addEventListener("resize", () => {
  // hanya relayout chart; closeSidebar() tidak dipanggil otomatis
  ["trendChart","distChart","heatmapChart","winrateChart","ngramsChart"].forEach(relayoutChart);
}, { passive: true });

/* ==========================
   EVENT HANDLERS (existing)
========================== */
document.getElementById("btnApply").addEventListener("click", applyFilters);
document.getElementById("btnReset").addEventListener("click", () => {
  document.getElementById("modelSelect").selectedIndex = -1;
  document.getElementById("topicSelect").selectedIndex = -1;
  document.getElementById("fitScale").value = "0_100";
  document.getElementById("sltThreshold").value = 6;
  document.getElementById("minNWinrate").value = 30;
  document.getElementById("useHeuristics").checked = true;
  seedFilters(); applyFilters();
});

/* ==========================
   BOOTSTRAP: LOAD DEFAULT CSV
========================== */
Promise.all([
  fetch("../../data/usage.csv", { cache: "no-store" }).then(r => r.ok ? r.text() : null).catch(() => null),
  fetch("../../data/winrate.csv", { cache: "no-store" }).then(r => r.ok ? r.text() : null).catch(() => null),
  fetch("../../data/ngrams.csv", { cache: "no-store" }).then(r => r.ok ? r.text() : null).catch(() => null),
]).then(([usageText, wrText, ngrText]) => {
  if (usageText) {
    const usage = Papa.parse(usageText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
    ingest(usage);
    enableExportButtons(true);
    enableDownload(true);
  } else {
    enableExportButtons(false);
    enableDownload(false);
  }

  if (wrText) WINRATE = Papa.parse(wrText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
  if (ngrText) NGRAMS = Papa.parse(ngrText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;

  ["trendChart","distChart","heatmapChart","winrateChart","ngramsChart"].forEach(id => setTimeout(() => relayoutChart(id), 80));
}).catch(() => {
  console.warn("Tidak memuat data default. Unggah CSV untuk mulai.");
});
