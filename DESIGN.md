# Agent Room — Kantor Dinas — Catatan Desain

> Ini dokumen mendalam: alasan di balik tiap keputusan, bukan cuma caranya.
> Versi ringkas + cara jalanin dalam 2 menit ada di [README.md](README.md).

Visualisasi langsung sesi Claude Code: kantor pemerintahan Indonesia dalam
pixel-art, satu pegawai (sprite kecil bergaris tepi) per sesi, yang jalan ke
meja berbeda sesuai tool yang lagi dipakai agent-nya. Lengkap dengan Garuda,
bendera merah putih, dispenser galon, dan AC yang netes ke ember.

```
Claude Code hooks  ──curl──▶  server.mjs (:4517)  ──SSE──▶  browser (canvas)
```

Tanpa dependency. Cuma butuh Node dan `curl` (bawaan Windows 10+, macOS, Linux).

## Daftar isi

Dokumen ini dipecah per tema ke folder `docs/` (bagian panjangnya sudah 1.800 baris). Judul tiap bagian tidak diubah, jadi rujukan seperti "lihat DESIGN.md → Tiga aturan" tetap menemukan judul yang sama di berkas tujuannya.

### [Jalanin & pasang](docs/01-jalanin.md)

- [Jalanin](docs/01-jalanin.md#jalanin)
- [Pasang hook](docs/01-jalanin.md#pasang-hook)
  - [Kotak surat hook offline](docs/01-jalanin.md#kotak-surat-hook-offline)
  - [Event yang dipasang](docs/01-jalanin.md#event-yang-dipasang)
- [Konfigurasi](docs/01-jalanin.md#konfigurasi)
  - [Gerbang: penjaga Host & kunci event](docs/01-jalanin.md#gerbang-penjaga-host-kunci-event)
  - [Kantor pusat & kantor cabang](docs/01-jalanin.md#kantor-pusat-kantor-cabang)
- [Kenapa curl, bukan node](docs/01-jalanin.md#kenapa-curl-bukan-node)

### [Ruangan & pegawai](docs/02-ruangan.md)

- [Peta stasiun](docs/02-ruangan.md#peta-stasiun)
  - [Butuh manusia](docs/02-ruangan.md#butuh-manusia)
  - [Berhenti karena galat](docs/02-ruangan.md#berhenti-karena-galat)
  - [Nota dinas keluar (webhook)](docs/02-ruangan.md#nota-dinas-keluar-webhook)
  - [Berpikir mengikuti tempatnya](docs/02-ruangan.md#berpikir-mengikuti-tempatnya)
  - [Kenapa perintah shell dipecah dua](docs/02-ruangan.md#kenapa-perintah-shell-dipecah-dua)
- [Peserta rapat](docs/02-ruangan.md#peserta-rapat)
  - [Kursi sementara, lalu diambil alih](docs/02-ruangan.md#kursi-sementara-lalu-diambil-alih)
  - [Kapan mereka permisi](docs/02-ruangan.md#kapan-mereka-permisi)
- [Persona pegawai](docs/02-ruangan.md#persona-pegawai)
- [Pegawai standby](docs/02-ruangan.md#pegawai-standby)
- [Kartu pegawai](docs/02-ruangan.md#kartu-pegawai)
  - [Daftar kru: seksi per proyek & pin](docs/02-ruangan.md#daftar-kru-seksi-per-proyek-pin)
  - [Cabang git sebagai konteks sesi](docs/02-ruangan.md#cabang-git-sebagai-konteks-sesi)
  - [Buku induk pegawai](docs/02-ruangan.md#buku-induk-pegawai)
- [Suasana ikut jam](docs/02-ruangan.md#suasana-ikut-jam)
  - [Babak hari kerja](docs/02-ruangan.md#babak-hari-kerja)
  - [Tema kalender](docs/02-ruangan.md#tema-kalender)
  - [Hujan ikut cuaca sungguhan](docs/02-ruangan.md#hujan-ikut-cuaca-sungguhan)

### [Isi transkrip & arsip](docs/03-isi-transkrip.md)

- [Balon pikiran & kotak kabar](docs/03-isi-transkrip.md#balon-pikiran-kotak-kabar)
  - [Balon ucap tiga baris](docs/03-isi-transkrip.md#balon-ucap-tiga-baris)
  - [Pikiran jadi balon awan](docs/03-isi-transkrip.md#pikiran-jadi-balon-awan)
  - [Kalimatnya jadi kotak kabar](docs/03-isi-transkrip.md#kalimatnya-jadi-kotak-kabar)
  - [Meja disposisi & pencarian](docs/03-isi-transkrip.md#meja-disposisi-pencarian)
  - [Tombol di bilah bawah](docs/03-isi-transkrip.md#tombol-di-bilah-bawah)
  - [Token sesi terminal](docs/03-isi-transkrip.md#token-sesi-terminal)
  - [Riwayat lintas sesi](docs/03-isi-transkrip.md#riwayat-lintas-sesi)
  - [Papan SKP & nota mingguan](docs/03-isi-transkrip.md#papan-skp-nota-mingguan)
  - [Yang berubah soal privasi](docs/03-isi-transkrip.md#yang-berubah-soal-privasi)
- [Bahasa yang tampil](docs/03-isi-transkrip.md#bahasa-yang-tampil)
  - [Kamera](docs/03-isi-transkrip.md#kamera)
  - [Debu di berkas cahaya & rim light](docs/03-isi-transkrip.md#debu-di-berkas-cahaya-rim-light)
  - [Mode ringan](docs/03-isi-transkrip.md#mode-ringan)
  - [Mode kadis: `?kadis=1`](docs/03-isi-transkrip.md#mode-kadis-kadis1)
  - [Overlay layar kedua / OBS: `?overlay=1`](docs/03-isi-transkrip.md#overlay-layar-kedua-obs-overlay1)
- [Buku agenda](docs/03-isi-transkrip.md#buku-agenda)

### [Event acak](docs/04-event-acak.md)

- [Event acak](docs/04-event-acak.md#event-acak)
  - [Tiga aturan yang tidak boleh dilanggar](docs/04-event-acak.md#tiga-aturan-yang-tidak-boleh-dilanggar)
  - [Pantry](docs/04-event-acak.md#pantry)
  - [Apel pagi](docs/04-event-acak.md#apel-pagi)
  - [Kenapa hujan tidak ada di daftar itu](docs/04-event-acak.md#kenapa-hujan-tidak-ada-di-daftar-itu)

### [Kendali web & pemantauan](docs/05-kendali-web.md)

- [Kendali web](docs/05-kendali-web.md#kendali-web)
  - [Antrean disposisi](docs/05-kendali-web.md#antrean-disposisi)
  - [Paraf dari ruangan](docs/05-kendali-web.md#paraf-dari-ruangan)
  - [Model yang dipakai](docs/05-kendali-web.md#model-yang-dipakai)
  - [Token headless](docs/05-kendali-web.md#token-headless)
  - [Kenapa penelusur foldernya dilayani server](docs/05-kendali-web.md#kenapa-penelusur-foldernya-dilayani-server)
  - [Sesi dari halaman ini tidak muncul di aplikasi Claude](docs/05-kendali-web.md#sesi-dari-halaman-ini-tidak-muncul-di-aplikasi-claude)
  - [Dua sumber untuk sesi dari halaman](docs/05-kendali-web.md#dua-sumber-untuk-sesi-dari-halaman)
  - [Kalau tugasnya tidak pernah muncul](docs/05-kendali-web.md#kalau-tugasnya-tidak-pernah-muncul)
  - [Jebakan dua instalasi](docs/05-kendali-web.md#jebakan-dua-instalasi)
- [Agent Room sebagai MCP server](docs/05-kendali-web.md#agent-room-sebagai-mcp-server)
  - [Uji tanpa peramban](docs/05-kendali-web.md#uji-tanpa-peramban)
- [Pemantauan](docs/05-kendali-web.md#pemantauan)
  - [`/metrics` gaya Prometheus](docs/05-kendali-web.md#metrics-gaya-prometheus)
  - [Rem SSE](docs/05-kendali-web.md#rem-sse)

### [Isi repositori](docs/06-isi-repo.md)

- [Isi](docs/06-isi-repo.md#isi)
