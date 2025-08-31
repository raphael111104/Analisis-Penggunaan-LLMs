# Analisis Penggunaan LLMs

> **Status:** Stabil • **Fokus:** validasi metrik & perluasan data • **Output:** Notebook + Streamlit + Web statis

Proyek ini menganalisis penggunaan model LLM (Large Language Models) dari sisi **popularitas**, **kinerja (win-rate dengan Wilson 95% CI)**, **Turns-to-Solve (TTS)**, dan **fit-for-purpose** (proxy solved rate per topik × model). Hasil disajikan dalam:

- **Notebook**: `Proyek_Analisis_Data.ipynb`
    
- **Dashboard Streamlit**: `streamlit/dashboard.py`
    
- **Web statis**: `web/index.html` + `web/assets/app.js` + `web/assets/styles.css`
    

---

## 1) Fitur Utama

**Analisis**

- Win-Rate per model dengan **Wilson 95% CI** (asymmetric error bars).
    
- **TTS** tidak lagi konstan: diturunkan dari multi-sumber (turn, conversation length, tts, list dalam `user_text`, dan proxy panjang teks).
    
- Heatmap **Topik × Model** sebagai proxy **fit-for-purpose** (solved rate).
    

**Dashboard Streamlit**

- Otomatis membaca `data/usage.csv` dan/atau `data/winrate.csv`.  
    Fallback: **LMSYS Arena** untuk win-rate bila file lokal kosong.
    
- Filter Top-N model, ambang minimal turn, serta ringkasan TTS (median, p75).
    
- Visual: error bars Wilson, stripplot distribusi TTS, heatmap topik × model.
    

**Web statis (Tanpa server)**

- **Sidebar default tersembunyi** (desktop & mobile), tombol **close (X)** berfungsi, plus **backdrop** (klik di luar menutup).
    
- Toggle **Heuristik TTS & Solved** (ON/OFF).
    
- **Min-N** untuk Win-Rate (filter model dengan sampel kecil).
    
- Ekspor chart ke **PNG**; unduh **CSV** hasil filter.
    
- Bootstrap otomatis dari `data/*.csv` jika tersedia, atau unggah manual.
    

---

## 2) Struktur Proyek

```
.
├─ Proyek_Analisis_Data.ipynb
├─ requirements.txt
├─ data/
│  ├─ usage.csv
│  ├─ winrate.csv
│  └─ ngrams.csv
├─ streamlit/
│  └─ dashboard.py
└─ web/
   ├─ index.html
   └─ assets/
      ├─ app.js
      └─ styles.css
```

---

## 3) Skema Data

### 3.1 `data/usage.csv` (baris = satu interaksi/percakapan)

Kolom utama (yang dipakai di analisis/dash):

- `date` _(YYYY-MM-DD atau ISO date)_
    
- `model` _(string; akan dinormalisasi)_
    
- `user_text` _(string; bisa berupa JSON list untuk multi-prompt)_
    
- `topic` _(string; jika kosong akan diturunkan heuristik sederhana)_
    
- `tts` _(opsional, numerik)_
    
- `is_solved` _(opsional; {0/1, true/false})_
    
- `fit_score` _(opsional; 0..100 atau 0..1)_
    
- `turn` _(opsional; numerik)_
    
- `conversation` _(opsional; JSON array pesan)_
    

> Catatan: Jika `turn/tts/is_solved` kosong, web & dashboard menurunkannya via heuristik.

### 3.2 `data/winrate.csv`

Dua format didukung:

1. **Ringkas**: `model,wins,apps` → dihitung Wilson CI di aplikasi.
    
2. **Lengkap**: `model,win_rate,wr_lo,wr_hi,apps` → langsung dipakai.
    

### 3.3 `data/ngrams.csv` (opsional)

- `term,freq` (unigram/bigram populer dari `user_text`).  
    Jika kosong, web akan menghitung n-gram cepat sebagai fallback.
    

---

## 4) Definisi Metrik & Metodologi

- **Win-Rate**: Proporsi “menang” per model dari pasangan/kompetisi (atau proxy solved dari `usage.csv` bila `winrate.csv` tidak ada). Ketidakpastian ditampilkan sebagai **Wilson 95% CI** (asimetris).
    
- **Solved rate (proxy)**: Proporsi sampel dengan `is_solved=true`. Jika kolom hilang, diperkirakan dari sinyal bahasa (“thanks/terima kasih/berhasil/solved/works/mantap/sip/oke/ok”) dan/atau `fit_score`.
    
- **TTS (Turns-to-Solve)**: Jumlah pesan/turn sampai “selesai”. Bila tidak tersedia, diperkirakan dengan urutan: `turn` → panjang `conversation` → nilai `tts` → jumlah item di `user_text` (2×len) → **proxy** panjang teks (≤25→2; 26–100→3; >100→4).
    
- **Topik × Model**: Heatmap solved rate proxy per kombinasi kategori topik (rule-based sederhana) dan model.
    

---

## 5) Cara Menjalankan (Lokal)

### 5.1 Persiapan

```bash
# Python 3.10+ direkomendasikan
pip install -r requirements.txt
```

### 5.2 Jalankan Dashboard Streamlit

```bash
streamlit run streamlit/dashboard.py
```

Buka URL yang ditampilkan (default: `http://localhost:8501`).  
Dashboard akan otomatis:

- Membaca `data/usage.csv` & `data/winrate.csv` bila ada.
    
- Menampilkan Win-Rate + **Wilson CI** dan ringkasan **TTS** (dengan heuristik derivasi bila perlu).
    

### 5.3 Buka Web Statis

Cukup buka `web/index.html` di browser (klik dua kali atau via file server sederhana).  
Di header tersedia:

- **Upload**: `usage.csv`, `winrate.csv`, `ngrams.csv`
    
- **Download**: CSV hasil filter
    
- **PNG**: tombol ekspor pada setiap panel
    

> Web akan mencoba memuat file default dari `../data/*.csv`. Jika tidak ada, unggah berkas Anda.

---

## 6) Keterbatasan & Validasi

**Keterbatasan**

- **Skema percakapan parsial** → TTS sering perlu **proxy** (lihat urutan derivasi).
    
- **Label solved heuristik** jika kolom tidak tersedia → potensi _false positive/negative_.
    
- **Bias ukuran sampel** → model dengan N kecil dapat tampak ekstrem; gunakan **Min-N** & perhatikan CI.
    
- **Klasifikasi topik rule-based** → akurasi lebih rendah dibanding model ML khusus.
    

**Strategi Validasi**

1. **Audit kualitatif**: sampling 50–100 contoh/cluster untuk cek label solved & topik.
    
2. **Stabilitas waktu**: _rolling window_ mingguan; tren yang valid relatif stabil.
    
3. **Sensitivitas N**: ulangi analisis pada N ∈ {20, 50, 100}.
    
4. **Bandingkan CI**: perhatikan overlap Wilson CI saat membandingkan model.
    
5. **Replikasi lintas sumber**: sanity-check dengan dataset eksternal (mis. LMSYS Arena).
    
6. **Perkaya skema**: tambahkan `conversation` dan label _ground truth_ pada subset untuk kalibrasi TTS/solved.
    

---

## 7) Panduan Penggunaan

### 7.1 Streamlit

- **Sample rows**: ambil subset acak untuk respons cepat.
    
- **Minimal turn untuk TTS**: singkirkan percakapan trivial.
    
- **Top-N model**: fokus ke model terpopuler/terbaik.
    
- **Output**: chart Win-Rate (Wilson CI), ringkasan TTS (median/p75), stripplot distribusi TTS, heatmap Topik×Model.
    

### 7.2 Web Statis

- **Sidebar**: default **tersembunyi** → buka dengan tombol ☰; tutup dengan **X**, klik **backdrop**, atau tombol **Esc**.
    
- **Heuristik TTS & Solved**: ON untuk data minim; OFF bila data kaya & sudah terlabel.
    
- **Min-N Win-Rate**: saring model dengan sampel kecil agar peringkat lebih andal.
    
- **Ekspor PNG**: tiap panel punya tombol PNG.
    
- **Unduh CSV**: `filtered.csv` untuk replikasi/analisis lanjutan.
    

---

## 8) Reproducibility & Kualitas

- **Dependensi**: lihat `requirements.txt` (pandas, numpy, matplotlib, seaborn, streamlit, datasets, plotly, papaparse, dayjs).
    
- **Caching**: `@st.cache_data` di Streamlit mempercepat load.
    
- **Normalisasi**: nama model dinormalisasi (menghapus suffix versi panjang).
    
- **Saran pengujian (opsional)**: tambahkan `pytest` sederhana untuk:
    
    - Validasi kolom wajib di `usage.csv` / `winrate.csv`
        
    - Rentang nilai (`win_rate ∈ [0,1]`, `wr_lo ≤ win_rate ≤ wr_hi]`)
        
    - JSON valid untuk kolom `conversation` (jika ada)
        

Contoh sketsa tes cepat:

```python
def test_usage_columns_exist(df_usage):
    required = {"date","model","user_text"}
    assert required.issubset(df_usage.columns)
```

---

## 9) Deployment

- **Streamlit Cloud** atau server internal: jalankan `streamlit run streamlit/dashboard.py`.
    
- **Web statis**: deploy folder `web/` ke **Vercel/Netlify/GitHub Pages**.
    
    - Pastikan folder `data/` ikut dideploy jika ingin bootstrap otomatis; jika tidak, pengguna bisa **upload CSV**.
        

---

## 10) Changelog (Agustus 2025)

- **Dashboard Streamlit**
    
    - Win-Rate dengan **Wilson 95% CI** (error bars).
        
    - **Derivasi TTS multi-sumber** (tidak lagi konstan).
        
    - Fallback LMSYS Arena saat data lokal kosong.
        
    - Heatmap Topik×Model + stripplot distribusi TTS.
        
- **Web statis**
    
    - **Sidebar default tersembunyi**, tombol **X** & **backdrop** (klik luar menutup), dukung **Esc**.
        
    - Toggle **Heuristik TTS & Solved**.
        
    - **Min-N** untuk Win-Rate.
        
    - Ekspor **PNG** & unduh **CSV** hasil filter.
        
    - Fallback n-gram jika `ngrams.csv` tidak tersedia.
        

---

## 11) Roadmap

- Tambah **classifier topik** berbasis ML (TF-IDF / embeddngs) mengganti rule-based.
    
- **Significance testing** antarmodel (uji proporsi; bootstrap).
    
- **CI/CD**: lint + build + deploy otomatis; pre-commit hooks.
    
- **Unit test** skema data & validasi lebih sistematis.
    
- **Panel drill-down** (klik sel heatmap → tampilkan sampel).
    

---

## 12) FAQ

**Q1. Kenapa peringkat model berubah saat Min-N diganti?**  
A1. Model dengan sampel kecil rentan _variance_ tinggi. Gunakan Min-N lebih besar untuk hasil lebih stabil.

**Q2. Angka TTS kadang angka bulat 2/3/4 — apakah akurat?**  
A2. Itu hasil **proxy** saat data percakapan tidak lengkap. Tambahkan kolom `turn`/`conversation` untuk TTS yang lebih presisi.

**Q3. Kenapa win-rate saya tidak ada error bars?**  
A3. Pastikan `apps` > 0. Jika Anda memberi `win_rate,wr_lo,wr_hi`, aplikasi akan langsung memakainya.

**Q4. Chart tidak tampil di web?**  
A4. Pastikan CSV valid (header benar, pemisah koma) dan tidak ada BOM/encoding aneh. Coba unggah ulang/refresh.

---

## 13) Lisensi & Kredit

- **Lisensi**: pilih sesuai kebutuhan (mis. MIT/Apache-2.0).
    
- **Kredit**: terinspirasi metrik pairwise publik (mis. LMSYS Arena) untuk acuan win-rate.
    

---

## 14) Kontributor

- **Owner/Lead**: Rafli A.
    
- **Kontribusi**: silakan ajukan _issue_ atau _pull request_ untuk ide/perbaikan.
    

**Kontak**: buka _issue_ di repo atau hubungi langsung sesuai kanal komunikasi tim.
