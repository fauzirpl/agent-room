# Catatan Perubahan

Semua perubahan yang berarti dicatat di sini. Formatnya mengikuti
[Keep a Changelog](https://keepachangelog.com/id/1.1.0/); versi mengikuti
[Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Ditambahkan

- **Jenis kelamin pegawai.** Aksesori kepala tidak lagi murni ikut jabatan:
  pegawai perempuan selalu digambar berjilbab (warnanya tetap ikut jabatan),
  laki-laki tidak pernah — jadi "Budi" di kursi auditor tidak lagi berjilbab
  dan "Sri" di kursi pranata madya tidak lagi berkumis. Ditebak dari nama
  depan, bisa ditimpa dari panel setelan (`Nama | jabatan | P`) maupun dropdown
  di kartu pegawai; timpaannya menempel di nama dan tersimpan di `nama.json`
  (v3). Rute baru `POST /jk`, dijaga `uji-jk.mjs`.
- Keenam belas jabatan kini punya warna kerudungnya sendiri di tabel `JABATAN`.


### Dihapus

- Panel **token headless** beserta endpoint `POST /kredensial`, berkas
  `.agent-room-token`, dan env `AGENT_ROOM_TOKEN_FILE`. Kredensial untuk sesi
  yang dilahirkan halaman kini ditempuh lewat env proses server saja
  (`CLAUDE_CODE_OAUTH_TOKEN=... node server.mjs --izinkan-perintah`), yang
  memang sudah diwarisi proses anaknya — jadi tidak ada kemampuan yang hilang,
  cuma satu jalur penyimpanan kunci mentah di disk yang tidak ada lagi.

## [0.1.0] — 2026-09-03

Rilis pertama yang diberi nomor. Ringkasan dari riwayat commit sampai hari ini.

### Ditambahkan

- `package.json` nol dependency: `npx github:fauzirpl/agent-room` jalan tanpa
  clone, `npm test` menjalankan harness uji event, `dinas --versi` mencetak
  versi paket.
- `dinas --layanan` mendaftarkan kantor supaya nyala sendiri tiap login
  (Task Scheduler di Windows, systemd `--user` di Linux, petunjuk launchd di
  macOS); `--lepas` mencabut, `--coba` cuma mencetak tanpa mendaftar.
- `CONTRIBUTING.md` dan berkas ini.
- Harness uji headless `uji-event.mjs` untuk semua event acak, dengan `Date`
  sandbox dikunci ke tanggal tetap, plus CI GitHub Actions (`uji.yml`).
- Pengingat sesi terkatung: lonceng 2 & 10 menit saat pegawai berhenti
  menunggu paraf/galat, judul tab `(n) menunggu paraf`, notifikasi peramban
  opsional.
- Wajah hidup: kedip acak per orang dan ekspresi fokus/lega/tegang.
- Cabang git sebagai konteks sesi: chip cabang di baris kru dan kartu pegawai.
- Riwayat token lintas sesi (`token-riwayat.jsonl`), dirangkum per hari/proyek
  dan disajikan lewat modal Statistik token.
- Kendali web dan token headless mandiri dari form tugas; modal kabar gaya
  nota dinas.
- Dua meja kerja tambahan (jadi enam), seragam harian, pantry mini, dan
  gelombang event acak baru.
- Mixer volume per komponen suara (efek, notifikasi, musik lofi) di panel
  Pengaturan.

### Diubah

- Pegawai voxel diganti sprite pixel-art bergaris tepi; tampak samping
  digambar sungguhan, tinggi tetap 28 px.
- Reskin kantor ala "DINAS AI KLOD": papan nama, bagan struktur, plakat nilai
  kerja, standee VISI, layar mini meja rapat.
- Dispenser dan tong sampah pindah ke pantry; koordinat event terkait ikut
  disesuaikan.
- Meja kerja jadi berdiri menghadap laptop, bukan duduk tenggelam di belakang
  meja.
- `token-riwayat.jsonl` yang lebih tua dari 30 hari dilebur per hari per
  proyek dan dipindah ke `token-riwayat.arsip.jsonl`.

### Dihapus

- Kabel lantai dan buku tamu.

### Diperbaiki

- `tick()` `edar-amplop-patungan` tidak lagi meledak setelah rantai serah
  tuntas (indeks keluar batas).
- Pegawai yang parkir di depan meja rapat tidak lagi tertelan meja
  (pita depth-sort digeser ke ≥ 230).

[0.1.0]: https://github.com/fauzirpl/agent-room/releases/tag/v0.1.0
