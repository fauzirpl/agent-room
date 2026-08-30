# Agent Room — Kantor Dinas — Catatan Desain

> Ini dokumen mendalam: alasan di balik tiap keputusan, bukan cuma caranya.
> Versi ringkas + cara jalanin dalam 2 menit ada di [README.md](README.md).

Visualisasi langsung sesi Claude Code: kantor pemerintahan Indonesia dalam
pixel-art, satu pegawai voxel 3D (gaya Crossy Road) per sesi, yang jalan ke
meja berbeda sesuai tool yang lagi dipakai agent-nya. Lengkap dengan Garuda,
bendera merah putih, dispenser galon, dan AC yang netes ke ember.

```
Claude Code hooks  ──curl──▶  server.mjs (:4517)  ──SSE──▶  browser (canvas)
```

Tanpa dependency. Cuma butuh Node dan `curl` (bawaan Windows 10+, macOS, Linux).

## Jalanin

Cara pendeknya lewat **Dinas Claude**, pelaksana hariannya:

```bash
node agent-room/dinas.mjs
```

Di Windows ada pembungkusnya, jadi cukup `dinas` (atau `./dinas.sh` di
macOS/Linux). Dia melapor dulu sebelum kantornya dibuka:

```
  +----------------------------------------------------+
  |   DINAS CLAUDE                                     |
  |   pemantau sesi Claude Code                        |
  +----------------------------------------------------+

  status kantor
  ----------------------------------------------------
  pelaksana    claude 2.1.247  (aplikasi Claude)
               C:\Users\...\Claude\claude-code\2.1.247\claude.exe
               PATH menunjuk 2.1.25 — dilewati, yang dipakai 2.1.247
  hook         15 event terpasang  (15 global)
  kredensial   tersimpan  (.agent-room-token)
  kendali web  mati  (nyalakan: dinas --kendali)
  alamat       http://127.0.0.1:4517
  ----------------------------------------------------
```

Tiga baris pertama itu alasan dia ada. Ketiganya tidak kelihatan kalau
`server.mjs` dijalankan langsung, dan justru ketiganya yang paling sering bikin
orang bingung: biner claude mana yang sebenarnya akan dipanggil, hook-nya sudah
terpasang atau belum, dan kredensial headless-nya ada atau tidak.

Baris `PATH menunjuk ...` itu **jebakan dua instalasi** yang dibereskan sendiri:
semua kandidat biner dikumpulkan, versinya ditanya satu per satu, dan yang
tertinggi yang dipakai — bukan yang kebetulan pertama di PATH. Tidak perlu lagi
mengingat `AGENT_ROOM_CLAUDE`.

| Perintah | Guna |
|---|---|
| `dinas` | buka kantornya |
| `dinas --kendali` | sekalian izinkan halaman menugaskan pekerjaan |
| `dinas --pasang` | pasang hook dulu, baru buka kantor (`-g` untuk semua project) |
| `dinas --lepas` | lepas hook, tidak membuka kantor |
| `dinas --periksa` | cuma tampilkan status, tidak menjalankan apa pun |
| `dinas --port 4600` | pakai port lain |
| `dinas --buka` | sekalian buka peramban |

Kalau lebih suka menjalankan servernya langsung, itu tetap jalan dan tidak akan
dihapus. Cuma mau menonton ruangannya:

```bash
node agent-room/server.mjs
```

Mau sekalian **menugaskan pekerjaan dan menelusuri folder** lewat halaman:

```bash
node agent-room/server.mjs --izinkan-perintah
```

Buka <http://127.0.0.1:4517>. Mau lihat tampilannya tanpa hook?
Tambahin `?demo=1` — ada event palsu yang jalan sendiri.

> Tanpa `--izinkan-perintah`, form penugasan dan tombol telusur folder **tidak
> muncul sama sekali** — itu memang disengaja, karena keduanya bergantung pada
> jalur yang bisa menjalankan kode.

## Pasang hook

```bash
node agent-room/install.mjs
```

Itu cuma nyentuh `.claude/settings.json` di project ini. Untuk semua project:

```bash
node agent-room/install.mjs --global
```

Melepas lagi:

```bash
node agent-room/install.mjs --remove
```

Installer selalu bikin backup (`settings.json.bak-<waktu>`, disimpan 3 terbaru),
aman dijalankan berulang, dan tidak menghapus hook lain yang sudah ada.

**Restart sesi Claude Code setelah install** — hook dibaca waktu sesi mulai.

### Event yang dipasang

Dokumentasi hook Claude Code mencantumkan 33 event. Yang dipasang 16 — yang
sisanya tidak punya apa pun untuk digambar di ruangan.

| Event | Yang terjadi di ruangan |
|---|---|
| `PreToolUse` | pegawainya berangkat ke stasiun tool-nya |
| `PostToolUse` | giliran kerjanya ditutup |
| `PostToolUseFailure` | cipratan tinta merah + baris merah di log, berisi pesan galatnya |
| `PermissionRequest` | **berdiri mengangkat map disposisi menghadap kamera** |
| `PermissionDenied` | pose yang sama, alasan penolakannya masuk kartu pegawai |
| `UserPromptSubmit` | dipanggil ke meja rapat untuk briefing |
| `Stop` | balik ke mejanya, "beres, siap disposisi" |
| `StopFailure` | berhenti di tengah jalan; jenis galatnya ditulis di panel |
| `SubagentStart` | satu peserta rapat masuk, namanya `agent_type` |
| `SubagentStop` | peserta dengan `agent_id` itu permisi |
| `Notification` | balon tanda seru; dua jenisnya ikut memicu pose menunggu |
| `SessionStart` | pegawainya masuk kantor |
| `SessionEnd` | pulang, rapatnya dibubarkan paksa |
| `PreCompact` | "merapikan catatan" |
| `PostCompact` | "catatan sudah rapi" |

Lima yang pertama dipasang dengan `matcher: "*"` karena matcher-nya menyaring
**nama tool**. Sisanya dipasang tanpa `matcher` sama sekali — untuk Claude Code,
matcher yang dihilangkan sama artinya dengan `"*"`, jadi bentuk polos itu benar
baik untuk event yang punya matcher (`SessionStart` menyaring cara mulai,
`SubagentStart` menyaring tipe agen, `PreCompact` menyaring pemicunya) maupun
untuk yang memang tidak punya (`Stop`, `UserPromptSubmit`).

## Peta stasiun

| Stasiun | Tool | Yang kelihatan |
|---|---|---|
| Lemari arsip | `Read`, `Glob` | baca map manila, debu beterbangan |
| Filing kabinet | `Grep`, `ToolSearch` | laci ketarik, kaca pembesar |
| Meja printer | `WebFetch`, `WebSearch` | di bawah jendela, Monas di kejauhan |
| Meja stempel | `Edit`, `Write`, `Artifact` | CAP! stempel + cipratan tinta merah |
| PC server | perintah **git** (`git`, `gh`, `jj`, …) lewat `Bash`/`PowerShell` | rak besi: patch panel, dua server, storage, switch, UPS, kabel UTP menjuntai, APAR di sampingnya |
| Meja rapat | `Task`, `Agent`, `Workflow`, plus **kegiatan berpikir selagi ada subagent berjalan** | meja panjang bertaplak putih + rimpel hijau, 9 kursi, peserta undangan ikut duduk, ada yang bicara ada yang mencatat notulen |
| Ruang kadis | `Skill`, `SendMessage`, `mcp__*` | ketuk pintu bawa map disposisi |
| Meja kerja | `TodoWrite`, `AskUserQuestion`, **semua perintah shell non-git**, dan tempat pulang waktu menganggur | **4 meja** di baris depan, laptopnya menyala hanya di meja yang ditempati |
| Ruang tunggu | limpahan waktu empat meja penuh | berdiri ngopi dekat dispenser — baris depan tengah |

Arahan baru dari kamu (`UserPromptSubmit`) memanggil pegawainya ke **meja rapat**
untuk menerima briefing. Tool yang tidak dikenal jatuh ke meja kerja; apa pun
berawalan `mcp__` menghadap kepala dinas. Kalau 7 detik tidak ada event,
pegawainya balik ke **meja kerjanya sendiri**, bukan ke ruang tunggu — ruangan
yang orangnya sibuk di mejanya masing-masing lebih enak dilihat daripada ruangan
yang orangnya antre. Ruang tunggu tinggal jadi limpahan: dipakai hanya kalau
empat meja sudah terisi semua, dan begitu ada meja yang kosong, yang menunggu
langsung dipanggil balik.

### Butuh manusia

Ada keadaan ketiga di samping *sedang bekerja* dan *menganggur*: **sesinya
berhenti menunggu keputusan kamu.** Bedanya nyata — yang menganggur sudah
selesai, yang ini tidak bisa lanjut sampai ada orang yang menjawab. Tanpa
tanda sendiri, dua-duanya terlihat sama: berdiri diam di ruangan.

Pemicunya lima. Tiga dari hook: `PermissionRequest`, `PermissionDenied`, dan
`Notification` yang `notification_type`-nya `permission_prompt` atau
`agent_needs_input`. Dua lagi dari tool yang memang tidak mengerjakan apa pun
sampai kamu menjawab — `AskUserQuestion` dan `ExitPlanMode` — dan untuk
keduanya isi pertanyaan atau rencananya ikut naik ke kotak kabar, bukan cuma
nama tool-nya (lihat **Balon pikiran & kotak kabar**).
Sembilan `notification_type` sisanya cuma kabar lewat — `auth_success`
memberitahu login berhasil, `agent_completed` memberitahu subagent kelar,
`quota_*` memberitahu kuota — dan tidak satu pun menahan sesinya.

Tandanya dibuat supaya terbaca **tanpa membaca teks**: pegawainya berdiri dari
kursinya, mengangkat map disposisi bercap merah dengan dua tangan, dan
**menghadap penonton**. Perkakas mejanya ikut disembunyikan — tangannya sedang
penuh. Selama menunggu dia juga tidak pulang ke mejanya walau lewat batas
menganggur; kalau dia balik ke meja, tandanya justru hilang dari layar.

Keadaannya **batal seketika**, bukan lewat sapuan berkala: event apa pun
berikutnya dari sesi yang sama sudah berarti tunggunya lewat. Itu penting soal
waktu — izin yang kamu berikan detik ini langsung disusul `PostToolUse`, dan
pegawainya harus duduk lagi saat itu juga.

Alasan penolakan dari `PermissionDenied` (mis. `Blocked by classifier`) ditulis
apa adanya di kartu pegawai. Itu satu-satunya keterangan kenapa sesinya
tertahan, jadi tidak diringkas jadi "ditolak".

Keadaan ini **tidak pernah muncul untuk pegawai standby** — standby tidak punya
sesi, jadi tidak pernah menerima event ini — dan **tidak menaikkan statistik apa
pun**. Yang terjadi bukan pekerjaan; justru pekerjaan yang tertahan.

### Berhenti karena galat

Ini keadaan **keempat**, dan gampang tertukar dengan yang di atas kalau tidak
dibedakan: *menunggu manusia* berarti kamu yang ditunggu — jawabanmu langsung
melanjutkannya. **Berhenti karena galat** berarti bukan kamu — sesinya tidak
bisa lanjut sampai keadaannya sendiri berubah (kuota reset, server pulih) atau
kamu yang memutuskan menyuruhnya lanjut lagi. Sebelum ini dua-duanya terlihat
sama persis begitu balon "berhenti — ..." yang sesaat itu hilang: berdiri diam
di ruangan, tidak ada bedanya dari yang benar-benar sudah selesai.

Pemicunya `StopFailure` dari hook — `error` (mis. `rate_limit`, `overloaded`,
`authentication_failed`) diterjemahkan lewat kamus yang sama dipakai untuk
`api_retry`. Sesi yang dilahirkan halaman ini (lewat `/perintah`) punya jalur
sendiri: galat API datang sebagai pesan asisten biasa yang ditandai
`is_api_error_message` di stream-json-nya, dibaca **selagi sesinya masih
jalan** — bukan menunggu proses itu mati dulu.

Tandanya sengaja **bukan pose**, melainkan lencana merah kecil `!` yang
menggantung tetap di atas kepala, tidak peduli pegawainya menghadap ke mana.
Alasannya: pose menghadap kamera + map disposisi sudah dipakai untuk "lihat
saya, saya butuh kamu" — memakainya lagi di sini bikin dua keadaan yang
maknanya berlawanan terlihat sama. Lencana tidak menua dan tidak berganti isi;
dia padam serentak begitu ada event lain dari sesi yang sama, sama seperti
aturan pembatalan **butuh manusia**.

### Berpikir mengikuti tempatnya

Menyusun agenda, menyusun atau mengajukan rencana, dan menunggu arahan
(`TodoWrite`, `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`) tidak selalu
dikerjakan di meja yang sama:

| Keadaan sesi | Berpikirnya di |
|---|---|
| sendirian | **meja kerjanya** |
| ada subagent yang benar-benar masih berjalan | **meja rapat** |

Alasannya sederhana: orang yang baru saja menggelar rapat tidak balik ke mejanya
untuk menyusun agenda lalu bolak-balik lagi — dia mengerjakannya di meja rapat,
di depan peserta yang sedang bekerja untuknya. Begitu rapatnya bubar, kegiatan
berpikir berikutnya kembali ke meja kerja sendiri.

Yang dialihkan hanya empat tool di atas. Perintah shell non-git juga jatuh ke
meja kerja, tapi **tidak** ikut pindah: menjalankan perintah bukan berpikir.

### Kenapa perintah shell dipecah dua

Dulu ada satu **meja komputer** berisi lima laptop dan semua `Bash` ke sana. Itu
jadi mubazir begitu tiap meja kerja punya laptopnya sendiri: pegawainya bolak-balik
melintasi ruangan cuma untuk mengetik di komputer lain. Sekarang mejanya
ditentukan **isi perintahnya**, bukan nama tool-nya:

- ada `git`, `gh`, `jj` di salah satu segmen perintah → berdiri ke **PC server**
- selain itu → dikerjakan di **meja kerjanya sendiri**

Pembungkus di depan perintah dibuang dulu, jadi `rtk git push` dan `sudo git pull`
tetap terbaca git. `cat .git/config` tidak: yang dibaca programnya, bukan
kata "git" di mana pun.

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

### Tombol di bilah bawah

| Tombol | Guna |
|---|---|
| ⚙️ | buka panel **Pengaturan** — lihat di bawah |
| 💬 | buka kotak kabar; lencananya jumlah kabar yang belum dibaca |

Lima setelan yang dulu masing-masing punya tombol sendiri di bilah ini sekarang
digabung ke satu panel **Pengaturan** (⚙️), supaya tidak perlu menghafal lima
posisi tombol berbeda:

| Setelan di panel | Guna |
|---|---|
| 💭 balon pikiran | balon pikiran nyala/mati |
| 💬 buka kabar otomatis | kembaran dari centang **buka sendiri** di kaki modal kabar — dua-duanya setelan yang sama, cuma dua tempat |
| 🔊 efek suara | efek suara (blip tiap event) nyala/mati |
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
`busNotif`/`busMusik`), dan setiap penghasil bunyi (blip tool call, derau
hujan/guntur, lonceng notifikasi + `ucapSuara`, beat/chord musik lofi,
termasuk Indonesia Raya) disambungkan ke bus yang sesuai alih-alih langsung
ke `audio.destination` — supaya volumenya bisa digeser sendiri-sendiri tanpa
mengubah campuran/attack tiap bunyi satu per satu.

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

## Peserta rapat

Subagent punya hook sendiri: `SubagentStart` menandai satu agen masuk,
`SubagentStop` dengan `agent_id` yang sama menandai dia keluar. Keduanya
membawa `agent_type` dan `agent_id` — **identitas subagent-nya sendiri**, bukan
tebakan dari sisi yang memanggilnya. Itu yang dipakai menamai dan memasangkan
peserta rapat.

Fase workflow tetap tidak punya hook sendiri: Claude Code tidak mengirimkan
event terpisah untuk tiap agen di panel **Phases**. Yang bisa dibaca cuma daftar
fase di `meta.phases` pada script workflow-nya, dan itu ikut dikirim server
sebagai `ev.peserta`. Begitu `Workflow` dipanggil, satu **peserta undangan**
masuk lewat pintu untuk tiap fase dan duduk di meja rapat sampai panggilan
tool-nya selesai.

### Kursi sementara, lalu diambil alih

`Task` dan `Agent` juga membuka satu kursi di `PreToolUse`, dinamai dari
`description` atau `subagent_type`-nya. Bedanya, kursi itu **sementara**:
`description` sudah bisa dibaca sekarang, sementara `agent_type` baru datang
beberapa saat kemudian lewat `SubagentStart`. Begitu agennya memperkenalkan
diri, kursi itu **diambil alih** — bukan ditambah kursi baru — lalu namanya
diganti nama agen yang sebenarnya dan diikat ke `agent_id`-nya.

Dua hal yang dijaga rancangan ini:

- **Tidak pernah ada dua kursi untuk satu agen.** Yang datang belakangan
  menempati kursi yang sudah ada, bukan bikin sendiri.
- **Kalau `SubagentStart` tidak pernah datang** — Claude Code lama, atau
  hook-nya belum dipasang ulang — kursi sementara itu yang bertahan, dengan
  nama dari `description`. Ruangannya tetap terisi, cuma namanya kurang tepat.

### Kapan mereka permisi

Yang gampang salah: **`PostToolUse` tidak pernah bisa dipercaya menandai
subagent selesai.** Kalau agennya dijalankan di latar, `post` datang
sepersekian detik setelah `pre` — yang ditandainya pengiriman, bukan hasilnya —
sementara agennya masih bekerja menit-menit berikutnya. Ini terlihat waktu satu
tugas nyata memanggil `Agent` di detik ke-50 dan `SubagentStop`-nya baru datang
di detik ke-230.

Dulu bedanya ditebak dari jarak `pre`→`post`: di bawah dua detik dianggap
dikirim ke latar. Tebakan itu **sudah dihapus**, dan tidak diganti tebakan lain
— `SubagentStop` selalu datang setelah agennya benar-benar berhenti, baik yang
sinkron maupun yang di latar, jadi tidak ada yang perlu dibedakan:

| Rapatnya | Ditutup oleh |
|---|---|
| `Task`, `Agent` | `SubagentStop` yang `agent_id`-nya cocok |
| `Workflow` | `PostToolUse` — fasenya memang habis waktu panggilan tool-nya habis |

Pasangan `pre`→`post` sendiri dicocokkan lewat `tool_use_id` yang dibawa
keduanya, bukan lewat (sesi, tool). Kalau payload-nya tidak membawanya, jatuh ke
cara lama: yang dibuka duluan yang ditutup duluan.

Giliran main agent boleh selesai duluan: `Stop` **tidak** membubarkan rapat yang
masih menunggu `SubagentStop`, karena subagent-nya memang masih jalan. Yang
membubarkan paksa cuma `SessionEnd` — sesinya habis, tidak ada lagi yang bisa
ditunggu — dan sapuan 15 menit untuk sesi yang mati mendadak.

Namanya muncul di panel kanan sebagai baris kecil menjorok di bawah sesi yang
mengundang. `SubagentStop` membubarkan satu peserta saja — subagent selesai bukan
berarti sesinya selesai, jadi pegawainya tetap di mejanya. Rapat yang kursinya
sudah habis ikut dicoret dari daftar saat itu juga, supaya entrinya tidak
menyangkut sampai sapuan 15 menit.

Kursinya ada 9: tujuh menghadap kamera di sisi jauh, dua lagi membelakangi kamera
di sisi dekat. Kalau fasenya lebih banyak dari kursi yang tersisa, sisanya
dicatat di log sebagai "ikut daring" — tidak dipaksa menumpuk di satu titik.

Meja rapat menghalangi tengah ruangan, jadi pegawainya tidak menembusnya — mereka
memutar lewat lajur depan meja dinding atau lajur depan meja rapat, tersambung di
sisi kiri (dekat bendera) dan kanan.

Stasiun yang paling sering dipakai dibuat berkapasitas banyak: **meja rapat**
punya 9 kursi, **meja kerja** 6 meja dengan titik berdiri yang didaftar manual
(koridor turun yang benar-benar bebas perabot — dua di antaranya sengaja mepet,
cuma berjarak 66px, karena itu batas paling longgar yang masih muat di celah
tersisa), dan **PC server** 4 slot dengan
langkah 20 px. Slot kelima di rak sengaja tidak ada: titiknya jatuh tepat di atas
ember penadah tetesan AC. Ruang tunggu ikut aturan yang sama, langkah slotnya 23.
Kalau sesi yang berkumpul melebihi itu, slot yang keluar kanvas dilewati, bukan
dipaksa menumpuk di tepi.

## Persona pegawai

Tiap pegawai punya **jabatan**. Perannya sama dengan yang dipakai di software
house, tapi namanya mengikuti jabatan yang benar-benar ada di instansi
pemerintahan — struktural (kepala dinas sampai kepala seksi) dan fungsional
(pranata komputer, sandiman, arsiparis, statistisi).

| Jabatan | Padanan di software house |
|---|---|
| Kepala Dinas | CTO / Kepala Teknologi |
| Sekretaris Dinas | Engineering Manager |
| Kepala Bidang | Manajer Proyek |
| Kepala Seksi | Ketua Tim / Tech Lead |
| Analis Sistem Informasi | Arsitek Sistem |
| Pranata Komputer Ahli Madya | Senior Engineer |
| Pranata Komputer Ahli Muda | Backend Engineer |
| Pranata Komputer Ahli Pertama | Frontend Engineer |
| Sandiman | Security Engineer |
| Auditor Internal | QA Engineer |
| Statistisi | Data Analyst |
| Arsiparis | Technical Writer |
| Pranata Humas | Developer Relations |
| Analis Kebijakan | Product Manager |
| Teknisi Jaringan | DevOps / SRE |
| Tenaga Magang | Intern |

Jabatan bukan sekadar label: **satu jabatan satu seragam**. Yang batik tidak
memakai lidah bahu, jadi siluetnya tetap terbaca beda walau warnanya berdekatan.
Warna chip di panel diambil dari seragam yang sama, supaya baris di panel dan
orang di ruangan bisa dicocokkan tanpa membaca namanya. Tabelnya ada di
`JABATAN` dalam [public/room.js](public/room.js).

Tiga cara mengaturnya:

- **kartu pegawai** — klik orangnya, ganti lewat dropdown *jabatan*
- **formulir tugas** — pilih jabatannya sebelum menekan *Tugaskan*. Seragamnya
  sudah benar sejak event hook pertama, karena server menentukan session id
  lewat `--session-id` sebelum prosesnya lahir — trik yang sama dengan nama
- **`POST /peran`** — `{ "sesi": "abc123", "peran": "sandiman" }`

Pilihannya disimpan di server, bukan di halaman, jadi tetap melekat waktu halaman
dibuka ulang dan sama di semua penonton. Sesi yang datang tanpa jabatan kebagian
giliran dari `PERAN_BAWAAN`, dimulai dari yang mengerjakan bukan yang memimpin:
satu sesi sendirian lebih masuk akal digambarkan sebagai staf yang bekerja
daripada kepala dinas yang menganggur.

Pegawai standby dan peserta rapat ikut berjabatan, tapi jabatannya cuma berlaku
selama halaman terbuka — mereka tidak punya sesi di server untuk dititipi.

## Kartu pegawai

Klik pegawainya — di ruangan atau di barisnya pada panel — untuk membuka kartu
detail. Kartunya menempel pada orangnya dan ikut berjalan, jadi tidak perlu
ditebak kartu ini punya siapa; yang sedang dibuka juga diberi sorotan di lantai.

| Isi kartu | Keterangan |
|---|---|
| nama + jabatan | lengkap dengan padanan software house dan uraian tugasnya |
| sesi / proyek | id sesi 12-char dan nama folder project-nya |
| posisi + kegiatan | stasiun tempat dia berdiri dan yang sedang dikerjakan |
| tertahan + alasan | cuma muncul waktu sesinya menunggu keputusan kamu; alasan penolakan ditulis apa adanya |
| di kantor | sudah berapa lama sejak pegawainya muncul |
| model | model yang dipakai sesi itu, kalau ketahuan |
| tool call | jumlah panggilan, plus berapa yang gagal |
| sering di | dua stasiun yang paling sering dia datangi |
| riwayat | 6 kegiatan terakhir; yang gagal ditandai merah |

Dari kartu itu juga jabatannya diganti, namanya diberikan, dan — kalau kendali
web menyala — tugasnya dihentikan. Standby dan peserta rapat dapat kartu yang
lebih pendek: mereka bukan sesi, jadi tidak ada angka sesi maupun tombol aksi,
cuma keterangan mereka ini apa.

Menutupnya: klik lantai kosong, tombol ✕, atau baris yang sama sekali lagi.
Pegawai yang pulang di tengah jalan menutup kartunya sendiri.

## Bahasa yang tampil

Yang kamu baca bukan nama tool, tapi kegiatannya: `Read` jadi "membaca berkas
laporan-2024.pdf", `Task` jadi "menggelar rapat tinjau modul otentikasi",
`TodoWrite` jadi "menyusun agenda 5 item". Petanya ada di `KEGIATAN` dalam
[public/room.js](public/room.js) — tinggal diubah kalau mau kata-kata lain,
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

Pegawainya voxel 3D, seragamnya mengikuti jabatan: khaki PNS (plus peci dan
kumis), batik sogan, Korpri, wearpack teknisi, sampai yang berjilbab. Beberapa
sesi Claude Code sekaligus
= beberapa pegawai; dengan hook global, panel kanan juga menampilkan nama folder
project tiap sesi. Kalau dua pegawai ke meja yang sama, mereka berjajar otomatis.

## Suasana ikut jam

Ruangan mengikuti jam di mesin penontonnya, digeser mulus antar patokan jam —
tidak ada loncatan suasana:

- **pagi** — langit biru muda kekuningan, matahari merangkak naik dari kiri
  jendela, ruangan segar
- **siang** — langit biru, awan lewat, persis suasana lama
- **senja** — langit jingga keunguan, matahari turun di kanan, ruangan kena
  semburat hangat dan neonnya mulai menyala
- **malam** — jendela gelap berbintang plus bulan, jendela gedung di kejauhan
  dan lidah api Monas ikut menyala, ruangan diselubungi biru gelap, dan dua
  lampu neon jadi sumber cahaya utama: tabungnya menghangat, ada kerucut
  cahaya turun ke lantai dan genangan warm di bawahnya

Semuanya dihitung dari `FASE_HARI` di [public/room.js](public/room.js) —
patokan warna langit, selubung ruangan, intensitas lampu, dan berkas cahaya
per jam. Mau memeriksa suasana tertentu tanpa menunggu jamnya tiba? Tambah
`?jam=18.4` di URL (boleh digabung: `?demo=1&jam=22`).

### Hujan ikut cuaca sungguhan

Saat halaman dibuka (lalu tiap 10 menit) dia bertanya ke `GET /cuaca`:
server menebak lokasi dari IP publiknya lewat [geojs.io](https://get.geojs.io)
dan membaca kondisi terkini dari [open-meteo.com](https://open-meteo.com) —
dua-duanya tanpa kunci API. Kalau di luar memang hujan, di jendela ikut hujan:

- **gerimis → deras** — goresan hujan di kaca makin rapat, langit mengelabu
  sesuai terangnya (hujan malam tetap gelap, bukan mendadak abu-abu muda),
  dunia luar meredup, dan neon ikut menyala seperti kantor sungguhan waktu
  hujan deras siang hari
- **hujan petir** — sekali 5–16 detik langit menyala sekejap, pantulannya
  sampai ke dalam ruangan
- kalau tombol suara 🔊 dinyalakan, ada **derau hujan** halus yang ikut
  deras-redanya, dan **gemuruh** menyusul tiap kilat
- mulai/redanya hujan dicatat di log aktivitas

Ini **satu-satunya lalu lintas keluar** yang dibuat server, hasilnya di-cache
10 menit, dan kegagalannya tidak pernah berisik: server lama, offline, atau
API tumbang membuat halaman jatuh ke mode **hujan sesekali** — dadu
deterministik per jam (sekitar 1 dari 5 jam gerimis), sama untuk semua
penonton. Yang tidak mau servernya keluar sama sekali:

```bash
AGENT_ROOM_CUACA=off node server.mjs
```

Atau tetapkan koordinat sendiri tanpa menebak dari IP, misalnya Jakarta:

```bash
AGENT_ROOM_CUACA=-6.2,106.8 node server.mjs
```

Uji cepat dari URL: `?hujan=gerimis`, `?hujan=deras`, `?hujan=petir`, atau
angka `?hujan=0.5` — boleh digabung `?demo=1&jam=22&hujan=petir`.

## Event acak

Selain yang dipicu tool call, ruangan punya **102 kejadian yang muncul
sendiri**: UPS berbunyi, kalender disobek, kabel LAN longgar, gorengan naik ke
meja rapat, kucing tidur di karpet, tamu salah alamat, sirene lewat di jalan
depan. Katalog lengkapnya ada di [EVENT-ACAK.md](EVENT-ACAK.md); definisinya di
[public/event-acak.js](public/event-acak.js), mesinnya di `room.js`.

Cara kerjanya: satu registri berbobot, satu penjadwal berjeda 18–45 detik,
cooldown per event. Bentuk satu definisi:

```js
{
  id: 'tegangan-turun-lampu-redup',
  kelas: 'latar',          // 'panggung' = eksklusif, cuma satu boleh jalan
  bobot: 5, cooldown: 180, durasi: 6,
  syarat: (S) => S.lampu > 0.15,
  mulai(E, S) {}, tick(E, dt, S) {}, selesai(E, S) {},
  gambarDinding(E), gambarLantai(E), gambarProp(E) + sortY, gambarAtas(E),
  lanjutan: [{ id: 'ups-beep-baterai', peluang: 0.5 }],
}
```

Event mengubah ruangan lewat dua objek. **`MOD`** dikembalikan ke nilai bawaan
tiap frame, jadi event cukup memasangnya di `tick()` tanpa perlu membereskannya
sendiri — intensitas neon, kecepatan kipas, layar laptop, kabut di kaca, sorot
jam. **`RUANGAN`** tidak pernah direset: itu tempat bekas yang sengaja hidup
lebih lama dari eventnya — noda tinta di meja stempel, kartu inspeksi di APAR,
label yang akhirnya tertempel di patch panel, kabel yang sudah dirapikan.
Ruangan yang menyimpan jejak kejadian tadi terasa dihuni; yang selalu kembali
bersih terasa seperti demo.

### Tiga aturan yang tidak boleh dilanggar

Halaman ini pertama-tama alat pantau sesi Claude Code, baru kedua sebuah
ruangan. Tiga aturan menjaga urutan itu:

1. **Event tidak pernah menarik pegawai yang sedang bekerja.** Yang boleh
   dipinjam cuma yang benar-benar menganggur — dan begitu tool call datang untuk
   sesi itu, `handle()` melepasnya saat itu juga: barang bawaannya jatuh,
   alpha-nya balik, dan dia langsung berangkat ke stasiun tool-nya. **Pegawai
   standby adalah pemeran utama event**; itu memang gunanya mereka ada.
2. **Event tidak masuk log dan tidak menaikkan statistik.** Panel kanan itu
   laporan sesi, bukan laporan suasana. Di kartu pegawai, kegiatan event ditulis
   terpisah dengan tanda `(suasana)`.
3. **Semuanya bisa dimatikan.** `?event=0` mematikan, `?event=<id>` memaksa satu
   event jalan berulang — tanpa itu event langka mustahil diuji. Beberapa id
   sekaligus boleh: `?event=kucing-kantor-mampir,gorengan-di-meja-rapat`.

`mulai()` yang melempar akan **membatalkan** eventnya, bukan membiarkannya jalan
setengah jadi — kalau tidak, `tick()`-nya ikut meledak tiap frame sampai
durasinya habis.

### Pantry

Sudut dispenser kedatangan tetangga: kabinet mini + toples kue
(`drawPantryKecil`, di sela x372..385, antara tong sampah dan kipas). Event
`ngerumpi-di-pantry` memakai pojok kosong tepat di atasnya (y226..250, kanan
meja rapat) buat mengumpulkan 2-3 pegawai standby berkerumun ngobrol —
beda dari `ngobrol-di-dispenser` yang orangnya kebetulan sudah di situ, di
sini mereka sengaja dipanggil dari mana pun lewat `pinjamAktor`. Isinya
gosip kantor (rotasi, mutasi), bukan obrolan kopi biasa.

### Kenapa hujan tidak ada di daftar itu

Rapat desainnya mengusulkan `hujan-deras` dan `hujan-petir-kedip` sebagai event
acak. Keduanya tidak dibuat: hujan di ruangan ini **sungguhan**, dibaca dari
`/cuaca`. Memaksanya dari penjadwal akan melawan data asli dan bikin baris log
"hujan turun / hujan reda" berbohong. Yang memang belum ada — mendung tanpa
hujan — itu yang dibuat.

## Kenapa curl, bukan node

Hook ini jalan **tiap tool call**, dua kali (sebelum dan sesudah), jadi
latensinya langsung terasa di sesi kamu:

| Transport | Per panggilan |
|---|---|
| `curl` | ~42 ms |
| `node hook.mjs` | ~153 ms |

Tiap event yang dipasang menambah satu panggilan `curl` **saat event itu
menyala**, bukan tiap tool call. Yang perlu diingat waktu menimbang daftar di
atas:

- `PreToolUse` dan `PostToolUse` yang benar-benar sering — itu yang menentukan
  laju kerja sesi, dan keduanya memang tidak bisa ditawar.
- `PostToolUseFailure`, `PermissionRequest`, dan `PermissionDenied` sama-sama
  ber-`matcher` nama tool, tapi menyala jauh lebih jarang. `PostToolUseFailure`
  malah menggantikan `PostToolUse` waktu tool-nya gagal — sejak keduanya
  terpisah, satu panggilan tool tetap menghasilkan tepat satu event akhir.
- Sisanya menyala paling banyak beberapa kali per sesi: `SessionStart`,
  `SessionEnd`, `PreCompact`, `PostCompact`, `StopFailure`.
- Yang paling mahal dari daftar tambahan adalah `SubagentStart`/`SubagentStop`,
  karena tugas yang memanggil banyak subagent bisa menyalakannya belasan kali.
  Itu tetap sepadan: tanpa keduanya, identitas peserta rapat cuma tebakan.

Satu event sengaja **tidak** dipasang meski sempat dicoba: `TeammateIdle`. Dia
cuma menambah satu baris log dan tidak menggerakkan siapa pun di ruangan, jadi
buat yang tidak memakai fitur tim dia murni ongkos. Aturannya dipakai untuk
seluruh 17 event sisanya juga: hook dipasang kalau ada yang bergerak karenanya,
bukan karena datanya ada.

Installer otomatis milih `curl`. Kalau `curl` tidak ada, dia jatuh ke
`hook.mjs`. Mau maksa pakai node: `node install.mjs --node`.

Dua hal yang bikin ini aman buat sesi kamu:

- Server balas **204 tanpa body**. Stdout hook dibaca Claude Code sebagai
  perintah kontrol, jadi hook ini sengaja tidak menulis apa pun.
- Perintahnya diakhiri `|| exit 0`. Server ruangan mati? Hook diam-diam
  no-op, sesi kamu jalan terus tanpa warning.

## Konfigurasi

| Env | Default | Guna |
|---|---|---|
| `AGENT_ROOM_PORT` | `4517` | ganti port (install ulang hook setelah diubah) |
| `AGENT_ROOM_HOST` | `127.0.0.1` | alamat bind |
| `AGENT_ROOM_CLAUDE` | hasil `where claude` | tunjuk biner claude tertentu, kalau PATH menemukan instalasi yang salah |
| `AGENT_ROOM_TOKEN_FILE` | `.agent-room-token` | tempat token headless diingat, kalau centangnya dinyalakan |
| `AGENT_ROOM_CUACA` | *(nyala, tebak dari IP)* | `off` mematikan cek cuaca; `lat,lon` menetapkan lokasi |
| `AGENT_ROOM_ISI` | *(nyala)* | `off` menutup transkrip sesi: ruangan kembali cuma menyiarkan metadata, tanpa pikiran dan kalimat agen |

## Isi

| File | Guna |
|---|---|
| `dinas.mjs` | pelaksana harian: periksa biner/hook/kredensial, lalu jalankan server |
| `dinas.cmd`, `dinas.sh` | pembungkus supaya cukup mengetik `dinas` |
| `server.mjs` | HTTP + SSE, normalisasi payload hook |
| `hook.mjs` | forwarder cadangan kalau `curl` tidak ada |
| `install.mjs` | pasang/lepas hook di `settings.json` |
| `public/room.js` | mesin render canvas + mesin event acak |
| `public/event-acak.js` | katalog 102 event acak (dimuat sesudah `room.js`) |
| `public/index.html`, `public/style.css` | rangka halaman + panel |
| `EVENT-ACAK.md`, `event-acak.json` | katalog rancangan 373 event, hasil rapat desain |

Server cuma bind ke localhost dan nyimpen 400 event terakhir di memori.
Lalu lintas keluar satu-satunya adalah cek cuaca lewat geojs.io +
open-meteo.com (matikan dengan `AGENT_ROOM_CUACA=off`). Disk **dibaca** untuk
mengikuti transkrip sesi yang sedang jalan — itu sumber balon pikiran dan kotak
kabar, dan bisa dimatikan dengan `AGENT_ROOM_ISI=off` — dan **ditulis** hanya
kalau centang **ingat di berkas** pada token headless dinyalakan.


## Pegawai standby

Ruangan dijaga minimal berisi **4 orang** supaya tidak terlihat mati saat cuma ada
satu sesi. Yang menambal adalah pegawai *standby*, dan jumlahnya selalu
`4 − jumlah sesi nyata`: satu sesi datang, satu standby pamit.

Mereka sengaja dibedakan supaya tidak ada yang salah baca:

- di ruangan digambar **pudar** (alpha 0.55)
- di panel barisnya diberi label `standby`, dimiringkan, dan diredupkan
- angka besar di panel tetap **jumlah sesi nyata**, standby disebut terpisah

Standby tidak pernah bicara, tidak punya balon teks, dan tidak pernah masuk log.
Mereka cuma mondar-mandir antar stasiun, dan lebih sering balik ke meja kerja
daripada ke sudut tunggu — itu yang bikin ruangan terbaca sibuk, bukan terbaca
antre.

## Kendali web

Halaman bisa menugaskan pekerjaan ke Claude Code, memberi nama pegawainya, dan
menghentikan tugas. Fitur ini **mati secara bawaan** karena pada dasarnya jalur
eksekusi kode. Menyalakannya:

```bash
node agent-room/server.mjs --izinkan-perintah
```

Alurnya memanfaatkan `--session-id`: server menentukan UUID sesi **sebelum**
prosesnya lahir, jadi nama yang kamu ketik langsung menempel pada pegawai yang
nanti muncul lewat hook. Tidak ada protokol baru — jalur hook yang sudah ada
dipakai ulang.

| Endpoint | Guna |
|---|---|
| `GET /kendali` | status izin, token, daftar tugas yang berjalan |
| `POST /perintah` | lahirkan sesi baru dengan nama + prompt + folder kerja |
| `POST /perintah/hentikan` | hentikan tugas yang sedang jalan |
| `POST /nama` | beri nama panggilan ke sesi mana pun, termasuk sesi terminal |
| `POST /peran` | tetapkan jabatan sesi mana pun; id yang tidak dikenal ditolak |
| `POST /kredensial` | pasang atau hapus token headless; nilainya tidak pernah bisa dibaca kembali |

**Formulir tugasnya sendiri sengaja disembunyikan di halaman ini**, apa pun
jawaban `/kendali` — `muatKendali()` di [public/room.js](public/room.js)
memaksa `elForm.hidden = true` tanpa syarat, jadi menyalakan
`--izinkan-perintah` tidak lagi memunculkan kotak nama/prompt/folder di
sidebar. Endpoint di tabel atas tetap hidup dan bisa dipanggil langsung kalau
kamu punya jalan lain ke token per-jalannya; yang hilang cuma jalan pintas
lewat formulir bawaan. Panel **token headless** (di bawah) dikecualikan dari
penyembunyian ini — lihat kenapa di bagiannya sendiri.

### Model yang dipakai

Dropdown kedua di formulir tugas menentukan `--model` sesi yang dilahirkan
halaman ini:

| Pilihan | Yang dikirim |
|---|---|
| model bawaan | tidak mengirim `--model` sama sekali — setelan Claude Code yang berlaku |
| Opus 5 | `claude-opus-5` |
| Sonnet 5 | `claude-sonnet-5` |
| Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Fable 5 | `claude-fable-5` |

Daftarnya ada di `MODEL` pada [public/room.js](public/room.js) — tambah sendiri
kalau kamu memakai id lain, misalnya id Bedrock atau Vertex. Server menerima apa
pun yang cocok dengan `MODEL_SAH` (alias sependek `opus`, id penuh, sampai id
penyedia lain yang memakai titik dan titik dua) dan **menolak 400** untuk sisanya
— bukan diam-diam menjalankan tanpa model. Id-nya tetap masuk sebagai satu
elemen argv seperti prompt, jadi tidak ada jalan ke shell.

Model cuma bisa ditentukan **saat sesi dilahirkan**. Proses yang sudah jalan
tidak bisa dipindah modelnya dari luar, jadi kartu pegawai hanya menampilkannya,
tidak menawarkan dropdown. Sesi terminal menampilkan model kalau payload
hook-nya kebetulan membawanya — itu tidak dijamin ada.

### Token headless

Sesi yang dilahirkan halaman ini butuh kredensialnya sendiri; login aplikasi
Claude di desktop tidak ikut terpakai. Daripada mengatur env di terminal,
tokennya bisa ditempel dari panel: buka **token headless**, tempel, **Simpan**.
Env yang dipakai ditentukan bentuk tokennya:

| Awalan | Dikirim sebagai |
|---|---|
| `sk-ant-api…` | `ANTHROPIC_API_KEY` |
| selainnya, mis. `sk-ant-oat…` dari `claude setup-token` | `CLAUDE_CODE_OAUTH_TOKEN` |

Panelnya **berdiri sendiri**, lepas dari formulir tugas yang disembunyikan di
atas — `id="kredensialPanel"` di [public/index.html](public/index.html),
ditampilkan/disembunyikan sendiri oleh `muatKendali()`. Syaratnya cuma `izin`
dari `GET /kendali`, bukan `siap`: `POST /kredensial` di server memang cuma
mensyaratkan kendali web menyala, tidak peduli biner `claude`-nya sudah
ketemu atau belum, jadi panelnya ikut syarat yang sama persis. Kendali web
mati sama sekali → panelnya juga tidak pernah muncul, karena `/kredensial`
toh akan menolak semuanya (tidak ada token per-jalan buat dikirim).

Tiga batasan yang berlaku apa pun pilihanmu:

- **satu arah**: tidak ada endpoint yang bisa membacanya kembali. `/kendali`
  hanya melaporkan ada/tidak, nama env-nya, dan tersimpan di berkas atau tidak
- tidak pernah masuk log, konsol, maupun stream event; yang dicatat cuma nama
  env-nya
- diteruskan ke proses anak lewat **env, bukan argv** — baris perintah sebuah
  proses bisa dibaca proses lain di mesin yang sama, isi env-nya tidak

Soal umurnya, kamu yang memilih lewat centang **ingat di berkas**:

| Centang | Tokennya |
|---|---|
| mati | hidup di memori server saja, hilang begitu server berhenti |
| nyala | ditulis ke `.agent-room-token` di samping `server.mjs`, dimuat sendiri tiap server start |

Berkas itu berisi token **mentah** — perlakukan seperti kunci. Server menulisnya
dengan mode `0600` (berlaku di POSIX; di Windows yang berlaku ACL folder
induknya) dan namanya sudah masuk `.gitignore`. Pindah tempat lewat
`AGENT_ROOM_TOKEN_FILE`. Menekan **Hapus** membuang keduanya sekaligus, memori
dan berkas; menyimpan ulang dengan centang dimatikan juga mencabut berkas lama.

Gerbangnya sama dengan `/perintah`: token per-jalan + cek `Origin`. Memang harus
sama, karena yang sudah bisa menyuruh mesin ini bekerja pasti juga bisa
menentukan kredensial yang dipakainya.
| `GET /folder` | daftar subfolder untuk penelusur folder kerja |

### Kenapa penelusur foldernya dilayani server

Browser sengaja **tidak** memberi path absolut dari `<input type="file">` maupun
`showDirectoryPicker()` — itu aturan keamanan browser, bukan kekurangan kita.
Dari sana yang didapat cuma nama folder dan path relatif, sedangkan `claude -p`
butuh path absolut untuk `cwd`. Jadi daftar foldernya diambil dari server lewat
`GET /folder`, yang hanya mengirim **nama direktori** — isi berkasnya tidak
pernah dibaca apalagi dikirim, dan endpoint-nya ikut dijaga token + cek `Origin`.

Tampilannya **dialog penuh layar**, bukan disempilkan di kolom panel yang cuma
selebar 290px. Isinya: breadcrumb yang tiap ruasnya bisa diklik, sidebar pintasan
(Home, folder server, daftar drive di Windows), kotak saring, dan kolom path yang
bisa diketik atau ditempel langsung.

| Aksi | Cara |
|---|---|
| masuk folder | dobel-klik, atau `Enter` di kolom path |
| pilih tanpa masuk | klik sekali, atau `↑`/`↓` |
| lompat ke induk mana pun | klik ruas di breadcrumb |
| cari cepat | ketik di kotak saring |
| tutup | `Esc`, tombol ✕, `Batal`, atau klik luar dialog |
| pakai | tombol **Pakai folder ini** |

Setelan izinnya longgar sesuai permintaan pemilik mesin: `bypassPermissions`,
semua tool aktif, `cwd` bebas ditentukan dari halaman. Yang tetap dipasang dan
tidak ditawar:

- **Prompt tidak pernah lewat shell.** Teksnya masuk sebagai satu elemen argv
  (`spawn` dengan `shell: false`), jadi tidak bisa disisipi perintah shell.
- **Token per-jalan + cek `Origin`.** Tanpa ini, situs web apa pun yang kebetulan
  kamu buka bisa mem-POST ke `localhost` dan menyuruh mesinmu bekerja — itu
  risiko yang ditimpakan pihak lain, bukan yang kamu pilih. Token hanya bisa
  dibaca lewat GET same-origin; situs lain boleh mem-POST tapi tidak boleh
  membaca balasan lintas-asal.
- **Batas 4 proses bersamaan** dan **timeout 15 menit**.
- **Gagal harus berisik.** Sesi yang tidak jadi lahir tidak akan memunculkan
  pegawai apa pun, jadi exit code dan stderr-nya dilaporkan ke log dan status bar
  — bukan menggantung diam.

### Sesi dari halaman ini tidak muncul di aplikasi Claude

Memang tidak akan. Yang dilahirkan halaman ini adalah proses **`claude -p`
headless** — anak dari server ini, bukan sesi milik aplikasi Claude di desktop.
Aplikasi desktop cuma menampilkan sesinya sendiri, jadi tugas dari sini tidak
akan pernah nongol di sana. Yang benar untuk dilihat: **pegawainya di ruangan**,
barisnya di panel kanan, dan daftar tugas berjalan di `GET /kendali`.

### Dua sumber untuk sesi dari halaman

Sesi terminal yang kamu jalankan sendiri terbaca lewat hook. Sesi yang
dilahirkan halaman ini terbaca **dua kali**: lewat hook seperti biasa, dan lewat
stdout-nya sendiri — dia dijalankan dengan `--output-format stream-json
--verbose`, jadi jalannya sesi mengalir baris per baris sebagai NDJSON ke server
ini.

Itu bukan pemborosan. Jalur hook untuk sesi headless punya tanggal kedaluwarsa:
`--bare` melewati hook sepenuhnya, dan dokumentasi Anthropic menyatakan dia akan
jadi default untuk `-p`. Sudah diuji juga bahwa di mode itu hook **tidak bisa**
dititipkan lewat `--settings` maupun `--plugin-dir` — kunci `apiKeyHelper` dari
berkas settings yang sama tetap dieksekusi, kunci `hooks` tidak sama sekali.
Kalau hari itu tiba, jalur hook untuk sesi headless mati total. stdout tidak
ikut mati.

Yang menentukan siapa yang bicara adalah hook mana yang datang duluan:

| Keadaan sesi | Yang menggerakkan ruangan | Yang disumbang stream |
|---|---|---|
| ada hook masuk | **hook** | biaya, percobaan ulang API, galat API |
| tidak ada hook sama sekali | **stream-json** | semuanya |

Pembagian itu wajib ada. Tanpanya satu panggilan tool terhitung dua kali —
sekali dari hook, sekali dari stream.

Tiga hal yang memang cuma bisa datang dari stream, karena payload hook tidak
pernah membawanya:

- **biaya setara sesi**, dari `total_cost_usd` di pesan `result`. Ditulis
  `setara $0,0298`, bukan `$0,0298`, dan itu disengaja: sesi headless yang
  memakai token dari `claude setup-token` berautentikasi lewat **langganan**,
  jadi yang terpakai kuota paket, bukan saldo API. Angkanya perkiraan sisi klien
  soal berapa pemakaian itu kalau ditagih lewat API. Tanpa kata "setara",
  pengguna langganan akan mengira baru saja dicharge padahal tidak
- **percobaan ulang API** (`api_retry`), lengkap dengan sebabnya — kena batas
  pemakaian, server penuh, tagihan
- **galat API** yang menghentikan giliran. Dia datang sebagai pesan asisten
  biasa yang ditandai khusus, jadi sebabnya terbaca **selagi sesinya masih
  jalan**, bukan setelah prosesnya mati

Pohon rapatnya juga lebih baik dari jalur hook: `parent_tool_use_id` menyebutkan
panggilan tool mana yang melahirkan sebuah pesan, jadi peserta rapat dari sesi
halaman tidak perlu ditebak sama sekali.

### Kalau tugasnya tidak pernah muncul

Sesi headless butuh kredensial sendiri. Kalau server dijalankan dari lingkungan
yang autentikasinya dibrokeri host (mis. dari dalam sesi Claude Code lain, atau
dari aplikasi Claude di desktop), proses anaknya akan menggantung tanpa keluaran.
Jalankan servernya dari terminal biasa tempat `claude` normal jalan, atau
siapkan token panjang umur:

```bash
claude setup-token
```

Gejalanya khas dan menyesatkan: pegawainya **muncul** di ruangan (itu dibuat oleh
`tugas-mulai` dari server sendiri), berdiri tenang dengan status *menunggu
arahan*, dan tidak pernah bekerja. Prosesnya memang lahir — yang tidak terjadi
adalah sesinya mulai, jadi tidak ada satu pun hook yang dikirim.

Kegagalan itu dulu diam selama 15 menit penuh sampai timeout. Sekarang server
memasang **penjaga bisu** 25 detik. Satu hook yang masuk membatalkannya, jadi
sesi yang sehat tidak pernah kena.

Sejak stream-json ikut dibaca, penjaga itu bisa membedakan dua diam yang dulu
dilaporkan sama:

| Yang diterima dalam 25 detik | Artinya | Yang dilakukan |
|---|---|---|
| hook | sesinya sehat | penjaga dibatalkan |
| tidak ada hook, tapi stream mengalir | sesinya jalan, hook-nya yang tidak ada — persis yang terjadi di mode `--bare` | dicatat di konsol sebagai keterangan, **bukan** peringatan |
| tidak ada hook maupun stream | sesinya memang tidak pernah mulai | `tugas-bisu` terbit merah di log, plus peringatan kredensial di konsol |

Baris kedua itu yang dulu salah. Sesi yang sebenarnya bekerja dengan baik tapi
kebetulan hook-nya tidak terpasang ikut dituduh gagal autentikasi, dan tuduhan
itu menunjuk ke arah yang sepenuhnya salah.

Satu jebakan yang pernah bikin peringatan ini berbohong: **payload hook yang
kebesaran**. Hook mengirim payload Claude Code apa adanya, termasuk
`tool_response`, jadi satu `Read` berkas besar gampang lewat setengah mega.
Batas lama 512 KB memotongnya tapi tetap meneruskan potongannya ke `JSON.parse`,
jadi yang muncul di konsol adalah

```
[agent-room] payload diabaikan: Unterminated string in JSON at position 508990
```

— pesan yang menunjuk ke arah salah, karena yang bermasalah ukurannya, bukan
payloadnya. Lebih buruk lagi: sesi yang menandai dirinya hidup lewat payload itu
jadi tidak pernah tertandai, sehingga penjaga bisu menuduhnya gagal autentikasi
padahal dia sedang bekerja. Sekarang batasnya 8 MB, pemotongan dilaporkan apa
adanya beserta ukurannya, dan `session_id` diselamatkan dari potongannya supaya
sesinya tetap dianggap hidup.

### Jebakan dua instalasi

Penyebab paling sering bukan kredensialnya, tapi **biner mana yang dipanggil**.
Satu mesin gampang punya dua instalasi sekaligus — mis. yang lama tertinggal di
`~/.local/bin` dan yang baru ikut aplikasi Claude di desktop — dan `where claude`
menemukan yang lama duluan. Versi lama bisa gagal **tanpa suara sama sekali**:
prosesnya lahir, stdout dan stderr kosong, lalu menggantung sampai timeout.
Versi baru menjawab apa adanya, mis. `Not logged in · Please run /login`.

Karena itu server sekarang mencetak versi biner yang dipakainya saat start:

```
[agent-room] memakai C:\Users\…\claude.exe (2.1.247 (Claude Code))
[agent-room] biner lain bisa ditunjuk lewat AGENT_ROOM_CLAUDE
```

Cara termudah menghindarinya: jalankan lewat `dinas`, yang memilih biner
tertinggi sendiri dan memberitahu kalau PATH menunjuk yang lain. Kalau tetap
mau menjalankan `server.mjs` langsung, perbarui instalasinya atau tunjuk yang
benar:

```bash
AGENT_ROOM_CLAUDE="C:\Users\…\claude-code\2.1.247\claude.exe" node server.mjs --izinkan-perintah
```

Uji tercepat sebelum menyalahkan agent-room — jalankan langsung di terminal yang
sama, tanpa melibatkan server:

```bash
claude -p "balas satu kata: siap"
```

Kalau itu pun diam atau menjawab `Not logged in`, masalahnya di CLI, bukan di
ruangan. Login dulu lewat sesi interaktif (`claude`, lalu `/login`) sampai
perintah di atas menjawab normal, baru jalankan ulang servernya.
