# app.py — Dashboard Analisis Penggunaan LLMs (Streamlit)
# -------------------------------------------------------
# Fitur:
# - Latar Belakang, Pertanyaan Bisnis, Visualisasi lengkap, Kesimpulan otomatis
# - Membaca data lokal: data/usage.csv, data/winrate.csv, data/ngrams.csv
# - Filter: rentang tanggal, Top-N model, pilih topik, dan opsi stopwords n-gram
# - Grafik interaktif (Plotly): bar/line/histogram/error bars/heatmap
# - Robust: aman jika sebagian file tidak tersedia (bisa upload manual)
#
# Struktur data yang diharapkan:
# usage.csv   -> columns: date, model, user_text, topic, tts, is_solved, fit_score
# winrate.csv -> columns: model, wins, apps, win_rate, wr_lo, wr_hi
# ngrams.csv  -> columns: term, freq

from __future__ import annotations
import os
import io
import re
from math import sqrt
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List

import numpy as np
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go

# ---- imports & dependency guard ----
from pathlib import Path

import streamlit as st

# Tampilkan error yang ramah jika ada modul yang hilang
missing = []
try:
    import pandas as pd
except Exception as e:
    missing.append(("pandas", str(e)))
try:
    import numpy as np
except Exception as e:
    missing.append(("numpy", str(e)))
try:
    import plotly.express as px
    import plotly.graph_objects as go
except Exception as e:
    missing.append(("plotly", str(e)))

if missing:
    st.set_page_config(page_title="Dashboard Analisis LLMs", page_icon="🤖", layout="wide")
    st.error("Beberapa paket Python belum terpasang.")
    st.write("Detail:")
    for name, msg in missing:
        st.write(f"- **{name}** → {msg}")
    st.info(
        "Perbaikan cepat:\n\n"
        "```bash\n"
        "pip install -r requirements.txt\n"
        "# atau\n"
        "pip install streamlit pandas numpy plotly\n"
        "```"
    )
    st.stop()

# Lanjutkan import standar setelah guard
from __future__ import annotations
import os, io, re
from math import sqrt
from typing import Tuple, Optional, Dict, Any, List

# ----------------------- Konfigurasi Halaman -----------------------
st.set_page_config(
    page_title="Dashboard Analisis Penggunaan LLMs",
    page_icon="🤖",
    layout="wide"
)

# Sedikit styling
CUSTOM_CSS = """
<style>
.small-muted { color: rgba(0,0,0,0.6); font-size: 0.9rem; }
.kpi-card {
  border-radius: 14px; padding: 14px 16px; border: 1px solid rgba(0,0,0,0.08);
  background: rgba(0,0,0,0.02); height: 100%;
}
.kpi-value { font-size: 1.4rem; font-weight: 700; margin: 2px 0 0 0; }
.kpi-label { font-size: 0.88rem; color: rgba(0,0,0,0.6); }
hr.soft { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 0.75rem 0; }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# ----------------------- Lokasi Data -----------------------
APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
USAGE_CSV = DATA_DIR / "usage.csv"
WINRATE_CSV = DATA_DIR / "winrate.csv"
NGRAMS_CSV = DATA_DIR / "ngrams.csv"

# ----------------------- Utilitas -----------------------
STOPWORDS_EN_ID = {
    # EN
    "the","and","for","with","that","this","from","your","have","you","will","just","does","did","can","could",
    "would","there","here","into","them","then","than","what","when","where","which","some","about","like",
    "been","were","they","their","ours","ourselves","are","how","not","was","but","one","all","has","her",
    "she","him","his","our","your","their","these","those","who","whom","whose","why","because",
    # ID
    "kami","kita","kamu","anda","yang","dengan","untuk","atau","dari","pada","dalam","akan",
    "saya","dia","itu","ini","bisa","tidak","iya","dan","atau","jadi","agar","karena","kalau","sehingga"
}

def wilson_ci(wins: float, n: float, z: float = 1.96) -> Tuple[float, float, float]:
    """Mengembalikan (p_hat, lo, hi) Wilson 95% CI."""
    if n <= 0:
        return np.nan, np.nan, np.nan
    p = wins / n
    denom = 1 + z**2/n
    centre = p + z*z/(2*n)
    adj = z * np.sqrt((p*(1-p) + z*z/(4*n))/n)
    lo = max(0.0, (centre - adj)/denom)
    hi = min(1.0, (centre + adj)/denom)
    return p, lo, hi

@st.cache_data(show_spinner=False)
def load_csv(path: Path) -> Optional[pd.DataFrame]:
    try:
        if path.exists():
            return pd.read_csv(path)
        return None
    except Exception as e:
        st.warning(f"Gagal membaca {path.name}: {e}")
        return None

def ensure_usage_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Normalisasi tipe kolom usage.csv."""
    if df is None or df.empty:
        return pd.DataFrame(columns=["date","model","user_text","topic","tts","is_solved","fit_score"])
    # Date
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    else:
        df["date"] = pd.NaT
    # Model
    if "model" not in df.columns:
        df["model"] = "unknown"
    df["model"] = df["model"].astype(str)
    # Topic
    if "topic" not in df.columns:
        df["topic"] = "Lainnya"
    df["topic"] = df["topic"].fillna("Lainnya").astype(str)
    # TTS
    if "tts" in df.columns:
        df["tts"] = pd.to_numeric(df["tts"], errors="coerce")
    else:
        df["tts"] = np.nan
    # is_solved
    if "is_solved" in df.columns:
        df["is_solved"] = pd.to_numeric(df["is_solved"], errors="coerce").round().astype("Int64")
    else:
        df["is_solved"] = pd.array([None]*len(df), dtype="Int64")
    # fit_score
    if "fit_score" in df.columns:
        df["fit_score"] = pd.to_numeric(df["fit_score"], errors="coerce")
    else:
        df["fit_score"] = np.nan
    return df

def ensure_winrate_schema(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=["model","wins","apps","win_rate","wr_lo","wr_hi"])
    for c in ["wins","apps","win_rate","wr_lo","wr_hi"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    if "win_rate" not in df.columns and {"wins","apps"}.issubset(df.columns):
        p, lo, hi = zip(*[wilson_ci(w, n) for w, n in df[["wins","apps"]].fillna(0).to_numpy()])
        df["win_rate"], df["wr_lo"], df["wr_hi"] = p, lo, hi
    return df

def sanitize_terms(df: pd.DataFrame, use_stopwords: bool, top_k: int) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=["term","freq"])
    work = df.copy()
    work["term"] = work["term"].astype(str)
    if use_stopwords:
        work = work[~work["term"].str.lower().isin(STOPWORDS_EN_ID)]
    work = work.sort_values("freq", ascending=False).head(top_k)
    return work

def model_title(s: str) -> str:
    s = str(s)
    s = s.replace("gpt-3.5-turbo-0613", "gpt-3.5").replace("gpt-4-0314", "gpt-4")
    s = re.sub(r"-\d{4,}$", "", s)
    return s

def kpi_card(label: str, value: str) -> None:
    st.markdown(
        f"""
        <div class='kpi-card'>
          <div class='kpi-label'>{label}</div>
          <div class='kpi-value'>{value}</div>
        </div>
        """, unsafe_allow_html=True
    )

# ----------------------- Sidebar: Input Pengguna -----------------------
st.sidebar.header("⚙️ Pengaturan")
st.sidebar.markdown("<span class='small-muted'>Saring sesuai kebutuhan visual.</span>", unsafe_allow_html=True)

# Opsi sumber data: lokal atau upload
use_local = st.sidebar.toggle("Gunakan data lokal (folder `data/`)", value=True)

uploaded_usage = uploaded_winrate = uploaded_ngrams = None
if not use_local:
    uploaded_usage = st.sidebar.file_uploader("Upload usage.csv", type=["csv"])
    uploaded_winrate = st.sidebar.file_uploader("Upload winrate.csv (opsional)", type=["csv"])
    uploaded_ngrams = st.sidebar.file_uploader("Upload ngrams.csv (opsional)", type=["csv"])

# ----------------------- Muat Data -----------------------
usage = None
winrate = None
ngrams = None

if use_local:
    usage = load_csv(USAGE_CSV)
    winrate = load_csv(WINRATE_CSV)
    ngrams = load_csv(NGRAMS_CSV)
else:
    if uploaded_usage is not None:
        usage = pd.read_csv(uploaded_usage)
    if uploaded_winrate is not None:
        winrate = pd.read_csv(uploaded_winrate)
    if uploaded_ngrams is not None:
        ngrams = pd.read_csv(uploaded_ngrams)

usage = ensure_usage_schema(usage)
winrate = ensure_winrate_schema(winrate)
if ngrams is None:
    ngrams = pd.DataFrame(columns=["term","freq"])

# Siapkan daftar model & rentang tanggal
all_models = sorted(usage["model"].dropna().astype(str).map(model_title).unique().tolist()) if not usage.empty else []
min_date = pd.to_datetime(usage["date"].min()) if "date" in usage.columns and usage["date"].notna().any() else None
max_date = pd.to_datetime(usage["date"].max()) if "date" in usage.columns and usage["date"].notna().any() else None

# Filter di sidebar
if min_date and max_date:
    date_range = st.sidebar.date_input(
        "Rentang tanggal",
        (min_date.date(), max_date.date()),
        min_value=min_date.date(),
        max_value=max_date.date()
    )
else:
    date_range = None

top_n_models = st.sidebar.slider("Top-N model (untuk chart)", min_value=3, max_value=20, value=10, step=1)
topics_available = sorted(usage["topic"].dropna().unique().tolist())
topics_selected = st.sidebar.multiselect("Pilih topik", options=topics_available, default=topics_available)
apply_stopwords = st.sidebar.toggle("Bersihkan stopwords n-gram", value=True)
top_k_terms = st.sidebar.slider("Banyak term n-gram ditampilkan", 10, 50, 30, 5)

# Terapkan filter ke usage
filtered = usage.copy()
if date_range and all(date_range):
    start_d, end_d = [pd.to_datetime(d) for d in date_range]
    filtered = filtered[filtered["date"].between(start_d, end_d)]
if topics_selected:
    filtered = filtered[filtered["topic"].isin(topics_selected)]

# ----------------------- Header & Deskripsi -----------------------
st.title("🤖 Dashboard Analisis Penggunaan LLMs")

with st.expander("🚀 Latar Belakang", expanded=True):
    st.markdown(
        """
        Seiring perkembangan *Large Language Models (LLMs)*, memahami bagaimana model digunakan, disukai,
        dan seberapa efektif menyelesaikan tugas menjadi penting untuk **pemilihan model**, **routing otomatis**,
        dan **perancangan produk**. Dashboard ini merangkum:
        - **Popularitas Model** (tren penggunaan),
        - **Topik Utama / N-gram** (gambaran kebutuhan pengguna),
        - **Win-Rate** per model (dengan **Wilson 95% CI** sebagai kehati-hatian statistik),
        - **Turns-to-Solve (TTS)** sebagai proxy efisiensi,
        - **Fit-for-Purpose** (*Topik × Model*) sebagai proxy kecocokan model per kategori tugas.
        """
    )

with st.expander("🎯 Pertanyaan Bisnis", expanded=True):
    st.markdown(
        """
        1) **Model terpopuler** — model mana paling sering dipakai dan bagaimana trennya?  
        2) **Topik/N-gram** — tema/kata kunci apa yang paling sering diminta?  
        3) **Win-Rate** — model mana yang paling disukai (dengan interval kepercayaan)?  
        4) **TTS** — berapa gilirannya hingga *“beres”* dan model mana yang paling efisien?  
        5) **Fit-for-Purpose** — model mana unggul di tiap kategori (Coding, Penulisan, Analisis Data, Terjemahan, dll.)?
        """
    )

# ----------------------- KPI Ringkas -----------------------
col_k1, col_k2, col_k3, col_k4 = st.columns(4)
total_interactions = int(len(filtered))
unique_models = int(filtered["model"].nunique())
overall_solved_rate = np.nan
if "is_solved" in filtered.columns and filtered["is_solved"].notna().any():
    overall_solved_rate = float(filtered["is_solved"].mean())

median_tts = float(filtered["tts"].median()) if "tts" in filtered.columns and filtered["tts"].notna().any() else np.nan

with col_k1: kpi_card("Total Interaksi", f"{total_interactions:,}")
with col_k2: kpi_card("Model Unik", f"{unique_models:,}")
with col_k3: kpi_card("Solved Rate (rata2)", f"{overall_solved_rate*100:,.1f}%" if not np.isnan(overall_solved_rate) else "—")
with col_k4: kpi_card("Median TTS", f"{median_tts:,.2f}" if not np.isnan(median_tts) else "—")

st.markdown("<hr class='soft'/>", unsafe_allow_html=True)

# ----------------------- Tabs Visual -----------------------
tab_overview, tab_ngrams, tab_winrate, tab_tts, tab_fit, tab_summary = st.tabs(
    ["📈 Overview", "🧩 Topik & N-gram", "🏆 Win-Rate", "⏱️ TTS", "🎛️ Fit-for-Purpose", "✅ Kesimpulan"]
)

# ----- 📈 Overview -----
with tab_overview:
    c1, c2 = st.columns([1.1, 1.4])

    # Popularitas Model (bar top-N)
    with c1:
        st.subheader("Popularitas Model (Top-N)")
        pop = (
            filtered
            .assign(model=lambda d: d["model"].map(model_title))
            .groupby("model", observed=False)
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
            .head(top_n_models)
        )
        if not pop.empty:
            fig_bar = px.bar(pop, x="model", y="count", text="count")
            fig_bar.update_layout(xaxis_title="", yaxis_title="Jumlah Interaksi", bargap=0.2)
            st.plotly_chart(fig_bar, use_container_width=True)
        else:
            st.info("Data tidak tersedia untuk grafik popularitas.")

    # Tren per Tanggal (line)
    with c2:
        st.subheader("Tren Penggunaan Per Hari")
        if "date" in filtered.columns and filtered["date"].notna().any():
            ts = (
                filtered.assign(model=lambda d: d["model"].map(model_title))
                .groupby(["date","model"], observed=False)
                .size()
                .reset_index(name="count")
            )
            # tampilkan hanya top-N model (berdasarkan total)
            top_models = (
                ts.groupby("model", observed=False)["count"].sum().sort_values(ascending=False).head(top_n_models).index
            )
            ts = ts[ts["model"].isin(top_models)]
            fig_line = px.line(ts, x="date", y="count", color="model")
            fig_line.update_layout(xaxis_title="Tanggal", yaxis_title="Jumlah Interaksi")
            st.plotly_chart(fig_line, use_container_width=True)
        else:
            st.info("Kolom 'date' tidak tersedia/valid.")

# ----- 🧩 Topik & N-gram -----
with tab_ngrams:
    col_t1, col_t2 = st.columns([1.2, 1.0])

    with col_t1:
        st.subheader("Distribusi Topik")
        topik = (
            filtered.groupby("topic", observed=False)
            .size().reset_index(name="count")
            .sort_values("count", ascending=False)
        )
        if not topik.empty:
            fig_topik = px.bar(topik, x="topic", y="count", text="count")
            fig_topik.update_layout(xaxis_title="", yaxis_title="Jumlah Interaksi")
            st.plotly_chart(fig_topik, use_container_width=True)
        else:
            st.info("Data topik tidak tersedia.")

    with col_t2:
        st.subheader("Top N-gram")
        grams = sanitize_terms(ngrams, use_stopwords=apply_stopwords, top_k=top_k_terms)
        if not grams.empty:
            fig_grams = px.bar(grams.sort_values("freq"), x="freq", y="term", orientation="h", text="freq")
            fig_grams.update_layout(xaxis_title="Frekuensi", yaxis_title="", margin=dict(l=10, r=10, t=40, b=20))
            st.plotly_chart(fig_grams, use_container_width=True)
        else:
            st.info("File ngrams.csv tidak tersedia atau kosong.")

# ----- 🏆 Win-Rate -----
with tab_winrate:
    st.subheader("Win-Rate per Model (dengan Wilson 95% CI)")

    if winrate is not None and not winrate.empty:
        wr = winrate.copy()
        wr["model"] = wr["model"].map(model_title)
        # sort & potong top-N
        wr = wr.sort_values("win_rate", ascending=False).head(top_n_models)

        # Siapkan error bar asimetris
        err_plus = (wr["wr_hi"] - wr["win_rate"]).clip(lower=0)
        err_minus = (wr["win_rate"] - wr["wr_lo"]).clip(lower=0)

        fig_wr = go.Figure()
        fig_wr.add_trace(go.Bar(
            x=wr["model"], y=wr["win_rate"],
            name="Win-Rate",
            text=(wr["win_rate"]*100).round(1).astype(str) + "%",
            hovertemplate="Model=%{x}<br>Win-Rate=%{y:.3f}<extra></extra>"
        ))
        fig_wr.update_yaxes(title_text="Win-Rate", tickformat=".0%")

        fig_wr.update_layout(barmode="group", xaxis_title="", margin=dict(l=10, r=10, t=40, b=20))

        # Tambahkan error bars
        fig_wr.update_traces(
            error_y=dict(
                type="data", symmetric=False,
                array=err_plus,
                arrayminus=err_minus,
                thickness=1.5,
                width=3
            )
        )
        st.plotly_chart(fig_wr, use_container_width=True)

        st.caption("Catatan: Interval kepercayaan menggunakan Wilson 95% CI.")
    else:
        st.info("winrate.csv tidak tersedia.")

# ----- ⏱️ TTS -----
with tab_tts:
    c_t1, c_t2 = st.columns([1.05, 1.05])

    with c_t1:
        st.subheader("Distribusi TTS (Histogram)")
        if "tts" in filtered.columns and filtered["tts"].notna().any():
            fig_hist = px.histogram(filtered, x="tts", nbins=20)
            fig_hist.update_layout(xaxis_title="TTS", yaxis_title="Jumlah")
            st.plotly_chart(fig_hist, use_container_width=True)
        else:
            st.info("Kolom 'tts' tidak tersedia/valid.")

    with c_t2:
        st.subheader("Ringkasan TTS per Model (Median & p75)")
        if "tts" in filtered.columns and filtered["tts"].notna().any():
            summary = (
                filtered.assign(model=lambda d: d["model"].map(model_title))
                .groupby("model", observed=False)["tts"]
                .agg(median="median", p75=lambda s: s.quantile(0.75))
                .reset_index()
                .sort_values("median", ascending=True)
                .head(top_n_models)
            )
            fig_tts = go.Figure(data=[
                go.Bar(name="Median", x=summary["model"], y=summary["median"]),
                go.Bar(name="p75", x=summary["model"], y=summary["p75"])
            ])
            fig_tts.update_layout(barmode="group", yaxis_title="TTS", xaxis_title="")
            st.plotly_chart(fig_tts, use_container_width=True)

            st.dataframe(summary, use_container_width=True, hide_index=True)
        else:
            st.info("Kolom 'tts' tidak tersedia/valid.")

# ----- 🎛️ Fit-for-Purpose (Topik × Model) -----
with tab_fit:
    st.subheader("Heatmap Solved-Rate: Topik × Model")
    if not filtered.empty and "is_solved" in filtered.columns and filtered["is_solved"].notna().any():
        work = filtered.assign(model=lambda d: d["model"].map(model_title))
        # Ambil model top-N berdasarkan jumlah interaksi agar heatmap tidak terlalu lebar
        top_models_for_heat = (
            work.groupby("model", observed=False).size().sort_values(ascending=False).head(top_n_models).index
        )
        work = work[work["model"].isin(top_models_for_heat)]

        pivot = (
            work.groupby(["topic","model"], observed=False)["is_solved"]
            .mean().reset_index().pivot(index="topic", columns="model", values="is_solved")
            .reindex(index=sorted(work["topic"].unique()))
        )

        if pivot.notna().any().any():
            fig_heat = px.imshow(
                pivot,
                aspect="auto",
                color_continuous_scale="Blues",
                labels=dict(x="Model", y="Topik", color="Solved Rate"),
                zmin=0, zmax=1
            )
            st.plotly_chart(fig_heat, use_container_width=True)
            st.caption("Semakin gelap → solved rate lebih tinggi.")
        else:
            st.info("Data solved-rate tidak mencukupi untuk membuat heatmap.")
    else:
        st.info("Butuh kolom 'is_solved' untuk menghitung solved-rate.")

# ----- ✅ Kesimpulan Otomatis -----
with tab_summary:
    st.subheader("Ringkasan & Rekomendasi")
    bullets: List[str] = []

    # 1) Popularitas
    pop2 = (
        filtered.assign(model=lambda d: d["model"].map(model_title))
        .groupby("model", observed=False).size().reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    if not pop2.empty:
        top3 = pop2.head(3)
        pop_line = ", ".join(f"{r['model']} ({int(r['count'])}x)" for _, r in top3.iterrows())
        bullets.append(f"**Popularitas** — Tertinggi: {pop_line}.")

    # 2) N-gram
    grams2 = sanitize_terms(ngrams, use_stopwords=apply_stopwords, top_k=10)
    if not grams2.empty:
        g_line = ", ".join(grams2["term"].head(8).tolist())
        bullets.append(f"**Topik/N-gram** — Kata/tema yang sering muncul: {g_line}.")

    # 3) Win-Rate
    if winrate is not None and not winrate.empty:
        wr2 = winrate.copy()
        wr2["model"] = wr2["model"].map(model_title)
        top_wr = wr2.sort_values("win_rate", ascending=False).head(3)
        wr_line = ", ".join(f"{r['model']} ({r['win_rate']*100:.1f}% WR)" for _, r in top_wr.iterrows())
        bullets.append(f"**Win-Rate** — Tertinggi: {wr_line} (lihat Wilson 95% CI untuk kehati-hatian).")

    # 4) TTS
    if "tts" in filtered.columns and filtered["tts"].notna().any():
        tts_rank = (
            filtered.assign(model=lambda d: d["model"].map(model_title))
            .groupby("model", observed=False)["tts"].median().sort_values(ascending=True).head(3)
        )
        tts_line = ", ".join(f"{m} (Median {v:.2f})" for m, v in tts_rank.items())
        bullets.append(f"**Efisiensi (TTS)** — Lebih cepat (median lebih kecil): {tts_line}.")

    # 5) Fit-for-Purpose
    if not filtered.empty and "is_solved" in filtered.columns and filtered["is_solved"].notna().any():
        fit = (
            filtered.assign(model=lambda d: d["model"].map(model_title))
            .groupby(["topic","model"], observed=False)["is_solved"].mean().reset_index()
        )
        # untuk tiap topik, ambil juara solved-rate
        winners = (
            fit.sort_values(["topic","is_solved"], ascending=[True, False])
            .groupby("topic", observed=False).head(1)
        )
        if not winners.empty:
            fit_line = "; ".join(f"{r['topic']}: {r['model']} ({r['is_solved']*100:.1f}%)" for _, r in winners.iterrows())
            bullets.append(f"**Fit-for-Purpose** — Juara per topik: {fit_line}.")

    # Tampilkan bullet points
    if bullets:
        st.markdown("\n".join([f"- {b}" for b in bullets]))
    else:
        st.info("Coba lengkapi data usage/winrate/ngrams untuk menghasilkan ringkasan.")

    st.markdown(
        """
        **Catatan interpretasi**  
        - Gunakan **Wilson 95% CI** untuk menghindari bias pada sampel kecil.  
        - Bandingkan **median** dan **p75 TTS** untuk menilai efisiensi stabil.  
        - Heatmap **Topik × Model** dapat dipakai sebagai dasar **routing otomatis** model per kategori tugas.
        """
    )

# ----------------------- Footer kecil -----------------------
st.markdown("<hr class='soft'/>", unsafe_allow_html=True)
st.markdown(
    "<span class='small-muted'>© 2025 • Dashboard Analisis LLMs — dibuat dengan Streamlit + Plotly</span>",
    unsafe_allow_html=True
)

