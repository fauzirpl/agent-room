# Isi repositori

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Isi

| File | Guna |
|---|---|
| `dinas.mjs` | pelaksana harian: periksa biner/hook/kredensial, lalu jalankan server |
| `dinas.cmd`, `dinas.sh` | pembungkus supaya cukup mengetik `dinas` |
| `server.mjs` | HTTP + SSE, normalisasi payload hook |
| `hook.mjs` | forwarder cadangan kalau `curl` tidak ada |
| `install.mjs` | pasang/lepas hook di `settings.json` |
| `public/room.js` | mesin render canvas + mesin event acak |
| `public/event-acak.js` | 272 event acak terpasang (dimuat sesudah `room.js`; angka dari `node uji-katalog.mjs`) |
| `uji-event.mjs`, `uji-zorder.mjs` + `uji-zorder.golden.json`, `uji-katalog.mjs` | harness uji headless: event (syarat/mulai/tick/selesai/gambar*/lanjutan/penjadwal), z-order `frame()` vs golden, papan skor katalog |
| `public/index.html`, `public/style.css` | rangka halaman + panel |
| `EVENT-ACAK.md`, `event-acak.json` | katalog rancangan 373 event, hasil rapat desain |

Server cuma bind ke localhost dan nyimpen 400 event terakhir di memori.
Lalu lintas keluar satu-satunya adalah cek cuaca lewat geojs.io +
open-meteo.com (matikan dengan `AGENT_ROOM_CUACA=off`). Disk **dibaca** untuk
mengikuti transkrip sesi yang sedang jalan — itu sumber balon pikiran dan kotak
kabar, dan bisa dimatikan dengan `AGENT_ROOM_ISI=off`. Disk **ditulis** di dua
keadaan: kredensial headless kalau centang **ingat di berkas** dinyalakan, dan
riwayat token (`token-riwayat.jsonl`) tiap ada delta token baru — yang kedua
ini tanpa syarat, lihat **Riwayat lintas sesi** di atas.

