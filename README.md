# Agent Room — Kantor Dinas

<p align="center">
  <img src="docs/screenshot.png" alt="Agent Room — kantor dinas pixel-art" width="640">
</p>

<p align="center">
  <a href="#id">🇮🇩 Bahasa Indonesia</a> ·
  <a href="#en">🇺🇸 English</a>
</p>

---

<a name="id"></a>
## 🇮🇩 Bahasa Indonesia

Nonton sesi **Claude Code** kamu kerja — bukan di terminal, tapi sebagai
pegawai kecil di kantor dinas pixel-art. Tiap sesi jadi satu orang, jalan
ke meja berbeda sesuai tool yang lagi dipakai: `Read` ke lemari arsip,
`Edit`/`Write` ke meja stempel, `git` ke PC server, `Task`/`Agent` ke meja
rapat. Lengkap Garuda, dispenser galon, AC yang netes ke ember, cuaca
sungguhan di jendela, dan 100+ kejadian iseng yang muncul sendiri.

### Jalanin

```bash
git clone https://github.com/fauzirpl/agent-room.git
cd agent-room
node dinas.mjs --pasang -g   # pasang hook (sekali saja) lalu buka kantor
```

`-g` memantau **semua** project Claude Code di mesin ini, bukan cuma folder
ini. Kalau ada sesi Claude Code yang lagi jalan, restart dulu — hook baru
kebaca waktu sesi mulai. Setelah itu, buka <http://127.0.0.1:4517>.

Belum mau pasang hook? `node dinas.mjs` lalu buka
`http://127.0.0.1:4517/?demo=1` — ruangannya jalan sendiri pakai event acak,
tanpa perlu sesi Claude Code sungguhan.

Malas clone? `npx github:fauzirpl/agent-room` menjalankan kantornya langsung
dari GitHub tanpa perlu dipublikasikan ke npm (argumen seperti `--pasang -g`
atau `--periksa` ditaruh di belakangnya seperti biasa). Supaya kantornya nyala
sendiri tiap login, `dinas --layanan` mendaftarkannya ke penjadwal bawaan OS
(`--lepas` mencabut, `--coba` cuma memperlihatkan yang akan dijalankan).

### Yang ada

- Setiap tool call Claude Code jadi gerakan di ruangan, bukan cuma baris log
- Balon pikiran & kotak kabar — isi transkrip beneran, bukan cuma nama tool
- **Serah terima antar sesi**: sesi Claude yang baru masuk di folder yang
  sama bisa langsung tahu apa yang sudah terjadi beberapa jam terakhir —
  berkas apa yang disunting, apa yang gagal, siapa yang masih menunggu
  paraf. Dirangkum dari buku agenda yang memang sudah ada: tanpa model
  bahasa, tanpa jaringan keluar
- 272 event acak (kucing lewat, UPS berbunyi, gorengan naik ke meja rapat) —
  angka dihitung otomatis: `node uji-katalog.mjs`
- Cuaca sungguhan di jendela + siklus siang–malam
- Ruangan mengusut sepanjang hari: pagi meja rapi, menjelang pulang penuh
  tumpukan dokumen, kursi serong, lembaran tercecer — pagi berikutnya bersih
  lagi. Coba `?kusut=1`
- Notifikasi suara pas sesi selesai, plus musik lofi kantor opsional —
  semua bunyi disintesis langsung, nol file audio eksternal
- Opsional: tugaskan pekerjaan baru dan telusuri folder langsung dari halaman

### Tanya kantornya dari sesi lain

Kantor ini juga bisa jadi **MCP server**: sesi Claude Code mana pun bisa
bertanya "siapa yang lagi tertahan?", "sesi mana yang hidup?", "token hari
ini berapa?", "tadi di folder ini terjadi apa?", atau mencari buku agenda —
tanpa membuka halaman. Jalankan `node dinas.mjs --mcp` untuk perintah
`claude mcp add`-nya (atau `--mcp --json` untuk blok `mcpServers`). Hanya-baca,
metadata saja; kantornya harus sedang jalan.

Yang paling kepakai dari situ: **serah terima**. `ruangan_serah_terima`
merangkum satu folder beberapa jam terakhir — sesi mana saja yang
menyentuhnya, berkas apa yang disunting, berapa tool yang gagal,
subperintah git apa yang dipakai, dan siapa yang masih tertahan minta izin —
jadi sesi yang baru masuk tidak menabrak kerja rekan seproyeknya. Isinya
dijahit dari buku agenda yang sudah lama ditulis kantor ini, jadi jawabannya
sama tiap kali ditanya dan tidak butuh kunci apa pun. Rinciannya di
[docs/05](docs/05-kendali-web.md#catatan-serah-terima-serah-terima).

Tanpa dependency — cuma butuh Node dan `curl`. Alasan di balik tiap
keputusan desain (kenapa `curl` bukan Node, kenapa hujan bukan event acak,
kenapa perintah shell dipecah dua meja, dst.) ada di **[DESIGN.md](DESIGN.md)**.
Katalog rancangan 373 event acak ada di **[EVENT-ACAK.md](EVENT-ACAK.md)**
(306 di antaranya sudah jadi kode; total 337 event terpasang, sisanya gelombang
*tamu tenar* yang ditambahkan di luar rancangan — papan skor:
`node uji-katalog.mjs`).

---

<a name="en"></a>
## 🇺🇸 English

Watch your **Claude Code** sessions work — not in a terminal, but as a
little pixel-art civil servant inside an Indonesian government office
("kantor dinas"). Each session becomes one employee who walks to a
different desk depending on which tool their agent is using right now:
`Read` sends them to the filing cabinet, `Edit`/`Write` to the stamping
desk, `git` to the server rack, `Task`/`Agent` to the meeting table.
Complete with a Garuda emblem, a water dispenser, an air conditioner
dripping into a bucket, real weather in the window, and 100+ ambient
events that fire on their own.

### Quick start

```bash
git clone https://github.com/fauzirpl/agent-room.git
cd agent-room
node dinas.mjs --pasang -g   # install the hook (once) and open the office
```

`-g` installs the hook **globally**, so it watches every Claude Code
project on this machine, not just this folder. If a Claude Code session is
already running, restart it — hooks are only read when a session starts.
Then open <http://127.0.0.1:4517>.

Not ready to install a hook yet? Run `node dinas.mjs` and open
`http://127.0.0.1:4517/?demo=1` — the room animates on its own with random
events, no real Claude Code session required.

Don't want to clone? `npx github:fauzirpl/agent-room` runs the office straight
from GitHub, no npm publish needed (put arguments like `--pasang -g` or
`--periksa` after it as usual). To have it start on every login,
`dinas --layanan` registers it with the OS's own login scheduler (`--lepas`
removes it, `--coba` only shows what would be run).

### What's in it

- Every Claude Code tool call becomes motion in the room, not just a log line
- Thought bubbles & a news box — actual transcript content, not just tool names
- **Shift handover between sessions**: a Claude session starting work in a
  folder someone else just left can see what happened there in the last few
  hours — which files were edited, what failed, who is still waiting on a
  human. Stitched from the activity log the office already keeps: no language
  model, no outbound network
- 272 random ambient events (a cat wanders in, the UPS beeps, someone brings
  fried snacks to the meeting table) — counted automatically by `node uji-katalog.mjs`
- Real weather in the window, synced to actual conditions, plus a day/night cycle
- A sound notification when a session finishes, and optional lofi office
  music — all synthesized on the fly, zero external audio files
- Optional: assign new tasks and browse folders straight from the page

### Ask the office from another session

The office doubles as an **MCP server**: any Claude Code session can ask
"who is waiting on me?", "which sessions are alive?", "how many tokens today?",
"what happened in this folder earlier?", or search the activity log — without
opening the page. Run `node dinas.mjs --mcp` to get the `claude mcp add`
command (or `--mcp --json` for an `mcpServers` block). Read-only, metadata
only; the office must be running.

The one that earns its keep: **handover**. `ruangan_serah_terima` summarises a
single folder over the last few hours — which sessions touched it, which files
they edited, how many tool calls failed, which git subcommands ran, and who is
still blocked waiting for a human — so a session picking up the work doesn't
walk over a colleague's. It is stitched from the activity log the office has
kept all along, so the answer is the same every time you ask and needs no API
key. Details in [docs/05](docs/05-kendali-web.md#catatan-serah-terima-serah-terima)
(Indonesian).

Zero dependencies — just Node and `curl`. The reasoning behind every design
choice (why `curl` instead of Node, why rain isn't a random event, why shell
commands split across two desks, etc.) lives in **[DESIGN.md](DESIGN.md)**
(Indonesian only, for now). The design catalog of all 373 random events is in
**[EVENT-ACAK.md](EVENT-ACAK.md)** (267 of them are implemented — scoreboard:
`node uji-katalog.mjs`).
