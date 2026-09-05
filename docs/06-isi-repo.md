# Isi repositori

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Isi

| File | Guna |
|---|---|
| `dinas.mjs` | pelaksana harian: periksa biner/hook, lalu jalankan server |
| `dinas.cmd`, `dinas.sh` | pembungkus supaya cukup mengetik `dinas` |
| `server.mjs` | HTTP + SSE, normalisasi payload hook |
| `hook.mjs` | forwarder cadangan kalau `curl` tidak ada |
| `install.mjs` | pasang/lepas hook di `settings.json` |
| `public/room.js` | mesin render canvas + mesin event acak |
| `public/event/` | 337 event acak terpasang, dipecah per tema; urutan muatnya di `manifest.json` (disambung server jadi satu `/event-acak.js`, dimuat sesudah `room.js`; angka dari `node uji-katalog.mjs`) |
| `uji-event.mjs`, `uji-zorder.mjs` + `uji-zorder.golden.json`, `uji-tenggat.mjs`, `uji-arah.mjs`, `uji-katalog.mjs` | harness uji headless: event (syarat/mulai/tick/selesai/gambar*/lanjutan/penjadwal), z-order `frame()` vs golden, tenggat `pada()` (lint pola tenggat bergerak + akibat yang dijanjikan benar-benar terjadi), arah hadap penonton (event tidak boleh menulis `hadap` ke orang yang bukan pemerannya — pakai `menoleh()`/`mendongak()`), papan skor katalog |
| `uji-ulang.mjs` + `uji-ulang.fixture.jsonl`, `buat-fixture.mjs` | putar ulang satu hari buku agenda sungguhan (tersamar) ke `frame()`/`handle()` asli, memeriksa invarian sepanjang hari; `buat-fixture.mjs` yang membuat fixture-nya, lengkap dengan pagar privasi |
| `uji-sisip.mjs` + `uji-sisip.golden.json`, `uji-seragam.mjs`, `uji-pagu.mjs`, `uji-pegawai.mjs` | bukaan ruang kadis (sapuan piksel + batas keras), jarak warna rompi kantor cabang, pagu anggaran token, dan formasi pegawai tetap |
| `uji-suara.mjs` | suara ucap & daftar nama: semua rupa kegagalan berujung 204, klip yang sama tidak pernah dibayar dua kali (cache + dedupe serentak), kunci tidak pernah keluar dari server, dan kalimat di `room.js` vs `server.mjs` tidak boleh hanyut. Memakai OpenRouter palsu di localhost — tidak pernah keluar jaringan, tidak pernah butuh kunci sungguhan |
| `pagu.contoh.json` | contoh `pagu.json` untuk disalin; `pagu.json` sendiri data lokal dan diabaikan `.gitignore` |
| `nama.json`, `suara.json`, `.agent-room-suara-kunci`, `suara/` | daftar nama pilihanmu, setelan suara ucap, kunci OpenRouter, dan cache klip. Semuanya lahir dari panel ⚙️, semuanya data lokal dan diabaikan `.gitignore`; rancangannya di [docs/07-suara-nama.md](07-suara-nama.md) |
| `selaras-katalog.mjs` | menyelaraskan tanda `**+**` dan angka "N sudah jadi kode" di `EVENT-ACAK.md` dengan registri sungguhan; `--periksa` ikut di `npm test` supaya katalognya tidak pernah lagi basi diam-diam |
| `public/index.html`, `public/style.css` | rangka halaman + panel |
| `EVENT-ACAK.md`, `event-acak.json` | katalog rancangan 373 event, hasil rapat desain |

Server cuma bind ke localhost dan nyimpen 400 event terakhir di memori.
Lalu lintas keluar ada tiga, dan cuma yang pertama hidup secara bawaan: cek
cuaca lewat geojs.io + open-meteo.com (matikan dengan `AGENT_ROOM_CUACA=off`),
nota dinas keluar (`AGENT_ROOM_LAPOR`), dan suara ucap ke OpenRouter (baru
jalan sesudah kunci dipasang lewat panel ⚙️). Disk **dibaca** untuk
mengikuti transkrip sesi yang sedang jalan — itu sumber balon pikiran dan kotak
kabar, dan bisa dimatikan dengan `AGENT_ROOM_ISI=off`. Disk **ditulis** untuk
riwayat token (`token-riwayat.jsonl`) tiap ada delta token baru — tanpa syarat,
lihat **Riwayat lintas sesi** di atas.

