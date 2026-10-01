# Ruangan & pegawai

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Peta stasiun

| Stasiun | Tool | Yang kelihatan |
|---|---|---|
| Lemari arsip | `Read`, `Glob` | baca map manila, debu beterbangan |
| Filing kabinet | `Grep`, `ToolSearch` | laci ketarik, kaca pembesar |
| Meja printer | `WebFetch`, `WebSearch` | di bawah jendela, Monas di kejauhan |
| Meja stempel | `Edit`, `Write`, `Artifact` | CAP! stempel + cipratan tinta merah |
| PC server | perintah **git** (`git`, `gh`, `jj`, …) lewat `Bash`/`PowerShell` | rak besi: patch panel, dua server, storage, switch, UPS, kabel UTP menjuntai, APAR di sampingnya |
| Meja rapat | `Task`, `Agent`, `Workflow`, plus **kegiatan berpikir selagi ada subagent berjalan** | meja panjang bertaplak putih + rimpel hijau, 9 kursi, peserta undangan ikut duduk, ada yang bicara ada yang mencatat notulen |
| Ruang kadis | `Skill`, `SendMessage`, `mcp__*` | ketuk pintu bawa map disposisi; kalau bukaannya terbuka, pegawainya benar-benar masuk ke dalam (lihat **Ruang kadis**) |
| Meja kerja | `TodoWrite`, `AskUserQuestion`, **semua perintah shell non-git**, dan tempat pulang waktu menganggur | **7 meja** di baris depan, laptopnya menyala hanya di meja yang ditempati |
| Ruang tunggu | limpahan waktu empat meja penuh | berdiri ngopi dekat dispenser — baris depan tengah |

Arahan baru dari kamu (`UserPromptSubmit`) memanggil pegawainya ke **meja rapat**
untuk menerima briefing. Tool yang tidak dikenal jatuh ke meja kerja; apa pun
berawalan `mcp__` menghadap kepala dinas. Kalau 7 detik tidak ada event,
pegawainya balik ke **meja kerjanya sendiri**, bukan ke ruang tunggu — ruangan
yang orangnya sibuk di mejanya masing-masing lebih enak dilihat daripada ruangan
yang orangnya antre. Ruang tunggu tinggal jadi limpahan: dipakai hanya kalau
empat meja sudah terisi semua, dan begitu ada meja yang kosong, yang menunggu
langsung dipanggil balik.

**Menyadap MCP sampai nama servernya.** Tool MCP bernama
`mcp__<server>__<tool>`, dan sebelumnya server cuma tahu "ini MCP". Sekarang
`normalize()` memecahnya sekali: `ev.mcpServer`, `ev.mcpTool` (pola tidak
cocok → dua field itu tidak ada, bukan tebakan), dan label bawaannya
`<server> · <tool>` — `Claude_Browser · navigate`, bukan string pertama dari
input-nya. Halaman menyusun kegiatannya dari nama tool yang sama:
"berkoordinasi dengan Claude Browser · navigate". `PostToolUse` MCP yang
`duration_ms`-nya lewat 8 detik ditandai `lambat: true` (ikut ke agenda) —
tool luar yang lelet itu informasi, bukan kesalahan pegawainya. Buku induk
menambah tabel `mcp: { <server>: jumlah }` per proyek, dibatasi 20 kunci,
sisanya `(lain)`. Loket per server di kanvas sengaja belum: semua MCP masih
menghadap kepala dinas.

**Kongsi seproyek.** Dua sesi nyata yang `cwd`-nya sama (cabang git boleh
beda) duduk bersebelahan: waktu salah satunya kebagian meja kerja, yang dipilih
bukan urutan prioritas `MEJA_KERJA_X`, melainkan meja kosong yang paling dekat
ke meja rekannya (`slotKongsi`). Alasannya sama dengan kantor sungguhan — orang
yang mengerjakan berkas yang sama duduk berdekatan supaya bisa saling lirik.
Keputusannya cuma diambil saat penugasan slot; meja yang sudah ditempati tidak
pernah digeser, jadi kursinya stabil dan penonton tidak melihat orang pindah
meja tanpa sebab. Sesekali (±20–40 detik) dua rekan yang sama-sama menganggur
saling menoleh sebentar, satu dari lima kali sambil bertanya pendek soal
branch. Itu bukan event acak: tidak masuk log, tidak menaikkan statistik, dan
batal seketika begitu tool call datang. Beda proyek tetap asing.

**Antrean stasiun.** Stasiun punya kapasitas (PC server 4 slot, meja rapat 9
kursi, meja kerja 7). Dulu yang kelima berdiri berimpit di slot pertama;
sekarang dia **mengantre** di lajur di belakang stasiun — berjarak 10 px,
paling banyak tiga yang kelihatan — dengan pose berdiri biasa menghadap
stasiunnya, bukan pose butuh manusia. Begitu ada slot kosong, yang paling
depan maju sendiri dan yang di belakangnya merapat. Secara logika dia tetap
`work` (tool call-nya memang sedang jalan), jadi kartu dan statistik tidak
berubah; yang antre cuma posisinya (`antre`, `tickAntre`). Yang datang
belakangan tidak pernah menyalip antrean yang sudah ada.

**Ritual pulang.** `SessionEnd` tidak lagi menghapus pegawainya di tempat.
Sesi yang tuntas (sudah `Stop`, tidak sedang menunggu siapa pun) berjalan ke
mesin absen, berhenti 0,6 detik menempel jari, lalu keluar lewat tepi kanan
lajur atas dan hilang; kalau ada rekan seproyek yang menganggur, dia singgah
sedetik untuk salaman (saling hadap) dulu. Slot mejanya dilepas **begitu
berangkat**, bukan setelah hilang — laptopnya padam saat itu juga, dan orang
lain boleh langsung menempati. Jatah seluruh ritual 6 detik dan diukur di
muka: yang tidak muat dibuang dari belakang (salaman dulu, lalu absennya —
dari meja paling kiri mesin absen ±10 detik jauhnya, jadi dia langsung keluar
lewat tepi terdekat). Sesi yang mati mendadak — `SessionEnd` tanpa `Stop`,
masih memegang tugas, atau dihapus dari panel — tidak berritual: hilang
langsung seperti dulu.

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
Pemicu keenam datang bukan dari hook: sesi lahiran halaman yang lahir dengan
`paraf:true` mengajukan izinnya lewat `POST /izin/tanya`, dan untuk itu
kartunya menawarkan tombol Paraf/Tolak yang sungguhan (lihat **Paraf dari
ruangan** di Kendali web).

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

### Nota dinas keluar (webhook)

Dua keadaan di atas — plus **tugas bisu** dari kendali web — sama-sama berarti
ruangan berhenti sampai ada orang yang datang, dan orang itu sering sedang
tidak menatap halamannya. Untuk itu server bisa mengirim **nota dinas keluar**:
satu POST JSON kecil ke URL yang kamu tunjuk, dibaca langsung oleh Slack,
Discord, atau gateway bot Telegram.

```bash
AGENT_ROOM_LAPOR=https://hooks.slack.com/services/… node agent-room/server.mjs
```

Kosong berarti mati, dan itu bawaannya. Yang dikirim:

| Field | Isi |
|---|---|
| `jenis` | `izin-minta` (butuh manusia, apa pun sebabnya), `stop-gagal` (macet), `tugas-bisu`, atau `selesai` |
| `sesi`, `nama`, `proyek`, `cabang`, `model` | identitas pegawainya — proyek cuma nama folder, bukan path |
| `sebab` | `izin`/`tolak`/`tanya` untuk butuh manusia; jenis galat untuk macet |
| `alasan` | label tool atau pesan galat, dipotong 200 karakter |
| `ts`, `alamat` | waktu, dan `http://127.0.0.1:PORT` supaya kamu tahu ruangan mana |
| `text`, `content` | satu kalimat yang sama, mis. `🙏 Menunggu paraf: Budi (agent-room@master) — Bash: npm test` — Slack membaca `text`, Discord `content` |

Yang **tidak pernah** ikut: `pikir`, `ucap`, dan prompt. Ini metadata saja,
dan kind-nya sengaja tidak ada di daftar pemicu. Tiap sesi+jenis dijeda 30
detik supaya rentetan izin dari satu sesi jadi satu kabar, bukan sepuluh.
Kirimannya dibatasi 5 detik; gagal kirim tidak pernah mengganggu ruangan —
satu baris peringatan di konsol paling banyak semenit sekali, sisanya diam.
`AGENT_ROOM_LAPOR_SELESAI=1` menambahkan kabar `selesai` untuk `Stop` dan
tugas kendali web yang habis, kalau kamu memang mau ditelepon waktu semuanya
beres.

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

**Transisi duduk & jeda tiba.** Tiba di stasiun tidak langsung berpose kerja:
ada jeda antisipasi 150 ms — `state`-nya sudah `work` (kartu dan statistik
tidak bergeser), cuma gambarnya yang menunggu (`poseKerja`). Di kursi rapat,
duduk dan berdiri bukan teleport: badannya turun 2 px per frame, tiga frame,
±150 ms (`turunDuduk`), dan bangkitnya kebalikannya sambil melangkah pergi.
Dua-duanya dilewati kalau pegawainya sedang beku atau event acak sedang
mengatur posenya, dan tidak menggeser jam event apa pun — `pada(E, t, …)`
tetap dibaca dari umur event, bukan dari pose.

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

## Ruang kadis

Selama ini pegawai yang menghadap kepala dinas cuma berdiri **di depan pintu**
dan mengetuk. Sekarang ruang kadis punya wujud: sebuah **bukaan berbingkai di
dinding sayap timur** yang tersibak begitu ada yang menghadap, dan pegawainya
benar-benar pindah ke dalamnya.

**Bukaan, bukan lantai dua, dan bukan dunia yang diperlebar.** Kotak bukaan itu
wilayah dunia 480×356 yang sama — koordinat di dalamnya koordinat biasa. Itu
sebabnya kamera, `keLayar`/`dariLayar`, `kameraTampak`, `agenDiTitik`,
`taruhKartu`, sorot, dan balon DOM semuanya langsung benar tanpa satu baris pun
diubah di sana.

Melebarkan dunia sempat dipertimbangkan dan ditolak, dengan alasan yang konkret:
lebar dunia dipakai puluhan berkas event sebagai arti "tepi kanan ruangan",
selubung malam menutup selebar dunia (jadi dunia yang lebih lebar akan terbelah
siang/malam), dan titik pintu keluar dihitung dari lebar dunia — melebarkannya
menaruh pintu itu di dalam tembok.

Belakangan dunia **memang** dilebarkan (ke 576, lihat **WC, dan dunia yang
dilebarkan ke kanan**), dan itu tidak membatalkan alasan di atas: yang ditolak
adalah menaruh ruang kadis di lahan tambahan yang *bertembok*. Sayap yang
ditambahkan belakangan justru lantai terbuka yang menyambung ruang utama, jadi
"tepi kanan" tetap tepi kanan, selubung malam tetap satu, dan pintu keluar
jatuh di lantai, bukan di tembok.

**Letaknya tidak ditebak.** Kotak yang diusulkan rancangan (154×94 di x284)
ternyata menimpa 9.165 piksel milik 17 perabot berbeda — yang terbesar rak PC
server, stasiun yang dipakai tiap hari. Jadi yang dicari adalah **persegi kosong
terbesar** di pita dinding itu: 73×46 di x289..362, y33..79. Satu kolom
dikembalikan kepada ekor cicak `cicak-jatuh-ke-berkas` yang lewat di kolom 289
selama ±70 ms, sehingga bukaan yang dipakai adalah **72×46 di x290..362**.
Batas kerasnya dijaga `uji-sisip.mjs` dengan sapuan piksel sungguhan, bukan
dengan mata.

Satu penyimpangan dari rancangan dicatat apa adanya: rancangan menyebut "jendela
kaca di samping pintu", tapi dinding antara rak server dan pintu kadis sudah
penuh — celah terlebar di sana cuma 16×8 px. Jadi bukaan ini berada 78 px di
kiri pintu kadis, dan yang menyambungkannya ke pintu itu bukan kusen melainkan
isinya.

Setelannya tiga keadaan, di panel setelan:

| Setelan | Perilaku |
|---|---|
| `auto` *(bawaan)* | bukaan tersibak sendiri begitu ada yang menghadap kadis, lalu menutup setelah ruangannya kosong |
| `selalu` | dibiarkan terbuka terus |
| `mati` | tidak pernah terbuka — pegawai berhenti di ambang pintu seperti sebelum fitur ini ada |

`?ruang=kadis` mengunci setelan `selalu` lewat URL dan `?ruang=mati` mengunci
`mati`, tanpa menulis ulang setelan tersimpan — pola yang sama dengan
`?kamera=`. Mengklik bukaan yang sedang terbuka membidikkan kamera ke dalamnya;
klik lagi untuk melepas.

Seberapa "persis" perilaku lama itu di setelan `mati` bukan klaim melainkan
ukuran: dindingnya nol piksel berbeda dari ruangan sebelum fitur ini ada,
diukur seluruh kanvas di tiga jam berbeda, dan sembilan titik sentuh lainnya
ikut diam. Satu hal memang **tidak** ikut mati, dan disebut supaya tidak ada
yang mengira `mati` berarti nol jejak: tempat berdiri antrean di depan pintu
kadis sekarang 440/452/464, tidak lagi menyebar ke kiri sampai x=357. Itu
tambalan cacat lama yang berdiri sendiri, bukan bagian dari bukaan.

**Jangan tertukar dengan `?kadis=1`.** Itu **mode HP** berupa daftar teks
(lihat **Mode kadis** di bawah), kanvasnya justru disembunyikan, dan sama sekali
bukan ruangan. Parameter bukaan ini `?ruang=`, bukan `?kadis=`. Di mode HP
bukaan tidak pernah ada, jadi pilihan setelannya sengaja dimatikan alih-alih
pura-pura bisa dipilih.

## Pantri, dan sekat yang akhirnya jadi dinding

Pantri menempati pojok kanan-depan (`x510..574`, `y196..288`) di balik sekat
kayu rendah: satu panel di belakang, satu panel di sisi kiri. Lama tapaknya
`x414..478`; sejak dunia dilebarkan ke 576 ia digeser +96 ke pojok kanan yang
baru — tepat sejauh tepi kanannya bergeser (lihat **WC, dan dunia yang
dilebarkan ke kanan**). Angka-angka di bawah ini ditulis dalam **denah lama**,
karena begitulah event menyebutnya: `pantriX(466)` menerjemahkan "dispenser di
x466" ke letak pantri sekarang, dan `sortY` prop-nya tetap dikunci golden
z-order.

Yang berubah: sekat itu dulu **cuma gambar**. `route()` tidak punya pengertian
rintangan sama sekali, jadi setiap kaki yang menuju pantri menembus kayunya di
lajur bawah `y=252`. Diukur dengan memanggil `route()` yang asli untuk lima
titik asal × dua belas tujuan pantri yang benar-benar dipakai event: **60 dari
60 jalur menembus**. Penulis event sudah menghindarinya satu per satu dengan
tangan — di `public/event/` masih ada komentar "berhenti sebelum sekat pantry
(x414)", "berakhir di x=404, aman dari sekat kiri pantry", "x=452 tidak bisa:
pantry menempati x414..478". Beban itu ada di orang, dan orang berikutnya pasti
lupa.

Sekarang pantri punya **pintu** (`y256..280` di panel kiri) dan router yang
memakainya. `PANTRI` di kepala `room.js` adalah satu-satunya sumber angkanya:
`drawPantry()` menggambar sekat dan kusen dari situ, dan `route()` menghindar
dari situ juga — pintu yang digeser di gambar ikut menggeser jalur kakinya.
Tiga cabang menutup semua arah:

- **masuk** (`masukPantri`) — rute biasa sampai depan pintu (`x=404`), lewat
  kusen, baru cari titiknya di dalam;
- **keluar** (`keluarPantri`) — cermin dari itu;
- **memutar** (`memutarPantri`) — untuk tujuan di lantai **bawah** sekat
  (`y>288`, `x>414`), yang dulu ditempuh dengan menembus sekat lalu
  menyeberangi ruang pantri. Kolom memutarnya `x=380`, bukan `x=404` seperti
  pintunya: turun di 404 berarti menginjak kaki kipas berdiri (`x390..410`).

Sisi **depan** pantri sengaja dibiarkan terbuka, bukan lupa dipagari: dalam
proyeksi miring ini pagar depan akan menutupi isi pantri sendiri, dan pantri
ini barang tontonan — harus bisa dilihat ke dalamnya. Itu tidak membuat
pintunya mubazir. Semua lalu lintas ke pantri datang dari lajur bawah
(`y=252`), yang berada di **atas** tepi depan pantri (`y=288`), jadi pintu kiri
memang selalu jalan masuk terdekat; tidak ada yang pernah melewati sisi
terbukanya lalu memutar. Yang lewat di bawahnya cuma jalur `memutarPantri`,
dan mereka memang bukan sedang menuju pantri.

Ambang pintunya `y=272`, dan itu **bukan** titik tengah bukaan (268). Angkanya
harus lebih besar dari `sortY` prop pantri (270), kalau tidak orang yang sedang
berdiri di ambang digambar di belakang sekatnya sendiri dan terbaca tertelan.
`uji-pantri.mjs` mengunci ketiganya: tidak ada ruas jalur yang menembus kayu,
pintunya benar-benar dilewati (dinding yang menyegel semua jalan juga akan
lolos pemeriksaan "tidak menembus"), dan ambangnya di depan `sortY`. Tujuan
yang disapunya **dipindai** dari `goToXY()` literal di `public/event/*.js`,
jadi event baru yang menaruh orang di pantri otomatis ikut teruji.

Rupanya ikut dibenahi bersama sekatnya. Sebelumnya dua pita kayu satu nada plus
satu kotak abu setinggi 15 px — kebaca sebagai bingkai dengan perabot di
dalamnya, bukan sebagai ruangan. Sekarang: tiap panel punya pucuk yang kena
lampu, muka, kaki yang masuk bayangan, dan bayangan yang dijatuhkannya ke
lantai; counter dipecah jadi meja granit (dilihat dari atas) dan lemari bawah
berlaminasi pucat (dilihat dari depan) — sengaja **bukan** kayu, karena dua
cokelat bertumpuk membuat lemarinya terbaca sebagai bagian dari sekat dan
counter-nya melayang lagi; wastafelnya bak tertanam dengan rim terang dan
lubang buangan, bukan kotak gelap yang ditempel; dan yang dulu disebut "oven"
digambar sebagai apa yang bentuknya memang: microwave meja.

Lantai di dalam pantri dibuat keramik 12 px, beda dari terazo 24 px sisa
ruangan, dan digambar di **lapisan lantai** — bukan di `drawPantry()`. Prop
pantri ber-`sortY` 270, jadi lantai yang ikut digambar di sana akan menimpa
siapa pun yang berdiri di `y<270`. Orang mengenali batas sebuah ruangan dari
lantainya sebelum dari sekatnya, dan itu yang paling murah membuat pantri
terbaca sebagai ruang lain alih-alih sebagai perabot yang berkumpul di pojok.

## WC, dan dunia yang dilebarkan ke kanan

Kantor ini akhirnya punya WC. Pintunya di **pojok kiri dinding belakang**
(`WC` di kepala `room.js`: kusen 24×80 di x0..23, y30..110) — cermin pintu kadis di
pojok kanan. Letaknya bukan soal selera: itu satu-satunya bidang dinding yang
masih kosong dari bawah papan nama sampai lantai. Kotaknya disapu seperti
bukaan kadis — `drawWall` di kelima tema, 27 PROPS, 166 hook gambar event,
umur 0..30 detik tiap 0,05 — dan yang menyentuhnya cuma bayangan papan nama
(berhenti y=27), lemari arsip (mulai x=24), cicak-jatuh yang merayap di kusen
(digambar sesudah dinding, jadi di atas pintu, tidak tertimpa), tikus di
lantai, dan dua sapuan cahaya malam yang memang harus lewat.

Rupanya sengaja **bukan** pintu kayu seperti kadis, supaya tidak terbaca ruang
pejabat kedua: kusen aluminium, daun PVC biru muda beralur dengan kisi-kisi di
bawah, plang biru pria · WC · wanita yang disekrup di daunnya, dan slot
ISI/KOSONG di bawah gagang. Dua tanda "ada orangnya" lagi yang terbaca tanpa
membaca huruf: kisi-kisinya berpendar lampu dari dalam, dan **sandal jepit** di
depan pintu hilang — dipakai masuk.

Yang memakainya cuma **pegawai standby**: tiap kali memilih tujuan
mondar-mandir, 1 dari 10 kesempatan dia ke WC (kalau kosong), berdiri di
ambang, pintunya terbuka, dia memudar ke dalam, dan 8–18 detik kemudian keluar
lagi menghadap ruangan. Itu rutinitas di `class Standby` (`keWC`/`tickWC`),
sekelas notulen — bukan event acak, tidak masuk log, tidak menaikkan statistik.
Selama di sana dia `adaTugas` (event, apel, dan notulen tidak meminjam orang
yang sedang di toilet) dan `betah` (jam menganggur tidak menyuruhnya balik ke
meja dari dalam WC). **Sesi nyata tidak pernah ke WC**: tempatnya waktu
menganggur adalah mejanya, dan tool call tidak boleh menunggu orang yang sedang
di dalam (Aturan 1). Akibatnya, dengan empat sesi nyata atau lebih — tidak ada
standby — WC-nya selalu kosong.

**Dunia dilebarkan dari 480 ke 576**, satu bentang pilar (garis pilar dinding
tiap 96 px, jadi sambungannya jatuh tepat di pilar x=480). Arahnya ke **kanan**,
dan itu satu-satunya arah yang aman: semua koordinat lama — ratusan literal di
`public/event/*.js`, golden z-order, golden bukaan kadis — tetap berlaku apa
adanya. Sebelum mengubahnya, disapu dulu koordinat mati di atas x=480
(`goToXY`, `spawn`, `x:`, pasangan `(x, y)`, perbandingan `x > 4xx`): nol. Semua
yang berarti "tepi kanan" — tamu masuk di `W + 16`, pintu keluar `PINTU_X`,
penjaga "masih di layar" — sudah ditulis dengan `W`, jadi ikut pindah ke tepi
baru. Yang berubah karenanya:

- pintu keluar ritual pulang ±170 px dari mesin absen (dulu ±60) — ±3,3 detik,
  masih muat di jatah 6 detik bersama absennya;
- tamu dari kanan berjalan ±96 px lebih jauh; adegan mereka menunggu tiba,
  bukan berpatokan detik, jadi urutannya tidak bergeser;
- lampu neon jadi **tiga**: tabung ketiga di plafon sayap timur (`NEON_X`
  170 · 410 · **530**). Semua yang menggambar cahaya sudah melingkari
  `NEON_X`; yang harus diubah cuma penulis `MOD.neonMati` sebagai array utuh —
  tiga event pemadaman yang dulu menulis `[1, 1]` kini memakai
  `neonSemua(v)`, dan `kedipNeon()` membaca tabung yang tidak disebut sebagai
  0, bukan NaN. `neon-sebelah-mati` memilih dari ketiganya dan meredupkan
  wilayah terdekat ke tabung itu (x0..290 · 290..470 · 470..576, titik tengah
  antar-tabung), bukan lagi belahan x=240.

Tiga perabot lalu mengisi lahan barunya.

**Pantri pindah ke pojok kanan** (`PANTRI.x` 414 → 510), tepat +96, jadi
letaknya terhadap dinding kanan identik dengan dulu. Yang sulit bukan
gambarnya — `drawPantry()` sudah relatif terhadap `PANTRI.x` — melainkan
58 angka mati di 12 berkas event yang menaruh orang, uap, dan barang di
dalamnya. Angka itu dibiarkan terbaca dalam denah lama dan dibungkus
`pantriX()`, jadi pemindahan berikutnya cukup mengubah satu angka. Buktinya
dua sapuan yang menjalankan seluruh 337 event dari `mulai` sampai `selesai`
tiap 0,1 detik sambil mencatat `goToXY`, `spawn`, dan gambar: sebelum pindah
23 event berurusan dengan kotak pantri lama; sesudahnya yang tersisa di kotak
lama cuma kipas, meja 444, lajur pel, dan tamu yang lewat, sementara semua
benda pantri muncul utuh di kotak baru. `uji-pantri.mjs` ikut membaca bentuk
`goToXY(pantriX(…), …)` — cakupannya tetap 12 tujuan seperti sebelum pindah.
Kolom memutarnya kini `x=500` (kolom pintu): kipasnya tidak ikut pindah, jadi
kolom itu sudah bebas perabot.

**Meja kerja ke-7** di `x=510` (papan x478..542), satu-satunya yang muat di
sayap baru — baris depan dengan itu penuh. Indeksnya 6, ditaruh di ujung
`MEJA_KERJA_X` seperti aturan lama. "Meja pojok" yang dulu dikunci sebagai
indeks 3 (x444) oleh wifi-sudut-lemah dan sales di 29-gel4-b sekarang
`MEJA_POJOK` — meja paling kanan, dihitung. Koridornya persis menyusur muka
sekat kiri pantri, jadi `route()` punya satu aturan kecil: titik di muka
sekat didekati lewat kolom `PANTRI_LUAR`, baru menyamping di garis kakinya.

**Pintu kadis jadi pintu dua daun**, 48×86 di `x440..488` (dulu satu daun
34×82 sampai x474), diperbesar ke kanan dan ke atas. Tepi kirinya sengaja
tetap: ambang `(452,140)`, slot antre 440/452/464, keset, dan gambar event
yang menempel di daunnya semuanya dihitung dari tepi itu.

Sisa lahan kosong: dinding x488..576 dan lantai tengah-kanan bekas pantri.

Satu benturan kecil dengan WC ikut dibereskan: dus tambahan lemari arsip
(saat `arsipPenuh`) dulu digambar di **kiri** lemari, x0..42 — persis kaki
pintu WC. Sekarang di depan lemari, sesuai keterangan `RUANGAN.dusTambahanArsip`.

### Perabot pengisi ruang kosong

Sesudah pelebaran, sisa ruang kosong diisi — dan "kosong" di sini **diukur,
bukan dikira**. Peta keterisian dibuat dengan membandingkan piksel dinding+lantai
polos terhadap piksel semua perabot, lalu ditumpangi 65.280 rute `route()`
sungguhan (antar semua slot stasiun, kursi rapat, ruang tunggu, WC, pantri,
pintu keluar, dan setiap tujuan `goToXY` literal di registri event) selebar
badan pegawai. Yang boleh diisi hanya sel yang kosong **dan** tidak pernah
dilewati badan siapa pun; tiap calon kotak lalu disapu lagi terhadap gambar dan
langkah semua event (umur 0..30 detik).

| Tempat | Perabot | Catatan dari sapuan |
|---|---|---|
| dinding sayap timur | papan pengumuman, kotak P3K | bersih |
| lantai sayap timur (dasar y120) | mesin fotokopi, lemari kaca piala | bersih |
| dinding antara jendela & bukaan kadis | papan kinerja harian | x258..285: gorden kanan melebar sampai x252, bayangannya harus berhenti sebelum SISIP (x290) |
| dinding atas papan visi | poster BerAKHLAK | mulai y43: `rapat-pimpinan-dadakan` menarik garis di y40 |
| lantai kiri-tengah | bangku tunggu besi, rak brosur | berhenti di x96 & dasar y202: `bagan-di-flipchart` memasang flipchart di x95..123 y207..246 |
| lantai kanan-tengah | akuarium arwana, sofa tamu & meja kopi, palem, tiang hand sanitizer | sofa mulai x398: `patch-panel-dilabeli` berdiri di (390,176) |
| samping meja 444 | tempat sampah pilah | di antara lajur pel OB (y262) dan layar meja 444 (y300) |
| pojok kanan bawah | mesin penghancur kertas | mulai y316: tiga event berdiri di (546..548,300) |

Satu kantong **dicoret**: lantai kiri bawah x94..128 y266..310 — sekitar 40
event menaruh orang di depan meja 86 dan memercik balon di sana. Yang tersisa
kosong sesudah dua putaran (±1.300 dari 5.280 sel) hampir seluruhnya jalur
jalan: lajur atas, lajur bawah, koridor turun ke meja, dan ruang tunggu.

Dua yang hidup: **papan kinerja** menggambar delapan batang, satu per
stasiun, dari tool call yang jatuh ke sana sejak halaman dibuka
(`tapakStasiun`) — yang tertinggi merah, garis putus merah = "target 80%".
**Mesin fotokopi** menyalakan lampu pindai dan mengeluarkan lembar selagi ada
yang berdiri di depannya; pegawai standby mampir ke sana sesekali (8% tiap
memilih tujuan), dan jam menganggur memulangkannya ke meja seperti biasa.
Semuanya bisa diklik (zoom + kartu inventaris), dan golden z-order cuma
bertambah label barunya: tanpa label itu urutan ke-18 kasusnya identik dengan
sebelum perabot ini ada.

### Tiga kejadian baru dari sisa katalog: kursi, lorong, kucing

Papan skor `uji-katalog.mjs` sempat menunjuk enam id "murah" (`layak`/
`layak-dengan-catatan`) sebagai kandidat berikutnya. Digali satu-satu, empat
di antaranya ternyata sudah selesai lewat jalan lain dan sengaja tidak
disentuh lagi: `hujan-deras`/`hujan-petir-kedip` kalah sama cuaca sungguhan
(`CUACA`, lihat "Hujan ikut cuaca sungguhan" di bawah — memaksanya jadi event
acak bikin log "hujan turun/reda" berbohong), `cicak-berburu-di-neon` dobel
sama `cicak-di-dinding`, dan `sobek-kalender-dinding` dobel sama
`kalender-dinas-diganti` (gelombang 1). `apel-pagi` malah sudah lengkap —
cuma dibangun sebagai ritual harian sendiri (`APEL_PAKSA` dkk, bukan
`daftarEvent()`), jadi papan skor menghitungnya "belum" padahal ada — sama
persis seperti yang sudah dicatat di bagian katalog.

Yang beneran kosong cuma tiga, dan ketiganya sengaja dipangkas ke versi
murah — catatan teknis di `event-acak.json` sendiri yang menyarankan begitu,
bukan keputusan sepihak di sini:

- **Kursi kurang ditarik** (`kursi-tambahan-ditarik`) — bukan `daftarEvent()`
  sama sekali, tapi rutinitas `class Standby` sekelas WC/notulen: begitu
  jumlah sesi nyata melebihi jumlah meja kerja (`MEJA_KERJA_X.length`) selama
  25 detik tanpa putus (`ramaiSejak`, dihitung tiap frame di `tickRuangan`
  seperti `CUACA.hujanTinggiSejak`), satu standby menyeret kursi rapat jauh
  terakhir ke celah kosong baris meja kerja (`KURSI_TAMBAHAN`, x=250 y=316).
  Kursi itu memang lenyap dari meja rapat — `slotBebas('rapat', ...)` dan
  `kursiKosong()` sama-sama memblokir indeksnya, bukan cuma kosmetik — dan
  kembali sendiri kalau lengang 60 detik (`sepiSejak`). Rancangan aslinya
  minta kursi ini juga direbut paksa begitu rapat kekurangan kursi; itu
  sengaja tidak dibuat supaya tidak menyentuh jalur kursi peserta rapat yang
  sudah dipakai belasan event lain.
- **Ngobrol di lorong** (`ngobrol-di-lorong`) — sepupu `ngobrol-di-dispenser`,
  berdiri persis di mulut koridor (LANE_DOWN x=196/214). Rancangan aslinya
  minta `route()` memutar semua orang lewat LANE_UP; catatan tekniknya sendiri
  menolak itu (perjalanan think→think tidak pernah punya alternatif lajur,
  dan `route()` dipakai tiap perpindahan tanpa tes) — jadi cuma dua orangnya
  yang menggeser badan 8px kalau ada yang lewat, bukan mengatur ulang jalur
  siapa pun. Bubar sendiri kalau `inspeksi-mendadak` mulai.
- **Kucing tidur di karpet** (`kucing-tidur-di-karpet`) — ketiga dari keluarga
  kucing (setelah `kucing-kantor` yang jalan lewat dan `kucing-tidur-di-rak-
  server`), muncul kalau kursi rapat hampir semuanya kosong. Rancangan
  aslinya juga minta titik singgah baru di `route()`; catatan tekniknya
  menyebut ini "mahal dan berisiko" karena alasan yang sama, jadi dipangkas
  ke `pemeranDekat()` seperti `kucing-kantor` — cuma satu orang terdekat yang
  menyimpang menghindarinya, bukan seisi ruangan.

## Gudang ATK & arsip, dan dunia yang dilebarkan lagi

Bentang pilar pertama (x480..576, lahan ekspansi dari pelebaran WC) sudah
penuh — pantri, meja ke-7, dan perabot pengisi persis mengisinya sampai
x574. Jadi ruangan baru berikutnya butuh lahan baru lagi: **dunia dilebarkan
dari 576 ke 672**, satu bentang pilar lagi, dengan alasan dan cara yang
identik dengan pelebaran pertama (lihat *WC, dan dunia yang dilebarkan ke
kanan* di atas) — disapu dulu untuk koordinat mati di atas x=576 (nol,
sama seperti sapuan x=480 sebelumnya), semua yang berarti "tepi kanan"
ditulis dengan `W` jadi ikut pindah tanpa disentuh, dan bentang lama
tidak bergeser satu koordinat pun.

Ruangan barunya: **gudang ATK & arsip**, pintu kedua di dinding belakang
(`GUDANG` di kepala `room.js`: kusen 32×80 di x608..640, y30..110 — margin
32px simetris dari kedua pilar bentang kedua). Polanya **disalin persis dari
WC** — rutinitas kecil di `class Standby` (`keGudang`/`tickGudang`/
`selesaiGudang`), bukan event acak, sesi nyata tidak pernah ke sana — tapi
rupanya sengaja beda supaya tidak terbaca WC kedua: daun metal abu-hijau tua
dengan strip hazard kuning-hitam (bukan plang huruf — "GUDANG" enam huruf di
5px cuma jadi gumpalan, beda dari "WC" yang dua huruf), dan gembok gantung
sebagai pengganti slot ISI/KOSONG — tertutup waktu kosong, terangkat terbuka
waktu ada orangnya. Kardus kosong di depan pintu (`drawDusGudang`) hilang
kalau terisi, sama fungsinya dengan sandal jepit WC.

Peluangnya 8% tiap standby memilih tujuan mondar-mandir (WC 10%, fotokopi
8%), lebih singkat di dalamnya (5–11 detik, WC 8–18 — ambil ATK lebih cepat
dari ke toilet), dan pulangnya bawa kardus (`a.bawa = 'kardus'`, dipakai
ulang dari `drawBawaan`, bukan bawaan baru). Bisa diklik seperti semua
perabot lain: zoom + kartu inventaris, kode BMN `1.03.01.01.019` satu
keluarga dengan pintu WC (`1.03.01.01.014`).

### Pojok baca ASN — perabot, bukan ruangan berpintu

Sudut literasi di **pojok kanan lantai** (`BACA` di kepala `room.js`,
x582..670 y172..248), sebelah sekat pantri: rak buku rendah dua susun, rak
koran & majalah di sebelahnya, karpet anyaman biru, meja lesehan rendah, dan
**tiga bantal duduk** berjajar. Sengaja **bukan** bukaan berdinding seperti
WC/gudang — tidak ada dinding baru, tidak ada daun pintu, tidak ada fase
memudar masuk/keluar.

**Letaknya tidak ditebak.** Kotak itu disapu dengan cara yang sama seperti
bukaan ruang kadis (`PROPS` + `drawFloor` + seluruh `gambarProp`/
`gambarDinding`/`gambarLantai`/`gambarAtas` registri event, umur 0..14 detik
tiap 0,02): **nol piksel** milik perabot lama. Batasnya lajur jalan semua,
bukan selera: atas `LANE_UP` (164, lajur pulang ke `PINTU_X`), bawah
`LANE_DOWN` (252), kiri panel kanan sekat pantri (`PANTRI.x1` 574) + 8 px,
kanan tepi dunia (`W` 672). Pita yang sama di ujung KIRI sudah lama dipakai
karpet meja rapat — jadi ini bukan pola baru, cuma ujung kanannya yang
sampai kemarin dibiarkan kosong.

Karpet, meja lesehan, dan bantalnya digambar di **`drawFloor`**
(`gambarKarpetBaca`), persis seperti karpet meja rapat: yang duduk atau lewat
di atasnya menutupinya, bukan tertutup olehnya. Yang tersisa sebagai prop
ber-`sortY` cuma dua raknya — dan **tingginya sengaja cuma 12..14 px** dengan
puncak y172. Bukan selera juga: garis kaki lajur pulang 164 dan badan yang
lewat digambar KE ATAS dari situ, jadi lemari buku setinggi orang akan
memakan kaki tiap pegawai yang berjalan ke pintu keluar. Rak rendah juga yang
benar untuk sudut lesehan — bisa dijangkau sambil duduk.

Standby yang mampir (`keBaca`/`tickBaca`/`selesaiBaca`, 8% tiap memilih
tujuan mondar-mandir, 8–16 detik) duduk lesehan dengan buku di pangkuan:
pose `'dudukLantai'` + `bawa 'buku'`, dua-duanya pola yang sudah ada, bukan
pose baru. Tiap 7 detik badannya tegak sedetik — isyarat ganti halaman.
Pulangnya **bukunya ikut dibawa ke meja** (`bawaSampai` 9 detik), pola yang
sama dengan kardus ATK dari gudang: yang ditinggal rutinitas ini bukan cuma
ingatan, tapi barang.

**Penghuninya jamak.** `bacaKeadaan.penghuni` adalah ARRAY, bukan satu orang:
`bacaTempati()` memberi bantal bebas pertama (x598, 622, 646 — garis kaki
228) dan `bacaLepas()` mengembalikannya, dipanggil juga dari `destroy()` di
`class Agent` supaya pegawai yang pamit di tengah baca tidak mengunci
bantalnya selamanya. Kartu inventarisnya ikut: kondisinya `DIPAKAI 2/3`,
isinya daftar nama yang sedang membaca plus jumlah lembar kliping yang sudah
dijilid (`RUANGAN.arsipKlipingLembar`, angka yang sudah ada — pojok baca
membacakannya, tidak menambah state baru).

Koran yang tergantung di raknya **kekuningan** kalau masih edisi kemarin, dan
baru putih lagi sesudah `koran-pagi-di-rak-baca` memasang yang baru — lihat
"Jejak event yang menetap" di bawah.

### Jejak event yang menetap

`RUANGAN` sejak awal tempat bekas yang hidup lebih lama dari eventnya (noda
tinta, piagam, keset). Tapi tiga benda di gelombang event ke-5 sempat
dipangkas jadi **digambar event itu sendiri** — muncul selama eventnya jalan,
lalu hilang — karena tidak ada tempat menyimpannya di luar `room.js`.
Sekarang ketiganya menetap:

| Jejak | Ditulis oleh | Digambar di | Hilangnya |
|---|---|---|---|
| panel MCB jalur timur | — (perlengkapan dinding permanen, `PANEL_MCB`) | `drawPanelMcb()` di `drawWall` | tidak pernah; tuasnya turun lewat `MOD.mcbTurun` |
| lakban "sering turun" di panel | `mcb-jalur-turun` (`RUANGAN.mcbTurunKali++`) | `drawPanelMcb()` | tidak pernah dicabut |
| rim kertas cadangan di atas mesin fotokopi | `jatah-kuota-cair` (+2, maks 3) | `drawFotokopi()` | dipakai orang yang memfotokopi (25% per kunjungan) |
| koran di rak pojok baca | `koran-pagi-di-rak-baca` (`RUANGAN.koranTanggal`) | `drawPojokBaca()` lewat `koranBasi()` | kekuningan lagi besok paginya |
| dus ekspedisi di depan lemari arsip | `dus-ekspedisi-datang` (`RUANGAN.dusTambahanArsip`, bekas yang sudah dipakai kurir) | `drawArsip()` | dirapikan event arsip (`arsipPenuh` kembali `false`) |

Panel MCB-nya **pindah** dari x422 ke dinding kiri pintu gudang (x592..606
y56..74): tempat lama ternyata menumpuk dengan dekor tema ramadan yang sapuan
coretan waktu itu lewatkan. `koranBasi()` sengaja cuma membaca: halaman yang
dibuka lewat jam 10 menganggap koran hari ini sudah dipasang orang sebelum
kita datang — kalau tidak, tiap muat ulang siang hari menampilkan koran basi
seharian padahal event paginya tidak mungkin jalan lagi.

Dus ekspedisi sengaja **tidak** diberi tumpukan baru: "dus menetap di depan
lemari arsip" sudah ada sebagai `RUANGAN.dusTambahanArsip`, dipakai kurir dan
`dus-arsip-ditumpuk`. Pengangkutnya sekarang mengantar ke titik itu (x40 dan
x64, garis kaki y138). Lantai tempat tumpukan sementara dulu digambar (88,150)
memang tidak layak ditumpuki: `sapu-ruang.mjs` memperlihatkannya sebagai lajur
yang dilewati hampir semua rute ke lemari arsip.

### Bekas yang bertahan muat ulang

Semua bekas di atas — dan bekas lama seperti noda tinta, piagam, keset, huruf
papan nama yang copot — dulu cuma hidup selama halaman terbuka. Muat ulang, dan
kantornya bersih lagi. Sekarang daftar putih `BEKAS_FIELD` di `room.js`
disimpan ke `localStorage` (kunci `ruanganBekas`, berversi) dan dipulihkan saat
halaman dimuat, jadi ruangannya pelan-pelan menua dari hari ke hari.

Yang ikut hanya **bekas yang tidak punya jam** — noda, retak, piagam, piala,
keset, stiker, label patch panel, edaran, kursi rusak, dus tambahan arsip,
lakban panel MCB, tanggal koran — plus **stok yang habis lalu diisi ulang**
event (toner, kertas printer, gelas dispenser, rim kertas). Keadaan sesaat
sengaja tidak ikut: kursi yang sedang diseret ke baris meja kerja, laci yang
sedang terbuka, kucing yang sedang tidur, kurva kusut harian, tema kalender.
Memulihkan yang begitu membuat ruangan terbangun dalam keadaan yang tidak masuk
akal — kursi rapat kurang satu padahal tidak ada yang sedang memegangnya.

Tulisannya tiap 15 detik dan saat halaman ditutup (`pagehide`), cuma kalau
isinya berubah — sengaja **bukan** dari `tickRuangan()`: harness uji
menjalankan `frame()` ribuan kali dengan `localStorage` tiruan, sedangkan
`setInterval`/`pagehide` di sandbox tidak pernah jalan, jadi tidak ada uji yang
diam-diam mewarisi bekas uji lain. Memulihkan tidak pernah melempar: JSON
rusak, versi lain, atau field yang tipenya berubah dilewati per field.
`?ruangan=baru` mulai dari kantor bersih; `lupakanBekasRuangan()` di konsol
melakukan hal yang sama tanpa muat ulang. Dijaga `uji-bekas.mjs`.

### Perbaikan berkala

Sejak bekas bertahan saat muat ulang, empat bekas hanya bisa **bertambah**:
noda plafon (maks 3), retak lantai (maks 6), noda kopi di taplak meja rapat
(tanpa batas sama sekali), dan kursi rapat yang rusak. Tidak ada satu baris
kode pun yang pernah menguranginya — dulu tidak apa-apa karena semuanya lenyap
tiap halaman dimuat ulang. Tanpa penyeimbang, kantornya jadi gedung
terbengkalai dalam beberapa minggu.

Empat event di `public/event/41-perbaikan-dan-perabot.js` penyeimbangnya: tukang
naik tangga lipat di depan lemari arsip dan mengecat satu noda plafon; kursi
pengganti diambil dari gudang lalu yang rusak dibawa balik; ubin retak yang
tertua ditambal; noda kopi di taplak dilap lalu lapnya dibilas di pantri.
**Satu bekas per kejadian, jarang, dan tidak pernah sampai bersih total** —
retak baru ditambal kalau sudah dua, noda kopi dicuci kalau sudah dua. Kantor
yang direnovasi tiap minggu sama tidak meyakinkannya dengan yang tidak pernah
diperbaiki. Buku riwayat mencatat perbaikannya sendiri ("Retak di lantai
ditambal") karena ia membaca bekas, bukan event.

Dua event lain di berkas yang sama untuk perabot yang selama ini cuma bisa
dipandang: **papan kinerja dievaluasi** (atasan menunjuk batang tertinggi —
stasiun yang paling banyak dipakai sesi sungguhan hari ini — dan pendengarnya
garuk tengkuk karena garis target 80% belum tercapai), dan **kertas nyangkut di
mesin fotokopi** sayap timur (laci ditarik, kertas kusut dicabut, lalu diisi
dari rim cadangan di atas mesin kalau ada).

### Buku riwayat kantor

Sejak bekas bertahan saat muat ulang, kantor punya riwayat — piagamnya ada di
dinding, tapi kapan datangnya tidak tercatat di mana pun. Tombol **📜** di bilah
panggung membuka **buku riwayat kantor**: tiap bekas yang muncul atau hilang,
bertanggal, dikelompokkan per hari seperti buku register. "Piala voli dipajang
di atas lemari arsip", "Kursi rapat rusak lagi satu (3 sekarang)", "MCB jalur
timur turun lalu dinaikkan lagi (ke-2 kalinya)".

**Tidak ada event yang menulis ke buku ini.** Tiap 3 detik potret bekas — daftar
putih `BEKAS_FIELD` yang sama dengan penyimpanan — dibandingkan dengan potret
sebelumnya, dan `jelaskanPerubahan()` menerjemahkan bedanya jadi kalimat. Satu
tempat, jadi event baru yang menulis bekas lama otomatis tercatat tanpa tahu
buku ini ada, dan 352 event yang sudah terpasang tidak perlu diubah satu pun.

Yang dicatat: bekas yang **muncul atau hilang**, dan stok yang **diisi ulang**
(toner diganti, rim kertas datang). Stok yang berkurang sengaja tidak — gelas
dispenser berkurang tiap ada yang ngopi, dan buku yang isinya "gelas berkurang
satu" empat puluh kali sehari bukan riwayat, itu log. Bekas yang **dipulihkan**
saat halaman dimuat juga tidak dicatat sebagai kejadian: potret dasarnya diambil
sesudah pemulihan. Disimpan terpisah di `localStorage` (`ruanganRiwayat`),
maksimum 300 entri; entri pembuka "mulai dicatat" selalu dipertahankan supaya
"dicatat sejak" tidak ikut bergeser. `?ruangan=baru` mengosongkan bekas **dan**
riwayatnya — kantor yang dibuka bersih tidak punya masa lalu. Dijaga
`uji-bekas.mjs` bagian "Buku riwayat".

Kartu inventaris barang ikut membacanya: barang yang menanggung bekas (meja
rapat → noda kopi & kursi rusak, printer → toner & kertas, lemari piala →
piala, fotokopi → rim cadangan, dan seterusnya — `RIWAYAT_BARANG` di
`room.js`) mendapat baris **riwayat** terakhir di kartunya, lengkap dengan
tanggal dan jamnya. Stiker inventaris sengaja tidak: entrinya tidak menyimpan
barang mana yang ditempeli.

### Masa pakai bekas, dan printer yang akhirnya memakai kertas

Bekas yang bertahan muat ulang ternyata diam-diam mematikan event. "Piala voli
dipajang" hanya menyala kalau belum ada piala, "keset baru dipasang" kalau
belum ada keset, "patch panel dilabeli" berhenti di label ke-10, "APAR
diperiksa" menunggu kartu inspeksinya belum tergantung. Dulu muat ulang
mengembalikan semuanya, jadi besoknya event itu datang lagi. Sejak bekasnya
disimpan, event itu menyala **sekali, lalu tidak pernah lagi**.

Sekarang tiap bekas seperti itu punya **masa pakai** dalam hari sungguhan
(`BEKAS_MASA` di `room.js`), dihitung dari kapan nilainya terakhir berubah —
tanggalnya ikut disimpan. Lewat masanya, bekasnya kembali ke keadaan bawaan dan
event yang menunggunya bisa menyala lagi:

| Bekas | Masa pakai | Di buku riwayat |
|---|---|---|
| kartu inspeksi APAR | 30 hari | Kartu inspeksi APAR habis masa berlakunya, dicabut |
| kabel rak server dirapikan | 14 hari | Kabel di rak server kusut lagi |
| label patch panel lengkap (10) | 30 hari | Patch panel ditata ulang, label lamanya dicopot |
| stiker inventaris di semua barang | 60 hari | Stiker inventaris lama dicabut, menunggu pendataan berikutnya |
| plang baru ruang kadis | 90 hari | Nomenklatur berubah lagi — plang baru diturunkan, plang lama dipasang dulu |
| keset depan pintu kadis | 21 hari | Keset depan pintu kadis sudah tipis, dibuang |
| piala voli | 60 hari | Piala voli dipindah ke gudang |
| bagan struktur penuh tempelan (2 kotak) | 45 hari | Bagan struktur organisasi dicetak ulang |
| buku tamu penuh (10 baris) | 3 hari | Buku tamu penuh, diganti buku yang baru |
| huruf papan nama yang copot | 14 hari | Huruf papan nama dipasang lengkap lagi |
| cat dinding mengelupas | 30 hari | Bagian dinding yang mengelupas ditutup |
| karpet rapat yang cerah sesudah dijemur | 14 hari | Karpet meja rapat kusam lagi |
| foto pejabat miring | 1 hari | Foto pejabat diluruskan lagi |

Foto miring ada di daftar karena satu kasus saja: halaman ditutup di tengah
event, sebelum `selesai()` sempat meluruskannya. Kantor yang ditutup tiga
minggu menemukan kesetnya sudah dibuang begitu dibuka lagi — dicatat pada saat
halaman dibuka, bukan tanggal kira-kira. Simpanan lama yang belum punya tanggal
mulai menghitung dari saat pertama dimuat, jadi tidak ada yang lenyap mendadak
sesudah pembaruan.

Bekas yang sudah punya jalan pulang lewat event (noda plafon, retak, noda kopi,
kursi rusak, arsip penuh, gelas dispenser) tidak diberi masa. `uji-bekas.mjs`
menjaga aturannya: setiap field `BEKAS_FIELD` yang dibaca `syarat()` suatu
event harus punya masa pakai **atau** jalan pulang yang terdaftar di ujinya —
event baru bersyarat `!RUANGAN.piagamDinding` langsung merah. Uji yang sama
memeriksa bahwa event yang menunggu tiap bekas benar-benar bisa menyala lagi
sesudah masanya habis, dan bahwa buku riwayat punya kalimat untuk kembalinya.

Sambil memeriksa itu ketahuan dua event yang **tidak pernah menyala sendiri
sejak dibuat**, bukan gara-gara penyimpanan: "toner printer dikocok" (bersyarat
toner di bawah 90%) dan "stok kertas habis" (bersyarat kertas nol). Toner dan
kertas printer dideklarasikan, diisi ulang, tampil di kartu inventaris — tapi
tidak ada satu baris pun yang menguranginya. Sekarang tiap tool call sungguhan
yang jatuh ke meja printer (stasiun `web`) mencetak selembar lewat
`pakaiPrinter()`: kertas berkurang satu, toner 0,6%. Kira-kira dua puluh call
kemudian ada yang bangun mengambil rim. Server memutar ulang sampai 60 event
terakhir tiap halaman tersambung; call yang lebih tua dari halaman itu sudah
dicetak halaman sebelumnya, jadi tidak memakai kertas dua kali.

Printer bukan satu-satunya yang aus karena kerja sungguhan. `PEMAKAIAN_STASIUN`
di `room.js` menghitung tool call nyata per stasiun dan memicu event yang cocok
begitu hitungannya penuh: **30 Grep** membuat laci filing kabinet macet, **40
Read** membuat satu map arsip hilang dan dicari, **20 perintah git** membuat rak
server kepanasan, **12 delegasi** (Task/Agent) di meja rapat membuat kopinya
tumpah — melengkapi yang sudah lama ada, tinta stempel yang kering tiap 25
hentakan Edit. Pemicunya tetap menghormati cooldown; kalau ditolak (cooldown,
event-nya masih jalan, tidak ada yang bisa dipinjam), hitungannya tidak dibuang
dan dicoba lagi di call berikutnya. Event yang diputar ulang server saat
halaman tersambung tidak dihitung.

Masa pakainya bisa dilihat. Buku riwayat 📜 dibuka dengan bagian **Sedang
menua**: tiap bekas bermasa pakai yang sedang berjalan, sudah berapa hari, dan
kapan hilang sendiri — yang paling dekat habis di atas ("Kartu inspeksi APAR ·
sudah 29 hari, habis besok"). Kartu inventaris barangnya mendapat baris **masa
pakai** yang sama: klik lemari piala dan kartunya menyebut kapan pialanya
dipindah ke gudang. Tanggal yang belum sempat tercatat ditulis "belum
diketahui", bukan ditebak (`bekasMenua()` di `room.js`).

Dan yang habis masanya **dibereskan orang, bukan lenyap**. Begitu masa pakainya
lewat, bekasnya *jatuh tempo* selama 12 jam (`BEKAS_TENGGANG_MS`) — di buku
riwayat tertulis "sudah habis, menunggu dibereskan" — dan event
**bekas-habis-masa-pakai** (`public/event/42-masa-pakai-habis.js`) boleh datang:
seorang pegawai menggulung keset lalu membawanya ke gudang, mencabut kartu
inspeksi APAR, menurunkan piala ke dalam boks, melepas plang baru ruang kadis,
mengganti buku tamu yang penuh. Barang yang dibawa pergi diantar ke gudang ATK.
Satu barang per kejadian, yang paling lama lewat lebih dulu. Baru kalau tidak
ada yang sempat — halaman ditutup sepanjang tenggang, atau tidak ada pegawai
yang menganggur — bekasnya dikembalikan diam-diam seperti sebelumnya. Foto
miring dan karpet yang kusam lagi sengaja tetap diam-diam: tidak ada orang yang
"memudarkan karpet".

### Gudang yang ikut menua, dan penghapusan BMN

Barang yang dibawa ke gudang — keset lama, piala, plang yang diturunkan, buku
tamu yang penuh, kursi rapat yang rusak — dulu lenyap di ambang pintunya.
Sekarang tersimpan (`RUANGAN.isiGudang`, ikut bertahan muat ulang, paling
banyak 8): tiga yang pertama bersandar di lantai gudang dan kelihatan tiap
pintunya terbuka, sisanya menumpuk di sebelah kanan pintu, dan kartu
inventaris gudang menyebut isinya ("Kursi rapat rusak ×2, Piala voli"). Pintu
gudang ikut terbuka sebentar tiap ada yang mengantar barang.

Barang milik negara tidak boleh sekadar dibuang. Begitu isinya empat, event
**penghapusan-bmn-gudang** bisa datang: petugas berseragam khaki masuk dari
tepi kanan, seorang pegawai menyambutnya dengan papan berita acara dan
menandatanganinya, lalu petugasnya bolak-balik mengangkut barang satu per satu
dari pintu gudang ke luar — tumpukan di luar dulu, baru isi lantai gudang.
Buku riwayat mencatatnya sekali: "Penghapusan BMN: 5 barang bekas di gudang
diangkut, berita acaranya ditandatangani". Titik tumpukannya dipilih dengan
`node sapu-ruang.mjs siapa 642 100 20 13`: nol piksel, nol lalu lintas.

### Alat sapu ruangan

Setiap perabot di ruangan ini ditaruh dengan cara yang sama: sapuan piksel atas
semua yang digambar (`drawWall` di kelima tema, `drawFloor`, `PROPS`, seluruh
hook gambar registri event di banyak cuplikan umur) ditambah rute pegawai yang
sungguhan. Dulu sapuan itu ditulis ulang sekali pakai tiap kali. Sekarang satu
perintah:

```bash
node sapu-ruang.mjs siapa 590 53 18 22 --halus      # siapa yang menggambar / lewat di kotak ini
node sapu-ruang.mjs peta 610 240 62 90              # peta ASCII: huruf = pemilik piksel, ~ = badan orang lewat
node sapu-ruang.mjs kosong 26 46 540 248 132 108    # calon kotak 26x46 yang bebas di area itu
```

Lalu lintasnya dihitung dengan `route()` yang **asli** antar semua titik tujuan
yang dikenal (slot stasiun, meja kerja, WC, gudang, fotokopi, bantal pojok baca,
mesin absen, pintu keluar, rute & pos satpam) plus setiap `goToXY(<angka>,
<angka>)` literal di `public/event/*.js` — 43 ribu rute, badan orang 11 px lebar
dari 30 px di atas garis kaki. Titiknya dibaca lewat `ruangRujukan()` di
`room.js`, jadi tujuan baru ikut tersapu tanpa mengubah alatnya. Untuk
perlengkapan dinding pakai `--abaikan-lalu-lintas`: orang yang lewat di depan
dinding tidak tertutup panel di belakangnya. `gambarAtas` sengaja tidak
dihitung kecuali `--atas` — isinya cahaya yang memang harus lewat.

Sapuan pertama alat ini langsung menemukan satu kesalahan lama: panel MCB
gelombang 5 menumpuk dengan dekor tema ramadan.

Supaya kesalahan kelas itu tidak lagi bergantung pada kebetulan ada yang
menjalankan alatnya, `uji-tempat.mjs` (ikut `npm test`) menyapu kotak panel
MCB, rim kertas, pos satpam, dan pojok baca sekaligus: pemilik pikselnya harus
cuma perabot itu sendiri, dan untuk perabot lantai tidak boleh ada rute yang
cuma **lewat** — rute yang sah berujung di dalam kotaknya. Kontrol negatifnya
kotak panel MCB versi pertama, yang harus ketahuan menumpuk dekor ramadan.
Menaruh perabot baru lewat `sapu-ruang.mjs`? Tambahkan barisnya di sana. Supaya
bisa dibedakan, perabot bernama yang digambar **di dalam** `drawWall` /
`drawFloor` (panel MCB, karpet pojok baca, pintu WC & gudang) disapu dengan
namanya sendiri, dan kepemilikan piksel dicatat per sumber — dua penggambar di
sel yang sama sama-sama tercatat.

### Satpam berpatroli

WC, gudang, dan pojok baca di atas semuanya rutinitas "jalan ke satu titik,
tunggu, pulang" — begitu tiba, dia diam di situ sampai waktunya habis, lalu
balik kanan. Satpam sengaja dibuat **beda bentuknya**, bukan cuma beda kulit:
dia keliling **berurutan** lewat beberapa titik sekaligus (`SATPAM_RUTE`,
dideklarasikan dekat `class Standby` di `room.js`, sesudah
`calonPetugasNotulen()`), singgah sebentar di tiap satu (pose `'nunjuk'`,
seolah menyorotkan senter), baru lanjut ke titik berikutnya — dan pulang ke
pos jaga sesudah titik terakhir. Rutinitasnya sendiri (`mulaiSatpam`/
`tickSatpam`/`selesaiSatpam`, dekat `destroy()` milik `class Standby`)
sekelas WC/gudang/baca/kursi/notulen: bukan `daftarEvent()`, tidak lewat
penjadwal, tidak masuk log — jalan sendiri tiap ±4 menit (`SATPAM_JEDA_MS`,
`window.SATPAM_UJI_MS` mempercepatnya di uji, pola yang sama dengan
`jedaNotulen()`).

Titik-titik kelilingnya **bukan geometri baru** — dunia `W = 672` tidak
dilebarkan untuk fitur ini, dan semuanya dipinjam dari yang sudah ada. Yang
BARU cuma satu, dan datang belakangan: **pos jaganya** (`POS_SATPAM`). Versi
pertama memulangkan satpam ke ruang tunggu semata karena kantor ini belum
punya pos; sekarang ada meja jaga di pojok kanan bawah (x643..669 y276..322 —
buku mutasi jaga, HT, papan POS, kursi lipat). Tempatnya dicari dengan
`sapu-ruang.mjs` (lihat "Alat sapu ruangan" di bawah): satu-satunya calon di
pojok itu yang bebas piksel dan bebas rute. Sampai di pos, satpam berjaga
25–45 detik menghadap ruangan sebelum ikut mondar-mandir lagi. Posnya
punya tiga kejadian sendiri (`public/event/40-pos-satpam.js`): tamu yang
lapor lalu diputar balik ke loket, laporan ronda malam di buku mutasi, dan
penjaga yang ketiduran sampai HT-nya berbunyi.

| Titik | Koordinat | Dipinjam dari |
|---|---|---|
| dekat pintu keluar | `ABSEN_X, ABSEN_Y` (424,152) | mesin absen, ritual pulang |
| ambang pintu WC | `WC.titikX, WC.titikY` (12,116) | `keWC()` |
| ambang pintu gudang | `GUDANG.titikX, GUDANG.titikY` (624,116) | `keGudang()` |
| depan ruang kadis | `STATIONS.agent.x, 152` (452,152) | ambang `agent` — y digeser dari 140 ke 152 supaya tidak berhimpit dengan sesi nyata yang sedang antre/bekerja tepat di depan pintu |
| depan pintu pantri | `PANTRI_LUAR, PANTRI.ambang` (500,272) | titik hinge yang sudah dipakai `route()` sendiri buat menembus sekat pantri |
| pos jaga (pulang) | `POS_SATPAM.titikX, POS_SATPAM.titikY` (658,298) | meja jaga baru — dulu `goTo('idle')`, ruang tunggu |

Perannya (`satpam` di `JABATAN`: peci, kumis, seragam khaki-coklat sendiri,
kerudung `#4a3c1f` buat yang jenis kelaminnya perempuan — lihat "Persona
pegawai" & `uji-jk.mjs`) **sengaja tidak** ditambahkan ke `PERAN_STANDBY`.
Array itu panjangnya 4, persis sama dengan `MIN_DI_LAYAR`: tiap standby yang
hidup memang dijatah satu peran unik dari situ, jadi menyisipkan entri kelima
di sana cuma bikin perannya nyaris tidak pernah kepilih (butuh standby kelima
yang jarang ada). Sebagai gantinya, giliran pertama siapa saja — standby
menganggur mana pun — dan `mulaiSatpam()` memanggil `setPeran('satpam')` atas
dia; sesudah itu `calonPetugasSatpam()` mendahulukannya lagi tiap giliran
berikutnya, persis pola arsiparis didahulukan `calonPetugasNotulen()`. Kalau
dia dihapus (`jagaPopulasi` menyusutkan populasi standby, atau tombol "hapus
dari daftar"), `destroy()` melepas kuncinya (`petugasSatpam`) dan giliran
berikutnya jatuh ke standby lain — peran `'satpam'`-nya ikut hilang bersama
orangnya, bukan berpindah.

Senternya (`a.bawa = 'senter'`, kasus baru di `drawBawaan`) dipegang selama
seluruh putaran, bukan cuma sekali seperti kardus gudang — dilepas
`selesaiSatpam()`, bukan menunggu `bawaSampai` kedaluwarsa sendiri. Direbut
event acak di tengah jalan (pagar `this.eventKerja` yang sama seperti
`tickWC`) membatalkan seluruh putaran, bukan melanjutkannya dari titik
terakhir — giliran berikutnya mulai dari titik pertama lagi.

**Sesi nyata tidak pernah dipaksa berpatroli**: rutinitasnya seluruhnya hidup
di `class Standby` (`mulaiSatpam`/`tickSatpam`/`selesaiSatpam`), yang tidak
pernah dipanggil dari `class Agent` dasarnya. Peran `'satpam'` sendiri cuma
kulit — kartu pegawai membolehkan siapa pun (termasuk sesi nyata) memilihnya
dari dropdown jabatan seperti peran lain, tapi memilihnya cuma mengganti
seragam, tidak menyalakan `tickSatpam()` sama sekali.

### Pramubakti merapikan pantri

Keluhannya: "ada pos satpam tapi tidak ada satpamnya, ada pantri tapi tidak
ada OB-nya". Satpam sudah dibereskan di atas; bagian OB-nya dikerjakan
dengan **pola yang sama persis**, disalin baris demi baris dari
`mulaiSatpam`/`tickSatpam`/`selesaiSatpam` jadi `mulaiPramubakti`/
`tickPramubakti`/`selesaiPramubakti` (dekat `destroy()` milik `class
Standby`, sesudah blok satpam) — bukan `daftarEvent()`, tidak lewat
penjadwal, tidak masuk log, keliling berurutan lewat beberapa titik lalu
pulang.

Ada dua beda dari satpam:

1. **Gerbangnya kebutuhan, bukan jam buta.** Satpam berpatroli tiap
   `SATPAM_JEDA_MS` apa pun keadaannya; pramubakti cuma berangkat kalau
   `perluPramubakti()` — `RUANGAN.kusut > PRAMUBAKTI_AMBANG` (0.35) — benar.
   Karena `RUANGAN.kusut` naik-turun terus (beda dari `RUANGAN.notulen` yang
   cuma naik sampai dibereskan), jam tunggunya (`pramubaktiBerikutnya`)
   sengaja direset ke 0 kalau kebutuhannya sempat hilang lagi sebelum
   gilirannya tiba — tanpa itu dia bisa berangkat merapikan pantri yang
   sudah rapi sendiri.
2. **Singgahnya bukan cuma berpose, tapi menutup dengan satu akibat nyata**:
   `bereskanKusut(0.85)` sesudah titik terakhir — klaim kecil (dibanding
   `ob-ngepel-lantai` 0.6 atau `jumat-bersih` 0.1), sepadan dengan lajurnya
   yang jauh lebih pendek dari keduanya.

Titik-titiknya (`PRAMUBAKTI_RUTE`, dekat `calonPetugasSatpam()`) juga bukan
geometri baru:

| Titik | Koordinat | Dipinjam dari |
|---|---|---|
| meja saji pantri | `pantriX(424), 280` | tempat lap digantung, `27-serba-kecil.js` |
| tong sampah | `pantriX(439), 270` | `tong-sampah-penuh`, `galon-habis-diganti` |
| sudut dispenser | `pantriX(466), 256` | `tanaman-layu-disiram`, `galon-habis-diganti` |
| pos (pulang) | `PANTRI_LUAR, PANTRI.ambang` | titik tunggu depan pintu pantri — sama yang dipakai `route()` sendiri, dan sama yang jadi salah satu checkpoint satpam |

Perannya (`pramubakti` di `JABATAN`, singkat `OB`, padanan `Workplace
Experience`) **sengaja tidak** masuk `PERAN_STANDBY` — alasannya identik
dengan satpam: array itu sudah penuh 4 slot (= `MIN_DI_LAYAR`), jadi entri
keenam nyaris tidak pernah kepilih. Giliran pertama jatuh ke standby
menganggur mana pun, `mulaiPramubakti()` memanggil `setPeran('pramubakti')`,
lalu `calonPetugasPramubakti()` mendahulukannya lagi tiap giliran
berikutnya — pola yang sama dengan arsiparis di `calonPetugasNotulen()` dan
satpam di `calonPetugasSatpam()`.

**Kenapa bukan `RUANGAN.gelasDispenser`/`RUANGAN.tongPenuh`.** Keduanya
kelihatan seperti sasaran OB paling jelas ("isi ulang gelas", "kosongkan
tong"), tapi keduanya sudah masing-masing punya adegan sendiri lengkap
dengan pemeran & dialog — `galon-habis-diganti` + `tukang-galon-datang`
untuk gelas, `tong-sampah-penuh` untuk tong (ketiganya `daftarEvent()`).
Menambah penulis ketiga atas field yang sama tanpa `bentrokDengan` (rutinitas
`class Standby` ini tidak lewat penjadwal, jadi tidak bisa ikut mekanisme
`bentrokDengan` sama sekali) cuma akan membuat pramubakti diam-diam
menghabisi syarat ambang kedua event itu sebelum sempat terpilih — adegan
yang sudah ada jadi nyaris tidak pernah muncul lagi. Yang disentuh gantinya
`RUANGAN.kusut` lewat `bereskanKusut()`, satu-satunya field yang memang
dirancang punya banyak penulis sekaligus (`jumat-bersih`, `ob-ngepel-lantai`,
`rombongan-pembersih`, dan sekarang pramubakti).

**Kenapa tidak ada `bentrokDengan` dengan `ob-ngepel-lantai`** (petugas
kebersihan luar yang mengepel lajur bawah, `public/event/22`) — dua alasan.
Mekanis: `bentrokDengan` cuma berlaku antar `daftarEvent()`, dan rutinitas
pramubakti bukan salah satunya, persis satpam yang juga tidak pernah masuk
`bentrokDengan` siapa pun walau `satpam-patroli` (versi tamu/`daftarEvent`-
nya) masuk ke banyak daftar orang lain. Tata letak: `ob-ngepel-lantai`
berhenti **sebelum** sekat pantri (`x` sampai `pantriX(404)`, `PANTRI_LUAR`),
sedangkan `PRAMUBAKTI_RUTE` seluruhnya **di dalam** pantri (`x` mulai
`pantriX(424)`) — beda rupa (wearpack biru + pel + papan licin, lawan
seragam pramubakti + lap), beda petak lantai, jadi tidak pernah terbaca
sebagai "dua OB" di layar yang sama.

Sesi nyata juga tidak pernah dipaksa merapikan pantri — sama seperti satpam,
rutinitasnya seluruhnya hidup di `class Standby` dan memilih peran
`'pramubakti'` dari kartu pegawai cuma mengganti seragam.

### Satpam dan OB tetap

Satpam dan pramubakti di atas dulu cuma **peran** yang ditempelkan ke pegawai
standby yang kebetulan menganggur saat gilirannya tiba. Standby itu penambal:
jumlahnya `MIN_DI_LAYAR` dikurangi sesi nyata, jadi di ruangan yang ramai sesi
mereka habis — dan satpam serta OB ikut tidak pernah terlihat.

Sekarang keduanya **pegawai tetap** (`Standby.tetap`, `pastikanPetugasTetap()`
dipanggil `jagaPopulasi()`): lahir sekali, tidak pernah dibuang, dan tidak
dihitung dalam jatah penambal. Satpam berjaga di pos satpam menghadap ruangan,
OB siaga di meja saji pantri; sesekali keduanya menoleh. Mereka tidak ikut
mondar-mandir standby (WC, gudang, pojok baca, kursi, notulen), dan `betah`
selamanya, jadi jam menganggur tidak pernah memulangkan mereka ke meja kerja.
Patroli keliling dan rapikan pantri jatuh ke mereka — kalau satpamnya sedang
dipinjam event, patrolinya menunggu, tidak digantikan standby lain. Selesai
patroli, dipinjam event, atau apa pun yang memindahkannya, mereka pulang ke
posnya sendiri (`tickTetap()`). Di daftar kru mereka tertulis "tetap" tanpa
tombol hapus, dan tidak ikut hitungan "+N standby". `?petugas=0` mematikannya.
Dijaga `uji-petugas.mjs`.

### Dua event lagi dari sisa katalog: dus ekspedisi, senam Jumat

- **Dus ekspedisi datang** (`dus-ekspedisi-datang`) — tiga dus jatuh
  berurutan (gravitasi sungguhan, `vy += 400*dt`) di depan bukaan ruang
  kadis, lalu dua pegawai mengangkutnya ke dekat lemari arsip (jalannya
  melambat, `a.laju = 0.65`, sambil membawa `'kardus'` — bawaan yang sudah
  ada, bukan baru). Guncangan layar tiap dus mendarat pakai `MOD.getar`
  yang sudah dipakai genset, bukan mekanisme baru. Rancangan aslinya minta
  tumpukannya **permanen** (masuk `PROPS`, bertambah tinggi tiap kali
  kejadian ini terjadi lagi); itu dipangkas ke versi sekali pakai — event
  ini menggambar tumpukannya sendiri lewat `gambarProp`, dan hilang begitu
  event selesai, bukan menetap di ruangan. Permanen berarti state `RUANGAN.*`
  baru sekaligus entri `PROPS` baru yang ikut sapuan golden z-order, untuk
  satu hiasan yang jatuhnya cuma sesekali — tidak sepadan.
- **Senam Jumat** (`senam-jumat`) — satu-satunya "barisan" selain apel pagi
  yang mengumpulkan seluruh penghuni menganggur, tapi sengaja tidak memakai
  `FORMASI_APEL` milik apel (formasi sendiri, grid 3 kolom di lantai dekat
  meja kerja). Kalah duluan kalau apel kebetulan masih berjalan (`syarat`
  memeriksa `!apel`, variabel global yang sama dipakai `tickApel()`) —
  "apel yang menang" kalau keduanya jatuh bersamaan, sama seperti disebut di
  rapat rancangannya. Interlock "tool call nyata memberangkatkan orangnya
  duluan" tidak perlu dibangun khusus: `handle()` memanggil `goTo()` yang
  menimpa `path` siapa pun, jadi otomatis berlaku untuk event apa saja,
  bukan cuma ini. Naik-turun badannya (`a.y = a.slotY + sin(a.phase*5)*amp`)
  dan lengan bergantiannya (pose `'tepuk'`, sudah ada) keduanya pose/posisi
  yang sudah ada — tidak ada pose baru untuk event ini.

## Kartu inventaris barang & zoom perabot

Semua perabot bisa diklik. Kamera membidik barangnya — rasanya sama dengan
mengklik bukaan ruang kadis — dan di sebelahnya terbuka **Kartu Inventaris
Barang**: kode barang dan NUP bergaya BMN (tiruan, bukan kode resmi), tahun
perolehan, lokasi, dan kondisi B/RR/RB yang **hidup** — ember berapa persen,
galon tinggal berapa gelas, AC bocor atau mati, WC isi atau kosong dan siapa
di dalamnya. Barang yang punya stasiun menyebut tool Claude Code yang
dikerjakan di situ, siapa yang sedang memakainya, dan berapa tool call yang
jatuh ke sana sejak halaman dibuka (`tapakStasiun`, lintas sesi). Tiap meja
kerja punya kartunya sendiri.

| Klik | Yang terjadi |
|---|---|
| pegawai | kartu pegawai seperti biasa — pegawai selalu menang |
| X-banner, bukaan kadis | perilaku lama, tidak berubah |
| perabot | zoom 2/3/4 (terbesar yang masih memuat barangnya) + kartu inventaris |
| pintu kadis | zoom ke **dalam ruang kadis**, gordennya dipaksa tersibak selama kartunya terbuka |
| barang yang sama / lantai kosong / Esc | zoom keluar, kartu ditutup |

Kotak barang yang bertumpuk (jam di dinding, dispenser di dalam pantri)
diputus luasnya: yang terkecil menang, karena itu yang ditunjuk. Kursor
berubah jadi tangan dan bingkai tipis putus-putus muncul di atas barang yang
bisa diklik; yang kartunya terbuka dibingkai lebih tebal dan berdenyut.
Kartunya meminjam `#kartu` milik kartu pegawai, tapi keadaannya terpisah
(`barangTerpilih`), jadi `terpilih` tetap cuma berarti pegawai.

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

### Peserta rapat ikut bekerja

Sampai sekarang peserta rapat cuma **duduk**. Tiap tool call yang dipicu di
dalam subagent menggerakkan **pegawai induknya** — dia yang berjalan ke lemari
arsip mewakili tiga pesertanya sekaligus, dan hitungan tool call, riwayat,
serta gagal berturut di kartunya ikut tercemar.

Sebabnya satu baris di `normalize()`: `agent_id` dan `agent_type` cuma dibaca
pada `subagent-start`/`subagent-stop`, padahal hook yang dipasang lewat
`settings.json` ikut menyala **di dalam** subagent dan `PreToolUse`/
`PostToolUse` dari sana membawa keduanya. Buku agenda mengukurnya: 2.020 baris
`pre` dalam sehari, nol yang ber-`agenId`, padahal baris `subagent-start` dari
sesi yang sama membawanya.

Sekarang identitas pelaku dibaca untuk **kind apa pun**, dan `pelakuUntuk()` di
[public/room.js](../public/room.js) mengarahkan `pre`/`post` ke pesertanya:
dia yang berjalan, dia yang bicara, dia yang punya riwayat. Peserta yang
kursinya belum sempat dibuka — urutan hook tidak dijamin — dibukakan saat itu
juga; kalau meja memang penuh, induk yang mewakili seperti dulu.

Gerbangnya **`agent_id`, bukan `agent_type`**, dan itu bukan detail: sesi yang
dijalankan dengan `claude --agent` membawa `agent_type` di tingkat **sesi**,
jadi menggerbangi `agent_type` akan menandai seluruh event sesi itu sebagai
kerja peserta yang tidak pernah ada.

Yang **tidak** ikut pindah ke peserta: keadaan tingkat sesi. `butuh`, `macet`,
kamera, proyek, dan cabang tetap milik induk, karena permintaan izin dari
subagent memang naik ke sesi induknya.

Sesudah kerjanya selesai peserta **kembali ke kursinya** sendiri (`update()` di
`class Peserta`, jeda 2 detik supaya rentetan tool call tidak membuatnya
bolak-balik). Notulen sisa rapat sekarang dihitung dari `pernahDuduk`, bukan
dari "sedang di kursi" — sejak peserta bisa pergi ke stasiun, dia bisa sedang
di lemari arsip waktu rapatnya ditutup.

### Surat kuasa: seberapa jauh sesi boleh bertindak sendiri

Tiap payload hook membawa `permission_mode`, dan sampai sekarang ia dibuang
utuh. Akibatnya pemilik tidak bisa membedakan sesi yang **memang tidak akan
pernah minta paraf** dari sesi yang sedang diam-diam menunggu dijawab — dua
keadaan yang di ruangan terlihat persis sama.

| `permission_mode` | Surat kuasa |
|---|---|
| `default` | diawasi |
| `plan` | magang |
| `acceptEdits` | kuasa stempel |
| `delegate` | kuasa delegasi |
| `dontAsk`, `bypassPermissions` | kuasa penuh |

Nilai yang tidak dikenal **dilewatkan apa adanya tanpa terjemahan**: menebak
nama mode baru lebih buruk daripada menampilkan nilai mentahnya.

Ini **status, bukan peristiwa**. Tidak ada kind baru, tidak ada baris agenda
baru, dan `?ulang=` tidak perlu tahu apa-apa soal ini — yang terakhir terlihat
itulah yang berlaku. Satu jebakan yang ditutup sejak awal: hook yang menyala di
dalam subagent memakai `session_id` **induk** tapi membawa mode miliknya sendiri
(agen bawaan sering `dontAsk`), jadi yang dipercaya hanya event yang tidak
ber-`agent_id`. Tanpa pagar itu surat kuasa induk akan berkedip sepanjang hari.

Di kartu pegawai ia jadi satu baris; di kartu paraf sesi terminal ia menambah
satu kalimat, *sesi ini berkuasa penuh — tidak akan pernah minta izin*.

### Berapa lama benar-benar tertahan

`butuhManusia` dan `macetSesi` dulu tidak menyimpan **kapan** sesi mulai
tertahan, jadi yang bertanya lewat MCP terpaksa menebaknya dari kapan sesi
terakhir bersuara. Dua hal yang berbeda: sesi bisa terus mengirim event sambil
tetap menunggu dijawab.

Sekarang keduanya membawa `sejak`, dan angkanya **bertahan** selama sesi itu
belum lepas dari tertahan — permintaan izin kedua dari sesi yang sama bukan
tunggu baru, ia tunggu yang sama yang belum dijawab. Jalur paraf memakai
`izin.sejak` yang sudah ada, bukan membuat stempel kedua: satu permintaan harus
punya satu sumber waktu.

### Berputar-putar

Agen yang mandek di tempat terlihat seperti pegawai rajin: tool call naik,
stamina turun, tidak ada satu pun tanda bahwa dia sedang mengulang. Dua pola
yang belum punya padanan di mana pun sekarang dideteksi server:

| Pola | Kapan |
|---|---|
| `ulang-sama` | operasi yang **persis** sama diulang ≥ 3 kali berturut-turut |
| `bolak-balik` | menyunting a lalu b lalu a lagi, ≥ 2 putaran |

"Persis" dihitung dari **sidik jari operasi** (`sidikTool()`) atas `tool_input`
mentah, bukan dari label: membaca dua berkas berbeda bukan pengulangan, dan
label yang sudah dipotong tidak bisa membedakan keduanya.

Yang **sengaja tidak ikut**: gagal berturut-turut. Itu sudah dihitung halaman
dan dipakai event acak inspektorat; menghitungnya ulang di server berarti
ruangan menampilkan dua angka untuk satu fakta.

Notanya terbit **sekali per kejadian**, bukan tiap tool call sesudahnya, dan
seperti biasa: nota, bukan rem. Tidak ada yang ditahan.

### Meteran jendela konteks

Sesi terminal tidak pernah memberitahu seberapa penuh konteksnya — pemilik baru
tahu waktu balon *merapikan catatan* muncul, dan sesudah itu agen sering lupa
arahan awal.

Angkanya sudah lewat di depan mata selama ini: masuk + cache dibaca + cache
ditulis pada baris asisten **terakhir** adalah ukuran prompt yang benar-benar
dikirim ke model. Itu yang dipakai, bukan jumlah kumulatif sesi.

Jendelanya **tidak ditebak dari nama model** — `modelDari()` mendahulukan nama
tampilan yang berubah antar versi, jadi mencocokkan `1m` di sana adalah tebakan
yang akan salah diam-diam. Urutannya: `AGENT_ROOM_KONTEKS` kalau disetel sadar,
lalu **pengamatan** — begitu sebuah sesi terlihat memakai lebih dari jendela
bawaan, jendelanya dinaikkan dan tidak pernah turun lagi sampai sesi berakhir.

### Pohon delegasi di server

Seluruh keadaan peserta dulu hidup di halaman saja, jadi mati begitu tab
ditutup — dan agen lain yang bertanya lewat MCP dijawab *menganggur* untuk sesi
induk yang sudah `stop` padahal tiga pesertanya masih bekerja. Itu keadaan
lazim, bukan pojok: subagent memang dijalankan di latar.

Server sekarang menyimpan `pesertaHidup` (metadata saja: jenis agen, sejak,
terakhir, tool terakhir, hitungan tool dan gagal), memaparkannya di
`GET /ruangan` sebagai `sesi[].peserta[]` dan `sesi[].delegasi`, dan
menerbitkan dua gauge di `/metrics`. Tool MCP `ruangan_pohon_delegasi`
membacanya, dan induk ber-`kind: stop` yang masih punya peserta disebut
**menunggu peserta**, bukan menganggur.

Penanda `diam` (10 menit tanpa kabar) itu **nota, bukan rem** — tidak ada yang
ditahan karenanya. Angkanya baru jujur sejak `agent_id` dibaca pada `pre`/
`post`: sebelum itu jam terakhir peserta membeku di detik dia masuk, jadi tiap
peserta yang hidup lebih dari sepuluh menit akan ditandai diam padahal sibuk.

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

**Notulen sisa rapat.** Peserta yang permisi meninggalkan selembar catatan di
sudut kiri depan meja rapat (`RUANGAN.notulen`, maks 10 lapis — bekas ruangan
tidak pernah direset, jadi batasnya di data, bukan cuma di gambar). Tumpukan
itu dibereskan pegawai standby berjabatan arsiparis (standby mana pun kalau
tidak ada) tiap ±10 menit selama isinya ≥3 lembar: dia berjalan ke sudut meja,
berhenti dua detik, lalu membawa kertasnya ke lemari arsip. Peserta yang
`agent_type`-nya pernah bubar dari rapat sesi induk yang sama disapa beda
waktu datang lagi — "hadir lagi" / "izin, lanjut yang tadi" — sekali per
kedatangan; yang dikenali orangnya, bukan sekadar kursinya.

Kursinya ada 9: tujuh menghadap kamera di sisi jauh, dua lagi membelakangi kamera
di sisi dekat. Kalau fasenya lebih banyak dari kursi yang tersisa, sisanya
dicatat di log sebagai "ikut daring" — tidak dipaksa menumpuk di satu titik.

Meja rapat menghalangi tengah ruangan, jadi pegawainya tidak menembusnya — mereka
memutar lewat lajur depan meja dinding atau lajur depan meja rapat, tersambung di
sisi kiri (dekat bendera) dan kanan.

Stasiun yang paling sering dipakai dibuat berkapasitas banyak: **meja rapat**
punya 9 kursi, **meja kerja** 7 meja dengan titik berdiri yang didaftar manual
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
`JABATAN` dalam [public/room.js](../public/room.js).

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

**Stamina & suasana hati.** Tiap pegawai punya `stamina` 0..1 yang mulai
penuh saat sesinya lahir dan turun pelan dari jumlah tool call, kegagalan
(lebih berat), lama di kantor, dan waktu menunggu kamu; naik lagi saat
menganggur dan selagi dipinjam event pantry. Efeknya **kosmetik saja**: di
bawah 0,3 langkahnya 0,85× (tidak lebih lambat — kedatangan ke stasiun tetap
cepat, Aturan 1 event acak), bahu dan kepalanya turun sepiksel, dan wajahnya
'lelah' (kelopak turun) sebagai ekspresi prioritas paling rendah — yang
sedang bekerja tetap terlihat fokus. Turunannya, `suasana` ('segar' /
'biasa' / 'lelah'), cuma muncul sebagai satu baris *kondisi* di kartu
pegawai; tidak masuk log, tidak masuk statistik. Konstantanya `STAMINA_*` di
[public/room.js](../public/room.js).

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

## Kartu pegawai

Klik pegawainya — di ruangan atau di barisnya pada panel — untuk membuka kartu
detail. Kartunya menempel pada orangnya dan ikut berjalan, jadi tidak perlu
ditebak kartu ini punya siapa; yang sedang dibuka juga diberi sorotan di lantai.

| Isi kartu | Keterangan |
|---|---|
| nama + jabatan | lengkap dengan padanan software house dan uraian tugasnya |
| sesi / proyek | id sesi 12-char dan nama folder project-nya, plus cabang git-nya |
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

### Daftar kru: seksi per proyek & pin

Begitu dua-tiga repo dipantau sekaligus, daftar kru di panel jadi campur aduk.
`renderCrew()` sekarang menyusun baris lewat `kruSusun()`: sesi nyata
dikelompokkan per `a.project` di bawah **kepala seksi** kecil (nama proyek +
jumlah, seperti map gantung di lemari arsip) yang bisa **dilipat** dengan
sekali klik — daftar proyek yang dilipat diingat peramban (`kruLipat`).
Kepala seksi cuma muncul kalau memang ada **≥2 proyek berbeda**; satu proyek
tidak butuh judul. Yang tanpa proyek jatuh ke seksi "tanpa proyek" paling
bawah.

📌 di tiap baris **menyematkan** sesi ke puncak daftar, di luar seksi mana pun
— buat sesi yang sedang kamu tunggu. Pinnya sengaja tidak diingat: id sesi
tidak pernah kembali, jadi pin hilang begitu pegawainya pulang
(`kruSusun()` membersihkannya tiap gambar ulang). Peserta rapat tetap
menumpang persis di bawah pemanggilnya (`p.pemilik`), termasuk ikut
tersembunyi kalau seksinya dilipat; standby tetap paling bawah. Angka besar
"sesi" di atas panel tidak berubah — tetap `agents.size`, bukan jumlah yang
sedang kelihatan.

### Cabang git sebagai konteks sesi

Nama folder saja tidak cukup membedakan dua pegawai di proyek yang sama:
sejak ada worktree, yang satu bisa di `master` dan yang lain di `fitur/x`
dengan nama folder yang sama-sama `agent-room`. Jadi tiap event yang punya
`cwd` juga membawa `cabang` — dibaca server langsung dari `.git/HEAD` (kalau
`.git`-nya berkas `gitdir:` milik worktree, diikuti ke sana), naik ke folder
induk paling banyak delapan tingkat, tanpa memunculkan proses `git` sama
sekali karena ini jalan tiap tool call. Hasilnya nama cabang, 7 hex pertama
saat detached, atau kosong kalau bukan repo. Di-cache per cwd 15 detik, dan
di luar itu cukup cek mtime HEAD — checkout selalu menulis ulang berkas itu.
Yang keluar ke halaman hanya nama cabangnya, bukan path.

### Buku induk pegawai

Kartu di atas cuma tahu **satu sesi**: tutup terminalnya, angkanya ikut
pulang. Buku induk (`buku-induk.json`, `AGENT_ROOM_BUKU_INDUK`) adalah arsip
kariernya — lintas sesi, lintas restart — dan kuncinya **nama folder
proyek**, bukan sesi: session id selalu baru, nama panggilan diacak, jabatan
bisa diganti dari dropdown kapan saja. Satu-satunya identitas yang bertahan
dari hari ke hari adalah folder tempat dia bekerja, jadi "pegawai" di buku
ini artinya *siapa pun yang bekerja di folder itu*.

Per proyek dicatat: jumlah sesi, tool call, yang gagal, **jam dinas** (jumlah
celah antar event hook yang masih ≤ 5 menit — jam *aktif*, bukan jam
kalender, jadi sesi yang dibiarkan terbuka semalaman tidak naik pangkat
karenanya), **fan-out** (berapa kali memanggil Task/Agent/Workflow), event
pertama dan terakhir, cabang git yang pernah disinggahi, dan tabel tool
(dibatasi 40 kunci teratas, sisanya dilebur ke `(lain)`). Bahannya **hanya
event hook nyata** lewat `/event` — event ambient tidak pernah sampai ke
sini, dan peserta rapat bukan sesi: yang dihitung cuma fan-out pemanggilnya.
Ditulis debounce ≤ 20 detik dan saat server keluar, dibaca sekali saat start.

Dari jam dinas itu server menghitung **golongan** ala ASN, dan angkanya
selalu berlabel *sejak dipantau*:

| Golongan | Jam dinas |
|---|---|
| CPNS | < 2 jam (atau belum ada tool call) |
| Pengatur | ≥ 2 jam |
| Penata Muda | ≥ 10 jam |
| Penata | ≥ 40 jam |
| Pembina | ≥ 120 jam |

Kenaikan golongan dideteksi server saat mencatat, satu event `promosi` per
kenaikan; halaman menjawabnya dengan satu nota **SK Kenaikan Pangkat** di
kotak kabar dan pegawai seproyek bersyukur di balonnya. Proyek dengan fan-out
tertinggi (≥ 10) diusulkan jadi **Kepala Bidang** — dan itu berhenti di kata
*usul*: label di kartu bertambah "usul: Kepala Bidang", tapi jabatan, seragam,
dan meja tidak berubah dari data. Aturan 1 berlaku di sini juga: pangkat tidak
boleh menyandera pekerjaan. Aturan 2 juga: angka karier tampil sebagai baris
terpisah di kartu, tidak dicampur ke tool call sesi maupun `/kendali`.

Yang keluar ke disk dan ke `GET /buku-induk` (tanpa token, sekelas
`/token-riwayat`) cuma angka dan nama — folder, cabang, tool. Tidak ada label,
tidak ada isi, jadi tidak ada yang perlu tunduk ke `AGENT_ROOM_ISI`. Berkasnya
tidak di-commit (`.gitignore`), sama seperti riwayat token.

### Pegawai tetap per proyek

Dulu nama pegawai diundi tiap sesi: buka dua terminal di folder yang sama, dapat
dua orang asing; tutup lalu buka lagi, orangnya berganti. Sekarang tiap folder
proyek punya **formasi**: kursi #1 sampai #12, dan nama serta jabatan menempel
pada **kursi**, bukan pada sesi.

Jadi terminal pertama di sebuah folder selalu ditempati orang yang sama, terminal
kedua selalu orang kedua yang sama, dan begitu seterusnya — hari ini, besok,
maupun setahun lagi. Sesi ke-13 yang jalan bersamaan berjalan tanpa nama tetap,
persis perilaku lama.

- **Kursi dilepas waktu sesi pamit**, jadi kursi #1 bebas untuk terminal
  berikutnya di folder itu.
- **Penghuni yang diam lebih dari 30 menit** dianggap sudah pulang tanpa pamit
  dan kursinya disapu.
- **Nama yang kamu ganti sendiri jadi permanen**: kursi itu ditandai `manual`,
  dan undian tidak akan pernah menimpanya lagi.
- **64 folder** yang boleh punya formasi. Waktu penuh, yang dibuang adalah folder
  dengan kunjungan **paling tua** dan tidak sedang dihuni — bukan yang paling
  lama dibuat, supaya folder yang benar-benar dipakai tidak pernah kehilangan
  orangnya. Sengaja bukan kedaluwarsa per hari: folder yang ditengok lagi
  setahun kemudian tetap berhak atas pegawai yang sama.

Disimpan di `formasi.json`, **berkas sendiri, bukan menumpang di
`buku-induk.json`**. Menumpang berarti menaikkan versi skema buku induk, dan
server versi lama yang membaca berkas versi baru akan menolak lalu menimpa
seluruh berkas — jam dinas dan golongan semua orang hilang cuma gara-gara fitur
nama. Dengan berkas terpisah, turun versi paling banter kehilangan nama;
kariernya utuh.

Aturan privasi dijaga dari sini juga: yang ditulis ke disk cuma nama panggilan,
id jabatan, cap waktu, nama folder, dan nama cabang/mesin. **Id sesi tidak
pernah ikut** — ia hidup di memori saja dan sengaja ditanggalkan waktu berkasnya
ditulis. Cabang git dicatat sebagai keterangan "dari mana dia terakhir
bertugas", bukan bagian dari identitas.

`AGENT_ROOM_PEGAWAI_TETAP=off` mematikan seluruhnya: nama kembali diundi tiap
sesi dan `formasi.json` tidak pernah lahir.

### Seragam kantor cabang

Kalau beberapa mesin melapor ke satu kantor pusat (lihat **Kantor pusat & kantor
cabang** di [Jalanin & pasang](01-jalanin.md)), tiap mesin dapat **rompi
seragam** sendiri: khaki, kelabu dinas, hijau lapangan, atau biru dinas. Nama
mesin di-hash (FNV-1a, ditulis tangan — nol dependency) lalu dipetakan ke salah
satu dari empat, jadi satu mesin selalu berompi sama tanpa perlu didaftarkan.

**Pegawai lokal tidak pernah berompi.** Rompi itu penanda "orang ini bertugas
dari cabang", jadi mesin yang tidak menyebut namanya tidak dapat apa-apa.

Rompi menumpang **di atas** seragam harian, tidak menggantikannya: batik Rabu
dan Jumat tetap terlihat di baliknya. Karena itu warnanya dipilih dengan syarat
keras dan dijaga `uji-seragam.mjs` — usulan awal rancangan (hijau `#41603c`,
kelabu `#4f545c`, cokelat `#7a4f2e`) semuanya jatuh di uji itu karena masing-masing
cuma berjarak 7, 41, dan 16 dari batik hijau Jumat, navy Rabu, dan batik cokelat
Jumat. Rompi yang warnanya setara bajunya tidak menandai apa pun. Yang dipakai
sekarang lebih terang dari semua baju gelap dan tetap lebih gelap dari kemeja
putih. Tidak ada cokelat sama sekali: setiap cokelat yang cukup jauh dari batik
cokelat sudah menjadi khaki.

Di daftar kru, chip mesin memakai warna rompi orangnya supaya panel dan ruangan
cocok tanpa perlu membaca nama mesin. Chipnya sendiri tetap muncul selama sesi
menyebut mesin, walau tabel warna kebetulan tidak punya jawaban — "ada atau
tidak" tidak boleh bergantung pada warna.

### Seragam satpam & OB

Satpam dan OB **tidak ikut seragam harian** PNS (putih, batik Rabu, batik
Jumat): jabatannya ber-`pal.seragam`, dan `terapkanSeragamHarian()`
melewatinya, jadi mereka memakai seragam lapangannya sendiri setiap hari
(`SERAGAM_PETUGAS` di `room.js`).

- **Satpam** — kemeja khaki pucat, celana dan ikat pinggang hitam bergesper
  emas, tali bahu hitam, papan nama hitam di dada kiri, tanda SATPAM di dada
  kanan, lencana perak, tanda kesatuan merah di lengan pendek, dan **topi pet
  hitam** bermonogram perak (jenis kepala baru `'topi'` di `drawHead()`, lidah
  topinya menjorok ke arah hadap). Satpam perempuan tetap berjilbab.
- **OB** — kemeja dua warna: bahu, dada atas, dan lengan pendek **navy**, badan
  **abu**, **piping putih** di sambungannya, plaket kancing tertutup, celana
  hitam.

Detailnya cuma digambar kalau `pal.seragam` terisi; jabatan lain memanggil
`r()` dengan urutan dan warna yang persis sama seperti sebelumnya, jadi golden
`uji-zorder` dan hitungan piksel `uji-seragam` tidak bergeser. Petugas tetap
juga tidak lagi dipudarkan seperti standby penambal — di alpha 0,55 detail
seragam 28 px tidak terbaca.

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

Semuanya dihitung dari `FASE_HARI` di [public/room.js](../public/room.js) —
patokan warna langit, selubung ruangan, intensitas lampu, dan berkas cahaya
per jam. Mau memeriksa suasana tertentu tanpa menunggu jamnya tiba? Tambah
`?jam=18.4` di URL (boleh digabung: `?demo=1&jam=22`).

### Babak hari kerja

Jam saja tidak cukup buat menjawab "sekarang kantor sedang apa": jam 12 hari
Rabu itu istirahat, jam 12 hari Minggu itu libur. `babakHari()` di
[public/room.js](../public/room.js) menyimpulkannya jadi satu status yang dibaca
event lewat `S.babak`:

| Babak | Kapan |
|---|---|
| `apel` | 07:00–07:45 hari kerja |
| `kerja` | 06:00–16:00 selebihnya |
| `istirahat` | 12:00–13:00; Jumat 11:30–13:00 |
| `pulang` | 16:00–17:00 |
| `lembur` | 17:00–22:00 |
| `malam` | 22:00–06:00 |
| `libur` | Sabtu/Minggu, hari kejepit (`HARI_KEJEPIT`), libur nasional (`LIBUR_NASIONAL`) — sepanjang hari |

`S.jam` dan `S.kerjaJam` **tetap ada**: tidak ada `syarat` event lama yang
diubah. Babak cuma masuk lewat pintu kedua — field opsional `babak` pada
definisi event, pengali bobot per babak (`{ istirahat: 2, lembur: .3 }`;
yang tidak disebut = 1, nol = tidak ikut undian di babak itu). Dipasang ke
belasan event yang paling jelas: gorengan, ngerumpi di pantry, ojol, dan
tukang bakso lebih mungkin saat istirahat; kopi pagi & rapat pimpinan saat
kerja; lembur-sampai-malam saat lembur; sandal jepit saat pulang/lembur.
Pengali diterapkan di `pilihBerbobot`, bukan di `syarat`, supaya event yang
bobotnya nol di satu babak tidak menghabiskan cooldown dan `uji-event.mjs`
(yang merakit `S` sendiri tanpa `babak`) tetap jalan.

### Kekusutan harian

Ruangan tidak cuma berganti cahaya sepanjang hari — dia juga **mengusut**.
Pagi-pagi meja masih rapi; menjelang siang berkas mulai menumpuk; menjelang
pulang mejanya penuh tumpukan dokumen, ada dus di kolong, kursi ditinggal
serong, dan lembaran tercecer di lantai. Sesudah jam pulang tumpukannya
menyusut lagi, dan pagi berikutnya ruangan sudah bersih.

Semuanya satu angka: **`RUANGAN.kusut`, 0..1**. Ini satu-satunya field
`RUANGAN` yang berjalan sendiri mengikuti jam, bukan bekas sebuah kejadian.
Kalau tiap benda punya jamnya masing-masing, yang kebaca cuma "ada yang
berubah" — bukan "sudah sore"; jadi tumpukan, kursi, dan ceceran semuanya
membaca kurva yang sama supaya ruangannya mengusut serempak.

| Jam | `kusut` (sesi sepi → ramai) | Yang kelihatan |
|---|---|---|
| 05.00–07.00 | 0,01–0,03 | bersih; petugas kebersihan sudah lewat |
| 09.00 | 0,14–0,20 | lapis pertama di meja yang pemiliknya paling cuek |
| 11.30–12.00 | 0,34–0,51 | keenam meja sudah menumpuk minimal satu lapis |
| 14.00 | 0,49–0,69 | kursi ditinggal serong, dus mulai turun ke kolong |
| 16.00–16.48 | 0,67–1,00 | puncak: 2–4 lapis per meja, map nyelip, lembar teratas terlipat |
| 19.00 | 0,27–0,38 | tinggal sisa; yang pulang membereskan mejanya sendiri |
| 21.00 | 0,10–0,14 | nyaris bersih lagi |

Kurvanya patokan per jam di `KUSUT_JAM` ([public/room.js](../public/room.js)),
idiom sama seperti `FASE_HARI`. Dua hal yang membedakannya:

- **Bukan fungsi murni dari jam.** Nilainya disimpan dan diseret pelan ke
  sasaran (naik 0,004/detik, turun 0,03/detik), jadi event yang membereskan
  ruangan lewat `bereskanKusut(sisa)` menyisakan jejak "sempat bersih"
  beberapa menit sebelum tumpukannya kembali — bukan terhapus di frame
  berikutnya oleh kurvanya sendiri. Yang memakainya: `jumat-bersih`
  (`0.1`, seisi ruangan) dan `ob-ngepel-lantai` (`0.6`, cuma lantainya —
  tumpukan di meja orang tidak disentuh OB).
- **Tick pertama menyetel langsung, tanpa diseret.** Membuka halaman jam
  15.00 harus dapat kantor yang *sudah* kusut, bukan kantor bersih yang baru
  mulai berantakan di depan mata penonton.

Sesi ramai mengusutkan lebih cepat: kurvanya dikali `0,7 + 0,3 ×
min(1, sesi/3)`. Berhenti di 0,7 (bukan 0) karena kantor tanpa sesi nyata
tetap dihuni pegawai standby yang mondar-mandir — sore tetap sore, cuma
tumpukannya berhenti satu-dua lapis lebih rendah. Hari libur (`hariLibur`)
dipatok maksimal 0,1: tidak ada yang mengusutkannya.

Yang dibacakan angka itu:

- **Tumpukan dokumen di meja kerja** (`gambarKusutMeja`) — 2 px per lapis,
  meruncing ke atas, ditumpuk **di atas** pernak-pernik tema meja: zona
  identitas `x+6..+29` sudah terisi penuh di keenam tema, dan begitulah meja
  kantor sungguhan jadi penuh — berkas baru ditaruh di atas yang sudah ada,
  bukan dicarikan tempat kosong. Kapasitas maksimumnya beda per meja
  (`KUSUT_MEJA_MAKS`) dan **mengikuti kepribadian meja di `drawMejaTema`**:
  meja rapi mentok 2 lapis dan paling lama bertahan, meja berantakan 4 lapis
  dan sudah menumpuk sejak jam 10. Lewat 0,62 ada map nyelip miring
  bersandar di sisi kanan; lewat 0,82 lembar teratas nyeruak, sudutnya
  terlipat.
- **Dus arsip di kolong meja** — lewat 0,55, bertumpu di palang bawah,
  berhenti sebelum tiang kursi.
- **Kursi ditinggal serong** — lewat 0,42, offset dari tabel `KUSUT_KURSI`
  (bukan `Math.random()`, jadi tidak bergeser sendiri tiap frame). Cuma meja
  yang **sedang kosong**: kursi yang diduduki tertutup badan pegawainya.
- **Ceceran di lantai** (`gambarKusutLantai`) — 14 titik tetap di
  `KUSUT_LANTAI`, masing-masing punya ambang sendiri, jadi cecerannya
  menyebar pelan-pelan dari tengah ruangan ke pinggir. Ini **bukan**
  `RUANGAN.kertasLantai` (itu punya event, meluruh dalam hitungan detik):
  yang ini turunan murni dari kurvanya, **tanpa state** — muncul dan hilang
  sendiri, jadi tidak ada array yang bocor kalau tabnya dibiarkan terbuka
  semalam, dan `bereskanKusut()` otomatis menyapunya. Titiknya tabel tetap,
  bukan acak: lantai yang titik sampahnya berpindah tiap frame kebaca
  sebagai kedipan, bukan sebagai kotor.

Tersedia buat event lewat **`S.kusut`**. Uji cepat tanpa menunggu jamnya
tiba: **`?kusut=0.9`** — boleh digabung dengan `?jam=` (`?kusut=` menang,
`?jam=` cuma mengatur cahayanya), misalnya `?demo=1&jam=7.4&kusut=1` untuk
memeriksa kantor yang kusut di bawah cahaya pagi.

### Tema kalender

Dekor musiman yang menempel sepanjang tanggalnya berlaku — bukan event yang
lewat lalu hilang — didaftar di tabel `TEMA` (id + syarat tanggal) dan
menempel di `RUANGAN.tema`, dievaluasi saat muat dan tiap ganti hari:

- **`agustusan`** (1–17 Agustus): umbul-umbul merah-putih di dinding atas,
  bendera lidi di tiap meja kerja, spanduk "DIRGAHAYU RI KE-N" (N dari tahun)
- **`ramadan`** (`taksirHijri` bulan 9): papan jadwal imsak/berbuka di celah
  dinding antara rak server dan pintu kadis — jam saja, taksiran per bulan
- **`korpri`** (29 November): spanduk "HUT KORPRI KE-N"
- **`tahun-anggaran`** (1–7 Januari): spanduk "TAHUN ANGGARAN <tahun>"

Digambar oleh `gambarTemaDinding()` (satu baris di `drawWall`, di bawah
neon) dan `gambarTemaMeja()` (satu baris di `drawMejaKerja`). Event acak
bertema sama — `hormat-bendera`, `ramadan-siang-sunyi`, `hari-korpri`,
`tahun-anggaran-baru` — **tetap jalan tanpa saling kunci**: dekor mereka
tidak ada yang dobel dengan ini (sajadah ramadan di lantai vs jadwal di
dinding; seragam Korpri vs spanduk; hormat & beres-beres arsip tanpa dekor).
`S.tema` tersedia kalau suatu hari ada yang dobel. Uji: `?tema=agustusan`,
`?tema=ramadan`, `?tema=korpri`, `?tema=tahun-anggaran`.

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

Ini salah satu lalu lintas keluar yang dibuat server (yang lain: nota dinas
keluar dan suara ucap, dua-duanya mati bawaan), hasilnya di-cache
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

## Rupa halaman

Chrome di sekeliling kanvas — panel kanan, bilah panggung, kartu pegawai, semua
dialog — mengambil warnanya dari benda yang benar-benar ada di kantor ASN
sekarang, bukan dari dashboard gelap ala terminal:

- **kain PDH khaki** buat latar panel; kartu dan dialog di atasnya kertas krem
  bertepi khaki tua, seperti berkas di atas meja;
- **kop surat** buat kepala panel dan kepala dialog: lencana bintang emas di
  atas biru Korpri, nama instansi serif rata tengah, lalu garis tebal-tipis —
  ciri yang langsung dikenali siapa pun yang pernah membaca surat dinas;
- **pita merah-putih** setinggi 6 px di puncak halaman, diulang setipis 4 px di
  tepi atas kartu pegawai. Merah bendera cuma dipakai di situ, di tombol utama
  (Tugaskan, Pakai folder ini), dan di tanda galat — kalau dipakai di mana-mana
  dia berhenti berarti;
- **papan nama akrilik** buat label jabatan di baris kru: hitam dengan huruf
  kapital kecil, satu-satunya elemen hitam di panel;
- **emas** buat angka yang harus terbaca sekali lirik (statistik, grafik token):
  emas tua di atas krem, karena emas terang gagal kontras di latar terang; emas
  terang disimpan buat bilah panggung yang gelap;
- **biru Korpri** buat tautan, fokus keyboard, dan kata kerja di log;
- **panel kayu jati gelap** di balik diorama, seperti dinding ruang kepala dinas,
  supaya pixel-art-nya tetap menonjol di antara permukaan yang serba terang.

Huruf ikut dibagi dua peran: serif (Georgia/Times) buat yang "resmi" — nama
instansi, judul dialog, judul bagian, angka statistik — dan monospace buat yang
"mesin": log, chip, isian, jalur berkas. Satu pengecualian sengaja: modal kabar
memakai monospace seluruhnya plus warna WA asli, karena yang ditiru di situ
aplikasi chat, bukan dokumen kantor.

Dua catatan buat yang mengubahnya. Kotak statistik di panel diberi selector
`.stats .stat`, bukan `.stat`, karena dialog token juga berkelas `stat` dan dulu
ikut mewarisi `flex: 1` (melebar sepenuh layar) serta `text-align: center` dari
kotak panel. Fokus keyboard (`:focus-visible`) dan `prefers-reduced-motion`
ditangani global, jadi tidak perlu diulang per elemen.

### Resolusi HD: kisi 480×356, piksel di baliknya sebanyak layar

Ruangan ini digambar di kisi **480×356 piksel dunia** — sejak pintu WC
**576×356**, dilebarkan ke kanan tanpa menggeser satu koordinat lama pun (lihat
**WC, dan dunia yang dilebarkan ke kanan**). Semua koordinat di `room.js`, semua
tabel stasiun, semua golden uji, dan kamera bekerja di angka yang sama seperti
hari pertama. Yang dulu ikut
terkunci di 480×356 adalah **kanvasnya** — dan itu masalahnya.

Kanvas 480 px yang direntangkan ke layar 1.100 px diperbesar peramban dengan
`image-rendering: pixelated`. Kalau perbesarannya bukan bilangan bulat — dan di
layar biasa memang tidak; skala tampil 1,81 dikali `devicePixelRatio` 1,25
menghasilkan 2,26 — satu piksel dunia jatuh jadi **dua** baris layar di satu
tempat dan **tiga** di tempat lain. Itu yang kebaca sebagai garis tepi belang
dan huruf yang lumer: bukan pixel-art yang tajam, melainkan pixel-art yang
diperbesar asal.

`SS` (supersampling, dipasang `pasangSS()` dari `fit()`) memisahkan keduanya.
Kanvasnya dibikin `SS` kali lebih besar dan `ctx` diskalakan `SS` kali, jadi
satu piksel dunia = kotak `SS`×`SS` piksel kanvas. Akibatnya dua-duanya benar
sekaligus:

- **Yang kotak tetap kotak.** `r()`/`fillRect` berkoordinat bulat jatuh persis
  di batas kotak `SS`×`SS`. Tidak ada satu pun sprite yang jadi kabur.
- **Yang bukan kotak akhirnya punya piksel.** Teks papan nama, layar, dan
  plakat; lengkung jam dinding dan rambu; gradasi lantai; pendar lampu; foto
  pejabat yang miring — semuanya digambar di resolusi layar, bukan di 480 px
  lalu diperbesar.

`SS` diambil dari `Math.ceil(skala × devicePixelRatio)` dan dibatasi 3, jadi
kanvasnya tidak pernah lebih kasar daripada layarnya dan tidak pernah membakar
9 kali piksel tanpa perlu. `?hd=1..4` memaksa angkanya, `?hd=0` menguncinya di
1 (kisi apa adanya, buat mesin lemah atau buat membandingkan). Diukur di
mesin penulisnya, satu frame berharga sama saja di `SS` 1, 2, maupun 3 (~4,5
ms): yang mahal di ruangan ini geometri dan logikanya, bukan jumlah pikselnya.

Satu pengecualian: **overlay tetap memakai `pixelated`**, tidak pernah
penyaringan halus. Penyaringan halus bekerja dengan mencampur piksel
bertetangga, dan di `?overlay=chroma` tetangga tiap sprite adalah hijau
`#00ff00` — campurannya jadi piksel setengah hijau yang tidak bisa dibuang
chroma key dan menyisakan rumbai hijau di sekeliling pegawai. `SS` tetap
menaikkan resolusi teks dan lengkungnya; cuma penskalaan akhirnya yang dijaga
tidak membaurkan warna.

### Bahan dinding & lantai

Menaikkan jumlah piksel saja tidak membuat ruangan terbaca "HD" — dinding dan
lantainya dulu bidang warna rata (dua pita cat di atas, satu kisi ubin di
bawah), dan begitu pikselnya bertambah justru **kerataan** itu yang paling
kelihatan. Yang kurang bahannya, bukan resolusinya. Tiga lapisan menambalnya:

- **`dindingLapis()`** — serat cat rol (bintik setipis satu piksel kanvas, dua
  arah: yang cuma gelap kebaca sebagai kotor, yang dua arah kebaca sebagai
  permukaan yang dicat), jatuh cahaya dari plafon ke kaki dinding (yang memberi
  dinding *arah*; sebelumnya krem 0..70 benar-benar satu nilai), lis pemisah
  tiga tingkat dengan bayangan yang jatuh ke wainscot, pilar yang punya sisi
  terang jadi terbaca sebagai pilaster bukan goresan, dan sudut dinding-lantai
  yang digelapkan.
- **`lantaiLapis()`** — terazo (serpih agregat sebesar satu piksel kanvas, jadi
  butirnya baru benar-benar ada begitu `SS` > 1), nada tua-muda per ubin seperti
  ubin yang dipasang dari beberapa dus, nat dengan sisi gelap dan bibir terang
  supaya ubinnya terbaca menonjol, dan kilap poles sejajar deret jendela. Retak
  ubinnya juga diperbaiki: dulu satu bentuk yang sama persis di tiap ubin
  terpilih — di kisi 480 px itu lolos, di resolusi tinggi stensil berulang itu
  langsung kebaca sebagai tanda panah — sekarang tiap ubin dapat patahannya
  sendiri dari `acakTetap()`.
- **`bayangKaki()` & `bayangDinding()`** — bayangan tempel di kaki perabot dan
  di balik benda yang menggantung. Ini penambah kedalaman termurah yang ada:
  tanpa dia tiap benda kebaca *ditempel* ke lantai/dinding, bukan *berdiri* di
  atasnya. Tabelnya ditulis tangan karena `PROPS` tidak menyimpan lebar maupun
  garis pijak; meja rapat tidak ikut (`drawRapat` sudah punya bayangannya
  sendiri) dan meja kerja dibaca dari `MEJA_KERJA_X` supaya tidak ada tabel
  kedua yang bisa basi.

Dua yang pertama **statis** — tidak menyentuh `now`, `RUANGAN`, maupun `MOD` —
jadi digambar sekali ke kanvas offscreen dan sesudahnya cuma satu `drawImage`
per frame. Tanpa itu ribuan `fillRect` serat dan terazo akan diulang 60 kali
sedetik demi gambar yang sama persis. Bintiknya pakai `acakTetap()`, bukan
`Math.random()`: lantai yang butir terazonya pindah tiap muat ulang bukan
lantai, itu kedipan. Cache-nya dibuang tiap `SS` berganti, karena isinya
digambar dalam piksel kanvas, bukan piksel dunia.

### X-banner: papan informasi aplikasi

X-banner di pojok kiri ruangan (`x16..42`, `y188..240`) dulu tempelan dekor —
kepala biru, satu blok emas berkomentar "logo bundar-ish", tiga pita abu
sebagai teks palsu. Bentuknya benar dari jauh dan tidak berarti apa-apa dari
dekat. Sekarang dia **papan nama aplikasinya sendiri, dan bisa diklik**: kamera
membidiknya dengan zoom 4, lalu papan "Tentang kantor ini" terbuka.

Wajahnya digambar dengan teks dan bintang lengkung sungguhan, bukan pita abu.
Di kisi 480 px itu memang mustahil terbaca — yang membuatnya mungkin adalah
supersampling (lihat **Resolusi HD** di atas): pada bidikan zoom 4 satu piksel
dunia jadi 12 piksel layar, cukup untuk huruf 5 px dan bintang lima sudut yang
benar-benar bersudut. Fitur ini yang paling langsung **memakai** resolusi itu,
bukan cuma menikmatinya.

Tiga hal yang ditata bersama, bukan sendiri-sendiri:

- **Satu sumber angka.** `XBANNER` dipakai bertiga — menggambar, hit-test klik,
  dan bidikan kamera — sama seperti `PANTRI`. Menggeser bannernya menggeser
  ketiganya sekaligus.
- **Panel menyusul kamera, bukan jam.** `tickBanner()` membuka papan begitu
  `KAMERA.zoom` benar-benar sampai, bukan sesudah jeda tetap: dengan
  `prefers-reduced-motion` kameranya langsung sampai, dan panel yang tetap
  menunggu 600 ms akan terasa macet.
- **Papannya di tengah, tirainya terang.** Penjepitan kamera (`tickKamera`)
  melarang bidikan melihat keluar ruangan, jadi banner yang menempel di tepi
  kiri terjepit ke sepertiga kiri layar — bukan ke tengah. Papan informasinya
  muncul di tengah layar seperti dialog lain, dengan tirai yang jauh lebih
  terang, jadi banner yang baru dizoom tetap kelihatan di kirinya; tirai gelap
  penuh layar akan membuang zoom yang baru saja dilakukan. Papan ini pernah
  rata kanan, supaya berdampingan dengan bannernya seperti benda pameran dan
  plakatnya — tapi di layar lebar itu justru menaruhnya menempel di tepi, jauh
  dari mata, dan terasa dilempar ke pinggir.

Menutupnya (tombol ✕, Esc, klik di luar papan, atau klik bannernya lagi)
**sekaligus melepas bidikannya** — papan yang tertutup sementara kameranya
masih terkunci zoom 4 di pojok kiri membuat ruangan terasa macet, dan tidak ada
lagi yang kelihatan bisa diklik untuk melepaskannya.

Isinya fakta yang bisa dicek di repo, bukan karangan: nama paket, deskripsi,
dan syarat Node dari `package.json`; alamat repo dari `package.json#repository`;
cara menjalankan disalin dari README; "tanpa dependensi" dari `dependencies`
yang memang kosong; dan pengembang dari `git log` — 45 commit pertama semuanya
atas nama yang sama. **Tidak ada nomor versi di papan ini, dan itu disengaja:**
halaman tidak punya jalan membacanya (server tidak menerbitkannya di `/kendali`
maupun `/health`), jadi angka yang diketik tangan pasti basi diam-diam pada
rilis berikutnya — dan papan "tentang" yang berbohong soal versinya lebih buruk
daripada papan yang tidak menyebut versi sama sekali. Sisanya dijaga
`selaras-dokumen.mjs` sebagai pasangan kelima (kode vs manifes): alamat repo,
nama paket, perintah `npx github:…`, syarat Node, dan klaim dependensi semuanya
diadu ke `package.json` tiap `npm test`.

### Kamera

Kisi dunianya tetap (576×356 sejak pintu WC) dan `fit()` cuma mengurus piksel layar (skala CSS
plus `SS` di atas); kameranya (`KAMERA` di room.js) hidup di koordinat dunia
dan dipasang di `frame()` lewat `setTransform` — dikalikan `SS` di situ juga —
sebelum segala gambar, jadi lantai, props, pegawai, dan partikel tidak tahu ada
kamera maupun ada supersampling. Zoom bidikannya cuma 1 atau 2 —
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

### Tampilan 3D: maket kantor

Ruangan yang sama bisa dilihat sebagai **maket tiga dimensi** — seperti maket
gedung yang dipajang di lobi dinas: lantai terazo di atas alas kayu jati,
dinding belakang lengkap dengan Garuda dan jam dindingnya, perabot yang
benar-benar berdiri, dan pegawai voxel yang berjalan, duduk di kursi rapat,
dan mengetik di laptop mejanya. Tombol **3D / 2D** di bilah bawah memindah
tampilan dan pilihannya diingat; `?tampilan=2d` atau `?tampilan=3d` di URL
mengalahkannya. Bawaannya 3D, kecuali di `?overlay=1` (siaran butuh piksel
yang dikunci) dan `?kadis=1` (tidak ada kanvas sama sekali).

Kendalinya: **seret** memutar maket, **klik kanan / shift+seret** menggeser,
**roda** mendekat-menjauh, **klik dua kali** kembali ke tampak awal. Di layar
sentuh, satu jari memutar dan dua jari mencubit & menggeser. Klik pegawai atau
perabot membuka kartu yang sama seperti di 2D, dan kamera ikut terbang ke
barangnya.

**Satu dunia, dua cara melihat.** Simulasinya tidak berubah satu baris pun:
pegawai, rute, stasiun, antrean, event acak, dan Aturan 1 tetap milik
`room.js`, di kisi 672x356 yang sama. `public/ruang3d.js` cuma cara lain
menggambarnya, dan menempel lewat satu kait saja — objek `TIGA` di room.js:

- `frame()` menjalankan seluruh pembaruan seperti biasa, lalu kalau
  `TIGA.aktif` menyerahkan penggambarannya ke `TIGA.gambar()` alih-alih
  `drawWall`/`drawFloor`/lapisan 2D. Yang digerbangi HANYA penggambaran — sama
  seperti aturan bukaan ruang kadis.
- `keLayar(x, y, kaki)` mendapat argumen ketiga: **garis kaki** benda yang
  memuat titik itu. 2D tidak membutuhkannya; 3D butuh untuk tahu seberapa jauh
  titiknya ke dalam. Balon ucap, balon pikir, lencana galat, dan kartu pegawai
  memberikannya (`this.y`).
- `let ctx` (bukan `const` lagi) + `gambarKe(k, fn)`: menukar `ctx` sementara
  lalu SELALU mengembalikannya. Itu yang membuat semua fungsi gambar 2D bisa
  dipakai ulang tanpa tahu dirinya sedang dipakai 3D.
- `TIGA.tanpaNeon`: `drawWall` melewatkan tabung neon, karena di 3D neon itu
  benda gantung sendiri yang sekaligus jadi sumber cahaya.
- `TIGA.tanpaCCTV`: `drawWall` melewatkan kubah CCTV dan bayangan tempelnya,
  karena di 3D kubahnya benda yang menoleh dan melempar bayangan sungguhan.

Tanpa `ruang3d.js` (harness uji di VM), tanpa WebGL2, atau kalau konteks
WebGL-nya dicabut peramban, `TIGA.aktif` tetap/kembali `false` dan ruangan
jalan persis seperti dulu. `uji-tiga.mjs` menjaga janji itu.

**Nol pustaka.** WebGL2 ditulis tangan — matriks, shader, peta bayangan —
sama seperti musik lofi dan bunyi event yang disintesis sendiri. Kantor ini
tetap tidak memuat apa pun dari luar mesinmu.

**Kerangka 3D, kulit 2D.** Yang dibangun ulang sebagai benda 3D cuma
BENTUKNYA. Permukaannya dilukis oleh fungsi gambar 2D yang sama persis, ke
kanvas tekstur berskala 3 texel per piksel dunia:

- **dinding** = seluruh bidang dinding 2D (baris 0..110): `drawWall`,
  `gambarDinding` event, dan prop yang memang menempel di dinding. Jam dinding
  tetap berdetak, cuaca di jendela tetap sungguhan (kacanya kini di punggung
  tembok — lihat **Perabot voxel**), bukaan ruang kadis tetap
  terlihat. Fungsi yang menggambar dua hal sekaligus dipanggil di dalam klip
  bagian dindingnya saja: `drawWindow` (jendela, tanpa meja printer di
  bawahnya) dan `drawFiling` (bagan struktur organisasi, tanpa kabinetnya);
- **lantai** = `drawFloor` + `gambarLantai` event apa adanya: terazo, karpet,
  berkas cahaya jendela, ceceran kusut, genangan. Karpet merah, karpet baca,
  meja lesehan, dan bantal duduk "ditimbulkan" — kotak rendah yang tutupnya
  memakai lukisan lantai di tapaknya sendiri;
- **kulit perabot** = muka depan filing kabinet, rak server (LED-nya tetap
  berkedip), badan fotokopi, dispenser, microwave, lemari counter pantri, dan
  seterusnya, masing-masing dilukis fungsi gambarnya sendiri di dalam klip
  kotaknya — lalu dipasang sebagai **relief** (`reliefKulit`): mukanya dipecah
  jadi lapisan menurut bagian lukisannya, tiap lapisan kotak sendiri bermuka
  potongan kulit yang sama dan bersisi warna tepi lukisan di tempat itu
  (dicicip dari kanvas kulitnya, jadi lemari kayu dapat samping kayu tanpa
  tabel warna kedua). Rak server berongga dengan lima unit yang menonjol, papan
  nama, dan UPS paling depan; fotokopi berlaci kertas bergagang dan beroda;
  dispenser bercerukan tempat gelas dengan keran voxel; jendela microwave masuk
  ke dalam bingkai pintunya. Laci filing malah kotak sungguhan yang meluncur
  keluar (`laciFiling`) waktu ada yang mencari berkas, laci yang tertinggal
  terbuka, atau yang sudah dikosongkan — kulitnya dilukis dengan semua laci
  tertutup, supaya lukisan laci yang ketarik tidak menimpa laci di bawahnya.
  Mesin absen dan penghancur kertas sudah penuh voxel, tanpa kulit. Yang bukan
  "muka sebuah kotak" — rak terbuka, tanaman, barang di atas meja, akuarium,
  lemari kaca — tidak dilukis, tapi dibangun (lihat **Perabot voxel** di bawah).

Dinding dilukis ulang 20 kali sedetik, lantai 7 kali, tiap kulit menurut
lajunya sendiri (rak server 12, fotokopi 6, daun pintu WC & gudang 3, daun
pintu kadis 2).
Mode ringan menyeparuhkan semuanya dan mematikan peta bayangan.

**Proyeksi oblik sebagai kamus.** Gambar 2D ruangan ini proyeksi oblik: titik
bertinggi h di kedalaman z jatuh di layar pada `y = z - h`. Balikannya —
**z = garis kaki, h = kaki - y** — dipakai untuk menaruh apa pun yang cuma
punya koordinat 2D: balon, kartu, partikel, kartu event. Titik yang garis
kakinya di atas lantai (`kaki <= FLOOR_TOP`) menempel di bidang dinding.
Satu-satunya pengecualian: titik milik pegawai (balon di y-30) tingginya dikali
`SKALA_ORANG`, karena pegawai 3D lebih besar dari sprite-nya.

**Dinding dimundurkan 10.** Di 2D, perabot dinding cuma "setebal" 8 px antara
dasar dinding (y 110) dan garis kakinya (118..120) — di 3D itu lemari setipis
papan. Bidang dinding 3D ada di z=100, jadi perabotnya punya kedalaman 18..20
tanpa satu garis kaki pun bergeser: rute dan stasiun tetap berdiri di depan
mejanya masing-masing.

**Pegawai voxel, 1,4 kali sprite-nya.** Sprite 2D setinggi 28 px itu gaya
chibi, sementara perabot 2D (meja 18, meja stempel 24, pintu 80..86) diukur
untuk orang yang lebih besar — di skala 1 pegawainya jadi anak kecil di kantor
raksasa. Bonekanya dibangun dari kotak berendi (paha-betis, lengan di bahu,
kepala di leher) dengan palet jabatan yang sama: PDH putih/batik Rabu/batik
Jumat, seragam satpam (topi pet bermonogram, tali bahu, lambang merah di
lengan pendek) dan OB (kemeja dua warna), rompi kantor cabang dengan tanda
pangkatnya, rambut/peci/jilbab/topi dari `kepalaEfektif()`, kacamata, kumis,
dan kedip mata. Posenya dibaca dari sumber yang sama dengan 2D: langkah dari
`phase`, lengan kerja dari `workArms()`, pose event dari `posEvent()`, map
disposisi terangkat waktu menunggu keputusanmu, barang bawaan di tangan,
terkapar waktu ditekel satpam. Bedanya satu: di 3D mereka **duduk sungguhan**
— di kursi rapat (mengikuti `turunDuduk()`), di kursi meja kerjanya, dan
lesehan di pojok baca. Meja kerja 3D sengaja setinggi 15, bukan 18: papan
setinggi 18 jatuh di bahu orang yang duduk.

Pegawai standby (0,55) dan yang memudar di ambang pintu digambar **tembus
pandang sungguhan**, dua lintasan: kedalamannya dulu, lalu warnanya dicampur
di permukaan terdepan saja — sosoknya tetap utuh, bukan tumpukan kotak bening.

**Event jadi kartu bertebal.** Tiap event hidup yang punya `gambarProp`
dilukis ke kanvasnya sendiri (satu texel per piksel dunia — gambar event memang
pixel-art) dan dipasang sebagai **kartu tegak di kedalaman `sortY`-nya**:
urutan depth-sort 2D terjaga di ruang 3D, kucing yang tidur di karpet tetap
tertutup pegawai yang lewat di depannya. Kartunya tidak setipis kertas:
siluetnya dipindai, dan tiap tepi antara piksel isi dan piksel kosong jadi sisi
setebal 3 berwarna piksel tepinya — kucing jadi sprite voxel yang dari samping
tetap punya badan. Pemindaiannya dibatasi kotak isi gambar (dibaca lewat
tampilan 32-bit) dan paling sering 20 kali sedetik; gambar yang terlalu
berisik (>3.000 ruas tepi) tetap datar. `gambarLantai` dan `gambarDinding`
sudah ikut masuk tekstur lantai & dinding. `gambarAtas` dipilah dari pikselnya
sendiri: yang keempat pojoknya terisi (kilat foto bersama, mati lampu) jadi
selubung seluruh layar; sisanya jadi kartu bertebal di kedalaman aktor pertama
event itu, atau menonjol dari dinding kalau seluruh gambarnya jatuh di bidang
dinding. Partikel (tinta, glyph, uap, tetes AC) dicap tempatnya sekali: milik
pegawai terdekat, milik tamu ruang kadis, di lantai, atau di dinding; tetes AC
jatuh lurus ke ember yang di 3D berdiri tepat di bawah AC-nya.

**Tamu event jadi boneka.** Semua sosok orang di gambar event lewat satu
pintu, `drawPerson()` — dipanggil `gambarOrangLuar` (kurir, tamu salah alamat,
pegawai baru lapor diri, dan belasan lainnya), `TAMU_BIROKRASI.gambar`, dan
`TOKOH.gambar` (tamu tenar). Di kartu, sosok itu berdiri di kedalaman `sortY`
milik EVENT, bukan di tempat orangnya, jadi tamu yang lewat di lajur lain
terbaca sebagai guntingan kertas di tempat yang salah. Sekarang ±30 kali
sedetik gambar tiap event dijalankan sekali di **kanvas hampa** (semua perintah
gambar tidak melakukan apa-apa) sambil `drawPerson` diganti pencatat. Tiap
sosok yang tercatat — palet, hadap, melangkah atau diam, barang bawaan,
`globalAlpha`-nya — berdiri sebagai boneka voxel di `(x, y)`-nya sendiri,
segaya pegawai, berbayang, ikut pudar. Waktu kartunya dilukis, sosoknya
dilewati, jadi kartu tinggal berisi properti event. Aksesori tamu tenar (topi,
helm, kacamata hitam, raket di punggung, nomor jersey) dilukis ke **stiker**
kecilnya sendiri, diperbesar `SKALA_ORANG` di sekitar titik kakinya, dan
menempel di depan bonekanya mengikuti posisinya tiap frame. Tamu yang kakinya
jatuh di jalur perabot dinding (y < 121, misalnya pemanjat lemari arsip)
ditaruh di muka perabot dan diangkat setinggi selisihnya.

**Hewan bermodel.** Lima event kucing kantor (jalan lewat, duduk dibelai,
meringkuk di karpet rapat, tidur di atas rak server, duduk di keyboard laptop
pegawainya) dan tikus yang lewat kolong tidak lagi berkartu: `MODEL_EVENT`
membangun boneka voxel dari `E.data` yang sama — kucing dengan tiga pose
(kaki melangkah dan ekor tegak bergoyang, duduk tegak berekor melingkar,
meringkuk dengan napas naik-turun), warna bulunya ikut lukisan tiap event.

**Barang event bermodel.** Barang yang paling sering muncul di gambar event
ikut dibangun voxel dari `E.data`-nya lewat `MODEL_EVENT` yang sama. Isi taplak
meja rapat — nampan gorengan, nasi kotak bertutup terbuka, gelas kopi, kue
ulang tahun berlilin, toples arisan yang dikocok, kardus oleh-oleh, tumpeng
yang menyusut tiap dipotong, laptop rapat daring, takjil buka puasa, toples kue
lebaran, amplop nota dinas, berkas rapat pleno — berdiri di permukaan meja 3D,
di pita kosong antara mik dan gelas yang statis. Tangga lipat teknisi AC
merapat ke tembok di bawah unit AC: bonekanya memanjat anak tangga sampai
kepalanya tepat di bawah AC (lengan terangkat, obeng di tangan), ember
penadahnya digeser selama tangga berdiri, dan tangganya dipanggul terlipat waktu
datang dan pulang. Flipchart berkaki tiga, tapi kertasnya tetap kartu yang
dipotong ke bidang kertas (`klip`), jadi coretan bagannya tetap hidup. Kurir
menjinjing kardusnya (bawaan boneka) dan tablet tanda tangan; OB menyeret
gagang pel yang menyapu lantai di depan kakinya dan memasang papan "awas
licin"; kerucut licin dan payung lipat ada yang ditaruh dan ada yang dijinjing;
laba-laba turun dari plafon di atas meja rapat; ember kedua menadah atap bocor;
toa terpasang di atas lambrequin gorden. Kursi kosong yang "berputar sendiri" —
di 2D cuma sandaran yang menyempit-melebar — di sini benar-benar berputar dua
kali mengitari tiangnya. Barang di atas taplak yang belum bermodel tidak jatuh
ke lantai: kartu event ber-`sortY` 249..255 yang isinya habis di dalam bidang
meja berdiri di atas meja 3D (`zRapat()`).

**Gelombang kedua** menyusul untuk yang paling janggal sebagai kartu: barang
yang semestinya tergeletak — kain dagangan pedagang, barisan semut yang merayap
di lantai lalu memanjat ke bungkus gorengan di meja kerja, terminal colokan
berkabel di kolong meja, dus arsip yang terguling dan berkasnya tercecer, dus
auditor, petak silau matahari sore yang hangat di lantai — dan bawaan orang
luar: kantong kopi ojol, topi dan senter satpam, galon yang dipanggul rebah di
bahu, tiga nasi kotak di bahu pengantarnya (lalu bertumpuk di ujung meja rapat
dan dibagikan ke depan tiap peserta), kotak dana sosial yang didekap. Yang
dipanggul menempel ke matriks badan bonekanya (`st.kepala`), jadi ikut arah
hadapnya. Perangkat yang berulah ikut bertubuh: telepon berdering, busur wifi
di atas rak server, stabilizer bermeter jarum, laci fotokopi yang tertarik,
kertas "KUOTA" di muka printer, silau dan logo di layar rak server, vakum di
kakinya, kaca pintu kadis yang menyala selama kadis rapat tertutup; juga ayam
kampung yang mematuk dan lomba makan kerupuk bertiang bambu. Tiga sengaja
digeser dari letak 2D-nya karena di 3D tempat itu sudah diisi benda pejal:
stabilizer menempel di tembok (lantainya milik ember penadah AC dan tangga
teknisi), telepon di tepi depan meja stempel (2D-nya menimpa baki surat), dus
auditor di depan ujung kiri meja rapat (2D-nya menimpa kursi sisi dekat).
Cahaya monitor lembur tidak lagi berupa cakram kartu: layar 3D-nya sudah
memancar sendiri. Tamu event yang berpindah kini melangkah dan menghadap arah
jalannya — gambar 2D-nya selalu `idle` menghadap penonton, gaya yang di 3D
jadi meluncur menyamping; begitu berhenti, dia kembali menghadap penonton.

**Ruang kadis sungguhan.** Di 2D ruang kadis adalah bukaan berbingkai — lukisan
ruangan mini yang diklip ke kotak 72x46 di dinding. Di 3D dindingnya benar-benar
**dilubangi** di bingkai itu (kusen jati bertebal, ambang yang menjorok ke ruang
utama), dan di baliknya berdiri ruangan 128x64 yang terbuka ke atas seperti
seluruh maket: foto Presiden & Wakil Presiden mengapit Garuda, lemari piala,
pintu dalam, karpet merah tua, palem, meja jati berlis kuningan dengan map
disposisi, telepon, dan sepasang bendera meja, dan kadisnya duduk di kursi
bersandaran tinggi. Ruangan itu ada di bayangan tembok bersama, jadi punya
lampu gantungnya sendiri — sumber cahaya keempat di shader, yang juga merembes
sedikit lewat jendela ke ruang utama. Gordennya vitrase 3D yang tersibak
mengikuti `RUANG_KADIS.t` persis seperti `drawGordenSisip()`.

Koordinat bukaan tetap bahasa simulasinya: tamu berdiri di `KADIS_TITIK`,
kadis di (329, 65). x dipakai apa adanya — tamu dan meja jati tetap tepat di
balik jendelanya — sedangkan y bukaan (garis lantai `SISIP_LANTAI` sampai ambang
bawah) direntang jadi kedalaman ruangan oleh `kadisZ()`. Satu pintu,
`posisiOrang()`, memetakan tamu untuk boneka, balon ucap, kartu, klik (cuma
lewat jendela atau dari atas tembok), dan partikelnya. Yang beda dari 2D: tamu
**berdiri melapor**, tidak duduk — adatnya memang begitu, dan kepala orang
duduk (±33) tenggelam di bawah ambang jendela (35), jadi dari ruang utama dia
tidak akan kelihatan. Setelan bukaan `mati` tetap berarti nol jejak: lubangnya
disumbat potongan lukisan dinding yang sama dan ruangannya tidak digambar.

**Pintu WC dan gudang sungguhan.** Di 2D kedua pintu itu juga lukisan: yang
datang berdiri di ambang lalu memudar, dan isi ruangannya dilukis di daun pintu
selama terbuka. Di 3D tembok bersamanya kini satu kisi yang boleh berlubang
berapa saja — jendela kadis, pintu WC, pintu gudang — masing-masing dengan
kusen dan ambangnya. Daunnya sungguhan: berengsel di tepi kiri, mengayun ke
dalam selama `bukaSampai` simulasi (dilunakkan; langsung kalau
`prefers-reduced-motion`), dan muka depannya lukisan pintu **tertutup** dari `drawPintuWC()`/
`drawPintuGudang()` yang sama, jadi plang pria·WC·wanita, kisi yang berpendar
waktu terisi, slot ISI/KOSONG, strip hazard, dan gemboknya tetap terbaca. Di
balik pintunya ada ruangannya:

- **WC** berplafon, isinya cuma kelihatan lewat pintu yang terbuka: dinding
  keramik biru, bak mandi dan gayung, kloset jongkok, lampu plafon yang
  menyala selama ada orangnya atau pintunya terbuka (lampu titik kelima di
  shader, putih dingin).
- **Gudang** terbuka ke atas seperti seluruh maket: dua rak besi empat susun
  berisi kardus ATK dan rim kertas, balok melintang dengan bohlam telanjang
  (lampu titik keenam, kuning), dan tiga barang bekas pertama
  `RUANGAN.isiGudang` di lantainya sebagai voxel sesuai jenisnya (keset
  gulung, piala, plang lama, buku tamu, kursi rusak). Yang ke-4 dst. menumpuk
  di kanan pintu di atas palet kayu — paletnya juga yang menutup cetakan
  lukisan 2D tumpukan itu di tekstur lantai. Dua kardus kosong di depan
  pintunya jadi kotak sungguhan yang hilang selama gudangnya terisi, persis
  `drawDusGudang()`.

Simulasinya tidak disentuh: pegawai tetap berdiri di ambang dengan alpha
1→0→1. `tampilanKhusus()` menerjemahkan pudar itu jadi **langkah** — selama
`masuk` dia melangkah dari ambang ke dalam (WC 28, gudang 40 satuan), selama
`keluar` kembali. Di WC dia tetap memudar seperti di 2D, sambil melewati
pintunya. Di gudang dia tidak memudar: kelihatan meraih rak di dalam
(bergantian dengan diam), lalu keluar membawa kardus yang di simulasi baru
diberikan sesudah dia sampai di ambang. Boneka, balon, klik, dan partikelnya
ikut lewat `posisiOrang()` yang sama dengan tamu kadis.

**Pintu kadis juga.** Pintu dua daun ruang kepala dinas (`drawKadis`) dilubangi
di dalam kusen jatinya; kusen dan lis mahkotanya timbul. Daunnya lukisan pintu
**tertutup** yang sama — panel timbul, gagang kuningan, plat tendang dengan
titik kuningan sebanyak tamu yang sedang menghadap — dan seperti di 2D cuma
daun kanan yang terbuka, ke dalam, selama stasiun `agent` dipakai atau event
menyalakan `MOD.pintuKadis`. Di baliknya lorong berpanel kayu beratap dengan
karpet merah tua, dan di ujungnya pintu ruangan yang terang kekuningan:
"gelap di dalam, cahaya kuning dari ruangan" versi 2D. Keset baru
(`kesetAda`) jadi tikar sungguhan di ambangnya.

**Perabot voxel.** Benda yang di putaran awal masih kartu tegak (lukisan 2D
yang berdiri, atau dua kartu bersilang untuk tanaman), atau cuma lukisan di
muka sebuah kotak padahal isinya bervolume (jendela, akuarium, lemari kaca),
sekarang dibangun dari kotak, mengikuti gambar 2D-nya piksel demi piksel —
tiap `r(x, y, w, h)` jadi
kotak di tempat & tingginya sendiri, dengan kedalaman yang masuk akal:

- **Lemari arsip** jadi rak terbuka sungguhan: rangka jati, empat papan, ordner
  berdiri berlabel dan berlubang ring di baris 0 & 2, tumpukan map dan bundel
  bertali di baris 1 & 3. Keadaannya ikut `RUANGAN`: bundel yang dipinjam
  bidang lain (`boksHilang`) bolong dari raknya, `arsipPenuh` memunculkan map
  yang menyembul miring dan dus tambahan di depan lemari (sesekali
  menghamburkan debu), dan di atasnya dus arsip, map kliping mingguan, piala
  voli, serta stiker inventaris.
- **Tanaman pot** dari kubus yang mengecil ke ujung, persis `leafP` 2D, tapi
  menyebar ke segala arah; waktu layu hijaunya luntur dan ujungnya menunduk.
  **Palem** ruang tunggu (dan kembarannya di ruang kadis) berpelepah melengkung
  dengan anak daun berpasangan.
- **Meja kerja**: pernak-pernik tujuh tema (papan nama & map rapi, kertas
  longsor, figure & manga, lightstick yang berpendar, pot kecil, termos &
  toples & foto keluarga, kardus BMN & lembar BAST), lalu kusut harian di lajur
  belakang meja dengan ambang `gambarKusutMeja()` yang sama — lapis berkas, map
  disandarkan, lembar yang nyeruak, dan **dus di kolong meja** (yang di 3D
  sebelumnya hilang karena jatuh di luar kartu). Tema agustusan menancapkan
  bendera kecil bertiang lidi di tiap meja.
- **Meja stempel**: tumpukan berkas (`tumpukanStempel`, rapi/zig-zag), map
  disposisi pink dan antaran caraka, goresan pulpen, cap basah yang merah
  segar lalu mengering, noda tinta di papan meja, bantalan yang memucat waktu kering,
  bak & dua stempel kayu, rak surat dua susun.
- **Fotokopi**: tutup kaca, pengumpan dokumen dengan kertas aslinya, panel yang
  lampunya menyala dan sinar pindai yang menyapu selama dipakai, lembar hasil
  di baki, rim cadangan dari `rimKertas`.
- **Rak brosur, sanitizer injak, buku tamu** (baris tintanya menumpuk, bolpoin
  bertali muncul sesudah tamu pertama), **standee VISI** (papan setebal jari,
  rangka silang, bohlam berpendar), dan **kursi lipat pos satpam** yang di 3D
  sebelumnya belum ada.
- **X-banner** benar-benar miring lalu rebah telentang mengikuti
  `RUANGAN.xbanner.sudut`, berputar pada tepi belakang kakinya; kainnya selalu
  lukisan banner tegak (dilukis dengan sudut ditahan 0), jadi yang memendek
  adalah sudut pandangnya, bukan gambarnya.
- **Jendela kantor** dilubangi seperti jendela ruang kadis: kacanya mundur ke
  punggung tembok dan tetap memakai potongan lukisan dinding yang sama —
  langit ikut jam, matahari, bulan & bintang, awan, kota & Monas, hujan, kilat,
  kaca berkabut, dan event yang menggambar di kaca semuanya tetap hidup. Kusen
  aluminium & tiang silangnya timbul tepat di atas yang terlukis, ambangnya
  menjorok ke ruangan, dan gordennya jadi kain berlipat: lambrequin bergerigi
  berpita emas, panel kiri, dan panel kanan selebar `RUANGAN.gordenKanan`
  (ikut melebar waktu ditarik karena silau sore).
- **Akuarium arwana**: kabinet bertombol kuningan, tangki berbingkai dengan
  lampu penutup yang menyala, pasir, tanaman air, batu aerator yang
  menggelembung, dan arwana emas yang berenang bolak-balik dengan rumus 2D yang
  sama — di balik air yang tembus pandang.
- **Lemari piala** berpintu kaca: piala emas & perak, plakat, dua medali
  bertali merah-putih yang tersemat di punggung lemari, piagam dan foto
  bersama yang berdiri bersandar, piala voli kalau `RUANGAN.piala` — di balik
  kaca berkilap miring. Lemari kecil di ruang kadis versi ringkasnya, rak
  terbuka tanpa kaca (ruangan itu cuma terlihat lewat jendela atau dari atas).
- **Rak pojok baca**: rak buku pendek dua susun (satu buku dicabut separuh) dan
  rak koran bertongkat penjepit; korannya kekuningan kalau masih edisi kemarin
  (`koranBasi()`).
- **Ceceran di lantai**: kertas dikepal dan lembaran rebah bersudut terangkat
  di empat belas titik `KUSUT_LANTAI`, muncul menurut ambang kusutnya
  masing-masing (lukisannya memudar masuk dulu, bendanya menyusul), plus
  barang tercecer dari event (`propLantai`: map merah, map disposisi, daun,
  kertas bekas). Tiap benda menutup tepat cetakan lukisannya di lantai.
- **Printer** di bawah jendela: badan krem, kertas di baki belakang, baki
  keluaran, stapler kosong. `MOD.printerMacet` membuatnya macet sungguhan —
  tutupnya terangkat, badannya memendek, selembar kertas tersangkut bergetar,
  lampunya berkedip merah; internet putus = merah tetap.
- **Sandal jepit** di depan WC (hilang selagi WC dipakai), **bacaan lesehan**
  (koran terbuka, dua buku bertumpuk, segelas teh; dua buku di karpet), dan
  **papan PANTRI** yang kini bertebal di atas sekatnya — benda tegak terakhir
  yang tadinya kartu.
- **Dekor tema kalender** (`RUANGAN.tema`): spanduk di atas jendela jadi kain
  bergelombang bertali dan berpaku (agustusan, HUT KORPRI, tahun anggaran) —
  mukanya tetap lukisan spanduk yang sama, termasuk angka tahunnya;
  umbul-umbul merah putih bertali sepanjang tembok, menempel rapat supaya
  perabot tinggi menutupinya persis seperti di 2D; papan imsakiyah Ramadan
  timbul. Uji: `?tema=agustusan|korpri|tahun-anggaran|ramadan`.

Isi yang ikut keadaan `RUANGAN` masuk satu grup sendiri yang dibangun ulang
**hanya waktu `tandaPerabot()` berubah** (kusut dihitung per lapis, layu
dibulatkan ke 1/20, lebar gorden ke 0,5), jadi tidak menambah kerja per frame;
yang memang bergerak — X-banner, lampu fotokopi, cap basah, arwana — disusun
tiap frame. Air akuarium dan pintu kaca lemari piala digambar tembus pandang di
lintasan pudar, tapi **tidak ikut peta bayangan**: kaca yang membayangi isinya
sendiri menggelapkan piala di baliknya. Stasiun yang sedang dipakai mendapat
pendar kuning sayup di tepi papan rak arsip atau bibir meja stempel, pengganti
`glow()` 2D yang dulu terlukis di kartunya. Dua puluh satu kulit yang tidak
terpakai lagi (termasuk tujuh kartu meja kerja) ikut dibuang, jadi melukis
kulit malah lebih ringan dari sebelumnya. Kartu tegak sudah tidak ada sama
sekali; yang masih "lukisan berdiri" tinggal gambar event (kartu bertebal).

**Pajangan dinding timbul.** Papan nama dinas, bagan struktur organisasi,
badan atas AC, plakat nilai, foto pejabat, Garuda, plang KEPALA DINAS, papan
kinerja, papan pengumuman, kotak P3K, poster BerAKHLAK, papan nomor antrean,
dan panel MCB menonjol dari tembok; jam dinding dan rambu dilarang merokok
jadi cakram. Muka depannya tetap tekstur dinding hidup di
kotak yang sama — jarum jamnya tetap berdetak dan LED AC tetap berkedip di muka
yang menonjol itu — sedangkan warna sisinya dicicip dari tepi lukisannya
sendiri. Bayangan tempel yang sudah dilukis `bayangDinding()` jatuh pas di
belakangnya. Karena relief mencicip lukisan dinding, dinding dilukis sekali
SEBELUM geometri statis dibangun.

**Pajangan dinding yang hidup.** Empat pajangan dibangun sungguhan, bukan
relief:

- **AC split** — di bawah badan reliefnya ada rumah sirip yang masuk sedikit,
  dengan sirip yang mengayun pelan selama AC menyala dan merapat waktu
  `MOD.acMati`. Dari mulutnya turun kepulan hawa dingin pucat; tetesnya tetap
  partikel yang jatuh ke ember.
- **Kubah CCTV** di pojok kiri atas: pelat, lengan, rumah, kubah bertingkat,
  dan lensa yang **menoleh** — membidik titik sapuan selama event
  `cctv-menyapu-ruangan`, pegawai yang kartunya dibuka, atau orang terdekat
  yang sedang berjalan; tanpa sasaran ia menyapu pelan sendiri. LED merahnya
  berkedip. Lukisan kubah 2D-nya dilewatkan waktu dinding 3D dilukis
  (`TIGA.tanpaCCTV`), jadi tidak ada LED kedua di tembok di belakangnya.
- **Monitor CRT** berdiri di papan rak kayu bersiku besi: dudukan, leher,
  tabung yang menirus ke tembok, dan bingkai. Layarnya kulit hidup sendiri
  (`drawCRT()`, bar gulingnya waktu `MOD.crtAktif`) yang sedikit memancar;
  lukisan dinding tidak lagi menggambar CRT, supaya tidak ada gambar kembar di
  tembok di belakangnya.
- **Lampu meja kerja** menyala selama mejanya dipakai: bohlam di bawah kapnya
  berpendar, dan lampu titiknya sendiri menerangi papan meja, laptop, dan
  wajah pegawainya. Siang nyaris tak terasa; malam ada genangan cahaya hangat
  bertingkat di papan meja.

Genangan lampu, kepulan AC, dan petak silau matahari tinggal di grup `sinar`:
tembus pandang dan dicampur di lintasan pudar, tetapi **tidak berbayang** —
cahaya yang ikut peta bayangan malah menggelapkan permukaan yang ia terangi.

**Debu & berkas cahaya.** Pasangan 3D `drawDebu()`: debu yang cuma kelihatan
waktu ditembus cahaya, hidup di volumenya sendiri — prisma berkas jendela (dari
kaca turun ke petak sinar yang dilukis `drawFloor`) waktu siang, kerucut di
bawah tiap neon waktu malam. Kapan menyala dan seberapa kuat diambil dari
`debuSumber()` yang sama, jadi debu 3D lahir & padam bersama debu 2D-nya.
Berkas jendelanya sendiri digambar sebagai selubung cahaya aditif tipis yang
memudar ke lantai dan meredup waktu hujan. Mode ringan mematikan keduanya.

**Cahaya ikut jam.** `ambien()` yang sama dengan 2D diterjemahkan jadi cahaya,
bukan selubung warna: langit & tanah (cahaya belahan), satu cahaya kunci dari
kiri-atas-depan yang melempar **bayangan sungguhan** (peta bayangan 2048,
disaring 3x3), dan ketiga tabung neon jadi lampu titik yang ikut berkedip
(`kedipNeon`) dan padam waktu mati lampu. Shader menampung enam belas lampu
titik, masing-masing dengan redamannya sendiri: neon, lampu kadis, WC, dan
gudang menjangkau jauh, tujuh lampu meja kerja cuma mejanya. Malam jadi
temaram kebiruan dengan genangan cahaya hangat di bawah tiap lampu; kilat
menerangi seluruh ruangan.

**Kamera 2D tetap yang memutuskan ke mana melihat.** Mode ikut, sinematik,
klik barang, X-banner, dan bukaan ruang kadis semuanya masih dihitung
`tickKamera()`; di 3D bidikannya diterjemahkan jadi titik sasaran dan jarak,
sementara sudut putar tetap milik orang yang memegang tetikus. Dinding samping
yang membelakangi kamera dipotong rendah, seperti maket arsitek.

**Melihat dari mata pegawai (POV).** Klik seorang pegawai di 3D dan kamera
meluncur (±0,45 detik) ke depan wajahnya. Letak dan arahnya diambil dari
matriks kepala bonekanya sendiri (`susunOrang` menyimpannya), jadi pandangan
ikut turun waktu dia duduk, ikut menoleh ke arah hadapnya, terkantuk-kantuk,
dan naik-turun sedikit waktu dia berjalan. Pegawai yang duduk di meja kerja
otomatis menatap laptopnya — layar kode yang bergerak di kanan depannya, yang
dari arah hadap lurus jatuh di luar bidang pandang — sampai penonton menoleh
sendiri. Seret = menoleh, roda atau cubit = lebar pandang, klik dua kali =
kembali ke lirikan semula, klik orang lain yang kelihatan = pindah ke matanya.
Selama POV badan pegawai itu sendiri tidak digambar dan tidak bisa diklik
(sinar kliknya berangkat dari dalam kepalanya), kartunya diparkir di tepi
kiri, dan maket ditutup dinding depan berpita serta plafon: cuma muka dalamnya
yang digambar, jadi dari kamera maket keduanya tidak pernah kelihatan. Keluar
lewat Esc, tombol "kembali ke maket" di pita bawah, menutup kartunya, atau klik
tempat kosong. POV cuma dari klik di ruangan 3D — klik baris kru di panel tetap
membuka kartu tanpa memindah kamera.

Yang **masih** beda dari 2D, sengaja dicatat supaya tidak dikira hilang:

- rim light dan vignette tidak digambar — cahaya 3D-nya sudah mengerjakan tugas
  yang sama;
- gambar event selain orang, hewan, dan barang bermodel tetap kartu bertebal
  satu lapis: papan yang miring di 2D tetap papan pipih yang miring, dan
  properti yang digambar di samping tamu (tali pemanjat, misalnya) tetap
  berdiri di kedalaman `sortY` event, bukan menempel di bonekanya;
- ruangan di balik tembok (kadis, WC, gudang, lorong pintu kadis) cuma
  kelihatan lewat bukaannya atau dari kamera yang didongakkan tinggi: tembok
  belakang tetap setinggi aslinya, tidak ikut dipotong rendah seperti dinding
  samping.

Waktu per tahap (lukis dinding, lantai, kulit, kartu, susun mesh) bisa dilihat
dari konsol: `RUANG3D.waktu`. Diukur di mesin penulisnya (150 frame, `SS` 2,
ruang kadis terbuka berisi tamu, satu event bergambar hidup, debu menyala):
median 3,4 ms per frame untuk 3D lawan 2,3 ms untuk 2D di keadaan yang sama —
yang termahal menyusun mesh dinamis (±1,1 ms; kotak ditulis langsung dari satu
penyangga sudut, tanpa alokasi per titik) dan memindai kartu event (±0,8 ms).
Kerja GPU — peta bayangan dan satu lintasan utama — tidak ikut terukur di
angka tersebut.

