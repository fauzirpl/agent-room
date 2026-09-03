# Isi transkrip & arsip

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Balon pikiran & kotak kabar

Sampai di sini ruangan cuma menunjukkan **perbuatan**: tool apa yang dipakai,
berkas mana yang disentuh, berhasil atau tidak. Yang tidak pernah kelihatan
justru dua hal yang paling ingin dibaca orang — apa yang sedang **dipikirkan**
agennya, dan apa yang sebenarnya **dia katakan**.

Keduanya tidak ada di payload hook. Hook memang tidak pernah membawa isi. Yang
membawanya cuma satu berkas: **transkrip sesi** yang ditulis Claude Code
sendiri, satu baris JSON per pesan, dan jalurnya dititipkan di tiap payload
hook lewat `transcript_path`. Server mengikutinya dari **ekor** — yang
bertambah sesudah pemantauan mulai, itu yang disiarkan. Sesi yang sudah panjang
tidak membanjiri ruangan dengan pikiran satu jam lalu.

```
transkrip sesi (.jsonl)  ──ekornya diikuti──▶  server.mjs  ──SSE──▶  balon + modal + kartu
```

Kalau `transcript_path` suatu hari hilang dari payload, jalurnya ditebak dari
`cwd` + `session_id` dengan aturan penyimpanan Claude Code
(`~/.claude/projects/<cwd disandikan>/<id>.jsonl`, dan `CLAUDE_CONFIG_DIR`
dihormati). Yang mati cuma jalan pintasnya, bukan fiturnya.

### Balon ucap tiga baris

Balon ucap dulu **sebaris** dan dipotong `…` di tengah kata. Untuk sapaan
pendek ("siap, ndan") itu cukup, tapi `ucap` — kalimat yang benar-benar
ditulis agen untuk kamu — hampir tidak pernah muat sebaris, dan yang
terpotong di huruf ke-84 cuma jadi penanda "ada yang bilang sesuatu", bukan
sesuatu yang dibaca.

Sekarang balonnya melebar sampai **244 px dan tiga baris**. Batasnya dijaga
CSS (`line-clamp`), bukan cuma potong huruf di JS: kalimat pendek tetap balon
kecil sebaris, kalimat panjang berhenti rapi di baris ketiga, dan tidak ada
angka ajaib di JS yang harus ditebak ulang tiap kali lebar balonnya berubah.
Balon yang lebih dari sebaris juga hidup lebih lama (6,4 detik, bukan 4,2) —
tiga baris butuh waktu baca yang lain dari dua kata.

Karena melebar, balon ucap ikut **dijaga di dalam bingkai** seperti balon
pikiran: pegawai di meja paling tepi tidak boleh bicara separuh keluar layar.
Geserannya sebatas lebar balonnya sendiri, dan ekornya digeser balik sejauh
itu juga supaya tetap menunjuk kepala orangnya, tidak pernah copot dari
badan balonnya. Tinggi dan lebar sungguhannya diukur sekali tiap `say()`
(bukan konstanta, bukan tiap frame) — itu yang dipakai balon pikiran untuk
menumpuk tepat di atasnya berapa pun baris yang terpakai.

### Pikiran jadi balon awan

Bentuknya sengaja dibedakan dari balon ucap: **awan bersudut bulat dengan dua
gelembung menurun** ke arah kepala, bukan ekor segitiga. Itu satu-satunya
penanda yang langsung terbaca sebagai "ini yang dipikirkan, bukan yang
diucapkan" tanpa perlu label.

Isinya ditampilkan **sepenggal-sepenggal**, berganti tiap 3,2 detik, maksimal
empat penggal. Satu blok pikiran gampang lebih panjang dari yang muat di atas
kepala orang, dan membacanya berganti kalimat justru yang bikin dia terbaca
sebagai proses — bukan sebagai papan pengumuman.

Balon pikiran **tidak masuk log kegiatan dan tidak menaikkan statistik apa
pun.** Berpikir bukan pekerjaan yang bisa dihitung, dan log kegiatan akan
tenggelam kalau tiap tarikan napas ikut dicatat.

Kalau balon ucapnya kebetulan sedang tampil, balon pikiran naik ke atasnya.
Dua-duanya boleh muncul bersamaan: mikir sambil melapor itu wajar.

**Isi pikiran tidak selalu ada.** Sebagian permintaan mengembalikan blok
`thinking` yang teksnya kosong — tersegel, cuma tanda tangannya yang ikut.
Waktu itu terjadi yang muncul tiga titik berkedip plus jumlah tokennya: "dia
memang sedang mikir, isinya tidak dibagi" lebih jujur daripada balon kosong,
dan jauh lebih jujur daripada mengarang isi.

Pikiran dari **subagent** (`isSidechain`) sengaja dilewati. Tidak ada apa pun
di barisnya yang bisa dipakai memastikan dia peserta rapat yang mana, dan
menempelkan pikiran ke orang yang salah lebih buruk daripada tidak
menampilkannya.

### Kalimatnya jadi kotak kabar

Kalimat yang benar-benar ditulis agen masuk **kotak kabar**, dan cuma sebagian
yang berhak memunculkan modal sendiri:

| Kabar | Muncul sendiri? | Dari mana |
|---|---|---|
| **hasil kerja** — teks yang menutup giliran | ya | blok teks pada pesan ber-`stop_reason: end_turn` |
| **catatan** — kalimat pengantar sebelum tool berikutnya | tidak | blok teks pada pesan yang masih berlanjut |
| **butuh jawaban** — `AskUserQuestion`, notifikasi yang menahan sesi | ya | `tool_input` / `Notification` |
| **mengajukan rencana** — `ExitPlanMode` | ya | `tool_input.plan` |
| **minta izin** — `PermissionRequest` | ya | payload hook |
| **berhenti** — giliran putus di tengah jalan | ya | `StopFailure` |

Aturannya satu kalimat: **modal yang muncul tiap agen berdehem bukan alat
pantau, tapi gangguan.** Yang berhak menyela cuma dua — hasil akhir, dan sesi
yang berhenti menunggu kamu. Sisanya menumpuk dengan lencana angka di tombol
💬 pada bilah bawah, tinggal dibuka kalau memang mau dibaca.

Untuk `AskUserQuestion` yang ditampilkan **pertanyaannya beserta pilihannya**,
bukan cuma nama tool-nya — itu yang sebenarnya perlu dibaca orang. Kabar yang
menahan sesi selalu ditutup satu catatan: jawabannya di tempat sesi itu jalan,
terminal atau aplikasi Claude, **bukan di halaman ini.** Halaman ini menonton,
tidak menjawab; menyembunyikan itu cuma bikin orang menunggu tombol yang memang
tidak akan pernah ada.

Modalnya sendiri berlagak **email yang meneruskan nota dinas**: kepala modal
gaya kepala email (avatar bulat + inisial, nama & jabatan pengirim, lencana
jenis, jam kirim), badannya panel gelap yang menaruh satu kertas krem di
tengah — kop **PEMERINTAH KANTOR DINAS**, judul **NOTA DINAS**, lalu tabel
Nomor/Sifat/Perihal/Tanggal/Kepada/Dari sebelum isi pesannya sendiri. Nomor
suratnya (`nomorNota()`) format asli `urut/ND-inisial-jabatan/bulan-romawi/
tahun`, urutnya jalan terus (`kabarSeq`) walau kabar lama sudah dibuang dari
larik `kabar` (lihat `KABAR_MAX`). Sifat (BIASA/SEGERA/PENTING) dan stempel
sudut kertas (`SELESAI`/`DICATAT`/`SEGERA`/`TERHENTI`, `mix-blend-mode:
multiply` biar nempel seperti tinta) dua-duanya dipakaikan ulang dari
taksonomi `cls` yang sama dipakai lencana jenis — satu sumber warna, tiga
tempat pakai. Metadata teknis (nama tool, id sesi) sengaja ditaruh **di luar**
kertas, di bawahnya — seperti header mentah yang klien email tampilkan
terpisah dari isi pesan yang diformat.

Kotak kabar menyimpan 60 kabar terakhir, bisa dibolak-balik dengan `←` `→`,
ditutup dengan `Esc`.

### Meja disposisi & pencarian

Utas grup enak dibaca berurutan, tapi payah buat *mencari*: "izin yang tadi
pagi soal `rm -rf` itu kabar yang mana?" Untuk itu ada tombol 📚 **meja
disposisi** — tumpukan berkas di meja kadis, bukan grup chat kedua. Dialognya
berdiri sendiri (`mejaGambar()` dkk. di room.js) dan cuma **membaca** larik
`kabar`; modal kabar dan `kabarUtas()` tidak disentuh, klik satu kartu memanggil
`kabarBuka(idx)` yang sudah ada dan menutup mejanya. Isinya:

- **kotak cari** — substring tanpa peduli huruf besar-kecil, mencari di
  perihal, isi, pertanyaan + pilihan `AskUserQuestion`, nama pegawai, jabatan,
  tool, dan id sesi;
- **tab jenis** (semua / hasil / tanya · izin / galat / lainnya) dan **pilihan
  pegawai** dari sesi yang memang ada di tumpukan — hitungannya ikut kata kunci
  yang sedang diketik;
- **kartu kecil** per kabar: stempel jenis, perihal, jam, nama pengirim
  (garis tepi warna seragamnya), cuplikan satu baris. Terbaru di atas, seperti
  tumpukan berkas;
- 📌 **sematkan**: kabar tersemat disalin utuh ke `localStorage` (`mejaSemat`,
  paling banyak 40), bukan cuma id-nya — nomor urut kabar cuma hidup sebatas
  sesi halaman, dan server cuma memutar ulang 60 event terakhir. Kuncinya
  `sesi|ts|jenis`; `ts` datang dari server, jadi kabar yang sama sesudah muat
  ulang dikenali sebagai berkas yang sama. Yang tersemat **tidak ikut
  dipangkas** `KABAR_MAX` (`kabarMasuk()` membuang kabar tak tersemat paling
  tua), dan yang sudah tidak ada lagi di larik tampil bergaris putus — dibaca
  di tempat, karena tidak ada lagi balonnya di utas;
- ⎘ **salin** sebagai teks polos (`navigator.clipboard`, jatuh ke textarea +
  `execCommand` kalau perambannya menolak): stempel waktu, nama, perihal, isi,
  tool, sesi;
- **cari di agenda** (atau Enter di kotak cari): kata kunci yang sama ke
  `GET /agenda?q=…&dari=…&sampai=…&limit=100`, hari ini plus enam hari
  sebelumnya, hasilnya daftar sederhana jam · sesi · tool · label di bawah
  tumpukan. Kotak kabar cuma ingatan halaman; buku agenda ingatan server.

Kalau server jalan dengan `AGENT_ROOM_ISI=off` (`kendali.isiAktif === false`),
kotak cari dan tombol agenda **dimatikan dengan keterangan**, bukan dibiarkan
menghasilkan kosong yang membingungkan — kabar tidak membawa kalimat agen dan
agenda tidak membawa label, jadi memang tidak ada isi yang bisa dicari.
Saringan jenis dan pegawai tetap jalan.

### Tombol di bilah bawah

| Tombol | Guna |
|---|---|
| ⚙️ | buka panel **Pengaturan** — lihat di bawah |
| 💬 | buka kotak kabar; lencananya jumlah kabar yang belum dibaca |
| 📚 | buka **meja disposisi**: cari, saring, sematkan, salin kabar; cari di buku agenda |

Lima setelan yang dulu masing-masing punya tombol sendiri di bilah ini sekarang
digabung ke satu panel **Pengaturan** (⚙️), supaya tidak perlu menghafal lima
posisi tombol berbeda:

| Setelan di panel | Guna |
|---|---|
| 💭 balon pikiran | balon pikiran nyala/mati |
| 💬 buka kabar otomatis | kembaran dari centang **buka sendiri** di kaki modal kabar — dua-duanya setelan yang sama, cuma dua tempat |
| 🔊 efek suara | foley per stasiun tiap event (stempel, laci arsip, kipas server, kursi rapat, ketikan) nyala/mati |
| 🔔 notifikasi tugas selesai | lonceng tiga nada, disusul diucapkan lewat Web Speech API kalau browsernya punya |
| 🎧 musik lofi kantor | chord, beat, dan desis vinyl, semua disintesis langsung, tanpa file audio |

Dua yang pertama diingat peramban (`localStorage`), dan halaman tetap jalan
kalau peramban memang tidak mengizinkannya. Tiga setelan suara (efek suara,
notifikasi, musik) sengaja **tidak** diingat — selalu mati waktu halaman
dibuka lagi, karena `AudioContext` baru boleh jalan sesudah klik pengguna;
menyalakannya otomatis dari `localStorage` toh tidak akan kedengaran sampai
ada klik lagi.

Ketiga setelan suara itu masing-masing punya **slider volume** sendiri
(0–100%, label persennya live) di bawah centangnya. Beda dari centang
nyala/mati: angka volume ini BOLEH diingat lewat `localStorage`, karena cuma
pengali relatif, bukan yang memaksa `AudioContext` menyala sendiri. Di baliknya
satu `AudioContext` dipakai bersama dengan tiga bus `GainNode` (`busEfek`/
`busNotif`/`busMusik`), dan setiap penghasil bunyi (foley tool call, derau
hujan/guntur, lonceng notifikasi + `ucapSuara`, beat/chord musik lofi,
termasuk Indonesia Raya) disambungkan ke bus yang sesuai alih-alih langsung
ke `audio.destination` — supaya volumenya bisa digeser sendiri-sendiri tanpa
mengubah campuran/attack tiap bunyi satu per satu.

Efek suara tool call bukan lagi satu blip seragam, tapi **foley per stasiun**
(`foley()` + kamus `FOLEY` di `room.js`): stempel yang thud lalu klik pegas
untuk Edit/Write, laci arsip digeser untuk Read/Grep, desis kipas + bip HDD di
rak server untuk git, kursi digeser atau ketukan pena di meja rapat, dua klik
tuts untuk laptop/web/MCP, "deng" turun kalau gagal — mata sudah bisa
membedakan meja, telinga seharusnya juga. Semua tetap disintesis, ≤250 ms,
pelan. Tiga rem supaya sesi deras tidak jadi derau: jeda 220 ms per nama
bunyi, pagu 6 bunyi/detik seluruh ruangan (kelebihannya dibuang, bukan
diantrekan), dan ducking — musik lofi turun ke 60% selama ~300 ms tiap foley
berbunyi, supaya bunyi pelan tidak tenggelam tanpa harus dikeraskan. Bunyinya
di-pan stereo mengikuti posisi x pegawainya (±0,7 maksimum), jadi arsip di
kiri kedengaran dari kiri dan rak server dari kanan. Lonceng notifikasi tidak
lewat jalur ini: itu kabar untuk kamu, bukan suara ruangan.

Panel yang sama juga menampilkan **status server** apa adanya — kendali web
nyala/mati, sumber cuaca (nyata/dipaksa/tebakan), isi transkrip nyala/mati,
dan alamat server — dibaca dari `/kendali` dan dari cek cuaca yang sudah
berjalan. Bagian ini murni bacaan: mengubah port, host, cuaca, atau isi
transkrip tetap lewat env var saat server dinyalakan (lihat **Konfigurasi**
di bawah), bukan dari panel ini — sama seperti kendali web sendiri, yang
sengaja tidak bisa dinyalakan dari halaman.

Notifikasi 🔔 memicu di event `Stop` — giliran sesinya kelar, "beres, siap
disposisi" — bukan di `SubagentStop`. Peserta rapat yang bubar satu-satu
selama rapat masih jalan bukan momen yang perlu memanggil kamu balik; sesi
utama yang selesai baru itu momennya.

### Token sesi terminal

Jalur yang sama yang membawa pikiran dan kalimat juga membawa **token** —
`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens` dari `message.usage` tiap baris asisten. Ini satu-
satunya cara sesi **terminal** (yang tidak dilahirkan halaman ini, jadi tidak
punya stream-json) bisa punya angka token sama sekali — hook tidak pernah
membawanya.

Angkanya **resmi**, bukan perkiraan, jadi kartu pegawai tidak menulis "data
sementara" untuknya seperti biaya. Ini langsung dari respons API,
dijumlahkan apa adanya. Yang perlu jujur justru soal **cakupannya**: dihitung
sejak transkripnya *mulai dipantau*, bukan sejak sesinya lahir — sesi yang
sudah berjalan sejam sebelum halaman ini dibuka tidak punya token dari jam
itu, cuma dari titik mulai memantau ke depan. Kartunya bilang begitu apa
adanya: **"(sejak dipantau)"**.

Sengaja **berhenti di token, tidak sampai ke dolar**. Transkrip tidak
menyimpan `costUSD` — beda dari yang ditemukan di beberapa alat sejenis pada
versi Claude Code lain. Menghitung dolarnya sendiri berarti tabel harga per
model yang harus dipelihara manual dan basi begitu Anthropic mengubah harga.
Kosong lebih baik daripada menebak.

Dipublish sebagai baris asisten dilewati, bukan ditumpangkan ke balon pikiran
atau kotak kabar: banyak giliran cuma berisi `tool_use` tanpa teks maupun
pikiran sama sekali, dan giliran itu tetap makan token. Tidak masuk log
kegiatan dan tidak menaikkan statistik — sama seperti balon pikiran, ini
pembaruan diam yang cuma kelihatan kalau kartunya dibuka.

### Riwayat lintas sesi

Token di atas cuma hidup selama **satu sesi** ada di memori server — restart
server atau tutup halamannya, angkanya hilang. Supaya bisa dipantau dari hari
ke hari, tiap delta token (baris `usage` yang sama dipakai di atas) juga
ditulis ke `token-riwayat.jsonl` di folder `agent-room`: satu baris JSON per
giliran asisten, `{ ts, proyek, model, input, output, cacheTulis, cacheBaca }`.
Sengaja **delta, bukan kumulatif** — supaya bisa dijumlah ulang per hari atau
per proyek kapan saja tanpa perlu menyimpan turunannya, dan supaya baris lama
tidak pernah perlu diubah waktu baris baru datang.

Server membacanya sekali waktu start (`riwayatMuat()`), merangkumnya jadi tiga
peta di memori — total sepanjang waktu, per hari, per proyek — dan
melayaninya lewat `GET /token-riwayat`. Endpoint ini **tanpa token**, sama
seperti `/cuaca`: angka yang sama toh sudah lewat `/stream` tanpa autentikasi
juga, jadi merahasiakannya di sini tidak menutup apa pun.

Halaman memanggilnya sekali waktu dimuat dan tiap kali modal **Statistik
token** (tombol 📊) dibuka lagi, lalu menggambar total sepanjang waktu,
efisiensi cache, grafik 14 hari terakhir, dan proyek teratas — di atas rincian
sesi aktif yang sudah ada (yang tetap terbatas pada "sejak halaman ini
dibuka", karena itu memang butuh peta sesi yang cuma ada di sisi halaman).
Mau pindah lokasi berkasnya: `AGENT_ROOM_TOKEN_LOG=/path/berkas.jsonl`.

Satu baris cuma 100-150 byte, tapi delta per giliran ternyata jalan ribuan
kali sehari — lima hari saja sudah 8.000 baris, dan semuanya dibaca sinkron
tiap start. Padahal untuk data lama tidak ada yang butuh butiran per giliran:
grafiknya per hari, tabelnya per proyek. Jadi waktu muat, baris yang lebih
tua dari 30 hari **dilebur** jadi satu baris per hari per proyek (`padat:
true`, `n` = jumlah giliran yang dilebur, ts = awal hari lokal); kalau
berkasnya masih di atas 4 MB, baris berumur 7-30 hari ikut dilebur per jam.
Berkas utama ditulis ulang atomik (`.tmp` lalu rename), dan baris aslinya
tidak dibuang melainkan dipindah ke `token-riwayat.arsip.jsonl` — yang tidak
pernah dibaca saat start, cuma jaminan kalau butirannya suatu hari dibutuhkan.
Baris yang rusak tidak lagi dibuang diam-diam: dihitung dan dilaporkan satu
baris di konsol. Keduanya tidak di-commit ke git (lihat `.gitignore`), sama
seperti `.agent-room-token`.

**Versi skema.** Tiga berkas di disk hidup lebih lama dari kode yang
menulisnya — riwayat token, `agenda/*.jsonl`, `buku-induk.json` — dan
sebelum ini bentuknya cuma disepakati diam-diam. Sekarang tiap baris/berkas
baru membawa `v` dari satu tabel `SKEMA` di `server.mjs` (token 1, agenda 1,
buku induk 1). Saat muat, baris **tanpa** `v` dianggap v0 dan dimigrasi di
memori lewat `migrasiToken()/migrasiAgenda()/migrasiBukuInduk()` (hari ini
identitas: cuma menambal `v`); baris yang gagal parse **atau** `v`-nya lebih
besar dari yang dikenal proses ini (ditulis server yang lebih baru) ditolak,
dihitung, dan dilaporkan satu baris di konsol — `token-riwayat: N baris
ditolak (skema v1; a bukan JSON / tanpa ts, b ber-v lebih baru)` — menyatu
dengan hitungan baris rusak dari pemadatan di atas. Berkas lama tidak pernah
ditulis ulang demi versi; baris v0 baru ikut ber-`v` kalau kebetulan dilebur
pemadatan. Menaikkan versi: naikkan angkanya di `SKEMA`, tambah cabang
`if (v < N)` di fungsi migrasinya (berurutan, supaya v0 pun melewati semua
tahap); penulisnya otomatis memakai angka baru.

### Papan SKP & nota mingguan

Riwayat token menjawab "habis berapa", buku induk menjawab "sudah berapa lama",
tapi tidak ada yang menjawab pertanyaan rapat Senin pagi: **minggu ini siapa
mengerjakan apa, seberapa sering gagal, berapa kali tertahan**. Papan SKP
(tab kedua di modal 📊, `GET /skp?dari=&sampai=`) menjawab itu per proyek dan
per sesi untuk rentang 7/14/30 hari, dan tombol 🖨️ di tab yang sama
menjilidnya jadi **nota dinas laporan mingguan**.

Angkanya **dihitung saat diminta** dari tiga catatan yang sudah ada di disk —
bukan tabel baru yang harus dipelihara: buku agenda (tool call dari `pre`,
gagal dari `post` yang `ok:false`, durasi dari `durasi`, tertahan dari
`izin-minta`/`stop-gagal`, campuran tool, jam dinas *dalam rentang* dengan
aturan celah ≤ 5 menit yang sama seperti buku induk), rincian harian riwayat
token (masuk/keluar/cache per proyek per hari, jadi rentangnya bisa dipotong
persis per tanggal), dan buku induk (jam dinas karier + golongan). Sengaja
**bukan** dari arsip kliping mingguan: kliping dijilid per Senin dan cuma
menyimpan angka teratas, sedangkan laporan butuh rentang bebas dan angka per
sesi — dan agenda toh sudah menyimpan setiap event yang dibutuhkan. Tiga
sumber, satu kalkulasi di server (`skpHitung()`), di-cache 30 detik per
rentang supaya modal yang dibuka-tutup tidak membaca ulang tiga puluh berkas
agenda. Endpointnya tanpa token, sekelas `/token-riwayat`: yang keluar cuma
angka, nama folder, cabang, dan nama tool; label tidak pernah ikut, jadi
`AGENT_ROOM_ISI=off` tidak punya apa-apa untuk disembunyikan di sini.

Nota dinasnya satu halaman HTML mandiri — inline CSS, `@media print`,
`@page` A4 — dibuka di tab baru dan **dicetak lewat Ctrl+P**, "Simpan sebagai
PDF" bawaan browser. Bukan pustaka PDF: proyek ini nol dependency, dan mesin
cetak browser sudah cukup rapi untuk kop, tabel berbingkai, dan blok tanda
tangan; yang perlu ditulis tangan cuma gaya kertasnya. Nomornya
`ND/urut/AR/bulan romawi/tahun` (`nomorNota()`), urutannya penghitung per
browser yang naik tiap nota diterbitkan — bukan tiap tabel dilihat. Halaman
utama dengan `?cetak=mingguan` (opsional `&hari=14`) membuka lembar yang sama
sebagai lapisan di atas ruangan dan memanggil `print()` begitu datanya ada,
supaya bisa dijadwalkan (`chrome --kiosk-printing "http://127.0.0.1:4517/?cetak=mingguan"`).
Minggu yang kosong ditulis apa adanya sebagai laporan nihil.

Batasnya sama dengan yang lain dan tertulis di tabel maupun di catatan kaki
nota: **sejak dipantau** — sesi yang berjalan sebelum ruangan dibuka tidak
punya baris agenda dari jam itu; jam dinas karier dan golongan milik seluruh
karier proyek, bukan cuma minggu laporan; dan token tetap token, bukan biaya.

### Yang berubah soal privasi

Sebelum ini server cuma menyiarkan **metadata**. Sekarang isi percakapan ikut
lewat — masih tetap di localhost, masih tanpa lalu lintas keluar, tapi bedanya
nyata dan tidak pantas disembunyikan di catatan kaki.

Kalau ruangannya mau dikembalikan jadi metadata saja, matikan di **server**,
bukan cuma menyembunyikan balonnya di halaman:

```bash
AGENT_ROOM_ISI=off node agent-room/server.mjs
```

Dengan itu transkrip tidak dibuka sama sekali — `pikir`, `ucap`, **dan token
sesi terminal** tidak pernah lahir, karena ketiganya dibaca dari berkas yang
sama. Mematikan isi percakapan ikut memadamkan angka token; tidak ada mode
"baca token saja tanpa baca isinya", karena membaca satu baris berarti
mengurainya, terlepas dari field mana yang akhirnya dipakai.

Sejak ada **Buku agenda** (di bawah), ada satu berkas baru di disk yang
bertahan sebulan: `agenda/YYYY-MM-DD.jsonl`, berisi metadata event termasuk
`label` (nama berkas yang disentuh, ringkasan perintah shell, prompt yang
dipotong 120 karakter). Isi percakapan tidak pernah ditulis ke sana, dan
dengan `AGENT_ROOM_ISI=off` `label`-nya pun ikut tidak ditulis.

Ada **satu lalu lintas keluar** lagi selain `/cuaca`, dan sama-sama mati
secara bawaan: **nota dinas keluar** (lihat bagiannya di atas). Dia baru hidup
kalau `AGENT_ROOM_LAPOR` diisi URL, dan yang keluar cuma metadata keadaan
tertahan — nama pegawai, nama folder, cabang, sebab — tidak pernah `pikir`,
`ucap`, maupun prompt, terlepas dari `AGENT_ROOM_ISI`. Antrean disposisi juga
sengaja hidup **di memori saja**: prompt yang menunggu giliran tidak pernah
ditulis ke disk, jadi tidak ada berkas berisi perintah eksekusi yang
tertinggal setelah server mati.

Dua hal lagi sejak **gerbang & multi-mesin** (lihat **Konfigurasi**): ada
**satu pintu masuk baru yang hanya-baca**, `GET /ruangan` (dipakai
`mcp-room.mjs`), yang membawa metadata sesi hidup — id, proyek, cabang, nama
mesin, tool terakhir, sebab tertahan — tanpa label, alasan, apalagi isi. Dan
event sekarang bisa membawa `mesin`, nama host mesin pengirim, yang ikut ke
`/stream` dan buku agenda; itu hanya terisi untuk hook dari mesin lain. Yang
**tidak** berubah: server tetap mendengar di 127.0.0.1 saja. Membukanya ke
jaringan adalah keputusan sadar yang menuntut `AGENT_ROOM_KUNCI`, dan tanpa
tunnel/TLS seluruh isi di atas — `pikir`, `ucap`, prompt — ikut lewat
jaringan apa adanya.

Satu lagi, **telemetri galat halaman**: `window.onerror`/`unhandledrejection`
dan galat di jalur event acak dikirim ke `POST /galat` (paling banyak 5 per
menit, pesan yang sama sekali saja), dan yang dikirim hanya pesan galat,
nama berkas beserta barisnya, id event yang sedang jalan, serta nama
peramban — tidak pernah stack berisi path, apalagi isi apa pun. Server
menulis satu baris `[agent-room] galat halaman: …` ke konsol dan menyimpan
50 terakhir **di memori saja** (terbaca di `GET /galat`), tidak pernah ke
disk; masih hanya-localhost lewat penjaga Host dan cek Origin yang sama
dengan `/ambien`. Gunanya buat pemecahan masalah: halaman ini sering hidup di
layar kedua yang tidak ada yang memelototi, dan "event X meledak di
`tick()`" lebih enak terbaca dari terminal server daripada dari devtools
yang harus dibuka dulu.

Sejak ada **kotak surat hook offline** (lihat **Pasang hook**), ada satu
tempat lagi di disk yang menyimpan **payload hook mentah** — termasuk
`tool_input` dan `tool_response`, jadi isi berkas yang dibaca agen dan
keluaran perintahnya — yaitu `~/.agent-room/tunda/`. Ini satu-satunya berkas
milik agent-room selain transkrip Claude Code sendiri yang memuat isi kerja,
dan bedanya nyata dari agenda yang cuma metadata. Pembatasnya: berkas hanya
lahir saat server mati, folder 0700 / berkas 0600 di home pengguna, dihapus
begitu dipungut, dan yang lebih tua dari 24 jam dibuang tanpa dibaca —
sehingga umurnya paling lama sehari. `AGENT_ROOM_ISI=off` tidak
mempengaruhinya (isinya payload hook, bukan transkrip); yang tidak mau ada
jejak sama sekali selagi server mati cukup memasang ulang hook dengan
`|| exit 0` seperti dulu.

`GET /metrics` (lihat **Pemantauan**) tanpa token, dan yang keluar cuma angka:
tidak ada nama proyek kecuali `AGENT_ROOM_METRICS_PROYEK=1` dipasang sadar.

## Bahasa yang tampil

Yang kamu baca bukan nama tool, tapi kegiatannya: `Read` jadi "membaca berkas
laporan-2024.pdf", `Task` jadi "menggelar rapat tinjau modul otentikasi",
`TodoWrite` jadi "menyusun agenda 5 item". Petanya ada di `KEGIATAN` dalam
[public/room.js](../public/room.js) — tinggal diubah kalau mau kata-kata lain,
tanpa perlu restart server.

Dua hal yang sengaja dijaga di situ: verbanya dibuat pendek supaya yang terpotong
di panel sempit adalah verbanya, bukan objeknya (objek justru satu-satunya bagian
yang berubah tiap panggilan); dan perintah shell panjang penuh flag diringkas
jadi nama programnya saja — segmen pengantar seperti `cd ...` dibuang dulu supaya
`cd X && node build.js` terbaca "menjalankan perintah node", bukan "cd".

Urusan git punya kamusnya sendiri (`KEGIATAN_GIT`), karena "menjalankan perintah
git push" tidak mengatakan apa-apa: `git push origin main` jadi "mengirim
perubahan origin main", `git commit` jadi "mencatat perubahan", `git status` jadi
"memeriksa perubahan". Flag global dilewati, jadi `git -C proyek log --oneline`
tetap terbaca "membaca riwayat".

Pegawainya sprite pixel-art, seragamnya mengikuti jabatan: khaki PNS (plus peci
dan kumis), batik sogan, Korpri, wearpack teknisi, sampai yang berjilbab.
Beberapa sesi Claude Code sekaligus
= beberapa pegawai; dengan hook global, panel kanan juga menampilkan nama folder
project tiap sesi. Kalau dua pegawai ke meja yang sama, mereka berjajar otomatis.

Sosoknya dulu balok voxel bertumpuk (gaya Crossy Road): kepala kubus, badan
kubus, kaki kubus. Diganti **sprite pixel-art bergaris tepi** — kepala bulat,
leher, bahu melandai, lengan lepas dari badan, dua kaki bersepatu — karena balok
bikin semua pegawai terbaca kotak, dan seragam putih hari Senin/Selasa/Kamis
nyaris lenyap di atas ubin terang. Garis tepinya warna dasar tiap bagian yang
digelapkan, bukan hitam: cukup tegas memisahkan sosok dari lantai tanpa jadi
stiker. Tampak samping digambar sungguhan (satu mata, hidung, lengan dekat di
depan badan, kaki melangkah maju-mundur), bukan wajah depan yang matanya digeser
sepiksel; lengan yang lebih terangkat selalu jadi lengan dekat supaya isyarat
event tetap terbaca dari samping. Tingginya dijaga 28 px supaya balon, kotak
klik, dan lencana galat yang mengukur dari garis kaki tidak perlu disentuh.
Orang luar (tamu, kurir, ojol) memakai penggambar yang sama lewat
`gambarOrangLuar`, jadi tidak ada tamu bergaya balok di antara pegawai bergaya
sprite.

### Kamera

Kanvasnya tetap 480×356 dan `fit()` tetap cuma memilih skala integer ke CSS;
kameranya (`KAMERA` di room.js) hidup di koordinat dunia dan dipasang di
`frame()` lewat `setTransform` sebelum segala gambar, jadi lantai, props,
pegawai, dan partikel tidak tahu ada kamera. Zoom bidikannya cuma 1 atau 2 —
bulat — karena satu piksel dunia harus tetap jadi kotak piksel layar yang
utuh; zoom 1,4 bikin garis tepi sprite belang walau smoothing sudah mati.
Nilai pecahan cuma lewat sebentar selagi easing (±600 ms), geserannya pun
dibulatkan ke piksel kanvas.

Semua yang menempel ke kanvas dari DOM — balon ucap, balon pikiran, lencana
galat, kartu pegawai — dan hit-test klik lewat SATU pasang fungsi,
`keLayar()`/`dariLayar()`. Dulu tiap-tiap menghitung `offX + x * scale`
sendiri; begitu kamera bergeser, satu saja yang lupa dan kartunya meleset
dari orangnya. Tiga mode di ⚙️ (mati / ikut pegawai / sinematik; `?kamera=`
di URL mengalahkannya). Bawaannya **mati**: halaman ini alat pantau dulu,
baru tontonan — kamera yang bergerak sendiri mengejutkan orang yang cuma mau
melirik siapa yang sedang macet. *Ikut* membidik pegawai yang baru tool call
selama 4 detik, tapi mundur ke tampak penuh begitu dua orang sama-sama
aktif (jangan bolak-balik). *Sinematik* berkeliling stasiun sesudah 60 detik
sepi, dan dimatikan kalau `prefers-reduced-motion` menyala.

### Debu di berkas cahaya & rim light

Dua sentuhan kecil yang membuat cahayanya terasa *mengisi* ruangan, bukan
sekadar ditempel di atasnya. **Debu** (`debu[]`, `updateDebu`/`drawDebu`):
paling banyak 40 butir 1 px, alpha rendah, melayang pelan sekali — dan hanya
lahir *di dalam* berkas: kerucut neon waktu malam, berkas jendela di lantai
waktu siang. Yang hanyut keluar dari berkasnya dibunuh, bukan dibiarkan
melayang di gelap; debu memang ada di mana-mana, tapi cuma kelihatan waktu
ditembus cahaya. Digambar sesudah selubung suasana supaya tidak ikut
digelapkan.

**Rim light** (`sumberCahaya`/`rimPegawai`, dipakai `drawPerson`): satu piksel
tepi badan di sisi yang menghadap cahaya, diwarnai lewat jalur tepi sprite
yang sudah ada (`lerpHex` dari warna baju ke warna cahaya), bukan lapisan alpha
di atasnya — jadi tetap satu piksel tegas seperti tepi lainnya. Sumbernya
sengaja **satu** yang dominan per frame: neon terdekat waktu malam, jendela
waktu siang, senja memilih yang lebih kuat. Dua sumber berarti dua sisi
terang, dan sprite selebar 10 px berhenti terbaca sebagai badan bertepi.
Yang tepat di bawah lampu tidak dapat rim (tidak ada "sisi"), yang memegang
map disposisi dilewati karena mapnya menutupi separuh badan. Depth-sort tidak
disentuh sama sekali. Keduanya mati di mode ringan.

### Mode ringan

Halaman ini biasanya dibiarkan hidup berjam-jam di layar kedua atau laptop,
dan 60 fps dengan tujuh gradasi radial per frame itu boros buat ruangan yang
isinya berubah pelan. Mode ringan (centang di ⚙️, diingat browser) menyala
sendiri kalau `?ringan=1` di URL, `prefers-reduced-motion` aktif, atau
Battery API melaporkan baterai <30 % tanpa dicas (opsional — kalau API-nya
tidak ada, ya tidak ada). Yang berubah:

- **30 fps**: `frame()` melewati frame yang datang terlalu cepat *tanpa*
  menyentuh `last`, jadi `dt` frame berikutnya menampung dua interval —
  simulasinya tetap tepat waktu, cuma digambar separuh sesering. Saat tab
  tersembunyi rAF dijeda peramban; mode ringan menjalankan simulasinya 15 fps
  lewat `setTimeout` supaya pegawai tidak melompat waktu tab dibuka lagi.
- **pendar neon dari cache** (`neonLapis`): geometrinya tetap dan semua
  alphanya linear terhadap intensitas, jadi tiap neon cukup digambar sekali ke
  kanvas offscreen pada intensitas 1, lalu tiap frame cuma `drawImage` dengan
  `globalAlpha` = intensitas saat itu. Kedipnya tetap hidup — yang berkedip
  alphanya — tapi `createRadialGradient` per frame turun dari 8 ke 0.
  Vignette (`vignetteLapis`) sama, dikunci pada alpha `MOD.vignette`.
- jatah partikel separuh (120; yang tertua digusur, bukan yang baru ditolak,
  karena pemanggil boleh memegang partikel yang dikembalikan `spawn`), debu
  mati, rim light mati. Kedip neon **tidak** dimatikan: itu identitas
  ruangan, bukan hiasan. `prefers-reduced-motion` juga membekukan kipas
  plafon.

Fps sebenarnya (frame yang benar-benar digambar) tampil kecil di panel ⚙️
selagi panelnya terbuka, berikut sebab otomatisnya kalau ada.

### Mode kadis: `?kadis=1`

Kepala dinas yang melirik dari HP tidak butuh diorama; dia butuh daftar. Dengan
`?kadis=1` kanvas dan bilah panggung disembunyikan (`body.mode-kadis` di
style.css), panel jadi **satu kolom penuh layar** berhuruf lebih besar dengan
tombol setinggi jempol, dan di atas daftar kru ada ringkasan
(`kadisGambar()` di room.js) yang menjawab pertanyaan kadis berurutan: siapa
**menunggu paraf/izin**, siapa **berhenti karena galat**, siapa **sedang
bekerja**, siapa di meja tanpa tool call, berapa yang **antre** di loket
disposisi, dan **token hari ini** dari `/token-riwayat` (angka token saja,
tanpa dolar — biaya di halaman ini toh "data sementara"). Tombol merah
**muat ulang** di bawahnya, karena di HP tidak ada F5. Ringkasan digambar
ulang tiap `renderCrew()` dan tiap 4 detik (kegiatan berganti tanpa
`renderCrew()`), token disegarkan tiap menit. Simulasinya tetap jalan di
balik layar supaya keadaan pegawai benar; yang tidak digambar cuma kanvasnya.

Satu hal yang tidak boleh disalahpahami: server **tetap bind `127.0.0.1`**.
Mode ini hanya berguna lewat tunnel (ssh `-L`, Tailscale, atau sejenisnya)
dari HP ke mesin yang menjalankan server — dan itu memang jalannya. Jangan
pernah melonggarkan bind ke `0.0.0.0` demi mode ini: yang lewat `/stream`
adalah isi kerja agen, dan halaman tanpa autentikasi di jaringan Wi-Fi kantor
bukan "tampilan HP", tapi kebocoran.

### Overlay layar kedua / OBS: `?overlay=1`

Buat ditumpuk di atas siaran atau layar kedua: `?overlay=1` menyembunyikan
panel kanan, bilah panggung, pita merah-putih, dan semua dialog (kabar yang
menyela di atas siaran bukan fitur), lalu membuat latar `<html>` dan `<body>`
**tembus** (`background: transparent`) — OBS browser source menampilkan apa
yang ada di bawahnya. `?overlay=chroma` memakai hijau `#00ff00` sebagai gantinya
buat chroma key di perangkat yang tidak mendukung alpha. Kelasnya
(`mode-overlay` + `mode-tembus`/`mode-chroma`) dipasang di awal room.js,
sebelum `fit()` pertama.

Di mode ini `fit()` berubah dua hal: tepi 36 px yang biasa disisakan buat
bayangan kanvas ditiadakan (stageInner-nya full-bleed, padding 0), dan skala
**dikunci ke bilangan bulat ≥ 1** — OBS menyusun ulang tiap frame, skala pecahan
bikin garis tepi sprite belang di layar penonton. Balon ucap dan balon pikiran
tetap tampil (mereka anak stageInner), jadi padukan dengan `?panggung=1` kalau
siarannya ditonton orang lain: isi balon dan kabar disamarkan, animasinya tetap.

## Buku agenda

Ring 400 event di memori itu daya ingat ikan mas: restart server, ruangan hari
ini hilang; buka halaman sore hari, yang kelihatan cuma sisa setengah jam
terakhir. Buku agenda menambalnya dengan catatan append-only di
`agenda/YYYY-MM-DD.jsonl` — satu berkas per hari, satu baris per event yang
lewat `publish()`, ditulis `appendFileSync` (satu baris ~200 byte per tool
call, jauh lebih murah daripada kehilangan baris terakhir saat server
dimatikan). Saat start, berkas lebih tua dari 30 hari (`AGENT_ROOM_AGENDA_HARI`)
dibuang dan ≤400 baris terakhir hari ini dimuat kembali ke `ring`, dengan
`seq` dilanjutkan dari id terbesar supaya `Last-Event-ID` halaman yang sudah
terbuka tidak bertabrakan.

Yang ditulis **metadata saja**, lewat daftar putih di `agendaBaris()`: id, ts,
sesi, proyek, cabang, kind, tool, label (dipotong 120), ok/galat, durasi,
model, butuh/macet. `pikir`, `ucap`, dan `token` tidak pernah masuk, `teks`
maupun `tanya` tidak pernah ikut walau menumpang di event lain. Ring/SSE boleh
membawa isi karena umurnya sebatas memori; berkas di disk umurnya sebulan,
jadi ambangnya sengaja lebih rendah. Event ambient tetap tidak tercatat —
memang tidak pernah lewat `publish()`. Per hari, bukan satu berkas panjang,
supaya rotasi cuma soal nama berkas dan `GET /agenda?q=&sesi=&proyek=&dari=&sampai=&kind=&limit=`
(terbaru dulu, tanpa token seperti `/token-riwayat`) cukup membuka berkas yang
diminta.

`/stream?ulang=YYYY-MM-DD&laju=60` (atau halaman `?ulang=…&laju=…`) memutar
ulang satu hari: koneksi SSE terpisah yang tidak menerima event live dan
tidak dihitung viewer, jeda antar event = selisih ts asli / laju (dipangkas
5 detik), tiap event bertanda `ulang: true`, ditutup `ulang-selesai`. Ini uji
integrasi gratis: satu hari kerja sungguhan, dengan urutan dan jeda asli,
dilempar ke halaman tanpa perlu menjalankan Claude Code — bug perpindahan
pegawai yang cuma muncul pada urutan event tertentu jadi bisa direproduksi
berkali-kali dari berkas yang sama.

