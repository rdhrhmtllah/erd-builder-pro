# Status pekerjaan per 2026-09-30

Catatan serah-terima dari sesi panjang di VPS. Dibaca bersama
[handover-dbml-bundle-split.md](handover-dbml-bundle-split.md), yang berisi
pekerjaan bundel yang harus dikerjakan di laptop.

Produksi: <https://server-diagram.ajt.my.id> · deploy dari
`/home/hermes-admin/services/erd-builder-pro` di VPS.

---

## Sudah live dan berfungsi

Semua ini sudah ter-deploy dan terverifikasi:

| Perubahan | Commit |
|---|---|
| Notes: sub-page + breadcrumb di editor | `3c4a7f7` |
| ERD: copy SELECT/INSERT/UPDATE/DELETE dari tabel | `ca9cbf4` |
| Perbaikan layar hitam saat submenu Placeholder dibuka | `275dfdd` |
| ERD: mode tangan & kursor di kanvas | `d30906e` |
| ERD: pita "Show all tables" saat tabel disembunyikan | `bb38e08` |
| Perbaikan link berbagi publik di deployment self-host | `1be22cb` |
| Perbaikan service worker yang menyajikan bundel mati | `a370ec7` |
| Pencabutan loop reload yang membuat produksi tidak bisa dibuka | `a765024` |

Bundel yang live: `index-Cbk32MRU.js`. Tes: **470 passed, 7 skipped, 0 failed**.

## Sudah di-commit, BELUM di-deploy

- `3de2425` — ERDView dimuat lazy. Terbukti bisa dibuild (chunk ERDView 187 kB),
  tapi belum pernah sampai produksi karena build terakhir gagal.

## Belum dikerjakan

Kecepatan loading. `@dbml/core` masih 15,08 MB dari ~20,4 MB yang diunduh browser
saat boot. Rinciannya di `handover-dbml-bundle-split.md`.

---

## Batasan mesin — penting

**VPS ini tidak bisa membangun frontend proyek ini.** Empat percobaan gagal di
tahap *transform* Vite: 2 GB, 3 GB, 3 GB + chunk dipecah, lalu 4 GB yang dibunuh
OOM killer pada RSS 3,65 GB. RAM ~6,4 GB dengan swap 4 GB yang biasanya 60–95%
terpakai.

Aturannya: **jangan build di VPS**, jangan pernah memberi `--max-old-space-size`
di atas angka *available* dari `free -m`, dan cek `free -m` (termasuk baris swap)
sebelum operasi berat apa pun. Jangan pernah menjalankan build hanya untuk
mengukur sesuatu.

Ada empat dev server Vite menganggur yang menahan ~1,6 GB swap dan **dinyalakan
ulang otomatis oleh Herdr**, jadi mematikannya hanya membebaskan memori sampai
mereka kembali. Minta izin sebelum mematikan proses milik user.

## Setelan cloud sudah dimatikan (2026-09-30)

Di `~/.claude/settings.json`, atas permintaan user. Jangan dinyalakan kembali
tanpa diminta:

```
disableRemoteControl = true      remoteControlAtStartup  = false
autoUploadSessions   = false     enableArtifact          = false
agentPushNotifEnabled = false    inputNeededNotifEnabled = false
```

Artinya **tool Artifact tidak tersedia** — sampaikan hasil sebagai file di repo
atau teks di terminal, bukan halaman terpublikasi.

## Yang diparkir user — jangan mulai tanpa diminta

- **Live collaboration gaya Figma.** Diparkir saat tahap desain, sebelum ada kode.
  Penghalang yang sudah ditemukan: menyimpan diagram mengirim seluruh kanvas dan
  server menghapus apa pun yang tidak ada di kiriman
  (`server/routes/diagrams/save-service.ts`), jadi pengeditan bersamaan menuntut
  perubahan model penyimpanan, bukan sekadar transport. `yjs` sudah ada di
  `package.json` tapi belum dipakai. Baru ada satu akun user.
- **Ganti nama aplikasi** dari "ERD Builder Pro" ke sesuatu bermuatan "NOIR".
- **Bandingkan skema database lokal vs produksi.** User memilih pendekatan
  snapshot (tanpa menyimpan kredensial prod). Temuan: `fetchSchema()` di
  `server/lib/db-connectors/` sudah mengembalikan tabel, kolom, FK, dan index;
  tapi model `DbAccount`/`DbCatalog` hanya ada di `schema.sqlite.prisma` — tidak
  ada di `schema.pg.prisma`, dan database produksi tidak punya tabel `db_accounts`.

## Roadmap yang sudah disetujui user (Notes)

Berurutan: **backlink + mention tabel/kolom ERD**, lalu **tasks** yang dikumpulkan
dari checkbox lintas halaman.

## Sudah dijawab, tidak perlu dikerjakan

MCP untuk drawings sudah ada dan aktif. `PUBLIC_MCP_DOCUMENT_TYPES` di
`server/mcp/public-service.ts` sudah memuat `"drawings"`, jadi
`document_read_full` dan `workspace_write_propose`/`workspace_write_apply`
menanganinya. Sudah diuji ke produksi: baca berhasil, propose berhasil, tanpa
menulis data. Yang belum ada hanyalah lapisan semantik (seperti `erd_patch`)
supaya agent tidak perlu mengarang `seed`, `index`, dan binding panah Excalidraw
sendiri — user memilih memakai yang sudah ada.

---

## Alur deploy

Image hanya menyalin `dist` yang sudah jadi (`Dockerfile.mcp` =
`FROM bekenweb/erd-builder-pro:latest` + `COPY . .`).

```bash
# dist dibangun di laptop, lalu:
rsync -az --delete dist/ USER@VPS:/home/hermes-admin/services/erd-builder-pro/app/dist/

# di VPS
cd /home/hermes-admin/services/erd-builder-pro
sudo docker compose build erd-builder-pro
sudo docker compose up -d erd-builder-pro
```

Verifikasi: `curl -s -o /dev/null -w '%{http_code}' https://server-diagram.ajt.my.id/`
dan `sudo docker compose logs --since 3m erd-builder-pro | grep -i error`.

## Catatan Cloudflare

Cloudflare menimpa header `Cache-Control` origin: `sw.js` dikirim origin sebagai
`no-cache` tapi sampai browser sebagai `max-age=14400`. Itu setelan **Browser
Cache TTL = 4 jam** di dashboard Cloudflare user; kalau diubah ke "Respect
Existing Headers", perbaikan service worker akan sampai lebih cepat. Di luar kode.
