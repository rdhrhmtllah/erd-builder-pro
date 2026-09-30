# Handover: mengeluarkan @dbml/core dari boot

Browser mengunduh dan mem-parse sekitar **20 MB JavaScript** sebelum aplikasi bisa
dipakai, dan **15,08 MB di antaranya adalah `@dbml/core`** — dibayar bahkan saat
pengguna cuma membuka satu catatan.

Pekerjaan ini **harus dikerjakan di laptop, bukan di VPS**. VPS-nya tidak sanggup
membangun proyek ini: empat percobaan build gagal kehabisan memori (2 GB, 3 GB,
3 GB + chunk dipecah, lalu 4 GB yang dibunuh OOM killer pada RSS 3,65 GB).
Optimasi bundel butuh siklus ubah–build–ukur yang berulang, dan mesin itu tidak
bisa menjalankannya.

---

## Prompt untuk agent di laptop

Salin seluruh blok di bawah ini.

```text
Kerjakan optimasi ukuran bundel di repo ini sampai selesai, lalu laporkan hasil ukurannya.

REPO
- https://github.com/rdhrhmtllah/erd-builder-pro.git, branch master
- Root repo ADALAH folder app itu sendiri (setelah clone, kamu langsung di dalamnya)
- compose.yml TIDAK ada di repo; itu hanya ada di VPS
- Jalankan `npm install` lebih dulu

TUJUAN
Keluarkan @dbml/core dari jalur boot. Sekarang browser mengunduh dan mem-parse
sekitar 20 MB JavaScript sebelum aplikasi bisa dipakai, dan 15,08 MB di antaranya
adalah @dbml/core — dibayar bahkan saat pengguna cuma membuka satu catatan.

FAKTA YANG SUDAH DIVERIFIKASI — jangan investigasi ulang
- Hanya `dbmlToERD` yang benar-benar memakai `Parser`/`ModelExporter` dari @dbml/core.
- `applyDBMLMetadata` memanggil `dbmlToERD` di dalamnya, jadi ikut butuh parser.
- Murni olah string, TIDAK butuh parser: `erdToDBML`, `findMatchingCanvasEdge`,
  `normalizeDBMLIndexSyntax`, `removeEmptyDBMLIndexes`.
- Sembilan file mengimpor `src/lib/dbml-converter.ts` secara STATIS:
  ErdFromSqlDialog.tsx, actions/erdActions.ts, DBMLEditorLinter.ts,
  DBMLEditorPanel.tsx, ErdMigrationPlannerPanel.tsx, ErdTemplatePanel.tsx,
  TableCodePanel.tsx, hooks/aiEntityContext/diagram.ts, lib/erd-templates.ts
  Ditambah dua di jalur boot: hooks/useDiagrams.ts dan routes/AppLayout.tsx.
- Rollup MENOLAK memindahkan modul ke chunk lain selama masih ada satu importir
  statis yang terjangkau dari entry. Pesannya persis:
  "dynamic import will not move module into another chunk".
  Jadi mengubah hanya dua file boot TIDAK berpengaruh sama sekali — ini sudah dicoba
  dan gagal. Semua jalur statis yang terjangkau dari entry harus ditangani.
- `applyToErdContent` (actions/erdActions.ts) sinkron dan dipanggil dari 5 tempat
  di ERDView.tsx. Tiga situs lain ada di dalam `useMemo` sehingga tidak bisa
  di-await langsung: ErdFromSqlDialog.tsx, TableCodePanel.tsx, TableDialog.tsx.
  Pertimbangkan memindahkan batas lazy-nya, bukan mengubah semuanya jadi async.
- ERDView sudah lazy (commit 3de2425) dan terbukti bisa dibuild; chunk ERDView 187 kB.

CARA MENGUKUR — ini satu-satunya angka yang menentukan
Ukuran chunk utama MENIPU. Yang menentukan adalah total JS yang diunduh saat boot:

  grep -oE '/assets/[^"]+\.js' dist/index.html | sed 's|/assets/||' \
    | xargs -I{} stat -c%s dist/assets/{} | awk '{t+=$1} END {print t/1048576" MB"}'

Ukur SEBELUM mengubah apa pun sebagai garis dasar, lalu ukur lagi sesudahnya.
BERHASIL bila chunk `dbml-*.js` tidak lagi muncul di daftar itu. Target sekitar 5 MB.

BATASAN — jangan dilanggar
1. JANGAN memakai manualChunks yang mengelompokkan per paket. Ini sudah dicoba dan
   MEMPERBURUK: total boot naik dari ~20,4 MB ke 25,34 MB, karena excalidraw
   (4,54 MB) yang tadinya aman di dalam chunk lazy DrawingsView justru terangkat
   menjadi chunk yang di-modulepreload. Periksa dist/index.html setiap kali.
2. JANGAN mengubah perilaku build desktop. Di vite.config.ts, cabang non-web harus
   tetap satu bundel: `manualChunks: webBuild ? {...} : () => 'app'`.
3. HATI-HATI di `saveDiagram` (src/hooks/useDiagrams.ts). Kalau keliru, gejalanya
   bukan error yang kelihatan, melainkan DBML tidak ikut tersimpan. Tulis tes untuk
   jalur itu sebelum mengubahnya.
4. JANGAN build di VPS. Build di laptop saja.
5. JANGAN commit folder dist — sudah masuk .gitignore.

VERIFIKASI SEBELUM SELESAI
  npx tsc --noEmit --incremental false     → harus 0 error
  npx vitest run                            → garis dasar 470 passed, 7 skipped, 0 failed
  ERD_WEB_BUILD=1 npm run build             → harus sukses
Lalu ukur lagi dan laporkan angka sebelum/sesudah.

LAPORKAN
Angka total boot sebelum dan sesudah, daftar file yang diubah, dan apa pun yang
kamu putuskan untuk TIDAK dikerjakan beserta alasannya. Kalau ternyata pendekatanmu
tidak bisa menurunkan angka itu, hentikan dan laporkan — jangan memaksa refactor
besar tanpa bukti bahwa angkanya turun.
```

---

## Angka rujukan

| | Ukuran |
|---|---|
| `@dbml/core` | 15,08 MB |
| excalidraw | 4,54 MB |
| chunk entry | 3,13 MB |
| **Total boot sekarang** | **± 20,4 MB** |
| Total boot setelah `manualChunks` per paket *(salah, jangan diulang)* | 25,34 MB |
| **Target** | **± 5 MB** |

Angka-angka itu dari satu build yang berhasil di VPS dengan heap 4 GB.

---

## Deploy setelah selesai

Image hanya **menyalin** `dist` yang sudah jadi — `Dockerfile.mcp` berisi
`FROM bekenweb/erd-builder-pro:latest` lalu `COPY . .`, jadi frontend tidak
dibangun di dalam container. Langkah ini ringan di VPS.

```bash
# dari laptop — dist/ ada di .gitignore, jadi tidak lewat git
rsync -az --delete dist/ USER@VPS:/home/hermes-admin/services/erd-builder-pro/app/dist/

# lalu di VPS
cd /home/hermes-admin/services/erd-builder-pro
sudo docker compose build erd-builder-pro
sudo docker compose up -d erd-builder-pro
```

## Sudah beres, tidak perlu dikerjakan lagi

Commit `3de2425` (ERDView dimuat lazy) sudah ada di repo dan terbukti bisa dibuild.
Itu akan ikut terpakai otomatis pada build pertama di laptop.

---

Semua angka dan nama file di sini berasal dari log build dan pembacaan kode, bukan
perkiraan. Satu hal yang **belum terbukti**: apakah menangani kesembilan importir
statis itu benar-benar menurunkan total boot ke sekitar 5 MB. Itu yang harus diukur
di laptop.
