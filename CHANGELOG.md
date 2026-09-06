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

- **Catatan serah terima per proyek.** Sesi yang baru masuk di folder yang
  dipakai bersama bisa bertanya "sebelum saya mulai, di sini sudah terjadi
  apa?" — `GET /serah-terima?proyek=&jam=` dan tool MCP
  `ruangan_serah_terima` menjahitnya per sesi: berkas yang disunting,
  subperintah git yang dipakai, tool yang gagal, bacaan, paraf yang ditolak,
  rencana yang diajukan, dan siapa yang masih tertahan beserta sejak kapan.
  Sepenuhnya DETERMINISTIK — dirangkum dari buku agenda yang sudah lama
  ditulis kantor ini, tanpa model bahasa dan tanpa jaringan keluar, jadi
  jawabannya sama tiap kali ditanya. Teks perintah yang sedang menunggu paraf
  tidak pernah ikut keluar; yang lewat cuma sebab dan waktunya. Penjaganya
  `uji-serah.mjs`.

- **Kuota loket per proyek** lewat `loket.json` (opsional, di luar repo).
  `MAKS_JALAN` menjaga mesin; ini menjaga supaya satu proyek tidak memakai
  seluruh slot dan membuat proyek lain menunggu tanpa giliran. Akibatnya loket
  berhenti selalu memanggil kepala baris, jadi **nomor antre dicabut dari
  halaman** dan diganti sebabnya ("kuota proyek penuh" / "menunggu slot") —
  urutan yang bisa dilangkahi bukan janji yang pantas ditampilkan. Sebab
  tundanya ikut ke `POST /perintah` (202), `/kendali`, `/ruangan`, dan
  metrik `agent_room_antrean_tunda{sebab}`. Tanpa berkasnya, antreannya FIFO
  persis seperti sebelumnya.

- **Juknis paraf per proyek** lewat `sop.json` (opsional, di luar repo):
  menuliskan sekali apa yang tidak boleh disentuh agen di sebuah proyek, lalu
  mesin yang menegakkannya untuk tiap sesi yang dilahirkan kantor ini. Aturan
  hanya bisa **menolak** — tidak ada jalur memaraf otomatis, karena rem yang
  bisa memberi izin sendiri bukan lagi tata kelola manusia-di-lingkaran. Tiap
  pemakaiannya dicatat di buku agenda beserta nomor aturannya; polanya sendiri
  tidak pernah ikut ke disk. Contoh: `sop.contoh.json`.

- **Pegawai honorer: Gemini CLI** masuk lewat loket yang sama. Satu vendor
  saja, dan bukan pilih kasih — Gemini CLI satu-satunya yang kontrak hook-nya
  bisa dibaca langsung dari paket terpasang di mesin ini, bukan dari dokumen di
  internet. Nama event dan nama tool-nya dipetakan ke kosakata kantor; asalnya
  terbaca di `/ruangan` dan lewat `ruangan_sesi_aktif`. Transkripnya tidak
  pernah dibaca. Pasang dengan `dinas --pasang --untuk gemini`.

- **Papan SKP menilai mutu, bukan cuma volume.** Dua ratus tool call yang rapi
  dan dua ratus tool call karena mengulang `Edit` yang sama empat puluh kali
  dulu terlihat sama di papan. Sekarang ada lima sumbu perilaku (rasio gagal
  bersih, bolak-balik, tertahan, gagal beruntun, rapat yatim) dan satu nilai
  0–100 — semuanya dari medan buku agenda yang sudah ada: tidak ada hook baru,
  tidak ada kunci, tidak ada sinyal baru. **Bobot dan titik jenuhnya ikut
  keluar** bersama nilainya, supaya angkanya bisa dibantah, dan ambangnya
  dikalibrasi ke data hari sungguhan, bukan ditebak. Ikut ke tool MCP
  `ruangan_skp`.

- **Transkrip peserta rapat sampai ke pemiliknya.** Pikiran, kalimat, dan token
  subagent dulu dibuang seluruhnya, jadi peserta rapat berdiri di stasiunnya
  tanpa pernah berpikir, bicara, atau menghabiskan token yang sebetulnya mereka
  habiskan. Sekarang tiap baris diserahkan ke peserta yang benar.

- **Sesi yang macet dan sesi yang berkuasa penuh punya namanya sendiri.**
  `permission_mode` yang selama ini dibuang jadi **surat kuasa** — sesi yang
  memang tidak akan pernah minta paraf tidak lagi terlihat sama dengan sesi
  yang sedang diam-diam menunggu dijawab. Ditambah **lama tertahan** (dihitung
  dari stempel `sejak`, bukan ditebak dari kapan sesi terakhir bersuara),
  penanda **berputar-putar** (mengulang operasi yang sama), dan **meteran
  konteks**. Semuanya nota, bukan rem: tidak ada yang ditahan karenanya.

- **Loket paraf dua detik.** Kartu paraf tidak lagi cuma menempelkan perintah
  mentah 300 karakter — ada pita risiko dan nama pola dari lembar telaah
  (`telaah.mjs`, deterministik dan nol jaringan), supaya yang diminta memaraf
  tidak harus menilai sendiri tiap kali, cepat-cepat. Itu cara paling gampang
  membuat paraf jadi stempel. Buku registernya di `GET /paraf?dari=&sampai=`,
  dibaca ulang dari buku agenda: enum, angka, dan nama pola saja — isi
  perintahnya tidak pernah ada di sana, dan sentinel uji yang menjaganya.

- **Instansi luar minta keterangan.** Hook `Elicitation`/`ElicitationResult`
  dikenali, jadi sesi yang berhenti menunggu jawaban server MCP tidak lagi
  terlihat sama dengan sesi yang sedang bekerja: pegawainya berdiri mengangkat
  map dengan nama instansi yang bertanya. Nama hook dan medannya dibuktikan
  dari binari terpasang lebih dulu — peta rapat menyebut dua nama medan yang
  dua-duanya salah. Pertanyaannya sendiri isi kerja, jadi ia tidak pernah
  sampai ke disk.

- **Peserta rapat ikut bekerja, dan pohon delegasinya terbaca.** Tool call yang
  dipicu di dalam subagent dulu menggerakkan pegawai INDUKNYA — satu orang
  berjalan ke lemari arsip mewakili tiga pesertanya, sementara hitungan tool
  call dan gagal beruntun di kartunya ikut tercemar. Sekarang yang bergerak
  pesertanya sendiri, dan tool MCP `ruangan_pohon_delegasi` menyebut siapa
  menyuruh siapa. Induk yang sudah menutup gilirannya tapi pesertanya masih
  jalan disebut **menunggu peserta**, bukan menganggur.

- **Jalur tata kelola manusia-di-lingkaran akhirnya punya penjaga.** Sampai
  kemarin `mcp-izin.mjs` — satu-satunya pintu yang memutuskan sebuah tool
  boleh jalan atau tidak — nol uji. Sekarang loop lengkapnya dimainkan
  ujung-ke-ujung dengan pemeran (`claude-palsu.mjs`), termasuk antrean penuh,
  pembatalan, penghentian, dan tugas yang tak pernah bersuara. Yang ketahuan
  karenanya dan langsung ditutup: **paraf yang datang lebih cepat daripada poll
  pertama hilang, dan diam-diam berubah jadi TOLAK.** Sekaligus dibuktikan
  bahwa sesi terminal tidak bisa diparaf dari halaman.

- **Pagar mesin untuk janji yang selama ini dijaga kebiasaan**: kontrak
  nol-jaringan yang membuktikan `npm test` tidak punya jalur keluar,
  `selaras-dokumen.mjs --periksa` yang menahan dokumen supaya tidak hanyut
  dari kode (daftar hook, tabel tool MCP, nama metrik, daftar harness), klien
  MCP palsu untuk `mcp-room.mjs`, dan putar ulang satu hari kerja sungguhan
  ke sisi **server**, bukan cuma ke halaman.


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
