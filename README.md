
# 🤖 Dashboard Analisis Penggunaan LLMs
Analisis penggunaan chatbot/LLM tahun 2024–sekarang berbasis **Jupyter Notebook** dan dipresentasikan ulang via **Streamlit** sebagai dashboard interaktif. Isi utama: *Latar Belakang, Pertanyaan Bisnis, Visualisasi Data (Popularitas, Topik/N-gram, Win-Rate + Wilson CI, TTS), Fit-for-Purpose (Topik × Model), dan Kesimpulan Otomatis.*

---

## 🔎 Ringkas (TL;DR)
```bash
# 1) Buat environment & install dependensi
python -m venv .venv
# Windows
. .venv/Scripts/activate
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt

# 2) Siapkan data (taruh CSV di folder data/)
#    - data/usage.csv
#    - data/winrate.csv (opsional)
#    - data/ngrams.csv (opsional)

# 3) Jalankan dashboard
streamlit run app.py
````

> Tidak punya CSV? Anda bisa **upload langsung** dari sidebar aplikasi Streamlit (nonaktifkan toggle “Gunakan data lokal”).

---

## 🧱 Struktur Proyek

```
.
├── app.py                        # Dashboard Streamlit (siap jalan)
├── data/
│   ├── usage.csv                 # Wajib: interaksi per sesi
│   ├── winrate.csv               # Opsional: ringkasan preferensi model
│   └── ngrams.csv                # Opsional: daftar n-gram
├── notebooks/
│   └── Proyek_Analisis_Data.ipynb# Analisis di Jupyter Notebook
├── web/
│   └── index.html                # Presentasi web statis (opsional)
├── requirements.txt
└── README.md
```

---

## 🎯 Tujuan & Pertanyaan Bisnis

- **Model terpopuler** — model mana paling sering dipakai & bagaimana trennya?
    
- **Topik/N-gram** — tema/kata kunci yang dominan?
    
- **Win-Rate** — model yang paling disukai (dengan _Wilson 95% CI_)?
    
- **TTS (Turns-to-Solve)** — efisiensi interaksi (median & p75)?
    
- **Fit-for-Purpose** — model terbaik per **Topik × Model**?
    

---

## 📊 Fitur Dashboard

- **Latar Belakang** & **Pertanyaan Bisnis** (ringkas & jelas)
    
- **KPI Ringkas**: total interaksi, model unik, _solved rate_, median TTS
    
- **Overview**:
    
    - Bar chart **Popularitas Model (Top-N)**
        
    - Line chart **Tren Harian** per model
        
- **Topik & N-gram**:
    
    - Distribusi Topik
        
    - Top N-gram (opsi bersihkan **stopwords** EN+ID)
        
- **Win-Rate**:
    
    - Bar + **error bars** (Wilson 95% CI)
        
- **TTS**:
    
    - Histogram distribusi TTS
        
    - Ringkasan per model (Median & p75)
        
- **Fit-for-Purpose**:
    
    - Heatmap **Solved-Rate**: _Topik × Model_
        
- **Kesimpulan Otomatis** (bullet) dari data yang ada
    
- **Filter Sidebar**:
    
    - Rentang tanggal
        
    - Top-N model untuk grafik
        
    - Pilih topik
        
    - Stopwords N-gram ON/OFF
        
    - Upload CSV (jika tidak pakai data lokal)
        

---

## 🗃️ Skema Data (CSV)

### 1) `data/usage.csv` (Wajib)

|Kolom|Tipe|Deskripsi|
|---|---|---|
|`date`|datetime|Tanggal/waktu interaksi (format bebas yang dikenali Pandas)|
|`model`|string|Nama model (mis. `gpt-4o`, `claude-3.5-sonnet`, dll.)|
|`user_text`|string|(Opsional) Teks permintaan pengguna|
|`topic`|string|Kategori/topik (Coding, Penulisan, Analisis Data, Terjemahan, dll.)|
|`tts`|float|Turns-to-Solve (jumlah giliran sampai selesai)|
|`is_solved`|int {0/1}|1 bila pengguna menilai “beres/puas”, 0 bila tidak|
|`fit_score`|float|(Opsional) Skor kecocokan model|

**Contoh minimal:**

```csv
date,model,user_text,topic,tts,is_solved,fit_score
2025-08-20,gpt-4o,"ringkas artikel",Penulisan,3,1,0.9
2025-08-21,claude-3.5-sonnet,"buat pseudocode",Coding,4,1,0.8
```

### 2) `data/winrate.csv` (Opsional)

|Kolom|Tipe|Deskripsi|
|---|---|---|
|`model`|string|Nama model|
|`wins`|int|Banyak “menang / disukai”|
|`apps`|int|Total percobaan/perbandingan|
|`win_rate`|float|Rasio menang (`wins/apps`)|
|`wr_lo`|float|Batas bawah Wilson 95% CI (0–1)|
|`wr_hi`|float|Batas atas Wilson 95% CI (0–1)|

> Jika `win_rate`, `wr_lo`, `wr_hi` kosong, aplikasi akan **menghitung otomatis** Wilson 95% CI dari `wins` dan `apps`.

### 3) `data/ngrams.csv` (Opsional)

|Kolom|Tipe|Deskripsi|
|---|---|---|
|`term`|string|n-gram (unigram/bigram/trigram)|
|`freq`|int|frekuensi kemunculan|

**Contoh:**

```csv
term,freq
data analysis,42
translate,25
kode,18
```

---

## 📓 Ekspor Data dari Notebook

Di `notebooks/Proyek_Analisis_Data.ipynb`, simpan hasil olahan ke folder `data/`:

```python
# Pastikan folder data/ ada
import os, pandas as pd
os.makedirs("data", exist_ok=True)

usage.to_csv("data/usage.csv", index=False)

# opsional:
winrate.to_csv("data/winrate.csv", index=False)
ngrams.to_csv("data/ngrams.csv", index=False)
```

> Setelah CSV siap, jalankan `streamlit run app.py`. Anda juga bisa meng-upload CSV langsung dari sidebar aplikasi.

---

## 🛠️ Instalasi

1. **Python 3.10+** disarankan
    
2. Buat **virtual environment** dan pasang dependensi:
    
    ```bash
    python -m venv .venv
    # Windows
    . .venv/Scripts/activate
    # macOS/Linux
    # source .venv/bin/activate
    pip install -r requirements.txt
    ```
    

**`requirements.txt` (disarankan):**

```
streamlit>=1.35
pandas>=2.2
numpy>=1.26
plotly>=5.22
```

---

## ▶️ Menjalankan Dashboard

```bash
streamlit run app.py
```

Akses di browser (alamat yang ditampilkan terminal), lalu gunakan **sidebar** untuk pengaturan:

- Toggle **Gunakan data lokal** / **Upload CSV**
    
- Filter **Rentang tanggal**
    
- **Top-N model**, pilih **Topik**
    
- Bersihkan **stopwords** untuk N-gram
    

---

## 🧠 Interpretasi & Catatan Metodologis

- **Wilson 95% CI** pada Win-Rate membantu mengurangi bias sampel kecil (lebih konservatif daripada proporsi mentah).
    
- **Median & p75 TTS**: median menggambarkan efisiensi tipikal, p75 memberi gambaran _long tail_ percakapan yang lebih lama.
    
- **Heatmap Topik × Model**: gunakan sebagai dasar routing otomatis—model berbeda bisa unggul di topik tertentu.
    

---

## 🧪 Troubleshooting

- **`FileNotFoundError: data/usage.csv`**  
    → Pastikan file berada di `data/usage.csv` atau **upload** lewat sidebar.
    
- **`KeyError: 'model'/'topic'/'tts'`**  
    → Cek **header kolom** sesuai skema tabel di atas.
    
- **`ValueError: could not convert string to float: '...'` (kolom `tts`)**  
    → Pastikan `tts` numerik (hapus teks/NA aneh), simpan ulang CSV.
    
- **`ModuleNotFoundError: streamlit/plotly/pandas`**  
    → Jalankan `pip install -r requirements.txt` di environment aktif.
    
- **Port sudah dipakai**  
    → Jalankan `streamlit run app.py --server.port 8502`
    
- **Grafik kosong**  
    → Periksa filter (tanggal/topik) dan kolom wajib yang terisi.
    

---

## 🔐 Privasi Data

Gunakan data yang **telah dianonimkan** (hilangkan PII). Hindari menyimpan teks mentah sensitif pada `user_text`.

---

## 🗺️ Roadmap (Opsional)

- Impor langsung dari dataset Hugging Face + normalisasi skema
    
- Ekspor PNG/CSV dari tiap grafik
    
- Segmentasi vendor/model family & versi
    
- Model routing rules otomatis per topik (berdasarkan heatmap)
    
- Halaman “Perbandingan Model” + uji statistik antarmodel
    


---

## 🤝 Kontribusi

Masukan/Pull Request dipersilakan. Harap pertahankan skema data & gaya visual yang konsisten.

---

## 📄 Lisensi

MIT — silakan sesuaikan sesuai kebutuhan institusi/proyek Anda.

---

## 🙌 Kredit

- Notebook analisis: `notebooks/Proyek_Analisis_Data.ipynb`
    
- Dashboard: `app.py` (Streamlit + Plotly)
    
- Terima kasih kepada kontributor & komunitas riset pembelajaran berbasis data.
    
