# Kendali web & pemantauan

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

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
| `GET /folder` | daftar subfolder untuk penelusur folder kerja |

**Formulir tugasnya sendiri sengaja disembunyikan di halaman ini**, apa pun
jawaban `/kendali` — `muatKendali()` di [public/room.js](../public/room.js)
memaksa `elForm.hidden = true` tanpa syarat, jadi menyalakan
`--izinkan-perintah` tidak lagi memunculkan kotak nama/prompt/folder di
sidebar. Endpoint di tabel atas tetap hidup dan bisa dipanggil langsung kalau
kamu punya jalan lain ke token per-jalannya; yang hilang cuma jalan pintas
lewat formulir bawaan.

### Antrean disposisi

Batasnya tetap **4 proses bersamaan**, tapi tugas kelima tidak lagi ditolak
`429` lalu hilang. Dia masuk **loket disposisi**: `/perintah` menjawab `202`
`{antre: true, id, posisi}`, dan begitu satu slot kosong — selesai, timeout,
atau prosesnya keluar — yang paling depan dilahirkan server sendiri lewat
jalur spawn yang sama persis (`lahirkanTugas()` di [server.mjs](../server.mjs)).
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
JSON inline yang mendaftarkan [mcp-izin.mjs](../mcp-izin.mjs) — server MCP stdio
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

**Lembar telaah staf.** Tiap permintaan izin datang dengan **tingkat risiko**
dan **nama pola** yang memicunya — `rm -rf`, `git push --force`, `curl | sh`,
berkas rahasia, dan seterusnya. Aturannya satu berkas, [`telaah.mjs`](../telaah.mjs),
dan sengaja dipakai **dua proses**: `mcp-izin.mjs` dan `server.mjs`. Yang
tertinggi di antara keduanya yang berlaku.

Pembagian itu bukan kerapian: proses MCP memegang `input` **utuh**, sedangkan
server cuma menerima ringkasan 300 karakter. Perintah panjang menyembunyikan
bagian berbahayanya justru di ekor, jadi telaah yang dihitung dari ringkasan
saja akan buta terhadapnya. Yang naik ke server tetap cuma **hasilnya** —
tingkat plus nama pola, tidak pernah isi perintahnya.

Di kartu paraf ia jadi satu pita, dan untuk tingkat **tinggi** tombolnya minta
klik kedua (*Paraf, yakin?*). Gesekan itu untuk **manusia di halaman ini**: ia
tidak menahan pegawai mana pun, tidak menunda tool apa pun, dan hilang begitu
kartunya digambar ulang. Nota, bukan rem.

Sesi terminal ikut dapat pitanya — dihitung di `normalize()` dari `tool_input`
mentah — tapi tetap **tanpa tombol**, karena halaman ini memang tidak punya
pegangan ke proses terminal itu.

### Buku register paraf

`GET /paraf?dari=&sampai=` mengembalikan keputusan izin sepanjang rentang,
**dibaca ulang dari buku agenda** — bukan tabel baru yang harus dipelihara.
Sekelas `/skp`: tanpa token, rentang dijaga sama, dan yang keluar cuma enum,
angka, dan nama pola.

| Kolom | Isi |
|---|---|
| `keputusan`, `sumber` | `paraf`/`tolak`, dan dari mana jawabannya datang |
| `tunggu` | berapa detik permintaan itu menunggu sebelum dijawab |
| `risiko`, `tanda` | tingkat, dan nama pola yang memicunya |

Yang **tidak pernah** ada di sini: isi perintahnya. `uji-paraf.mjs` menjaganya
dengan sentinel — kalau suatu saat potongan perintah bocor lewat pintu baru
ini, ujinya merah sebelum siapa pun sempat melihatnya.

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

Daftarnya ada di `MODEL` pada [public/room.js](../public/room.js) — tambah sendiri
kalau kamu memakai id lain, misalnya id Bedrock atau Vertex. Server menerima apa
pun yang cocok dengan `MODEL_SAH` (alias sependek `opus`, id penuh, sampai id
penyedia lain yang memakai titik dan titik dua) dan **menolak 400** untuk sisanya
— bukan diam-diam menjalankan tanpa model. Id-nya tetap masuk sebagai satu
elemen argv seperti prompt, jadi tidak ada jalan ke shell.

Model cuma bisa ditentukan **saat sesi dilahirkan**. Proses yang sudah jalan
tidak bisa dipindah modelnya dari luar, jadi kartu pegawai hanya menampilkannya,
tidak menawarkan dropdown. Sesi terminal menampilkan model kalau payload
hook-nya kebetulan membawanya — itu tidak dijamin ada.


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
Jalankan servernya dari terminal biasa tempat `claude` normal jalan, atau bikin
token panjang umur lalu isikan lewat env waktu server dijalankan:

```bash
claude setup-token          # salin hasilnya
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat... node server.mjs --izinkan-perintah
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
| `ruangan_sesi_aktif` | `GET /ruangan` | sesi hidup: id, proyek, cabang, mesin, **asal** (vendor agennya — `claude` atau `gemini`), tool terakhir, sejak |
| `ruangan_token_hari_ini` | `GET /token-riwayat` | total hari ini + rincian per proyek, total sepanjang masa |
| `ruangan_agenda_cari` | `GET /agenda` | cari buku agenda: `q`, `proyek`, `sesi`, `kind`, `dari`, `sampai`, `limit` |
| `ruangan_pohon_delegasi` | `GET /ruangan` | siapa mendelegasikan ke siapa saat ini: sesi induk beserta subagent yang masih hidup di bawahnya, berapa lama, berapa tool, dan mana yang sudah lama diam. Induk ber-`kind: stop` yang masih punya peserta disebut **menunggu peserta**, bukan menganggur |
| `ruangan_skp` | `GET /skp` | papan SKP: nilai mutu 0–100 per proyek & per sesi dalam satu rentang, beserta indikator yang membentuknya (rasio gagal bersih, bolak-balik, tertahan, gagal beruntun, rapat yatim) dan **bobot serta titik jenuh** yang dipakai menghitungnya. `dari`, `sampai`, `proyek` (saringan nama folder, dilakukan di sisi tool — `/skp` sendiri tidak punya parameter itu). Angka saja: tidak ada label maupun isi kerja |
| `ruangan_kesehatan` | `GET /health` | server hidup atau tidak |

### Juknis paraf (`sop.json`)

Satu berkas milik kamu, di luar repo, yang menuliskan **sekali** apa yang tidak
boleh disentuh agen di sebuah proyek. Salin `sop.contoh.json` jadi `sop.json`
(atau tunjuk berkas lain lewat `AGENT_ROOM_SOP`). Tidak ada berkasnya = fitur
ini diam total, persis seperti `pagu.json`.

```json
{ "v": 1, "proyek": { "<nama-folder>": {
  "parafWajib": true,
  "modeDilarang": ["bypassPermissions"],
  "aturan": [
    { "putusan": "tolak", "tool": "Bash", "pola": "\\.env", "pesan": "juknis: .env bukan urusan agen" },
    { "putusan": "tolak", "risiko": "tinggi", "pesan": "juknis: risiko tinggi tidak dijalankan di sini" }
  ] } } }
```

**Juknis v1 hanya bisa MENOLAK.** Tidak ada `putusan: "paraf"`, tidak ada paraf
otomatis, tidak ada aturan yang bisa melewati manusia. Ia cuma bisa menambah
penolakan, tidak pernah mengurangi pertanyaan — jadi gerbang manusia yang sudah
ada tidak mungkin melemah karenanya. Kalau paraf otomatis suatu hari benar-benar
diinginkan, itu keputusan tersendiri, bukan nilai baru di enum yang sudah ada.

Aturan dicocokkan berurutan; yang **pertama cocok** yang berlaku. Syaratnya
boleh `tool` (nama persis), `pola` (regex ke ringkasan ≤300 karakter, bukan ke
input utuh), dan `risiko` (batas bawah: `sedang` juga cocok dengan `tinggi`).
Aturan tanpa satu pun syarat **ditolak waktu dimuat** — itu bukan juknis,
itu memutus telepon. Aturan yang salah ketik dilewati dengan satu peringatan;
aturan lain yang benar tetap berlaku.

Yang ditegakkan, dan di mana:

| | sesi lahiran halaman | sesi terminal |
|---|---|---|
| aturan `tolak` | **ditolak otomatis** di `/izin/tanya`, `izin-jawab` ber-`sumber: "sop"`, pegawainya tidak pernah berdiri menunggu | **catatan saja** (`ev.sop`) — tidak ada yang ditahan |
| `parafWajib` | `/perintah` memaksa `paraf: true` | tidak berlaku |
| `modeDilarang` | `/perintah` menolak 400 pada **mode efektif** | tidak berlaku |

Bedanya bukan kelalaian. Yang bisa ditolak juknis cuma permintaan yang lewat
`/izin/tanya`, dan rute itu menuntut kunci per-tugas yang hanya hidup di env
proses anak yang kantor ini lahirkan sendiri. Sesi terminal menjawab izinnya
di terminal, dan kantor ini tidak punya — tidak boleh punya — cara mencampuri.
**Nota bukan rem**, dan di sinilah kalimat itu diuji.

`modeDilarang` diperiksa pada **mode efektif**, bukan pada field `mode` di body:
body tanpa `mode` lahir `bypassPermissions` (atau `default` kalau ber-paraf),
jadi memeriksa field-nya justru membiarkan lewat mode yang paling mungkin
dilarang. Buku agenda menyalin `putusan` + **nomor** aturannya saja — polanya
tidak pernah ikut ke disk, karena regex juknis bisa memuat nama berkas rahasia.

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
| `agent_room_izin_menunggu{tingkat}` | gauge | permintaan paraf yang masih menunggu dijawab, menurut tingkat risikonya. Cuma jalur paraf — label untuk tindakan yang lewat tanpa paraf sengaja tidak ada, karena perintah yang sudah diizinkan lewat `settings.json` tidak pernah memicu `PermissionRequest` dan angkanya akan berbohong |
| `agent_room_konteks_rasio` | gauge | rasio jendela konteks TERPENUH di antara sesi hidup (`1.0` = penuh). Yang ingin dipantau orang adalah "apakah ada sesi yang hampir kehilangan ingatan", bukan rata-ratanya |
| `agent_room_sesi_mode{mode}` | gauge | sesi hidup menurut `permission_mode`-nya. Kardinalitasnya kecil dan tetap (enum CLI), jadi aman jadi label — beda dari nama proyek. Sesi tanpa mode masuk `mode="tak-diketahui"` |
| `agent_room_peserta_hidup`, `agent_room_peserta_diam` | gauge | subagent yang masih tercatat di bawah sesi induknya, dan yang di antaranya tidak terdengar lebih dari sepuluh menit. Angka kedua baru jujur sejak `agent_id` dibaca pada `pre`/`post` — sebelum itu jam terakhir peserta membeku di detik ia masuk |
| `agent_room_uptime_seconds` | gauge | `process.uptime()` |
| `agent_room_pagu_proyek_serapan_rasio`, `agent_room_pagu_proyek_terlampaui` | gauge | dua deret berlabel `proyek="…"` dari pagu anggaran token; **hanya terbit** kalau `AGENT_ROOM_METRICS_PROYEK=1` dan `pagu.json` ada (20 proyek teratas menurut rasio) |

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

### Daftar hadir: mengukur dulu, membangun belakangan

`GET /health` membawa satu blok `absen`. Claude Code menulis satu berkas per
proses di `~/.claude/sessions/<pid>.json` berisi `sessionId`, `pid`, `cwd`, dan
`entrypoint`. Kalau berkas itu bisa dipercaya, ia menjawab pertanyaan yang hari
ini tidak punya jawaban: **sesi mana yang sudah mati tanpa sempat mengirim
`SessionEnd`**.

| Angka | Arti |
|---|---|
| `terbaca` | berkas sesi yang berhasil diurai |
| `cocok` | sesi hidup di kantor ini yang punya berkasnya |
| `yatim` | sesi hidup yang **tidak** punya berkas sama sekali |
| `mati` | sesi hidup yang berkasnya ada tapi pid-nya sudah tidak jalan |

Yang ada di sini **cuma penghitung**. Tidak ada sesi yang dihapus, tidak ada
yang diklasifikasi, dan tidak ada satu pun perilaku yang berubah karenanya —
`mati` yang tinggi pun tidak menyapu apa pun. Itu disengaja: membangun sapuan
di atas sinyal yang belum diukur persis kesalahan yang membuat beberapa usulan
rapat gugur. Amati angkanya dulu; kalau `cocok` ternyata jauh lebih kecil dari
jumlah sesi hidup, berkas itu memang tidak layak dijadikan sumber kebenaran.

Pengecekan pid memakai `process.kill(pid, 0)`, yang **tidak mengirim sinyal apa
pun** — ia cuma menanya "boleh saya kirim?" dan melempar kalau prosesnya sudah
tidak ada. Tidak ada proses yang terganggu karenanya.

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

