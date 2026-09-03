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
| `dinas --versi` | cetak versi paket saja |
| `dinas --layanan` | daftarkan supaya kantornya nyala sendiri tiap login (`--lepas` mencabut, `--coba` cuma mencetak) |

`--layanan` tidak membuat daemon sendiri; dia menumpang penjadwal login bawaan
OS — Task Scheduler (`schtasks /SC ONLOGON`) di Windows, unit systemd `--user`
di Linux, petunjuk launchd di macOS — supaya pengguna bisa melihat dan
mencabutnya lewat alat yang sudah mereka kenal. Yang diteruskan ke layanan cuma
`--port` dan `--kendali`; `--buka` sengaja tidak. Versinya dibaca dari
`package.json` — berkas yang sama yang membuat `npx github:fauzirpl/agent-room`
jalan tanpa clone dan tanpa publish ke npm.

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
`--coba` cuma mencetak perintah hook yang akan ditanam (berikut header mesin,
kunci, dan alamat kantor pusat kalau env-nya ada) tanpa menyentuh berkas apa pun.

**Restart sesi Claude Code setelah install** — hook dibaca waktu sesi mulai.

### Kotak surat hook offline

Dulu perintah hook diakhiri `|| exit 0`: server ruangan mati, event-nya
hilang, sesi jalan terus. Sekarang cabang `||`-nya menulis surat:

```
curl -s -m 2 --connect-timeout 1 -X POST -H "content-type: application/json" \
  -H "x-agent-room: 1" -H "Expect:" -H "x-agent-room-mesin: <host>" \
  -T - http://127.0.0.1:4517/event || node "<agent-room>/hook.mjs" --tunda
```

Kuncinya di `-T -`, bukan `--data-binary @-`. Keduanya mengirim stdin sebagai
body, tapi `--data-binary` **menghabiskan stdin sebelum tersambung** — kalau
koneksinya ditolak, cabang `||` menerima stdin kosong dan tidak ada yang bisa
disimpan. `-T -` baru membaca stdin sesudah koneksi berdiri (dikirim
`Transfer-Encoding: chunked`, `Expect:` dikosongkan supaya curl tidak menunggu
100-continue), jadi saat server mati payload masih utuh untuk `hook.mjs
--tunda`, yang menaruhnya di `~/.agent-room/tunda/<ts>-<acak>.json`
(`AGENT_ROOM_TUNDA_DIR` memindahkannya). Server memungut folder itu saat start
dan tiap 60 detik: diurutkan menurut `ts` di nama berkas, diserap lewat jalur
yang **sama persis** dengan `POST /event` (normalize, ring/SSE, agenda, buku
induk) dengan `tunda: true` dan **ts asli** — agenda mencatat kapan
kejadiannya, bukan kapan kantornya buka lagi — lalu berkasnya dihapus. Yang
tidak ikut untuk event tunda: nota dinas keluar (keadaan tertahan berjam-jam
lalu bukan bahan lapor) dan pemantau transkrip (sesinya sudah lewat).

Batasnya dijaga di sisi penulis: berkas lebih tua dari 24 jam dibuang, dan
kalau sudah 500 berkas / 20 MB yang paling tua disingkirkan dulu. Folder
0700, berkas 0600, ditulis `.tmp` lalu rename supaya pemungut tidak pernah
membaca berkas setengah jadi. `hook.mjs` sebagai transport utama
(`install.mjs --node`) juga menulis surat kalau kirimnya gagal.
`dinas --periksa` menampilkan jumlah surat yang belum dipungut. Cabang `||`
sendiri berlaku di ketiga shell yang mungkin menjalankan hook di Windows
(cmd.exe, Git Bash) maupun sh di Linux/macOS — diuji ketiganya — dan
`hook.mjs` tetap keluar 0 tanpa menulis stdout, jadi sesi tidak pernah kena
warning. Ongkos di jalur normal nol: node hanya dipanggil saat curl gagal.

Satu batas yang harus jujur: kotak surat ini **lokal**. Hook di kantor cabang
(`AGENT_ROOM_URL` menunjuk mesin lain) menulis suratnya di mesin cabang, dan
hanya server yang berjalan di mesin itu yang memungutnya.

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
[public/room.js](public/room.js).

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

### Babak hari kerja

Jam saja tidak cukup buat menjawab "sekarang kantor sedang apa": jam 12 hari
Rabu itu istirahat, jam 12 hari Minggu itu libur. `babakHari()` di
[public/room.js](public/room.js) menyimpulkannya jadi satu status yang dibaca
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

## Event acak

Selain yang dipicu tool call, ruangan punya **272 kejadian yang muncul
sendiri** (angka dihitung otomatis: `node uji-katalog.mjs`): UPS berbunyi,
kalender disobek, kabel LAN longgar, gorengan naik ke
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

Objek `S` yang diterima `syarat()`/`mulai()`/`tick()` — potret ruangan dari
`potretRuangan()` — sejak ini membawa **fakta sesi**, bukan cuma jam, lampu,
dan cuaca: `gagalBeruntun` (kegagalan tool berturut-turut terbanyak di satu
agen), `lajuToken` (token/menit 5 menit terakhir), `rasioEdit`,
`proyekDominan`, `proyekBerbeda`, `modelCampur`, `tungguTotal` (agen yang
menunggu kamu/macet), `sibukRatio`. Semuanya dihitung dari agen nyata saja,
dan potretnya **hanya dibaca**: tidak ada event yang menulis balik ke agen,
log, atau statistik, jadi aturan 2 di bawah tetap utuh — yang berubah cuma
*kapan* sebuah kejadian suasana masuk akal (`inspektorat-mendadak` menyusul
agen yang tiga kali gagal beruntun, `audit-token` saat sesinya boros,
`antre-tanda-tangan-kadis` saat ≥2 agen menunggu tanda tangan kamu). Setiap
pembacaan dijaga `?? 0` supaya potret lama dan harness `uji-event.mjs` tetap
jalan.

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

Ruangan sendiri, bersekat (`drawPantry`, x414..478 — dua panel kayu rendah
di sisi atas & kiri, bukan dinding penuh), menempati bekas tempat kardus
arsip di kanan rak server, bawah pintu kadis. Isinya kabinet+wastafel+oven
mini berjajar di counter nempel sekat atas, rak piring digantung di
sisinya, kardus arsipnya sendiri pindah jadi tumpukan stok di sudut, dan
satu meja kafe kaki-tunggal (beda siluet dari meja rapat/kerja yang semua
berkaki empat) buat tempat berkumpul. Sekatnya sengaja cuma dua sisi:
lajur ke meja kerja pojok (444, lihat `MEJA_KERJA_X`) lewat tepat di sisi
terbuka, jadi tidak perlu pintu.

Event `ngerumpi-di-pantry` memanggil 2-3 pegawai standby dari mana pun
lewat `pinjamAktor` untuk berkumpul di depan meja kafenya — beda dari
`ngobrol-di-dispenser` yang orangnya kebetulan sudah berdiri di situ.
Isinya gosip kantor (rotasi, mutasi), bukan obrolan kopi biasa.

### Apel pagi

Sekali sehari, di babak `apel` (07:00–07:45 hari kerja) dan hanya kalau
halamannya sedang terbuka: pegawai nyata yang menganggur plus standby berbaris
dua saf di bawah tiang bendera menghadap ke atas, bendera naik pelan dari
kaki tiang (`apelBendera` di `drawBendera`), Indonesia Raya diputar lewat
`mainkanIndonesiaRaya()` kalau audio sudah pernah dibuka pengguna, lalu
pembina apel — kadis kalau ada personanya, kalau tidak standby berjabatan
tertinggi — memberi amanat. Amanatnya dirakit di klien dari buku agenda
kemarin (`GET /agenda?dari=<kemarin>&sampai=<kemarin>`): "Kemarin N tool
call dari M sesi, terbanyak <tool>." — kalau kosong atau gagal, kalimat
generik. Senin lebih formal: 40 detik dan ada pembacaan Panca Prasetya
Korpri sebagai balon berurutan; hari lain 20 detik. Sesudah itu bubar ke
tempat semula.

Kenapa **bukan event acak**: apel itu jadwal, bukan kebetulan — tidak boleh
ikut undian bobot, tidak boleh kalah dari event `panggung` lain yang
kebetulan sedang jalan, dan tidak boleh dilaporkan ke arsip kliping
(`/ambien`) seolah kejadian suasana. Dia jalan dari `tickApel()` walau
`?event=0`, tidak masuk log, tidak menaikkan statistik. Kenapa **sekali
sehari**: penanda tanggal di localStorage (`apelTerakhir`) — tab yang dimuat
ulang jam 07:20 tidak apel dua kali, dan tab yang dibuka jam 9 tidak apel
sama sekali; kalau semua orang sedang sibuk saat dicek, penandanya tidak
ditulis dan dicoba lagi tiap detik selama babaknya masih `apel`.

Aturan 1 berlaku mutlak. Peserta apel dipegang lewat `eventKerja` yang sama
dengan event acak, jadi `handle()` melepasnya persis seperti biasa begitu
tool call datang — dia keluar barisan saat itu juga menuju stasiun tool-nya,
dan barisan yang bolong dibiarkan bolong. Pembina yang dipanggil tool call
digantikan yang tertinggi di sisa barisan, dari tempatnya berdiri. Satu
pengecualian sengaja atas "standby tidak pernah bicara": pembina standby
diberi balon lewat `Agent.prototype.say` selama apel saja — amanat tanpa
balon bukan amanat. Uji: `?apel=1` memaksa apel sekarang, `?apel=senin`
memaksa varian Senin (keduanya mengabaikan babak & penanda).

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
- Perintahnya diakhiri `|| node hook.mjs --tunda` (dulu `|| exit 0`). Server
  ruangan mati? Payload-nya ditaruh di kotak surat `~/.agent-room/tunda`
  (lihat **Kotak surat hook offline**), sesi kamu jalan terus tanpa warning —
  `hook.mjs` selalu keluar 0 dan tidak menulis stdout. Node cuma dibayar
  saat curl gagal.

## Pemantauan

### `/metrics` gaya Prometheus

`GET /metrics` mengeluarkan format exposition (`text/plain; version=0.0.4`),
tiap metrik dengan `# HELP`/`# TYPE`, tanpa token seperti `/health` — penjaga
Host di depan tetap berlaku. Isinya angka yang sudah ada di memori server,
tidak ada hitungan baru:

| Metrik | Jenis | Sumber |
|---|---|---|
| `agent_room_events_total` | counter | event yang lewat `publish()` sejak proses hidup |
| `agent_room_viewers` | gauge | klien `/stream` |
| `agent_room_sesi_hidup` | gauge | `sesiHidup` (jendela 3 jam) |
| `agent_room_sesi_tertahan{jenis="butuh"\|"macet"}` | gauge | sesi hidup yang butuh manusia / macet |
| `agent_room_antrean`, `agent_room_tugas_jalan` | gauge | antrean disposisi, sesi headless berjalan |
| `agent_room_token_total{jenis=…}` | counter | riwayat lintas sesi sepanjang masa |
| `agent_room_token_hari_ini{jenis=…}` | gauge | hari kalender lokal server |
| `agent_room_galat_halaman` | gauge | laporan `POST /galat` yang tersimpan (maks 50) |
| `agent_room_sse_dibuang_total`, `agent_room_sse_dilebur_total`, `agent_room_sse_diputus_total` | counter | rem SSE (di bawah) |
| `agent_room_tunda_berkas`, `agent_room_tunda_diserap_total` | gauge/counter | kotak surat hook offline |
| `agent_room_uptime_seconds` | gauge | `process.uptime()` |

`jenis` token ada empat: `input`, `output`, `cache_tulis`, `cache_baca`. Nama
proyek **tidak** jadi label secara bawaan — kardinalitas di sisi pengumpul,
dan nama folder itu metadata yang tidak perlu keluar bersama angka.
`AGENT_ROOM_METRICS_PROYEK=1` menambahkan deret berlabel `proyek="…"` pada
kedua metrik token (hari ini hanya `input`/`output`, karena rinciannya
per-proyek-per-hari memang cuma menyimpan itu). Contoh:

```
# HELP agent_room_sesi_tertahan Sesi hidup yang tertahan: butuh manusia atau macet karena galat.
# TYPE agent_room_sesi_tertahan gauge
agent_room_sesi_tertahan{jenis="butuh"} 1
agent_room_sesi_tertahan{jenis="macet"} 0
# HELP agent_room_token_total Token sepanjang masa dari riwayat lintas sesi.
# TYPE agent_room_token_total counter
agent_room_token_total{jenis="input"} 30300
```

### Rem SSE

`publish()` dulu menulis ke semua klien tanpa melihat nilai balik
`res.write()`. Satu tab yang tertidur — laptop ditutup, tab latar yang
dibekukan peramban — membuat buffer socket-nya menggelembung tanpa batas di
memori server, dan `token` yang lahir tiap giliran asisten penyumbang
terbesarnya. Sekarang tiap klien punya keadaan sendiri, dua lapis:

1. `write()` yang menjawab `false` belum berarti klien lambat — highWaterMark
   socket cuma 16 KB, dan satu cek transkrip bisa melahirkan ribuan event
   **sinkron** (`SUSUL_MAX` 4 MB) sebelum siapa pun sempat drain. Jadi selama
   byte yang masih tertahan di stream (`writableLength`) di bawah 4 MB, event
   tetap ditulis langsung.
2. Lewat itu, event masuk **antrean per klien** (maks 200, buang-terlama,
   dihitung `dibuang`) yang dikuras saat `drain`. Event `token` berurutan
   untuk sesi yang sama **dilebur** waktu antre — isinya angka kumulatif sesi,
   jadi yang terbaru sudah memuat semua delta sebelumnya; itu dihitung
   `dilebur`, bukan `dibuang`, karena tidak ada yang hilang.

Memori per klien dengan begitu terikat: ≤ 4 MB + 200 event. Klien yang
antreannya penuh lebih dari 30 detik tanpa pernah drain **diputus** — satu
baris log `klien SSE lambat diputus: antrean penuh N detik tanpa drain, M
event dibuang` — dan tidak dikirimi `: beat` selagi tersumbat (cuma menambah
buffer). Halaman `EventSource` menyambung sendiri lewat `retry` dan
`Last-Event-ID`, jadi yang hilang cuma yang memang sudah dibuang.
`/stream?tanpa=pikir,token` menyaring `kind` per klien di sisi server — untuk
penonton yang cuma butuh perbuatan, bukan isi kepala — dan berlaku juga pada
60 event ring yang dikirim saat sambung. Angkanya ke `/health`
(`sseDibuang`, `sseDilebur`, `sseDiputus`, `memoriMB`) dan `/metrics`.

Uji yang menetapkan angkanya: satu klien `/stream` yang tidak pernah membaca
socket-nya, 3.000 event token + 9.000 `ucap` (≈21 MB); buffer kernel
loopback Windows sendiri menyerap belasan MB sebelum `writableLength` naik,
klien normal di sebelahnya menerima semuanya, RSS server naik ≈77 MB untuk
21 MB × 3 klien lalu turun setelah klien lambatnya diputus di detik ke-34.

## Konfigurasi

| Env | Default | Guna |
|---|---|---|
| `AGENT_ROOM_PORT` | `4517` | ganti port (install ulang hook setelah diubah) |
| `AGENT_ROOM_HOST` | `127.0.0.1` | alamat bind |
| `AGENT_ROOM_CLAUDE` | hasil `where claude` | tunjuk biner claude tertentu, kalau PATH menemukan instalasi yang salah |
| `AGENT_ROOM_TOKEN_FILE` | `.agent-room-token` | tempat token headless diingat, kalau centangnya dinyalakan |
| `AGENT_ROOM_TOKEN_LOG` | `token-riwayat.jsonl` | tempat riwayat token lintas sesi ditulis (lihat **Riwayat lintas sesi**) |
| `AGENT_ROOM_AGENDA_DIR` | `agenda/` | folder buku agenda harian (lihat **Buku agenda**) |
| `AGENT_ROOM_AGENDA_HARI` | `30` | berkas agenda lebih tua dari ini dibuang saat start |
| `AGENT_ROOM_BUKU_INDUK` | `buku-induk.json` | tempat buku induk pegawai (karier per folder proyek) ditulis (lihat **Buku induk pegawai**) |
| `AGENT_ROOM_BUKU_INDUK_UJI` | *(kosong)* | **uji saja**: pengali jam dinas (mis. `100000`) supaya kenaikan golongan bisa dipaksa; nilainya ikut tampil di `/buku-induk` sebagai `uji` |
| `AGENT_ROOM_CUACA` | *(nyala, tebak dari IP)* | `off` mematikan cek cuaca; `lat,lon` menetapkan lokasi |
| `AGENT_ROOM_ISI` | *(nyala)* | `off` menutup transkrip sesi: ruangan kembali cuma menyiarkan metadata, tanpa pikiran dan kalimat agen |
| `AGENT_ROOM_KUNCI` | *(kosong)* | kalau diisi, `POST /event` wajib membawa header `x-agent-room-kunci` yang sama; **wajib** begitu bind dibuka ke jaringan (lihat **Kantor pusat & kantor cabang**) |
| `AGENT_ROOM_URL` | *(kosong)* | dibaca **installer** & `mcp-room.mjs`: alamat kantor pusat yang dituju hook mesin ini, mis. `http://kantor.lan:4517` |
| `AGENT_ROOM_HOST_IZIN` | *(kosong)* | nama Host tambahan yang diterima penjaga Host, dipisah koma (nama mesin di LAN, nama tunnel) |
| `AGENT_ROOM_TUNDA_DIR` | `~/.agent-room/tunda` | kotak surat hook offline: dibaca `hook.mjs --tunda` (penulis), server (pemungut), dan `dinas --periksa` (lihat **Kotak surat hook offline**) |
| `AGENT_ROOM_METRICS_PROYEK` | *(kosong)* | `1` menambahkan label `proyek` pada metrik token di `/metrics` (lihat **Pemantauan**) |

### Gerbang: penjaga Host & kunci event

Ada dua pemeriksaan di pintu depan, berlaku sebelum route mana pun:

**Penjaga Host.** Semua permintaan yang header `Host`-nya bukan
`127.0.0.1[:port]`, `localhost[:port]`, `[::1][:port]`, alamat bind
(`AGENT_ROOM_HOST`), atau salah satu isi `AGENT_ROOM_HOST_IZIN` ditolak 403.
Alasannya **DNS rebinding**: bind ke 127.0.0.1 tidak menghalangi situs jahat
yang kebetulan dibuka pemilik mesin mengarahkan domainnya sendiri ke 127.0.0.1
lalu membaca `/stream` dari skripnya — `/stream` memang tidak pernah memeriksa
Origin karena halaman kita sendiri membacanya lewat `EventSource`. Yang pasti
beda pada permintaan seperti itu adalah `Host`: domain si penyerang, bukan
alamat kita. Hook `curl` mengirim `Host: 127.0.0.1:port`, halaman mengirim
alamat yang diketik di peramban; keduanya lolos tanpa perubahan apa pun.

**Kunci event.** `AGENT_ROOM_KUNCI` kosong = perilaku lama, hook yang sudah
terpasang tetap diterima. Diisi = `POST /event` tanpa `x-agent-room-kunci` yang
cocok ditolak 403 (satu peringatan per menit di konsol), dibandingkan lewat
hash supaya panjang kuncinya tidak bocor lewat waktu. Installer menanamkan
header itu ke perintah `curl` kalau env-nya ada saat `--pasang`, jadi kuncinya
**harus sama** di server dan di mesin yang memasang hook. Nilainya dibatasi
8–128 karakter `[A-Za-z0-9_.-]` karena masuk ke satu baris shell di
`settings.json` — kutipan yang pecah lebih berbahaya daripada kunci yang ditolak.

Installer juga selalu menanam `-H "x-agent-room-mesin: <hostname>"`. Server
menyalin nilainya ke `ev.mesin` **hanya kalau berbeda** dari hostname-nya
sendiri; sesi lokal tidak pernah membawa field itu, jadi chip `⌂ mesin` di
panel kru dan baris "mesin" di kartu cuma muncul untuk pegawai dari kantor
cabang.

### Kantor pusat & kantor cabang

Multi-mesin dibangun dari yang sudah ada, bukan protokol baru: hook di mesin
B mengirim ke server di mesin A. Di mesin B, pasang hook dengan alamat kantor
pusat dan kuncinya:

```bash
AGENT_ROOM_URL=http://kantor.lan:4517 AGENT_ROOM_KUNCI=kunci-yang-sama node install.mjs --global
```

Di mesin A, server harus mendengar di antarmuka jaringan **dan** memegang kunci
yang sama:

```bash
AGENT_ROOM_HOST=0.0.0.0 AGENT_ROOM_KUNCI=kunci-yang-sama AGENT_ROOM_HOST_IZIN=kantor.lan node server.mjs
```

Yang harus tegas: **membuka bind ke LAN tanpa `AGENT_ROOM_KUNCI` berarti
menyiarkan isi kerja.** Bukan cuma metadata — `/stream` membawa `pikir`,
`ucap`, dan prompt (kecuali `AGENT_ROOM_ISI=off`), dan `/event` tanpa kunci
membiarkan siapa pun di jaringan memalsukan sesi. Server mencetak peringatan
keras saat start kalau bind bukan loopback dan kuncinya kosong, dan
`dinas --periksa` menandainya merah. Kunci itu pun cuma menjaga **pintu masuk
event**; `/stream`, `/agenda`, `/token-riwayat` tetap terbuka bagi siapa pun
yang bisa mencapai port-nya, dan HTTP polos berarti kuncinya sendiri lewat
jaringan tanpa dienkripsi. Karena itu susunan yang disarankan: bind tetap
127.0.0.1 dan sambungkan mesin lewat tunnel (`ssh -L 4517:127.0.0.1:4517
kantor`, Tailscale, atau reverse-proxy TLS) — di situ `AGENT_ROOM_URL` di
cabang cukup menunjuk ujung tunnel-nya. Kendali web (`--izinkan-perintah`)
tidak pernah boleh dinyalakan di server yang terbuka ke jaringan: token
per-jalannya bisa dibaca siapa pun lewat `GET /kendali` dari alamat yang lolos
penjaga Host.

## Agent Room sebagai MCP server

Semua yang lain di repo ini berjalan **satu arah**: Claude Code bicara ke
kantor (hook → `/event`), kantor bicara ke halaman (`/stream`). `mcp-room.mjs`
membalik arahnya — kantor bisa **ditanya** oleh sesi Claude mana pun, tanpa
membuka halaman:

```bash
dinas --mcp          # cetak perintah `claude mcp add …` dan blok JSON mcpServers
dinas --mcp --json   # blok JSON-nya saja
```

`dinas` sengaja tidak menjalankan `claude mcp add` sendiri: itu mengubah
konfigurasi Claude Code milik pengguna, dan pantas diketik sendiri.

| Tool | Sumber | Isi |
|---|---|---|
| `ruangan_siapa_tertahan` | `GET /ruangan` | sesi yang butuh manusia / macet, dan antrean disposisi |
| `ruangan_sesi_aktif` | `GET /ruangan` | sesi hidup: id, proyek, cabang, mesin, tool terakhir, sejak |
| `ruangan_token_hari_ini` | `GET /token-riwayat` | total hari ini + rincian per proyek, total sepanjang masa |
| `ruangan_agenda_cari` | `GET /agenda` | cari buku agenda: `q`, `proyek`, `sesi`, `kind`, `dari`, `sampai`, `limit` |
| `ruangan_kesehatan` | `GET /health` | server hidup atau tidak |

Servernya stdio JSON-RPC polos tanpa dependency (`initialize`, `tools/list`,
`tools/call`, `ping`; notifikasi diabaikan), log hanya ke stderr karena stdout
adalah kanal protokolnya. Tiap tool cuma satu GET ke server ruangan yang sudah
jalan — alamatnya dari `AGENT_ROOM_URL`, bawaan `http://127.0.0.1:4517` — lalu
hasilnya satu kalimat ringkasan Indonesia di atas JSON ringkas. `GET /ruangan`
baru dibuat untuk ini: tanpa token, sekelas `/health`, isinya sesi hidup
(diisi tiap hook masuk, dihapus saat `SessionEnd`, dibuang setelah tiga jam
diam) plus jumlah antrean, proses jalan, dan penonton.

Yang **sengaja tidak diekspos**: `pikir`, `ucap`, prompt, isi balon halaman,
token per-jalan kendali web, dan route apa pun yang bisa melahirkan atau
menghentikan sesi. Sesi Claude yang memasang MCP ini dapat *keadaan* kantor,
bukan *isi kerja* sesi lain — yang butuh isi sudah punya jalannya sendiri
lewat halaman. Bahkan `butuh`/`macet` di `/ruangan` cuma membawa `sebab`/
`jenis`, tanpa `alasan` maupun `label`.

Tanpa autentikasi, dan itu konsisten dengan sisanya: `mcp-room.mjs` bicara ke
server lewat HTTP biasa, jadi dia hanya bisa mencapai apa yang bisa dicapai
`curl` dari mesin yang sama — yaitu localhost. Kalau kantornya dibuka ke
jaringan (bagian di atas), yang menjaga tetap tunnel/kunci di server, bukan
MCP-nya; MCP tidak menambah pintu baru karena semua route yang dipakainya
memang sudah ada dan sudah tanpa token.

### Uji tanpa peramban

Tiga harness Node nol-dependency, semuanya dijalankan `npm test` dan CI:

- **`uji-event.mjs`** memuat `room.js` + `event-acak.js` apa adanya ke sandbox
  `node:vm` (DOM/`Date`/canvas palsu) dan memanggil `syarat()` di 36 kombinasi
  jam×hujan×ramai, lalu `mulai()→tick()×N→selesai()` tiap event. Hook
  `gambar*` (nama kaitnya dibaca dari `room.js`, bukan dihafal) dipanggil di
  sela tick terhadap **canvas 2D palsu yang melempar** kalau ada argumen angka
  `NaN`/`undefined`/`Infinity` — di peramban kesalahan itu diam, gambarnya cuma
  tidak muncul. Rantai `lanjutan` diikuti sampai kedalaman 3 di ruangan yang
  sama, seperti `matikanEvent()` sungguhan. Aturan `bentrok()`/`kelas
  panggung`/`perluAktor`/`pinjamAktor` diuji lewat fungsi asli `room.js`
  terhadap definisi sintetis — bukan salinan aturannya. Bug gambar yang
  diketahui tapi belum diperbaiki dicatat di `DIKETAHUI` supaya CI hijau tanpa
  bug-nya hilang dari laporan.
- **`uji-zorder.mjs`** memanggil `frame()` asli dengan pegawai fixture di
  posisi yang pernah bikin bug (pita lajur bawah 230–265, duduk di kursi rapat
  sisi dekat, di depan/belakang meja kerja, prop event ber-`sortY`) dan
  membandingkan **urutan** gambar prop/pegawai dengan `uji-zorder.golden.json`.
  Golden-nya urutan id, bukan angka y: geser `sortY` boleh, asal urutannya
  memang disengaja (`--perbarui`).
- **`uji-katalog.mjs`** papan skor `event-acak.json` vs `daftarEvent()`:
  katalog, terdaftar, terimplementasi, belum (per kategori), dan id di luar
  katalog. Selalu exit 0 (`--gerbang` untuk menggagalkan). Angka jumlah event
  di dokumen ini dan README diambil dari sini.

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
| `POST /perintah/batal` · `DELETE /perintah/antre/<id>` | tarik tugas yang masih antre di loket disposisi |
| `POST /izin/jawab` | paraf atau tolak permintaan izin sesi halaman yang lahir dengan `paraf:true` (lihat **Paraf dari ruangan**) |
| `POST /izin/tanya` · `GET /izin/tunggu` | pintu proses MCP anak (`mcp-izin.mjs`); dijaga kunci per-tugas, bukan token halaman |
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

### Antrean disposisi

Batasnya tetap **4 proses bersamaan**, tapi tugas kelima tidak lagi ditolak
`429` lalu hilang. Dia masuk **loket disposisi**: `/perintah` menjawab `202`
`{antre: true, id, posisi}`, dan begitu satu slot kosong — selesai, timeout,
atau prosesnya keluar — yang paling depan dilahirkan server sendiri lewat
jalur spawn yang sama persis (`lahirkanTugas()` di [server.mjs](server.mjs)).
Loketnya menampung 12; di atas itu baru `429` dengan pesan *loket disposisi
penuh*. Field `sifat` di body (`BIASA` bawaan, atau `SEGERA`) menentukan
urutannya: SEGERA menyalip semua BIASA, tapi antre di belakang SEGERA yang
lebih dulu.

Isi antrean — prompt, folder, nama, model — hidup **di memori saja**, tidak
pernah ditulis ke disk. Server mati berarti loketnya kosong lagi, dan itu
disengaja: perintah eksekusi bukan sesuatu yang pantas tertinggal di berkas.
`GET /kendali` mengembalikan `antrean` (id, nama, nama folder, sejak, sifat,
posisi — tanpa prompt), dan tiap perubahan disiarkan sebagai satu event ringan
`{kind:'antre', aksi:'masuk'|'lahir'|'batal'|'gagal', antrean:[…]}` yang
membawa potret seluruh loket, jadi halaman tinggal mengganti daftarnya tanpa
polling. Di daftar kru barisnya tampil bergaris putus-putus di bawah standby:
*antre #posisi · nama · proyek · sifat*, dengan tombol **batal** yang
menariknya dari loket lewat gerbang yang sama dengan `/perintah`.

### Paraf dari ruangan

Sesi yang dilahirkan halaman selama ini jalan `bypassPermissions`: tidak
pernah minta izin, jadi tidak pernah tertahan. Sekarang ada pilihan kedua —
`paraf: true` di body `/perintah` — yang melahirkan sesinya dengan
`--permission-mode default`, dan tiap permintaan izinnya bisa **dijawab dari
kartu pegawai**: dua tombol, **Paraf** dan **Tolak** (plus catatan opsional
yang diteruskan ke agennya kalau ditolak). Bawaannya tetap jalur lama; tanpa
`paraf:true` tidak ada yang berubah.

**Hanya untuk sesi lahiran halaman.** Sesi terminal tetap menampilkan catatan
*sesi terminal · jawab di terminal*, dan itu bukan pilihan desain yang bisa
dilonggarkan nanti: halaman ini tidak punya pegangan apa pun ke proses
terminal itu — bukan stdin-nya, bukan protokol izinnya. Yang lahir dari
`/perintah` adalah anak server ini, jadi cuma untuk mereka server bisa
menyisipkan diri di antara CLI dan keputusan izinnya. Kartu membedakan
keduanya dengan label yang berbeda (*sesi halaman · bisa diparaf di sini*),
karena pose di ruangannya persis sama.

**Lewat tool izin MCP, bukan stdin.** `claude -p` tidak membaca jawaban izin
dari stdin — stdin-nya memang kita tutup sejak awal (lihat `lahirkanTugas()`).
Yang disediakan CLI untuk mode non-interaktif adalah
`--permission-prompt-tool <mcp_tool>`: tiap kali sebuah tool butuh izin, CLI
memanggil tool MCP itu dan membaca jawabannya sebagai teks JSON
`{"behavior":"allow","updatedInput":{…}}` atau `{"behavior":"deny","message":"…"}`.
Flag ini ada di biner (2.1.258: *MCP tool to use for permission prompts, only
works with --print*) walau tidak tercetak di `--help`. Jadi server melahirkan
sesinya dengan tiga tambahan: `--permission-mode default`,
`--permission-prompt-tool mcp__agent-room-izin__izin`, dan `--mcp-config` berisi
JSON inline yang mendaftarkan [mcp-izin.mjs](mcp-izin.mjs) — server MCP stdio
tanpa dependency, satu tool bernama `izin`. Tidak ada berkas sementara; JSON-nya
satu elemen argv seperti prompt.

Urutan pesannya, dari sisi proses MCP:

1. CLI → `initialize`, `notifications/initialized`, `tools/list` — jabat tangan MCP biasa
2. tool butuh izin → CLI → `tools/call izin {tool_name, input, tool_use_id}`
3. mcp-izin → `POST /izin/tanya {tugas, kunci, tool_name, ringkasan, tool_use_id}`;
   server mencatat permintaannya, menyalakan **butuh manusia**, dan menyiarkan
   `izin-minta` yang membawa `paraf:{id, tool}` — pose map disposisi, pengingat
   terkatung, dan nota dinas keluar semuanya ikut jalan tanpa perlu tahu dari
   mana izinnya datang
4. mcp-izin → `GET /izin/tunggu?tugas&kunci&id` berulang; server menahan tiap
   poll paling lama 25 detik lalu menjawab `{tunggu:true}`
5. kamu menekan Paraf/Tolak → halaman `POST /izin/jawab {token, id, keputusan, pesan?}`
   → server melepas long-poll dengan `{keputusan}`, menyiarkan `izin-jawab`, dan
   mencabut butuh manusia (kalau ditolak, tool-nya tidak pernah jalan, jadi
   tidak ada `PostToolUse` yang akan mencabutnya)
6. mcp-izin membalas `tools/call` dengan `allow` (input diteruskan apa adanya)
   atau `deny` beserta catatanmu; CLI melanjutkan atau melewati tool itu

**Dua gerbang yang berbeda.** `/izin/tanya` dan `/izin/tunggu` dijaga **kunci
per-tugas** — 16 byte acak yang cuma ada di env proses claude anak (diwarisi
proses MCP-nya), tidak pernah di argv, tidak pernah di disk, tidak pernah ke
halaman — jadi yang bisa *mengajukan* izin hanya proses yang memang kita
lahirkan. `/izin/jawab` dijaga gerbang yang sama persis dengan `/perintah`:
`--izinkan-perintah`, token per-jalan, cek `Origin`. Yang sudah bisa menyuruh
mesin ini bekerja memang pantas memparaf pekerjaannya; sebaliknya, situs lain
yang kebetulan terbuka tidak bisa memparaf apa pun. Yang naik ke halaman cuma
**ringkasan** input tool (≤300 karakter: perintah shell, nama berkas, pola),
bukan argumen utuhnya.

**Batas waktu 15 menit**, dihitung di dua tempat yang saling mengunci: server
menolak sendiri (`izin-jawab` dengan *tidak ada paraf*) kalau 15 menit tidak
ada jawaban, dan mcp-izin berhenti mengulang poll setelah batas yang sama
(`AGENT_ROOM_IZIN_TIMEOUT_MS` untuk uji). Perlu diingat batas umur tugas juga
15 menit — menunggu paraf ikut menghabiskannya. Tugas yang berakhir (selesai,
dihentikan, timeout) membersihkan permintaan yang masih menggantung, supaya
kartu tidak menawarkan tombol untuk proses yang sudah tidak ada. `GET /kendali`
mengembalikan `izinTunggu` supaya halaman yang dibuka belakangan tetap dapat
tombolnya.

**Yang tidak bisa.** Ini paraf izin *tool*, bukan percakapan. `AskUserQuestion`
dan `ExitPlanMode` di sesi headless tidak punya jalur jawaban — CLI tidak
mengalihkannya ke permission tool — jadi untuk sesi halaman kartunya menulis
*pertanyaannya tidak bisa dijawab dari sini*, dan untuk sesi terminal tetap
*jawab di terminal*. Formulir tugas di halaman masih disembunyikan tanpa syarat
(lihat atas), jadi `paraf:true` untuk sekarang hanya bisa dikirim lewat body
`/perintah` langsung.

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
