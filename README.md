---

# Dashboard Analisis Penggunaan LLMs (Single-File)

Website responsif berbasis satu berkas `index.html` untuk mempresentasikan hasil analisis data dari notebook **Proyek_Analisis_Data.ipynb**.  
Mendukung unggah **CSV/JSON**, filter multi-kolom, KPI ringkas, dan visual interaktif (Plotly).

> **Privasi:** Semua pemrosesan berlangsung **di sisi klien** (browser). Tidak ada data yang dikirim ke server mana pun.

> **Sumber Dataset:** https://huggingface.co/datasets/lmarena-ai/arena-human-preference-55k

> **Interactive Visualization:** https://analisis-penggunaan-llm-s.vercel.app/

---

## ✨ Fitur Utama

- **Single-file**: cukup `index.html` (tanpa server).
    
- **Responsif**: tampilan desktop & mobile (mobile-first).
    
- **Input data fleksibel**: **CSV** atau **JSON (array of objects)**.
    
- **Normalisasi kolom otomatis** (alias/sinonim diakui; huruf besar/kecil diabaikan).
    
- **Filter lengkap**: rentang tanggal, multi-pilih _Model_ / _Topik_ / _Tugas_, opsi **Solved only**.
    
- **KPI ringkas**: total interaksi, rentang tanggal, jumlah model aktif, top model, rata-rata TTS, solve rate, rata-rata token.
    
- **Visual interaktif**:
    
    - Tren interaksi per tanggal (+ overlay Solve Rate),
        
    - Distribusi Model,
        
    - Distribusi Jenis Tugas,
        
    - Histogram TTS,
        
    - **Heatmap Topik × Model** (metrik **count** atau **avg TTS** toggle).
        
- **Tabel detail** dengan scroll & **Unduh CSV (terfilter)**.
    
- **Demo data** bawaan untuk pratinjau (tombol _Muat Contoh Data_).
    

---

## 🧭 Struktur Proyek yang Disarankan

```
/proyek-analisis-llms
├─ index.html                 # Dashboard single-file (siap pakai)
├─ Proyek_Analisis_Data.ipynb # Notebook analisis utama
└─ data/
   ├─ llms_output.csv         # (opsional) ekspor dari notebook
   └─ llms_output.json        # (opsional) alternatif JSON
```

> Catatan: `index.html` tidak otomatis membaca dari `/data`. Pengguna **mengunggah** berkas melalui UI (drag & drop / file picker). Pendekatan ini aman untuk distribusi ke klien.

---

## 🚀 Cara Pakai Cepat

1. **Buka `index.html`** langsung di browser (double-click) **atau** pakai ekstensi _Live Server_ (VS Code) untuk pengalaman optimal.
    
2. Klik **Unggah →** pilih **CSV/JSON** hasil ekspor dari notebook.
    
3. Atur **Filter** (tanggal, model, topik, tugas, solved only) → klik **Terapkan Filter**.
    
4. Navigasi ke **Ringkasan / Visual / Tabel**.
    
5. (Opsional) Klik **Unduh CSV (terfilter)** untuk menyimpan subset data.
    

---

## 🔢 Skema Data & Sinonim Kolom

Dashboard melakukan **pemetaan otomatis** berdasarkan sinonim berikut (case-insensitive):

|Kolom Kanonis|Sinonim yang Diakui (contoh)|
|---|---|
|`datetime`|`datetime`, `date`, `tanggal`, `time`, `timestamp`, `created_at`, `created`, `dt`, `waktu`|
|`model`|`model`, `chatbot`, `assistant`, `engine`, `provider`, `llm`, `produk`, `nama_model`|
|`topic`|`topic`, `topik`, `subject`, `kategori`, `category`, `intent`, `tema`|
|`task`|`task`, `use_case`, `usecase`, `jenis_tugas`, `pekerjaan`, `job`, `tipe`, `type`|
|`tts`|`tts`, `turns`, `turns_to_solve`, `conversation_turns`, `steps`, `turn_to_solve`, `turn_to_solved`|
|`solved`|`solved`, `is_solved`, `success`, `resolved`, `status`, `hasil`, `berhasil`|
|`tokens_in`|`tokens_in`, `input_tokens`, `prompt_tokens`, `tokens_input`|
|`tokens_out`|`tokens_out`, `output_tokens`, `completion_tokens`, `tokens_output`|
|`rating`|`rating`, `score`, `nilai`, `skor`, `satisfaction`, `quality`|

**Tipe nilai yang diharapkan:**

- `datetime`: tanggal/waktu parsable (ISO `YYYY-MM-DD` disarankan).
    
- `model`, `topic`, `task`: string.
    
- `tts`, `tokens_in`, `tokens_out`, `rating`: numerik.
    
- `solved`: boolean (`true/false`, atau string seperti `berhasil`, `success`, `yes/no`, `1/0`).
    

---

## 🧪 Contoh Data

**CSV**

```csv
date,model,topic,task,tts,solved,input_tokens,output_tokens,rating
2025-07-02,GPT-4o,Koding,Debugging,4,true,380,210,5
2025-07-03,Claude 3.5 Sonnet,Analisis Data,EDA,6,true,420,260,4
2025-07-05,Gemini 1.5 Pro,Terjemahan,Menerjemahkan,3,false,300,180,3
```

**JSON (array of objects)**

```json
[
  {"date":"2025-07-02","model":"GPT-4o","topic":"Koding","task":"Debugging","tts":4,"solved":true,"input_tokens":380,"output_tokens":210,"rating":5},
  {"date":"2025-07-03","model":"Claude 3.5 Sonnet","topic":"Analisis Data","task":"EDA","tts":6,"solved":true,"input_tokens":420,"output_tokens":260,"rating":4}
]
```

> Format JSON alternatif yang juga diterima: `{ "data": [ ... ] }`.

---

## 🔗 Ekspor dari Notebook (Pandas)

Contoh ringkas untuk mengekspor ke CSV **dengan nama kolom kanonis**:

```python
# df = dataframe hasil olahan akhir
rename_map = {
    'timestamp':'date', 'created_at':'date',
    'chatbot':'model',
    'subject':'topic',
    'use_case':'task',
    'turns_to_solve':'tts',
    'is_solved':'solved',
    'prompt_tokens':'input_tokens',
    'completion_tokens':'output_tokens',
    'score':'rating',
}
df_out = df.rename(columns=rename_map)

# Pastikan tipe data konsisten
df_out['date'] = pd.to_datetime(df_out['date']).dt.date
num_cols = ['tts','input_tokens','output_tokens','rating']
for c in num_cols:
    df_out[c] = pd.to_numeric(df_out[c], errors='coerce')

# Ekspor
df_out.to_csv('data/llms_output.csv', index=False)
# atau JSON:
df_out.to_json('data/llms_output.json', orient='records', force_ascii=False)
```

---

## 🖥️ Panduan UI Singkat

- **Unggah**: pilih berkas CSV/JSON atau gunakan **Muat Contoh Data** untuk demo.
    
- **Filter & Konteks Data**:
    
    - Rentang **tanggal** (From/To),
        
    - Multi-pilih **Model**, **Topik**, **Tugas**,
        
    - **Solved only**: hanya baris `solved = true`,
        
    - **Heatmap metric**: toggle **Avg TTS** (default: **count**).
        
- **Ringkasan (KPI)**: total interaksi, rentang tanggal, model aktif & top model, rata-rata TTS, solve rate, rata-rata token.
    
- **Visual**:
    
    - **Tren Interaksi** (bar) + **Solve Rate** (garis, sumbu kanan),
        
    - **Distribusi Model** (bar),
        
    - **Distribusi Tugas** (bar, top 20),
        
    - **Histogram TTS**,
        
    - **Heatmap Topik × Model** (count / avg TTS).
        
- **Tabel**: pratinjau hingga 300 baris pertama (untuk performa); gunakan **Unduh CSV** untuk seluruh subset terfilter.
    

---

## 📱 Responsif & Aksesibilitas

- **Mobile**: Navigasi diperkecil; konten grid otomatis menjadi satu kolom untuk layar sempit.
    
- **Kontras warna**: tema gelap dengan kontras teks tinggi.
    
- **Keyboard**: elemen form fokusable, tabel dapat digulir.
    

---

## ⚙️ Kustomisasi

- **Warna & radius**: ubah variabel CSS di `:root` (`--bg`, `--accent`, `--radius`, dll.).
    
- **Jumlah bin histogram**: `nbinsx` pada grafik TTS (default 20).
    
- **Batas baris tabel**: `pageSize` (default 300).
    
- **Metrik heatmap**: toggle **Avg TTS** vs **Count** dari UI.
    

---

## 🧩 Pertanyaan Bisnis (Contoh)

1. Model mana yang paling sering dipakai dan untuk topik apa?
    
2. Seberapa efisien model berdasarkan **Avg TTS** pada tiap topik?
    
3. Pola tren interaksi dan **Solve Rate** harian/bulanan?
    
4. Jenis tugas apa yang paling sering/berhasil diselesaikan?
    
5. Korelasi kasar antara panjang interaksi (tokens) dan keberhasilan?
    
6. Rekomendasi kandidat model _fit-for-purpose_ untuk topik/tugas tertentu?
    

> Semua pertanyaan di atas bisa dijelajah lewat **Filter**, **KPI**, dan **Heatmap**.

---

## 🛠️ Troubleshooting

- **“Gagal membaca berkas / data kosong”**  
    Pastikan format **CSV** punya header dan minimal kolom `date` + `model`; atau **JSON** adalah **array of objects**.
    
- **Tanggal tidak terbaca**  
    Gunakan format `YYYY-MM-DD` atau ISO-8601. Untuk Excel serial/Unix epoch, dashboard mencoba mendeteksi otomatis.
    
- **Nilai boolean `solved`**  
    Diterima: `true/false`, `1/0`, `yes/no`, `berhasil/tidak`, `success/failed`.
    
- **Angka dengan koma**  
    Parser menghapus `,` sebelum parsing; pastikan tidak ada simbol selain angka & titik desimal.
    
- **Grafik kosong**  
    Periksa filter rentang tanggal & pilihan multi-kolom (semua opsi bisa di-**Clear**).
    
- **Dataset besar (> ~10–15k baris)**  
    Pertimbangkan pre-agregasi di notebook (mis. per tanggal/model), atau sampling.
    

---

## 🧾 Changelog

- **2025-08-31**
    
    - Rilis **dashboard single-file** `index.html`: unggah CSV/JSON, filter lengkap, KPI, tren + solve rate, distribusi model & tugas, histogram TTS, **heatmap Topik × Model** (count/avg TTS), unduh CSV terfilter.
        
    - Pemetaan **sinonim kolom** otomatis & demo data untuk pratinjau.
        

---

## 📄 Lisensi

Silakan pilih sesuai kebutuhan proyek Anda (mis. **MIT**). Contoh:

```
Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy...
```

---

## 🙌 Kredit

- **[Plotly.js]** untuk visual interaktif.
    
- **[PapaParse]** untuk parsing CSV di browser.
    

---

## 📬 Kontak & Dukungan

- Pertanyaan/feature request: buka _issue_ internal proyek atau hubungi pengelola repositori.
    
- Ingin menambahkan metrik/visual baru (mis. _turn cost_, _latency_, _win rate_)? Sertakan contoh data & sketsa output yang diinginkan.
    

---

## ✅ Checklist untuk Demo ke Klien

-  Siapkan 1–2 **dataset contoh** (CSV + JSON).
    
-  Pastikan label kolom sesuai (atau masuk dalam **sinonim**).
    
-  Susun **narasi**: 3 insight utama + 1 rekomendasi per topik.
    
-  Screenshot halaman **Ringkasan** & **Heatmap** untuk dokumen penawaran.
    
-  Gunakan **Unduh CSV (terfilter)** sebagai lampiran _appendix_.
    
