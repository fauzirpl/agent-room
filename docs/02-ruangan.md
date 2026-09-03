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
kursi, meja kerja 6). Dulu yang kelima berdiri berimpit di slot pertama;
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

