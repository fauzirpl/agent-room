# Jalanin & pasang

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

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
  kendali web  mati  (nyalakan: dinas --kendali)
  alamat       http://127.0.0.1:4517
  ----------------------------------------------------
```

Dua baris pertama itu alasan dia ada. Keduanya tidak kelihatan kalau
`server.mjs` dijalankan langsung, dan justru keduanya yang paling sering bikin
orang bingung: biner claude mana yang sebenarnya akan dipanggil, dan hook-nya
sudah terpasang atau belum.

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

### Pegawai honorer: agen selain Claude Code

`--untuk gemini` memasang hook yang sama ke **Gemini CLI**, dan sesinya muncul
di ruangan yang sama, buku agenda yang sama, dan pagu token yang sama:

```bash
node agent-room/install.mjs --untuk gemini --global
```

Bisa karena payload hook Gemini ternyata sama persis bentuknya dengan milik
Claude Code — `session_id`, `transcript_path`, `cwd`, `hook_event_name`, plus
`tool_name`/`tool_input`/`tool_response`. Yang berbeda cuma nama eventnya
(`BeforeTool` bukan `PreToolUse`), nama toolnya (`run_shell_command` bukan
`Bash`), dan tiga rincian pemasangan: berkasnya `~/.gemini/settings.json`,
hooknya masih eksperimen sehingga `tools.enableHooks` + `hooks.enabled` ikut
dinyalakan, dan `timeout`-nya dihitung **milidetik**.

Yang perlu kamu tahu soal honorer:

- **tidak punya balon pikiran maupun kalimat.** Transkrip vendor lain sengaja
  tidak pernah dibaca — medannya bernama sama, isinya format lain, dan menebak
  isi berkas orang bukan harga yang pantas dibayar untuk balon teks;
- **tetap dihitung penuh** di tool call, gagal, buku agenda, papan SKP, dan
  pagu token per proyek;
- asalnya terbaca di `GET /ruangan` dan lewat tool MCP `ruangan_sesi_aktif`.

Codex CLI dan Cursor belum dibuka. Codex tidak terpasang di mesin ini jadi
kontraknya tidak bisa dibuktikan; payload Cursor membawa `user_email` dan isi
`edits`, sementara kotak surat tunda menyimpan payload mentah sampai 24 jam.

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

Dokumentasi hook Claude Code mencantumkan 33 event. Yang dipasang 17 — yang
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
| `Elicitation` | **server MCP minta keterangan di tengah tool call**: pegawainya berdiri mengangkat map disposisi dengan nama instansi yang bertanya |
| `ElicitationResult` | keterangannya sudah diberikan; posenya dicabut |

Lima yang pertama dipasang dengan `matcher: "*"` karena matcher-nya menyaring
**nama tool**. Sisanya dipasang tanpa `matcher` sama sekali — untuk Claude Code,
matcher yang dihilangkan sama artinya dengan `"*"`, jadi bentuk polos itu benar
baik untuk event yang punya matcher (`SessionStart` menyaring cara mulai,
`SubagentStart` menyaring tipe agen, `PreCompact` menyaring pemicunya) maupun
untuk yang memang tidak punya (`Stop`, `UserPromptSubmit`).

## Konfigurasi

| Env | Default | Guna |
|---|---|---|
| `AGENT_ROOM_PORT` | `4517` | ganti port (install ulang hook setelah diubah) |
| `AGENT_ROOM_HOST` | `127.0.0.1` | alamat bind |
| `AGENT_ROOM_CLAUDE` | hasil `where claude` | tunjuk biner claude tertentu, kalau PATH menemukan instalasi yang salah. Kalau nilainya berakhiran `.mjs`/`.cjs`/`.js`, anaknya dijalankan sebagai `node <skrip>` — **seam untuk uji** (dipakai `uji-kendali.mjs` lewat `claude-palsu.mjs`), dan kantor mengatakannya keras-keras di konsol waktu dipakai. Bukan kuasa baru: env ini memang sudah menjalankan executable sembarang |
| `AGENT_ROOM_TOKEN_LOG` | `token-riwayat.jsonl` | tempat riwayat token lintas sesi ditulis (lihat **Riwayat lintas sesi**) |
| `AGENT_ROOM_KLIPING_LOG` | `kliping-mingguan.jsonl` | tempat arsip kliping mingguan ditulis (lihat **Arsip kliping mingguan**); checkpoint minggu berjalan ikut ke folder yang sama |
| `AGENT_ROOM_AGENDA_DIR` | `agenda/` | folder buku agenda harian (lihat **Buku agenda**) |
| `AGENT_ROOM_AGENDA_HARI` | `30` | berkas agenda lebih tua dari ini dibuang saat start |
| `AGENT_ROOM_BUKU_INDUK` | `buku-induk.json` | tempat buku induk pegawai (karier per folder proyek) ditulis (lihat **Buku induk pegawai**) |
| `AGENT_ROOM_BUKU_INDUK_UJI` | *(kosong)* | **uji saja**: pengali jam dinas (mis. `100000`) supaya kenaikan golongan bisa dipaksa; nilainya ikut tampil di `/buku-induk` sebagai `uji` |
| `AGENT_ROOM_PAGU` | `pagu.json` | tempat setelan pagu **token** per proyek dibaca (lihat **Pagu anggaran token**). Berkasnya tidak ada = fitur mati total, tanpa peringatan |
| `AGENT_ROOM_PAGU_BAWAAN` | *(kosong)* | jalan pintas tanpa berkas: satu angka token yang berlaku untuk semua proyek. Hanya dibaca kalau `pagu.json` memang tidak ada |
| `AGENT_ROOM_FORMASI` | `formasi.json` | tempat formasi pegawai tetap (nama & jabatan penghuni tiap kursi per folder proyek) ditulis (lihat **Pegawai tetap per proyek** di [Ruangan & pegawai](02-ruangan.md)) |
| `AGENT_ROOM_PEGAWAI_TETAP` | *(nyala)* | `off` mematikan formasi pegawai tetap: nama pegawai kembali diundi tiap sesi dan `formasi.json` tidak pernah lahir |
| `AGENT_ROOM_CUACA` | *(nyala, tebak dari IP)* | `off` mematikan cek cuaca; `lat,lon` menetapkan lokasi |
| `AGENT_ROOM_ISI` | *(nyala)* | `off` menutup transkrip sesi: ruangan kembali cuma menyiarkan metadata, tanpa pikiran dan kalimat agen |
| `AGENT_ROOM_KUNCI` | *(kosong)* | kalau diisi, `POST /event` wajib membawa header `x-agent-room-kunci` yang sama; **wajib** begitu bind dibuka ke jaringan (lihat **Kantor pusat & kantor cabang**) |
| `AGENT_ROOM_URL` | *(kosong)* | dibaca **installer** & `mcp-room.mjs`: alamat kantor pusat yang dituju hook mesin ini, mis. `http://kantor.lan:4517` |
| `AGENT_ROOM_HOST_IZIN` | *(kosong)* | nama Host tambahan yang diterima penjaga Host, dipisah koma (nama mesin di LAN, nama tunnel) |
| `AGENT_ROOM_TUNDA_DIR` | `~/.agent-room/tunda` | kotak surat hook offline: dibaca `hook.mjs --tunda` (penulis), server (pemungut), dan `dinas --periksa` (lihat **Kotak surat hook offline**) |
| `AGENT_ROOM_KONTEKS` | `200000` | jendela konteks yang diasumsikan waktu menghitung meteran konteks. Sengaja tidak ditebak dari nama model — nama tampilan berubah antar versi; kalau sebuah sesi terlihat memakai lebih dari ini, jendelanya dinaikkan sendiri ke 1.000.000 dan tidak turun lagi |
| `AGENT_ROOM_METRICS_PROYEK` | *(kosong)* | `1` menambahkan label `proyek` pada metrik token di `/metrics` (lihat **Pemantauan**) |
| `AGENT_ROOM_NAMA` | `nama.json` | tempat daftar nama pegawai pilihanmu disimpan (lihat [Suara ucap & daftar nama](07-suara-nama.md)) |
| `AGENT_ROOM_SUARA` | `suara.json` | tempat setelan suara ucap disimpan (aktif, model, voice, format) |
| `AGENT_ROOM_SUARA_KUNCI` | `.agent-room-suara-kunci` | tempat kunci OpenRouter disimpan, mode `0600`; nilainya tidak pernah dicetak ke konsol |
| `AGENT_ROOM_SUARA_DIR` | `suara/` | folder cache klip suara ucap |
| `AGENT_ROOM_SUARA_URL` | OpenRouter `/audio/speech` | alamat penyedia TTS; diarahkan ke penyedia palsu oleh `uji-suara.mjs` supaya uji tidak pernah keluar jaringan |
| `AGENT_ROOM_SUARA_MODEL_URL` | OpenRouter `/models` | alamat daftar model TTS untuk datalist di panel ⚙️ |

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

### Pagu anggaran token

Tiap proyek boleh diberi **pagu token per minggu kalender** (Senin sampai
Minggu). Begitu serapan minggu berjalan melewati ambang, ruangan menerbitkan
satu nota — sama seperti nota promosi buku induk: dideteksi di server, bukan di
halaman, supaya satu kejadian berarti satu nota di semua penonton.

**Ini angka token, bukan uang.** Tidak ada tabel harga di dalamnya dan tidak
akan pernah ada: harga berubah, angka token dari API tidak. (Kata "pagu" muncul
juga di antrean disposisi sebagai `--max-budget-usd`; itu pagu dolar, dunia
lain, dan tidak pernah disambung ke angka di sini.)

Ini juga **nota, bukan rem**. Serapan yang lewat pagu tidak pernah menahan
pegawai, menahan antrean, atau mengubah state siapa pun.

Bentuk `pagu.json` (salin dari `pagu.contoh.json`):

```json
{
  "v": 1,
  "ambang": [80, 100],
  "bawaan": 0,
  "hitung": "io",
  "proyek": { "agent-room": 5000000 }
}
```

| Kunci | Guna |
|---|---|
| `ambang` | persen serapan yang menerbitkan nota. Bawaan `[80, 100]` |
| `bawaan` | pagu untuk proyek yang tidak disebut di `proyek`. `0` = tidak dipagu |
| `hitung` | `io` (bawaan) menghitung token masuk+keluar saja; `semua` ikut menghitung token tulis-cache dan baca-cache |
| `proyek` | nama **folder** proyek → pagu token per minggu |

Tanpa `pagu.json`, **tidak terjadi apa-apa**: tidak ada nota, tidak ada metrik,
tidak ada berkas baru, dan tidak satu baris konsol pun. Yang tidak memakai fitur
ini tidak perlu tahu fitur ini ada.

Empat sifat yang lebih baik dibaca sekarang daripada ditemukan sendiri nanti:

1. **Dibaca sekali waktu start.** Mengubah `pagu.json` tanpa merestart dinas
   tidak berpengaruh, sama seperti env lain.
2. **Dasar diam.** Pemeriksaan pertama sebuah proyek menandai *diam* semua
   ambang yang sudah terlewati sebelumnya, supaya restart di tengah minggu tidak
   memuntahkan ulang nota lama. Harganya: kalau pagu baru diisi waktu serapan
   sudah 90%, nota 80% memang tidak akan terbit minggu itu — hanya 100%.
3. **Kuncinya nama folder**, sama seperti riwayat proyek dan buku induk. Dua
   worktree yang nama foldernya sama dihitung sebagai satu pagu.
4. **Ambang lebih dari empat dipotong** dari yang terendah, tapi ambang 100%
   tidak pernah ikut dibuang — itu satu-satunya nota yang jadi alasan fitur ini
   ada. Yang dibuang tetap disebut namanya di konsol.

Lima metrik ikut terbit di `/metrics` begitu pagu aktif:

| Metrik | Arti |
|---|---|
| `agent_room_pagu_proyek` | berapa proyek dipagu eksplisit di berkas (angka konfigurasi, bukan pemakaian) |
| `agent_room_pagu_bawaan` | pagu bawaan (`0` = tidak ada) |
| `agent_room_pagu_proyek_aktif` | proyek berpagu yang masuk laporan minggu berjalan |
| `agent_room_pagu_serapan_rasio` | serapan minggu berjalan sebagai rasio terpakai/pagu (`1.0` = pas pagu) |
| `agent_room_pagu_terlampaui` | berapa proyek yang serapan minggu ininya sudah lewat pagu |

Ditambah `agent_room_pagu_hitung_penuh_total`, yang naik sekali tiap laporan
dihitung penuh — kalau angka itu naik tiap scrape, cache laporannya sudah tidak
bekerja. Dengan `AGENT_ROOM_METRICS_PROYEK=1`, dua metrik berlabel `proyek`
ikut terbit (20 teratas menurut rasio).

`pagu.json` berisi nama folder proyek milik pemakai, jadi berkasnya diabaikan
`.gitignore`. Yang ikut di repo justru `pagu.contoh.json`.

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

