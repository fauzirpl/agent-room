# Catatan Perubahan

Semua perubahan yang berarti dicatat di sini. Formatnya mengikuti
[Keep a Changelog](https://keepachangelog.com/id/1.1.0/); versi mengikuti
[Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Ditambahkan

- **Lagu kantor tiap hari kerja jam 10.** Satu lagu milik kantor ini sendiri,
  disetel Senin–Jumat jam 10 seperti Indonesia Raya disetel Selasa & Kamis.
  Ini satu-satunya bunyi di halaman yang datang dari berkas, bukan dari
  oscillator — dan justru karena itu berkasnya **tidak ikut di repo**: isinya
  milik pemilik mesin, sedangkan repo ini dipasang orang lain lewat npm. Taruh
  sendiri sebagai `lagu-kantor.m4a` (atau `.mp3`/`.ogg`/`.opus`/`.webm`/`.wav`)
  di folder proyek, atau tunjuk lewat `AGENT_ROOM_LAGU`. Tanpa berkas itu rute
  `/lagu-kantor` membalas 204 dan jadwalnya cuma diam — sama sekali tanpa pesan
  merah, dan janji "nol file audio eksternal" tetap berlaku untuk semua yang
  dibawa repo. Lagunya lewat `busMusik` (jadi ikut slider volume musik dan ikut
  ducking foley), beat lofi diam selama ia jalan, dan Selasa & Kamis ia
  menyusul sesudah Indonesia Raya alih-alih menimpanya. Centangnya di panel
  ⚙️ diingat browser; `mainkanLaguKantor()` di konsol untuk mencobanya tanpa
  menunggu jam 10.
- **WC.** Pintu kamar mandi di pojok kiri dinding belakang, cermin pintu kadis
  di pojok kanan: kusen aluminium, daun PVC biru muda berkisi-kisi, plang
  pria · WC · wanita, slot ISI/KOSONG, dan sandal jepit di depan pintu yang
  hilang selagi ada orangnya. Pegawai standby sesekali memakainya (1 dari 10
  kali memilih tujuan, 8–18 detik di dalam); sesi nyata tidak pernah — tool
  call tidak boleh menunggu orang di toilet. Rinciannya di
  [docs/02](docs/02-ruangan.md), bagian *WC, dan dunia yang dilebarkan ke
  kanan*.
- **Semua perabot bisa diklik: zoom + Kartu Inventaris Barang.** Kamera
  membidik barangnya (zoom 2/3/4, seperti klik bukaan ruang kadis; klik pintu
  kadis masuk ke ruangannya), dan di sebelahnya terbuka kartu inventaris
  bergaya BMN — kode barang, NUP, tahun perolehan, dan kondisi yang dibaca
  hidup dari ruangan (ember, galon, toner, WC isi/kosong). Barang yang punya
  stasiun menyebut tool Claude Code yang dikerjakan di situ, siapa yang sedang
  memakainya, dan berapa tool call yang jatuh ke sana. Klik lagi, lantai
  kosong, atau Esc untuk keluar.
- **Meja kerja ke-7** di sayap baru (x=510) — baris depan penuh. "Meja pojok"
  milik wifi-sudut-lemah ikut pindah ke meja paling kanan (`MEJA_POJOK`).
- **Tiga belas perabot pengisi ruang kosong**, dipilih dari peta keterisian
  (piksel perabot + 65.280 rute pegawai) supaya tidak ada yang menghalangi
  jalan: papan pengumuman, kotak P3K, mesin fotokopi, lemari piala, papan
  kinerja harian (grafiknya hidup dari tool call), poster BerAKHLAK, bangku
  tunggu besi, rak brosur, akuarium arwana, sofa tamu & meja kopi, palem,
  tiang hand sanitizer, tempat sampah pilah, dan mesin penghancur kertas.
  Pegawai standby sesekali memfotokopi. Semuanya bisa diklik.
- **Tiga kejadian kantor dari sisa katalog event.** Kursi kurang: begitu sesi
  nyata melebihi jumlah meja kerja selama 25 detik, seorang standby menyeret
  kursi rapat jauh terakhir ke baris meja kerja (dan benar-benar mengurangi
  kursi rapat yang bisa diduduki) — kembali sendiri kalau lengang 60 detik.
  Ngobrol di lorong: dua pegawai berhenti di mulut koridor, memberi jalan
  sebentar kalau ada yang lewat. Kucing tidur di karpet meja rapat: muncul
  kalau rapat sedang sepi, satu orang terdekat menyimpang menghindarinya
  sambil bilang "sst, biarin aja".
- **Gudang ATK & arsip.** Pintu kedua di dinding belakang, bentang pilar
  kedua (x608..640) — dunia dilebarkan lagi dari 576 ke 672 untuk lahannya.
  Polanya disalin dari WC (rutinitas standby, memudar masuk/keluar, sesi
  nyata tidak pernah ke sana) tapi rupanya sengaja beda: daun metal dengan
  strip hazard kuning-hitam dan gembok gantung, bukan plang huruf. Standby
  mampir 8% tiap memilih tujuan, pulangnya bawa kardus. Bisa diklik.
- **Pojok baca ASN.** Sudut literasi di pojok kanan lantai (x582..670
  y172..248), sebelah sekat pantri — satu-satunya bidang yang benar-benar
  luas dan, menurut sapuan piksel seluruh perabot + registri event,
  benar-benar kosong. Isinya rak buku rendah dua susun, rak koran & majalah,
  karpet anyaman, meja lesehan, dan **tiga bantal duduk**: tiga orang bisa
  baca bareng. Karpet & bantalnya digambar di lantai seperti karpet meja
  rapat, jadi yang duduk/lewat menutupinya; raknya sengaja pendek supaya
  tidak pernah memakan kaki orang yang jalan ke pintu keluar. Standby mampir
  8% tiap memilih tujuan, duduk lesehan dengan buku di pangkuan 8–16 detik
  (badannya tegak sedetik tiap 7 detik: ganti halaman), lalu **bukunya ikut
  dibawa ke meja** — pola yang sama dengan kardus ATK dari gudang. Kartu
  inventarisnya menyebut `DIPAKAI 2/3` beserta namanya dan jumlah lembar
  kliping yang sudah dijilid.
- **Satpam berpatroli.** Beda bentuk dari WC/gudang/pojok baca: bukan sekali
  jalan-tunggu-pulang, tapi keliling berurutan lewat lima titik yang sudah
  ada (ambang WC, ambang gudang, depan ruang kadis, depan pantri, dekat pintu
  keluar), singgah sebentar sambil menyorotkan senter di tiap satu, lalu
  pulang ke pos jaga (ruang tunggu) — berulang tiap ±4 menit. Tidak ada
  ruangan, dinding, atau perabot baru; peran `satpam` (peci, seragam
  khaki-coklat sendiri) sengaja tidak masuk daftar peran standby yang
  diundi sejak lahir — giliran pertama siapa saja, lalu dia didahulukan lagi
  tiap putaran berikutnya, sama seperti arsiparis didahulukan urusan notulen.
  Sesi nyata tidak pernah dipaksa berpatroli.
- **Delapan event lagi (gelombang 5).** Empat memakai pojok baca yang baru:
  koran pagi dipasang di raknya dan edisi kemarin dibuang ke tong pantri, dua
  orang lesehan mendiskusikan buku yang sama, satu ketiduran di atas bantal
  sesudah makan siang sampai dibangunkan, dan raknya sesekali dilap. Empat
  sisanya menuntaskan usulan rapat yang dulu divonis "mahal": **MCB satu
  jalur turun** (panel MCB di bidang dinding kosong sebelah rak server, dua
  tabung sisi timur padam sampai ada yang menaikkan tuasnya lagi), **rapat
  molor kopi masuk** (syaratnya membaca rapat sungguhan — ada rapat yang
  sudah lewat empat menit dengan tiga orang duduk), **jatah kuota cair**
  (rim kertas diambil dari gudang; dia tidak ikut undian sama sekali, cuma
  menyala sebagai lanjutan `kuota-fotokopi-habis`, jadi kertasnya tidak
  pernah datang sebelum ada yang kehabisan), dan **foto bersama** (dua saf di
  lantai depan meja rapat, juru fotonya berhitung, blitz sekejap — selalu
  menyusul penghargaan zona integritas). Papan skor katalog naik 310 → 314
  dari 373, total event terpasang 341 → 349.
- **Dua event lagi dari sisa katalog.** Dus ekspedisi datang: tiga dus jatuh
  berurutan (gravitasi sungguhan) di depan ruang kadis, dua pegawai
  mengangkutnya ke dekat lemari arsip — tumpukannya sekali pakai, hilang
  begitu event selesai, bukan perabot permanen. Senam Jumat: pagi Jumat
  07-08, seluruh penghuni menganggur berbaris grid dan senam bersama, kalah
  duluan kalau apel pagi kebetulan sedang berjalan.

### Diubah

- **Papan “Tentang kantor ini” muncul di tengah layar**, bukan lagi rata kanan.
  Rata kanan dulu dipilih supaya papan berdampingan dengan banner yang terjepit
  di sepertiga kiri layar, tapi di layar lebar itu menaruhnya menempel di tepi —
  jauh dari mata, dan terasa dilempar ke pinggir. Tirainya tetap lebih terang
  dari dialog lain, jadi banner yang baru dizoom masih kelihatan di kirinya.

- **Ruangan dilebarkan dari 480 ke 576 piksel dunia**, ke kanan, satu bentang
  pilar — lahan untuk ekspansi. Koordinat lama tidak ada yang bergeser; semua
  yang berarti "tepi kanan" (tamu masuk, pintu keluar ritual pulang) ikut
  pindah ke tepi baru karena memang ditulis dengan `W`. Di layar yang sama
  sprite tampil sedikit lebih kecil, karena kanvas yang lebih lebar dipaskan
  ke panggung yang sama.
- **Pantri pindah ke pojok kanan** (x414 → x510). Event yang menaruh orang dan
  barang di dalamnya kini menulis angka denah lama lewat `pantriX()`, jadi
  pemindahan berikutnya cukup mengubah `PANTRI.x`.
- **Pintu kadis jadi pintu dua daun** 48×86 (dulu satu daun 34×82), dengan lis
  mahkota dan gagang kuningan; tepi kirinya tidak bergeser.
- Dus tambahan lemari arsip yang penuh kini digambar di depan lemari, bukan di
  kirinya — tempat itu sekarang pintu WC.
- **Lampu neon ketiga di sayap timur** (x=530). Event pemadaman kini
  memadamkan semua tabung lewat `neonSemua()`, bukan `[1, 1]` yang ditulis
  tangan; `neon-sebelah-mati` bisa mengenai tabung mana saja dan meredupkan
  wilayah terdekatnya. Tabung ketiga ikut punya kartu inventaris.
- **Lagu kantor jam 10 mati bawaan.** Jam 10 sudah milik Indonesia Raya
  (Selasa & Kamis); lagu kantor cuma menyala kalau centang 🎵 di panel ⚙️
  dinyalakan sendiri. Izinnya pindah ke kunci `laguKantorIzin`: kunci lama
  diabaikan karena versi sebelumnya menulis "nyala" ke sana tiap halaman
  dibuka, jadi mengganti bawaannya saja tidak akan mematikan apa pun.

### Diperbaiki

- **`teknisi-dipanggil-ke-kolong-meja` tidak lagi menyeret pegawai yang masih
  bekerja.** Tanpa teknisi, pemilik meja didorong ke daftar pemeran tanpa
  `bisaDipinjam()` — pelanggaran Aturan 1 yang ditangkap invarian J
  `uji-ulang.mjs` begitu urutan acaknya bergeser. Catatan jujur: kode di commit
  sebelumnya pun sudah gagal `uji-ulang` di benih 4 (`kucing-di-atas-keyboard`,
  kelas yang sama) dan benih 7 (bocor peserta); benih bawaan saja yang selama
  ini lolos. Keduanya belum disentuh.

- **Beat lofi tidak lagi melempar kalau gaya musik sempat kosong di tengah
  birama.** Scheduler membaca `musikGayaAktif` di setiap langkah, jadi
  mengosongkannya di luar awal birama membuat sisa birama itu melempar di
  `G.kord`. Sekarang gayanya dipasang ulang begitu ketahuan kosong, dan yang
  dulu mengosongkannya (label yang kembali sesudah lagu kantor selesai) tidak
  perlu mengosongkan apa pun.

## [0.2.0] — 2026-09-07

### Ditambahkan

- **Lisensi MIT, dan penulisnya disebut di manifes.** Repo ini sebelumnya tidak
  punya berkas lisensi sama sekali — artinya secara hukum tidak ada yang boleh
  memakainya, betapa pun terbukanya kodenya. Sekarang ada `LICENSE` (MIT,
  © 2026 Fauzi), dan `package.json` menyebut `license` serta `author` supaya
  npm dan GitHub sama-sama membacanya dari satu tempat.

- **Ruangan digambar di resolusi layar, bukan lagi di kisi 480 px.** Kisi
  dunianya tetap 480×356 — semua koordinat, tabel stasiun, kamera, dan golden
  uji tidak bergeser sedikit pun — tapi kanvas di baliknya sekarang dibikin
  `SS` kali lebih besar dan `ctx` diskalakan `SS` kali. Yang kotak tetap kotak
  (`fillRect` berkoordinat bulat jatuh persis di batas kotak `SS`×`SS`), yang
  BUKAN kotak akhirnya punya piksel sungguhan: teks papan nama dan layar,
  lengkung jam dan rambu, gradien lantai, pendar lampu, foto pejabat yang
  miring. Sebelumnya kanvas 480 px direntangkan peramban dengan faktor pecahan
  — di layar penulisnya skala tampil 1,81 dikali `devicePixelRatio` 1,25 =
  2,26 — jadi satu piksel dunia jatuh jadi **dua** baris layar di satu tempat
  dan **tiga** di tempat lain; itu yang selama ini kebaca sebagai garis tepi
  belang dan huruf lumer. `SS` dihitung `fit()` dari skala tampil ×
  `devicePixelRatio` dan dibatasi 3; `?hd=1..4` memaksa, `?hd=0` mengembalikan
  kisi apa adanya. Diukur di mesin penulisnya satu frame berharga sama saja di
  `SS` 1, 2, maupun 3 (±4,5 ms) — yang mahal di ruangan ini geometrinya, bukan
  jumlah pikselnya. Satu pengecualian: overlay tetap memakai `pixelated`, sebab
  penyaringan halus bekerja dengan mencampur piksel bertetangga dan di
  `?overlay=chroma` campuran itu jadi rumbai hijau yang tidak bisa dibuang
  chroma key.

- **Dinding dan lantai punya bahan, bukan cuma warna.** Menaikkan jumlah piksel
  saja tidak membuat ruangan terbaca lebih tajam — yang kurang bahannya. Dinding
  dapat serat cat rol (bintik setipis satu piksel kanvas, dua arah: yang cuma
  gelap kebaca sebagai kotor, yang dua arah kebaca sebagai permukaan yang
  dicat), jatuh cahaya dari plafon ke kaki dinding, lis pemisah tiga tingkat,
  dan pilar yang punya sisi terang jadi terbaca sebagai pilaster bukan goresan.
  Lantai dapat terazo, nada tua-muda per ubin seperti ubin dari beberapa dus,
  nat bersisi gelap dan berbibir terang, serta kilap poles sejajar jendela.
  Retak ubinnya juga diperbaiki: dulu satu bentuk yang sama persis di tiap ubin
  terpilih — di kisi 480 px itu lolos, di resolusi tinggi stensil berulang itu
  langsung kebaca sebagai tanda panah — sekarang tiap ubin dapat patahannya
  sendiri. Ditambah bayangan tempel di kaki perabot dan di balik benda gantung:
  tanpa itu tiap benda kebaca *ditempel* ke lantai, bukan *berdiri* di atasnya.
  Semua lapisan bahan itu statis, jadi digambar sekali ke kanvas offscreen —
  per frame cuma satu `drawImage`, bukan ribuan `fillRect`.

- **X-banner bisa diklik dan jadi papan informasi aplikasi.** Bannernya sendiri
  yang jadi tombol: kamera membidiknya dengan zoom 4, lalu papan “Tentang kantor
  ini” terbuka berisi nama paket, cara menjalankan, alamat repositori, syarat
  Node, dan pengembangnya. Wajah bannernya digambar ulang jadi papan nama
  sungguhan — bintang lima sudut, nama instansi, garis kop — yang di kisi 480 px
  memang mustahil terbaca; ini fitur pertama yang benar-benar **memakai**
  resolusi baru di atas, bukan cuma menikmatinya. Papan informasinya berdiri
  rata kanan dengan tirai yang jauh lebih terang dari dialog lain: penjepitan
  kamera menaruh banner di sepertiga kiri layar, jadi keduanya berdampingan
  seperti benda pameran dan plakatnya alih-alih saling tutup. Menutupnya (✕,
  Esc, klik di luar, atau klik bannernya lagi) sekaligus melepas bidikannya.
  Isinya dijaga `selaras-dokumen.mjs` sebagai pasangan kelima — alamat repo,
  nama paket, perintah `npx github:…`, syarat Node, dan klaim “tanpa dependensi”
  semuanya diadu ke `package.json` tiap `npm test`, jadi papan “tentang” ini
  tidak bisa diam-diam jadi bohong waktu reponya pindah.

- **Musik lofi kantor ikut suasana ruangan.** Yang dulu satu loop tetap
  sepanjang hari sekarang punya sebelas gaya (`LOFI_GAYA` di `room.js`), dipilih
  dari hal-hal yang memang sudah menentukan rupa ruangan: babak hari, hujan/
  petir, dan kesibukan sesi. Tiap gaya bawa bank akornya sendiri plus tempo,
  ayunan swing, cutoff pad, pola drum, dan tebal desis vinyl — apel pagi paling
  cerah, jam istirahat jadi lounge dengan snare disapu, lembur berjarak lebar,
  malam nyaris cuma pad + desis, hujan menutup padnya, dan sesi yang macet
  dapat vamp dua akor yang tidak pernah menyelesaikan. Dua instrumen baru (bass
  dan satu nada rhodes yang jatuh acak) bikin dua birama bergaya sama pun tidak
  persis sama. Gayanya dibaca ulang tiap awal birama, jadi pindahnya jatuh di
  sambungan; nama suasananya ditulis kecil di panel ⚙️. Uji cepat:
  `?musik=malam`. Penjaganya `uji-musik.mjs` — termasuk akor yang bisu gara-gara
  nama nada salah ketik, dan babak hari baru yang lupa didaftarkan gayanya.

- **Suara ucap ikut jenis kelamin pegawainya.** Notifikasi maupun narasi
  kejadian sama-sama kalimat orang itu sendiri, jadi voice-nya ikut dia.
  Halaman cuma menitipkan `&jk=L`/`&jk=P`; pasangan voice-nya setelan server
  (`voiceL`/`voiceP` di `suara.json` v3). **Bawaannya kosong** — tidak ada
  tabel "voice ini laki-laki" di kode, sebab tabel itu tidak ada di sumber mana
  pun yang bisa dicek: OpenRouter cuma mengirim nama voice, dan dokumen Google
  cuma menyebut sifatnya (“Bright”, “Gravelly”, “Soft”). Panel menyediakan dua
  kolom + tombol ▶ coba di tiap kolom; pasangannya kamu tentukan pakai telinga.
  Yang di-hash voice efektif, jadi selama kolomnya kosong tidak ada satu pun
  klip lama yang basi.

### Diperbaiki

- **Sekat pantri akhirnya jadi dinding, bukan gambar.** `drawPantry()`
  menggambar panel kayu di `x414`/`y196` sejak lama, tapi `route()` tidak punya
  pengertian rintangan sama sekali: diukur sebelum diperbaiki, **60 dari 60**
  pasangan asal-tujuan menembus panel kirinya di lajur bawah `y=252`, dan
  penulis event sudah menghindarinya satu per satu dengan tangan (“berhenti
  sebelum sekat pantry (x414)”, “berakhir di x=404, aman dari sekat kiri
  pantry”) — beban yang ada di orang, bukan di kode. Sekarang pantrinya punya
  pintu (`y256..280` di panel kiri) dan router yang memakainya: `masukPantri`,
  `keluarPantri`, dan `memutarPantri` untuk tujuan di lantai bawah sekat yang
  dulu ditempuh dengan menyeberangi ruang pantri. `PANTRI` jadi satu-satunya
  sumber angkanya, dipakai bersama oleh yang menggambar dan yang menghindar.
  Rupanya ikut dibenahi: sekat bertebal dengan pucuk, muka, dan bayangan;
  counter dipecah jadi meja granit dan lemari laminasi; wastafel jadi bak
  tertanam; dan lantai di dalamnya keramik 12 px supaya pantri terbaca sebagai
  ruang lain. Penjaganya `uji-pantri.mjs` — 240 jalur dari `route()` yang asli,
  dengan tujuan yang **dipindai** dari `goToXY()` literal di `public/event/*.js`
  sehingga event baru yang menaruh orang di pantri otomatis ikut teruji.

- **`response_format` tidak lagi dipaku ke `mp3`.** Gemini TTS menolaknya
  mentah-mentah (`400 … only supports response_format="pcm"`), dan selama
  format itu jadi tetapan di kode, seluruh fitur suara mati begitu modelnya
  dipindah ke sana. Sekarang formatnya setelan yang **mengoreksi diri sendiri
  sekali lalu diingat**, dan pcm-nya dibungkus kepala WAV (24 kHz, 16-bit,
  mono — angkanya dari contoh `wave_file()` di dokumen Google) supaya tetap
  bisa dimainkan `<audio>`. Masih nol dependensi.

- **Suara & narasi tiap event acak.** 337 kejadian yang selama ini bisu kini
  berbunyi. Dua lapis yang tidak saling menunggu: efek suara Web Audio
  (kamus `EFEK`, 46 resep, disintesis di halaman — tanpa jaringan, tanpa
  kunci, ikut centang 🔊) dan narasi TTS lewat `/ucap?event=<id>`. Narasinya
  **satu kalimat sudut pandang orang pertama dari orang yang mengalami
  kejadiannya** — "Cicaknya jatuh ke tumpukan berkas saya, astaghfirullah",
  bukan judul "Cicak jatuh ke tumpukan berkas": 337 kalimat ditulis tangan di
  `narasi-event.json` yang baru. Halaman tidak pernah mengarang kalimatnya:
  yang dikirim cuma id event, dan `narasiEvent()` di server yang mengejanya —
  jatuh ke kolom `balon`, lalu `nama`, untuk event yang barisnya belum
  ditulis. Lingkupnya bisa diatur dari panel ⚙️
  (tiap kejadian / kejadian besar saja / mati) dan seluruh narasi bisa
  dipra-generate lewat tombol "panaskan narasi". Rancangannya di
  [docs/08-suara-event.md](docs/08-suara-event.md).
- `selaras-suara.mjs`: menerjemahkan kolom `suara` di `event-acak.json`
  (catatan desain hasil rapat, mis. "derit pendek tiap sapuan") jadi
  `public/event/99-suara.js`. `--periksa` ikut `npm test`, jadi gelombang
  event berikutnya tidak bisa lahir bisu tanpa ketahuan.
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

[Belum dirilis]: https://github.com/fauzirpl/agent-room/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fauzirpl/agent-room/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fauzirpl/agent-room/releases/tag/v0.1.0
