# Suara & narasi tiap event

> Bagian dari [DESIGN.md](../DESIGN.md). Status: **selesai** — efek suara,
> narasi TTS (orang pertama, suaranya ikut jenis kelamin), panel, generator,
> dan kasus 16-23 di `uji-suara.mjs`.

Sampai kemarin ruangan ini cuma bersuara untuk **pekerjaan** (foley per
stasiun: stempel, laci arsip, rak server) dan untuk **kamu** (lonceng
notifikasi). Kejadian yang muncul sendiri — kucing naik ke keyboard, AC bocor,
dus arsip ambruk, tamu datang — tidak berbunyi sama sekali. 337 kejadian, semua
bisu.

Sekarang tiap event membawa dua hal: **efek suara** yang menceritakan
kejadiannya, dan **narasi** — satu kalimat orang pertama dari orang yang
mengalaminya, bukan judul kejadiannya.

## Dua lapis yang tidak saling menunggu

| Lapis | Isi | Butuh jaringan? | Ikut centang |
|---|---|---|---|
| 0 | efek suara Web Audio (`EFEK` di room.js) | tidak | 🔊 efek suara |
| 2 | narasi TTS lewat `/ucap?event=<id>` | ya | 🗣️ + 🎙️ narasi kejadian |

Aturannya sama dengan lonceng notifikasi di
[07-suara-nama.md](07-suara-nama.md): **lapis 0 wajib jalan sendirian.** Tanpa
kunci OpenRouter, offline, kuota habis — ruangan tetap berbunyi seperti biasa,
cuma tanpa yang membacakan. Dan keduanya tidak diserikan:

```js
efekEvent(def, E.aktor[0]);   // instan, tanpa jaringan, selalu
ucapEvent(def, E.aktor[0]);   // menyusul kalau klipnya siap, boleh gagal, boleh diam
```

Kalau diserikan, "gelas pecah" terdengar tiga detik sesudah gelasnya pecah.

Keduanya dipanggil di `nyalakanEvent()` **sesudah `mulai()`**, supaya efeknya
bisa ikut posisi pemeran yang barusan dipinjam (panning stereo: kejadian di rak
server terdengar di kanan). `?event=<id>` yang dipakai untuk menguji satu event
TIDAK dikecualikan — beda dari `laporAmbien()` yang memang tidak boleh
mengotori arsip kliping. Menguji sebuah event tanpa bisa mendengar bunyinya itu
percuma.

## Lapis 0: kosakata, bukan 337 bunyi

`EFEK` di [`room.js`](../public/room.js) berisi 46 resep, dan kuncinya nama
**benda/gerak**, bukan nama event — persis pola `FOLEY` yang sudah ada:

```
bel bip bipGagal klik ketuk derit debum gedebuk pecah kertas sobek gores
stempel laci kursi printer dengung neon padam nyala kipas getar dering sirene
tetes guyur air sapu langkah pintu angin gemuruh tepuk sorak meong kicau lalat
denting plastik logam petik jepret sunyi   (+ nada/nadaTurun/nadaGanda generik)
```

337 kejadian tidak butuh 337 bunyi. Yang dibutuhkan cuma kosakata yang cukup
untuk membedakan "ada yang jatuh" dari "ada yang mengetuk pintu". Semuanya
disintesis dari dua bahan yang sudah dipakai foley — `foleyNada()` dan
`foleyDerauNada()` — supaya amplop dan cara membangun bunyinya tidak bercabang
dua, dan `dependencies` tetap `{}`.

Tiga resep (`stempel`, `laci`, `kursi`) memanggil `FOLEY` yang sudah ada, bukan
meniru bunyinya: stempel yang menghantam meja karena tool call dan stempel yang
menghantam meja karena event harus terdengar **sama**.

`sunyi` bukan lubang di kamus, melainkan keputusan: hujan dan petir sudah punya
suaranya sendiri (`aturSuaraHujan`, `gemuruh()`, yang mengikuti `/cuaca`
sungguhan). Menambah bunyi kedua di atasnya bukan bikin ramai, bikin **bohong**
— yang terdengar jadi dua petir untuk satu kilat.

### Petanya dihasilkan, bukan ditulis tangan

Menulis bunyi 337 event satu per satu berarti 337 keputusan kecil yang tidak
mungkin konsisten dan pasti basi tiap gelombang event baru. Padahal
keputusannya **sudah ada**: tiap baris di [`event-acak.json`](../event-acak.json)
punya kolom `suara`, catatan desain hasil rapat —

```
"blip(600,.04) tiap lembar keluar"
"derit pendek tiap sapuan"
"tiga ketukan tumpul beruntun"
"gemuruh rendah 0,6 detik setelah kilat"
```

[`selaras-suara.mjs`](../selaras-suara.mjs) menerjemahkan catatan itu ke
kosakata di atas dan menulis
[`public/event/99-suara.js`](../public/event/99-suara.js), yang ikut disambung
lewat `manifest.json` seperti berkas event lainnya.

```bash
node selaras-suara.mjs            # tulis ulang petanya
node selaras-suara.mjs --periksa  # exit 1 kalau basi (ikut `npm test`)
node selaras-suara.mjs --papan     # papan skor: berapa event per resep
```

Urutan penerjemahannya sengaja **kata kunci dulu, angka `blip` belakangan**.
`blip(600,.04) tiap lembar keluar` itu catatan yang menyebut bendanya (lembar
kertas keluar dari mesin) dan angkanya cuma penanda "ada bunyi kecil di sini";
menerjemahkannya jadi nada telanjang 600 Hz membuang keterangan yang justru
paling berguna. Angkanya baru dipakai kalau tidak ada satu pun benda yang bisa
dikenali. Kalau catatannya pun bisu, jatuh ke bawaan per kategori katalog —
event tanpa bunyi sama sekali itu event yang tidak terdengar terjadi.

Yang **menang** atas hasil skrip: medan `sfx` di definisi event itu sendiri
(`sfx: 'derit'` atau `sfx: ['nada', 600, 0.04]`). Event yang tahu bunyinya
sendiri tidak boleh dikalahkan tebakan; skrip ikut mencatatnya supaya tidak
ditulis dua kali.

### Satu jebakan yang sudah menggigit sekali

Kata pendek di tabel aturan SELALU dikurung `\b` di **dua** sisi. Batas
belakang saja (`pel\b`) ikut mengenai "ditem**pel**" dan "**pel**" di
"panel"; `bel\b` mengenai "la**bel**"; `lap\b` mengenai "ge**lap**"; `wa\b`
mengenai "ba**wa**"; `lan\b` mengenai "pe**lan**". Salahnya tidak pernah
kelihatan sebagai galat — yang terjadi cuma satu event berbunyi keliru, dan
tidak ada yang tahu bunyi yang benar seperti apa.

## Lapis 2: narasi, dan kenapa halaman cuma mengirim id

Halaman **tidak pernah** mengarang kalimat narasi. Yang dikirim cuma id event:

```
GET /ucap?event=cicak-jatuh-ke-berkas&jk=P
  ->  "Cicaknya jatuh ke tumpukan berkas saya, astaghfirullah."  (voice perempuan)
```

Ini pelajaran yang sudah dibayar sekali oleh `UCAP`/`suaraKalimat`: kalimat
yang hidup di dua tempat pasti hanyut, dan waktu hanyut, "panaskan cache"
memanaskan kalimat yang tidak pernah dipakai — tanpa satu pun galat muncul.
Kalimat notifikasi terpaksa hidup di dua tempat (halaman yang meminta, server
yang memanaskan) dan dijaga lint kasus 10. Narasi event tidak punya masalah itu
sama sekali, karena yang mengeja cuma satu pihak.

### Orang pertama, bukan papan nama

Kalimatnya **sudut pandang orang pertama — orang yang mengalami kejadiannya.**
Itu keputusan yang menentukan seluruh rasa fiturnya:

| | |
|---|---|
| papan nama | "Cicak jatuh ke tumpukan berkas" |
| orang pertama | "Cicaknya jatuh ke tumpukan berkas saya, astaghfirullah." |

Yang pertama terdengar seperti pengumuman stasiun kereta. Yang kedua terdengar
seperti ada orang di ruangan itu. Versi pertama sempat dipakai — kalimatnya
diambil dari kolom `nama` di katalog, yang memang judul — dan begitu didengar,
bedanya langsung jelas.

### Dari mana kalimatnya

`narasiEvent(id)` di [`server.mjs`](../server.mjs), tiga jenjang, berhenti di
yang pertama berisi:

1. **[`narasi-event.json`](../narasi-event.json)** — 337 kalimat yang ditulis
   tangan, satu per event, rata-rata 45 huruf. Ini yang dipakai sehari-hari.
2. **Kolom `balon`** di `event-acak.json` — kalimat balon ucap dari katalog
   rancangan. Sudah orang pertama juga (memang dialog), jadi ia jaring
   pengaman yang tepat untuk event baru yang barisnya belum ditulis. Perlu
   dibersihkan dulu: sebagian menulis dua pembicara (`arsiparis: "…" /
   pegawai: "…"` → giliran pertama saja, penanda pembicaranya dibuang), dan
   sebagian cuma bunyi (`...zzz`, `hatsyi!`, `-`). Yang cuma bunyi **dilewat**
   — dibacakan narator, `...zzz` terdengar seperti klip yang rusak, bukan
   seperti orang. Pagarnya dua kata dan sepuluh huruf.
3. **Kolom `nama`, atau idnya sendiri.** Orang ketiga dan kaku, tapi lebih baik
   daripada kejadian yang bisu. Kapitalnya dirapikan (katalog campur Title Case
   dan sentence case, jadi kata HURUF BESAR SEMUA seperti APAR/BPK/UTP
   dibiarkan), dan untuk yang jatuh ke id, akronim dikembalikan lewat daftar
   kecil: `kabel-lan-lepas` → "Kabel LAN lepas".

Jenjang 2 dan 3 ada supaya event baru tidak pernah bisu — tapi keduanya
terdengar beda, dan kalimat tulisan tangan tidak akan menyusul sendiri kalau
tidak ada yang menagihnya. Kasus 21 di `uji-suara.mjs` yang menagih: begitu ada
event terdaftar tanpa barisnya, ujinya merah dan menyebutkan idnya.

Kedua berkas dibaca **sekali**; keduanya berkas rancangan yang berubah kalau
ada gelombang event baru — yaitu saat servernya memang dijalankan ulang.
`AGENT_ROOM_KATALOG` dan `AGENT_ROOM_NARASI` boleh menggesernya (dipakai uji
supaya kalimat yang diperiksa tidak ikut berubah tiap orang menambah event).

### Pagar biaya

`?event=` cuma menerima yang **bentuknya id** (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`,
maksimal 60 huruf). Bukan soal keamanan — servernya cuma bind ke localhost —
melainkan supaya query string tidak bisa dipakai mengirim kalimat karangan
sendiri ke penyedia berbayar. Id yang tidak dikenal katalog **tetap dilayani**
(itu 31 event di atas); yang ditolak cuma yang bukan id, dan ditolaknya jadi
204, seperti semua kegagalan lain di jalur ini.

### Lingkup

| Nilai | Artinya |
|---|---|
| `semua` (bawaan) | tiap kejadian dibacakan |
| `panggung` | cuma kejadian besar yang eksklusif — 68 dari 337 |
| `mati` | tidak ada yang dibacakan; efek suaranya tetap jalan |

Bawaannya `semua` karena itu yang diminta waktu fitur ini dipesan. Yang merasa
terlalu cerewet tinggal turun ke `panggung` tanpa mematikan ucapan notifikasi.

`panggung` disaring **halaman**, bukan server: `kelas` event hidup di definisi
event, dan server tidak punya alasan untuk tahu. `mati` disaring dua-duanya —
halaman supaya tidak ada permintaan yang keluar, server supaya tetap benar
kalau ada tab lama yang belum tahu setelannya berubah.

### Satu narator

Event `latar` boleh menumpuk, jadi dua narasi bisa diminta dalam detik yang
sama. Yang kedua **dibuang, bukan diantrekan**: narasi yang telat sepuluh detik
menceritakan kejadian yang sudah lewat. Penandanya dilepas di `ended`/`error`,
plus jaring pengaman 15 detik kalau dua-duanya tidak pernah datang (tab
disembunyikan sebelum klipnya sempat mulai).

Efeknya punya rem sendiri: 400 ms antar bunyi, supaya event yang menyalakan
`lanjutan` seketika tidak jadi dua bunyi yang bertumpuk jadi bunyi ketiga yang
aneh.

## Suara ikut jenis kelamin

Kalimat notifikasi maupun narasi kejadian sama-sama **kalimat orang itu
sendiri** — "Izin, Sri Rahayu selesai" itu Sri Rahayu yang bicara, bukan
narator yang melaporkannya. Jadi voice-nya ikut dia.

Yang dikirim halaman cuma `&jk=L` / `&jk=P` — fakta yang memang dia punya
(`jkAgen(a)`, dari `ev.jk` milik server). **Halaman tidak pernah memilih
voice-nya sendiri**: pasangan voice itu setelan server, sama seperti model dan
kuncinya. Untuk narasi event, `jk`-nya milik pemeran yang dipinjam event itu;
event latar yang tidak meminjam siapa pun (cicak di dinding, mendung
menggantung) mengirim tanpa `jk`, dan itu bukan kekurangan — di ruangan ini
suara utama justru pas terdengar seperti narator.

`suaraVoice(jk)` di server satu-satunya yang memutuskan, dan sekaligus
satu-satunya yang menyaring: nilai selain `L`/`P` jatuh ke voice utama tanpa
cabang tambahan. Sempat ada `jkSah()` yang membersihkannya lebih dulu di rute;
itu dicabut karena tidak pernah mengubah satu pun hasil yang bisa diamati —
dua penjaga untuk satu hal cuma bikin salah satunya tidak pernah teruji.

### Kenapa tidak ada tabel "voice ini laki-laki"

Karena tabel itu tidak ada di sumber mana pun yang bisa dicek. OpenRouter
mengirim `supported_voices` sebagai daftar nama telanjang, dan dokumen Google
sendiri cuma menyebut **sifat** tiap voice — Zephyr "Bright", Algenib
"Gravelly", Achernar "Soft" — tidak pernah jenis kelaminnya. Menuliskannya di
kode berarti mengarang fakta lalu memakainya seolah-olah data, persis
kesalahan yang sudah dibayar sekali oleh bawaan `openai/gpt-4o-mini-tts`.

Jadi yang disediakan alatnya, bukan tebakannya: dua kolom di panel, satu
datalist berisi voice sungguhan milik model yang sedang dipilih, dan tombol
▶ coba di tiap kolom. Bawaannya **kosong**, dan kosong berarti semua orang
memakai voice utama — persis seperti sebelum fitur ini ada.

### Yang di-hash voice efektif, bukan `jk`-nya

Bedanya menentukan dua hal sekaligus. Selama kedua kolom masih kosong, ketiga
jenis kelamin menghasilkan hash yang **sama persis** seperti sebelum fitur ini
ada: cache lama tetap terpakai, dan "panaskan narasi" tidak mendadak jadi tiga
kali lipat. Begitu kolomnya diisi, yang berbeda otomatis dapat klip sendiri —
tanpa invalidasi manual, dan dikosongkan lagi pun klip lama langsung kepakai
kembali.

Itu juga yang bikin panaskan cache tetap jujur angkanya:

| Yang dipanaskan | Kolom kosong | Dua voice terpasang |
|---|---|---|
| daftar nama | 1 klip per nama | tetap 1 — namanya sudah membawa jenis kelaminnya (`jkDari`) |
| "Izin, mohon arahan" | 1 | 3 — tidak bermana, siapa pun bisa mengucapkannya |
| narasi event | 337 | 1.011 — pemerannya diundi ulang tiap event menyala |

## Format klip: mp3, atau pcm yang dibungkus WAV

Rancangan awal menulis `response_format: 'mp3'` sebagai **tetapan**, dengan
alasan yang benar (pcm mentah tidak bisa dimainkan `new Audio()`) tapi
kesimpulan yang salah. Kenyataannya:

```
POST .../audio/speech   { model: "google/gemini-3.1-flash-tts-preview", response_format: "mp3" }
-> 400  Gemini TTS only supports response_format="pcm". Got "mp3".
```

Jadi jawabannya bukan memaksa mp3, melainkan **memasang kepalanya**: PCM +
44 byte kepala RIFF = WAV, dan WAV dimainkan `<audio>` di semua peramban.
Tetap nol dependensi, tetap satu `fetch` polos.

Angkanya dari dokumen Google sendiri, bukan dari ingatan — contoh
`wave_file()` di sana menulis `rate=24000, sample_width=2, channels=1`, yaitu
24 kHz, 16-bit, mono. Laju cuplikannya tetap dibaca dulu dari `content-type`
kalau penyedianya menyebutkan (`audio/L16;rate=24000`); 24000 cuma jatuhannya.

Koreksinya **sekali lalu diingat**: 400 yang kalimatnya cocok dengan
`SUARA_PCM_SAJA` memindahkan `suara.format` ke `pcm`, menuliskannya ke
`suara.json`, dan mengulang permintaannya. Tanpa "diingat", tiap klip pertama
sesudah server hidup selalu membuang satu permintaan yang sudah pasti gagal —
dan pada penyedia yang menghitung permintaan gagal, itu dibayar.

Format ikut di-hash, jadi klip mp3 lama tidak pernah tersaji sebagai
`audio/wav` sesudah formatnya berpindah, dan `<hash>.mp3` hidup berdampingan
dengan `<hash>.wav` di cache sampai kamu menekan **kosongkan**.

## Panel ⚙️

```
Suara ucap
──────────
🗣️ ucapkan notifikasi                    [x]
🎙️ narasi kejadian     [ tiap kejadian ▾ ]
   ↳ 337 kejadian punya kalimatnya sendiri

model            [ google/gemini-3.1-flash-tts-preview ▾ ]
voice            [ Zephyr ▾ ]              [▶ coba]
voice ♂ laki-laki [ kosong = ikut voice di atas ]  [▶ coba]
voice ♀ perempuan [ kosong = ikut voice di atas ]  [▶ coba]
format klip      [ mp3 ▾ ]

cache 20 klip    [panaskan nama] [panaskan narasi] [kosongkan]
    935 KB
```

Tiga kolom voice, tiga tombol audisi, satu jalur (`/suara/coba?jk=`).
Kalimatnya sengaja **sama** untuk ketiganya: yang mau dibandingkan suaranya,
dan kalimat yang beda-beda justru bikin telinga membandingkan kalimat.

Dua tombol panaskan, satu jalur (`POST /suara/panasi` + `{lingkup}`). Dipisah
karena jumlahnya beda jauh: daftar nama belasan klip dan selesai sekali tekan,
narasi event ratusan dan hampir pasti kena batas 120 detik di server — makanya
kalimat penutupnya menyuruh menekan lagi, dan itu bukan kegagalan.

Daftar yang dipanaskan dibaca dari **sumber event yang benar-benar dikirim ke
halaman**, bukan dari katalog rancangan: katalog memuat 373 id termasuk yang
ditolak dan yang belum ditulis, dan klip untuk kejadian yang tidak akan pernah
menyala itu uang yang dibuang. Regexnya sama persis dengan yang dipakai
`uji-katalog.mjs`, yang menyilangkannya dengan registri sungguhan tiap
`npm test` — jadi kalau bentuk penulisan id berubah, ketahuannya di sana.

### Rem kegagalan beruntun

Kunci salah atau OpenRouter tumbang bikin **semuanya** gagal. Dengan 337
narasi, menghabiskannya sampai baris terakhir berarti 337 permintaan yang sudah
pasti gagal — lama, dan pada penyedia yang menghitung permintaan gagal, mahal.
Lima kegagalan berturut-turut sudah cukup jadi jawaban.

## Yang perlu kamu terima

Nama kejadian di ruangan ikut dikirim ke OpenRouter, sama seperti nama pegawai.
Bedanya jumlahnya: 337 kalimat, sekali bayar seumur cache (± 12 MB kalau
dipanaskan semua). Sesudah "panaskan narasi" tuntas, ruangan tidak lagi
menelepon siapa pun untuk bersuara.

## Uji

Kasus 16-23 di [`uji-suara.mjs`](../uji-suara.mjs), headless, tanpa jaringan.

| Kasus | Yang dijaga |
|---|---|
| 16 | Ketiga jenjang kalimat, satu per satu: tulisan tangan menang; yang belum ditulis jatuh ke balon; balon dua pembicara dipangkas jadi satu kalimat; balon yang cuma bunyi dilewat ke `nama`; HURUF BESAR tidak diturunkan; yang tidak ada di mana pun jatuh ke idnya. Plus: id yang bukan id → 204 **tanpa memanggil penyedia**; `?teks=` tidak berubah artinya; narasi yang sama tidak dibayar dua kali |
| 17 | `mati` membungkam kejadian tapi **tidak** notifikasi; `panggung` tetap dilayani server (penyaringnya di halaman); nilai ngawur ditolak; setelannya bertahan sesudah server mati; `suara.json` naik ke v2 |
| 18 | Tanpa `lingkup` tetap berarti daftar nama; daftar event datang dari registri (337), bukan dari katalog sandbox yang cuma tiga baris; tekan kedua kali nol panggilan; rem 5 kegagalan beruntun |
| 19 | Lint: tiap resep di `99-suara.js` ada di `EFEK`; `KOSAKATA` di generator = kamus sungguhan; tiap id di peta benar-benar event terdaftar; `nyalakanEvent()` memang memanggil `efekEvent()` **dan** `ucapEvent()`; `99-suara.js` terdaftar di `manifest.json` |
| 20 | Penyaring yang hidup di HALAMAN, dijalankan sungguhan di sandbox vm milik `uji-event.mjs`: `ucapNyala` mati, lingkup `mati`, lingkup `panggung` melewati event latar, satu narator (yang kedua dibuang, bukan diantrekan), dan URL-nya membawa id yang dikodekan — bukan kalimat |
| 21 | Tiap event terdaftar punya kalimat tulisan tangannya sendiri di `narasi-event.json`; tidak ada kalimat untuk event yang sudah tidak ada; tidak ada yang lebih dari 90 huruf, kosong, sepenggal, atau berkutip |
| 22 | Suara ikut jenis kelamin: bawaannya kosong (= voice utama untuk semua); sesudah dipasang, `L`/`P` memakai voice masing-masing dan yang tidak diketahui tetap voice utama; `jk` ngawur = tidak diketahui, bukan galat; kalimat sama dengan dua jenis kelamin = dua klip; dikosongkan lagi = klip lama kepakai kembali **tanpa panggilan baru**; ETag beda antar jenis kelamin; panaskan nama membawa jenis kelamin yang nanti benar-benar dipakai |
| 23 | Model yang menolak mp3: dicoba mp3 dulu lalu pcm, badannya WAV sungguhan (RIFF/WAVE, 24 kHz, mono, 16-bit, panjang data cocok), formatnya diingat di `suara.json` sehingga kalimat berikutnya langsung pcm, klip disimpan `.wav` dan ikut terbuang waktu dikosongkan, dan format ikut di-hash |

Kasus 19 menjaga kelas bug yang paling sunyi di fitur ini: nama resep yang
salah ketik tidak melempar apa pun — `resepEfek()` cuma mengembalikan `null`
dan eventnya diam. Begitu juga dua baris pemanggil di `nyalakanEvent()`: kalau
hilang waktu fungsi itu disunting orang lain, seluruh fitur mati tanpa gejala,
tidak ada galat, cuma ruangan yang kembali sunyi.

### Sepuluh mutasi disuntikkan, dan yang dua sempat lolos

| Mutasi | Semula | Sesudah |
|---|---|---|
| `ucapEvent(def)` dikomentari | **lolos** | tertangkap |
| nama resep di peta salah ketik | tertangkap | tertangkap |
| pagar bentuk id di `/ucap` dicabut | tertangkap | tertangkap |
| lingkup `mati` diabaikan server | tertangkap | tertangkap |
| dedupe narator dimatikan | **lolos** | tertangkap |
| berkas kalimat tulisan tangan diabaikan | tertangkap | tertangkap |
| jenjang balon dilewat, langsung ke `nama` | tertangkap | tertangkap |
| penanda pembicara di balon tidak dibuang | tertangkap | tertangkap |
| balon yang cuma bunyi ikut lolos | tertangkap | tertangkap |
| satu baris di `narasi-event.json` dihapus | tertangkap | tertangkap |

Dua yang lolos itu yang menentukan bentuk akhir ujinya:

1. Lint kasus 19 tadinya mencocokkan regex ke teks mentah, jadi
   `// ucapEvent(def);` — persis cara orang mematikan sesuatu sementara lalu
   lupa menyalakannya lagi — masih terbaca sebagai "dipanggil". Sekarang
   komentarnya dibuang dulu, pola yang sudah dipakai lint pagu.
2. `if (narasiSibuk)` yang diganti `if (false)` tidak bisa ditangkap regex mana
   pun yang masuk akal. Makanya kasus 20 tidak melint apa-apa: ia menjalankan
   `room.js` yang sungguhan di sandbox vm, menyulih `Audio`, lalu memanggil
   `ucapEvent()` beneran dan menghitung klip yang diminta.

Ada satu temuan sampingan dari situ: sandbox `uji-event.mjs` belum mendaftarkan
`encodeURIComponent`, jadi di dalam vm ia jatuh ke dummy dan diam-diam
mengembalikan `"function () { [native code] }"` — bukan galat, cuma string yang
salah. Kelas bug yang sama persis dengan catatan `Map`/`Set` yang sudah ada di
sana. Sudah didaftarkan.
