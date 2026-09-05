# Suara ucap & daftar nama pegawai

> Bagian dari [DESIGN.md](../DESIGN.md). Status: **selesai** — langkah 1-7,
> termasuk `uji-suara.mjs` yang ikut `npm test`.

Dua hal yang dirancang bareng karena saling bergantung: notifikasi yang
**diucapkan** (bukan TTS bawaan browser lagi) dan **daftar nama** yang boleh
kamu atur sendiri — sebab nama pegawai itulah satu-satunya bagian kalimat yang
berubah-ubah, jadi dia yang menentukan sebesar apa cache suaranya.

Semua pengaturan lewat panel ⚙️ di halaman. Tidak ada yang perlu diketik di
CLI, tidak ada berkas yang perlu disunting tangan.

## Kenapa berlapis

| Lapis | Isi | Butuh jaringan? | Butuh kunci? |
|---|---|---|---|
| 0 | earcon Web Audio (lonceng bermotif) | tidak | tidak |
| 1 | cache klip di disk (`suara/`) | tidak | tidak |
| 2 | OpenRouter TTS — pengisi cache | ya | ya |

Lapis 0 **wajib jalan sendirian**. Tanpa kunci, offline, kuota habis, OpenRouter
mati — ruangan harus tetap membunyikan notifikasi seperti biasa. Lapis 2 cuma
menempel di atasnya. Aturan ini yang bikin fitur ini tidak pernah bisa
merusak apa pun yang sudah ada.

Pembagian tugasnya: **earcon membawa *jenis* kejadian, ucapan membawa *siapa*.**
Jadi kalimatnya boleh pendek — pendek berarti murah, cepat, dan cache-nya kecil.

### Kosakata earcon (lapis 0)

| Kejadian | Fungsi | Motif | Rasa |
|---|---|---|---|
| selesai | `bunyiSelesai()` | C5–E5–G5 naik, ekor 0,55 s | bel meja resepsionis |
| menunggu jawabanmu | `bunyiPanggil()` | E5–E5 datar, pendek | interkom kantor |
| berhenti karena galat | `bunyiBerhenti()` | G5–D5 turun | bukan kabar baik |
| pengingat | `bunyiPengingat(a)` | motif kejadiannya, diulang sekali | "ini yang tadi" |

Arah nada (naik / datar / turun) cukup dibedakan telinga tanpa perlu dihafal.
Amplopnya satu fungsi bersama (`bunyiMotif`) supaya attack/decay tidak bisa
hanyut sendiri-sendiri antar motif; yang boleh beda cuma nada, jarak, panjang,
dan puncak.

Dulu `notifSelesai` dan `notifKonfirmasi` memakai lonceng yang **sama persis**
dan yang membedakannya cuma kalimat TTS yang menyusul. Begitu TTS dicabut, dua
kejadian yang artinya berlawanan jadi tidak bisa dibedakan telinga — makanya
yang dipecah motifnya, bukan sekadar ucapannya dihapus.

`bunyiPengingat()` memakai motif yang sama dengan keadaannya (butuh → panggil,
macet → berhenti) lalu mengulanginya sekali. Pengulangan itulah yang berarti
"ini bukan kejadian baru" — sekaligus tetap memberi tahu jenisnya, yang tidak
bisa dilakukan nada pengingat generik seperti dulu.

Catatan: `bunyiBerhenti()` untuk sekarang **cuma dipakai pengingat**. Tidak ada
lonceng yang berbunyi pada detik sebuah sesi masuk keadaan macet — dulu pun
tidak ada, dan menambahkannya berarti bunyi baru di tempat yang dulu senyap.
Motifnya sudah siap kalau nanti kamu mau.

## Lapis 2: OpenRouter

Endpointnya OpenAI-compatible dan mengembalikan **byte audio mentah**, bukan
JSON dan bukan SSE. Artinya cukup `fetch` polos — `dependencies` di
[`package.json`](../package.json) tetap `{}`.

```
POST https://openrouter.ai/api/v1/audio/speech
Authorization: Bearer <kunci>
Content-Type: application/json

{ "model": "google/gemini-3.1-flash-tts-preview",
  "input": "Izin, Sri Rahayu selesai",
  "voice": "Zephyr",
  "response_format": "mp3" }

-> 200, content-type: audio/mpeg, badan = mp3
```

`response_format` **harus** diisi `mp3`; bawaannya `pcm`, yang tidak bisa
dipakai `new Audio()` langsung.

Daftar model TTS-nya bisa diambil sendiri untuk mengisi dropdown:

```
GET https://openrouter.ai/api/v1/models?output_modalities=speech
```

Jadi kamu tidak perlu hafal ID model — panel ⚙️ yang menawarkannya, lengkap
dengan harga per karakter yang ikut di respons itu. Kalau daftarnya gagal
diambil, kolomnya tetap kotak teks biasa supaya ID model bisa diketik manual.

Respons itu juga membawa **`supported_voices` per model**, dan itu penting:
nama voice sama sekali tidak seragam antar penyedia — `Zephyr` (Google),
`flux-bree-en` (Deepgram), `English_radiant_girl` (MiniMax),
`en-US-Harper:MAI-Voice-2` (Microsoft) — dan voice yang salah ditolak
mentah-mentah. Kolom voice di panel karena itu mengikuti model yang sedang
dipilih. `supported_voices: null` (mis. Fish Audio) artinya penyedianya
menerima voice bebas, bukan tidak punya voice.

### Kenapa bawaannya Gemini Flash TTS

Pilihan bawaan `google/gemini-3.1-flash-tts-preview` + voice `Zephyr` diambil
dari daftar yang sungguhan, bukan dikira-kira. Dari 18 model TTS di OpenRouter,
hampir semuanya menamai voice-nya dengan tanda bahasa — `-en`, `en_paul_*`,
`English_*`, `en-US-*` — alias Inggris duluan, sementara kalimat kita bahasa
Indonesia. Gemini satu-satunya yang nama voice-nya netral bahasa (Zephyr, Puck,
Kore, …) dan modelnya memang multibahasa; harganya juga paling murah di daftar
itu.

Catatan sejarah supaya tidak terulang: bawaan pertama fitur ini
`openai/gpt-4o-mini-tts` — ID yang **tidak ada** di OpenRouter. Tidak ada satu
pun model OpenAI di daftar TTS-nya. Kalau menambah bawaan baru, cocokkan dulu
dengan `GET /api/v1/models?output_modalities=speech`, jangan dengan ingatan.

`preview` di nama model itu risiko yang disadari: model preview bisa dicabut.
Kalau itu terjadi, yang terjadi cuma `/ucap` balas 204 dan notifikasi kembali
ke lonceng — lalu kamu pilih model lain dari panel. Tidak ada yang rusak.

## Berkas baru

| Berkas | Isi | Git |
|---|---|---|
| `suara.json` | setelan: aktif, model, voice, format, kecepatan | diabaikan |
| `suara-kunci` | kunci OpenRouter, mode `0600`, satu baris | diabaikan |
| `suara/<hash>.mp3` | klip hasil generate | diabaikan |
| `nama.json` | daftar nama pegawai yang kamu atur (v1) | diabaikan |

Tidak ada berkas indeks cache: jumlah dan ukuran klip dihitung dari
`readdir` + `stat` saat panel memintanya. Satu sumber kebenaran, tidak ada
yang bisa hanyut.

Kunci dipisah dari `suara.json` supaya `suara.json` aman dibuka/di-`cat` kapan
saja. Polanya meniru `BERKAS_TOKEN` di [`server.mjs:145`](../server.mjs) —
termasuk aturan **nilainya tidak pernah dicetak ke konsol**, yang dicatat cuma
nama berkasnya.

`nama.json` ikut `SKEMA` + `migrasiNama()` seperti `formasi`/`agenda`/
`bukuInduk` di [`server.mjs:974`](../server.mjs), supaya versinya bisa naik
tanpa merusak berkas orang lain.

## Rute baru

| Rute | Guna |
|---|---|
| `GET /ucap?teks=…` | inti. Ada di cache → kirim; belum → generate, simpan, kirim; tidak aktif/tanpa kunci → **204** |
| `GET /suara/setelan` | isi panel ⚙️ (tanpa kunci — cuma `punyaKunci: true/false` + 4 huruf terakhir) |
| `POST /suara/setelan` | simpan aktif/model/voice/format/kunci |
| `GET /suara/model` | proxy daftar model TTS OpenRouter buat datalist |
| `GET /suara/coba` | audisi: satu klip contoh, TANPA menuntut `aktif` |
| `POST /suara/panasi` | pra-generate seluruh nama di roster |
| `DELETE /suara/cache` | kosongkan `suara/` |
| `GET /nama/daftar` | daftar nama + daftar bawaan, untuk panel |
| `POST /nama/daftar` | simpan roster (kosong = kembali ke bawaan) |
| `POST /nama/undi-ulang` | undi ulang kursi yang bukan pilihan manusia |

Semua rute di atas dijaga `asalSah(req)` saja — **tanpa `TOKEN`**, berbeda
dari [`/perintah`](../server.mjs). Alasannya: `TOKEN` cuma diberikan ke
halaman kalau server dijalankan dengan `--izinkan-perintah`, dan menuntutnya
di sini berarti panel ⚙️ cuma bisa dipakai dengan flag itu. `TOKEN` penjaga
jalur yang MELAHIRKAN SESI; setelan ruangan harus bisa diatur dari ruangan.
Presedennya `/nama`, `/peran`, dan `/ambien`, yang sudah begitu sejak dulu.

**204 itu bagian dari rancangan, bukan galat.** Halaman menafsirkannya
"ya sudah, earcon saja" dan tidak pernah menampilkan pesan merah.

### Kenapa `GET` dengan `?teks=`, bukan `POST`

Supaya URL-nya **stabil per nama** — `/ucap?teks=Izin,%20Oji%20selesai` selalu
URL yang sama untuk pegawai yang sama, jadi cache HTTP peramban ikut bekerja
tanpa kode cache tambahan di halaman. Server cuma bind ke localhost, jadi nama
di query string tidak ke mana-mana.

Yang dikirim `Cache-Control: private, no-cache` + `ETag`, **bukan
`immutable`** seperti rancangan awal: URL-nya cuma memuat teks, sedangkan
isinya ikut berubah kalau model/voice-nya kamu ganti. `immutable` akan
memutar suara lama dengan voice yang sudah diganti. Revalidasi ke localhost
harganya sepersekian milidetik dan balasannya 304 tanpa badan.

### Kunci cache

```
hash = sha256(teks + '\0' + model + '\0' + voice + '\0' + format + '\0' + kecepatan).slice(0, 16)
```

Model atau voice diganti → hash otomatis beda → klip lama tidak pernah
kepakai lagi, **tanpa perlu invalidasi manual**. Berkas lamanya dibiarkan
sampai kamu pencet "kosongkan cache" — jadi bolak-balik ganti voice tidak
bikin generate ulang.

### Dua pagar yang gampang kelupaan

1. **Dedupe in-flight.** `Map<hash, Promise>` di server. Tiga sesi selesai
   berbarengan dengan nama sama tidak boleh jadi tiga panggilan API.
2. **Lonceng jangan menunggu jaringan.** Earcon dibunyikan **segera**;
   ucapannya menyusul saat klipnya siap. Kalau diserikan, notifikasi telat
   1–3 detik pada generate pertama dan rasanya rusak.

```js
function notifSelesai(nama) {
  bunyiSelesai();               // lapis 0, instan, selalu, tanpa jaringan
  ucapKlip(UCAP.selesai(nama)); // lapis 1/2, boleh telat, boleh gagal, boleh diam
}
```

Kalimatnya hidup di dua tempat — `UCAP` di `room.js` (yang meminta) dan
`suaraKalimat` di `server.mjs` (yang memanaskan). Dua-duanya harus sama
persis; kalau hanyut, "panaskan cache" memanaskan kalimat yang tidak pernah
dipakai.

## Daftar nama pegawai

Dulu namanya diundi dari dua konstanta: `NAMA_DEPAN` (24) × `NAMA_BELAKANG`
(16) = 384 kombinasi. Sekarang satu daftar nama utuh, `NAMA_BAWAAN` (32),
dan daftar itu boleh kamu ganti seluruhnya dari panel.

Bentuk `nama.json` (v2) — **nama utuh**, plus jabatan opsional dan cara
penugasan:

```json
{ "v": 2,
  "penugasan": "acak",
  "penuh": [ { "nama": "Bu Alis", "peran": "kabid" },
             { "nama": "Oji", "peran": "pranata_pertama" } ] }
```

v1 (`penuh` berisi larik string) tetap terbaca apa adanya: `namaBersih()`
menerima string maupun objek, jadi naik versi tidak butuh kode migrasi
tersendiri. `peran` disaring BENTUKNYA saja di server — tabel jabatannya milik
halaman, dan server tidak berhak menebak id mana yang sah.

### Dua mode penugasan

| Mode | Nama menempel di | Akibat |
|---|---|---|
| `tetap` | **kursi** | Sesi berikutnya di folder yang sama mewarisi nama penghuni kursi itu. Undiannya deterministik. Perilaku asli fitur pegawai tetap. |
| `acak` (bawaan) | **orang** | Tiap sesi baru menarik satu orang acak dari daftar, lengkap dengan jabatannya. Ruangan berganti wajah. |

Saklarnya di panel ⚙️; `AGENT_ROOM_PENUGASAN` menang atas berkas (dipakai
`uji-pegawai.mjs` untuk menguji mode `tetap` tanpa bergantung pada nama.json
milik siapa pun).

Kenapa `acak` jadi bawaan: dengan `tetap`, jumlah nama yang bisa kamu lihat =
jumlah kursi = sesi terbanyak yang pernah jalan bersamaan di folder itu.
Daftar 18 nama pun cuma memunculkan 4-5 orang, selamanya, dan itu terasa
seperti daftarnya tidak terpakai. Ini keluhan sungguhan, bukan hipotesis.

Undiannya **rata, tanpa bobot**. Komposisi daftarnya sendiri yang menentukan
siapa sering muncul: kantor sungguhan isinya memang lebih banyak staf daripada
kepala bidang, jadi undian rata di atas daftar yang jujur sudah menghasilkan
ruangan yang masuk akal tanpa mesin pembobot apa pun.

Yang TIDAK pernah disentuh piket acak: nama yang kamu ketik sendiri lewat
kartu pegawai (`manual`) dan jabatan yang kamu setel sendiri (`peranManual`).
Itu keputusan manusia, dan undian tidak berhak membatalkannya.

- Berkasnya tidak ada / kosong / rusak → **jatuh ke `NAMA_BAWAAN`** (32 nama
  utuh di `server.mjs`). Ruangan tidak boleh pernah kehabisan nama, dan
  "kosong" itu cara resmi mengembalikan daftar bawaan, bukan galat.
- `pegawaiUndi()` berhenti membaca konstanta, ganti baca `daftarNama()`.
  Indeksnya `h.readUInt16BE(0) % daftar.length` — dua byte, bukan satu, supaya
  daftar panjang tetap terjangkau seluruhnya.
- Daftar dari panel dibersihkan: dipangkas, dibuang yang kosong dan yang
  kembar, dipotong 24 huruf, dibatasi 512 entri. Urutannya dipertahankan —
  undian deterministik bergantung pada urutan.
- Daftar lebih pendek daripada jumlah kursi sekarang mungkin terjadi (kamu
  boleh menyimpan satu nama saja), jadi `pegawaiUndi()` punya cabang terakhir
  yang menambahkan angka: `Oji`, `Oji 2`. Lebih jujur daripada dua pegawai
  bernama persis sama.

### Satu keputusan yang harus disadari

**Mengubah roster tidak mengganti nama pegawai yang sudah ada.**
[`formasi.json`](../formasi.json) menyimpan `slot.nama` per kursi (15 nama
terpakai sekarang), dan itu memang disengaja — nama menempel di kursi, besok
pegawai yang sama dipanggil begitu lagi. Roster cuma dipakai waktu **kursi
baru lahir**.

Jadi panel perlu tombol terpisah **"undi ulang nama otomatis"**, yang cuma
menyentuh kursi ber-`manual: false`. Nama yang kamu ketik sendiri (`manual:
true`) tidak pernah diganggu. Tanpa tombol ini, orang akan mengedit roster
lalu bingung kenapa ruangannya tidak berubah.

### Pra-generate, bukan sekadar cache-on-miss

Karena rosternya berhingga, seluruh klip bisa dibuat sekali di muka:

- roster hari ini: **15 nama → ~30 klip → < 1 MB**
- seluruh 384 kombinasi: masih < 12 MB

Tombol **"panaskan cache"** di panel menggenerate semua nama roster sekaligus
dengan bar kemajuan. Sesudah itu miss saat runtime praktis nol — yang tersisa
cuma nama manual yang baru kamu ketik.

## Panel ⚙️

Satu `pengaturan-grup` baru di [`index.html`](../public/index.html), ditaruh
sesudah grup audio, sebelum "Sesi terkatung":

```
Suara ucap & nama pegawai
─────────────────────────
🗣️ suara ucap                            [ ]      ← mati bawaan
   ↳ tanpa ini, notifikasi = lonceng saja

kunci OpenRouter   [••••••••••••] [Simpan]  terpasang ✓ …a3f9
model              [openai/gpt-4o-mini-tts ▾]  $0.015/1k karakter
voice              [alloy ▾]  [▶ coba suara]

cache              23 klip · 412 KB
                   [panaskan cache]  [kosongkan]

Nama pegawai
  ┌──────────────────────────────────────┐
  │ Oji                                  │   ← satu nama per baris;
  │ Sumala                               │     kosong = daftar bawaan,
  │ Pak Kadis Wibowo                     │     yang dipajang jadi placeholder
  └──────────────────────────────────────┘
  3 nama                  [Simpan]  [undi ulang]
```

Aturan GUI-nya:

- Kunci **tidak pernah dikirim balik** ke halaman. Server cuma bilang
  "terpasang" + 4 huruf terakhir. `type="password"`, `autocomplete="off"`.
- Tombol **coba suara** jalan sebelum setelannya disimpan, supaya kamu bisa
  dengar dulu baru memutuskan. Klipnya tetap masuk cache — audisi tidak
  terbuang.
- Roster diedit sebagai textarea satu-nama-per-baris, bukan tabel — lebih
  cepat ditempel dari mana saja. Selama daftar bawaan yang berlaku, textarea-
  nya **dibiarkan kosong** dan daftar bawaannya dipasang jadi `placeholder`:
  dengan begitu "kosong = bawaan" tidak perlu dijelaskan kalimat, kelihatan
  sendiri.
- Kolom model memakai `<input list=…>` + `<datalist>`, bukan `<select>`:
  daftar model boleh gagal diambil (offline, OpenRouter mati) dan kolomnya
  tetap bisa diketik.
- Blok setelan suara TIDAK disembunyikan waktu centangnya mati — kolom kunci
  di dalamnya justru yang harus diisi dulu sebelum centangnya bisa menyala.
- Centang 🗣️ ikut aturan tiga centang audio yang sudah ada: **tidak diingat
  browser**, karena audio baru boleh jalan sesudah klik. Model/voice/roster
  disimpan di server (bukan `localStorage`) supaya sama di semua tab dan
  bertahan sesudah server mati.

## Yang perlu kamu terima

1. Repo ini sekarang nol dependensi dan jalan penuh offline. Lapis 2 memasukkan
   kunci API + jaringan. Ongkos uangnya sepele (30 klip ≈ 750 karakter,
   pecahan sen) — ongkos strukturalnya yang nyata.
2. Nama pegawai — termasuk nama yang kamu ketik sendiri — dikirim ke
   OpenRouter. Ringan, tapi ada. Sebutkan di catatan panel.
3. `README` bagian "lalu lintas keluar satu-satunya adalah cek cuaca" jadi
   **tidak benar lagi**. Wajib diperbarui bareng fitur ini, jangan menyusul.

## Urutan kerja

| # | Langkah | Hasil yang bisa dicoba |
|---|---|---|
| 1 | ✅ Pecah earcon jadi 3 motif; cabut `ucapSuara()` | notifikasi sudah tidak ber-TTS, tanpa jaringan sama sekali |
| 2 | ✅ `nama.json` + roster + `pegawaiUndi()` baca roster | nama bisa diatur |
| 3 | ✅ Panel ⚙️ bagian nama + "undi ulang" | roster bisa diatur dari halaman |
| 4 | ✅ `suara.json`, `suara-kunci`, cache, `GET /ucap` (204 kalau mati) | pipa lengkap |
| 5 | ✅ Sambungkan OpenRouter + dedupe in-flight | klip beneran |
| 6 | ✅ Panel ⚙️ bagian suara: kunci, model, voice, coba, panasi | semua dari GUI |
| 7 | ✅ `uji-suara.mjs` + perbarui `docs/` | ikut `npm test` |

Uji yang sudah ada dijaga tetap hijau: `uji-pegawai.mjs` mencerminkan rumus
undian yang baru (dan membaca `NAMA_BAWAAN`, bukan dua daftar lama), dan
keempat env berkas data baru disandbox-kan di `uji-pegawai.mjs` maupun
`uji-pagu.mjs` — lint di `uji-pagu.mjs` memang menangkapnya otomatis.

Langkah 1 berdiri sendiri dan sudah menyelesaikan permintaan aslinya
("notifikasi tanpa TTS"). Kalau lapis 2 ditunda atau dibatalkan, tidak ada
yang perlu dibongkar.

## Uji

[`uji-suara.mjs`](../uji-suara.mjs) — 115 pemeriksaan, headless, **tanpa
jaringan**. `server.mjs` sungguhan dinyalakan sebagai proses anak dengan
`AGENT_ROOM_SUARA_URL` diarahkan ke OpenRouter palsu di localhost. Uji ini
tidak pernah butuh kunci sungguhan; kalau suatu hari dia mulai butuh, itu bug.

| Kasus | Yang dijaga |
|---|---|
| 1 | Semua rupa kegagalan → **204**: tanpa kunci, belum dinyalakan, 401, 500, klip kosong, penyedia tak terhubung. Servernya sendiri tetap hidup |
| 2 | Bentuk permintaan yang benar-benar keluar: `response_format: 'mp3'` (bukan `pcm` bawaan), `Bearer` + kunci, `speed` cuma ikut kalau bukan 1 |
| 3 | Klip yang sama tidak pernah dibayar dua kali — dihitung dari **panggilan penyedia**, bukan dari hasil. Ganti voice/model = klip baru; balik ke setelan lama = gratis; tidak ada sisa `.tmp` |
| 4 | Enam permintaan **serentak** = satu panggilan; peta in-flight bersih lagi sesudahnya |
| 5 | ETag → 304; ETag berubah waktu voice diganti — inilah bukti kenapa `immutable` akan salah |
| 6 | Kunci tidak pernah keluar: tidak di `/suara/setelan`, tidak di konsol, tidak di `suara.json`. Menyimpan setelan lain tidak menghapusnya; kunci berspasi ditolak |
| 7 | Panaskan cache: satu klip per nama + kalimat arahan; tekan kedua kali tidak membuat apa pun; penyedia gagal tetap 200 |
| 8 | Daftar nama dibersihkan (pangkas, kembar, kosong, potong 24, urutan). `nama.json` rusak / versi masa depan / tanpa medan → jatuh ke bawaan, server tetap menyala |
| 9 | Undi ulang melewati nama pilihanmu; daftar satu nama tidak melahirkan kursi kembar atau kosong |
| 10 | Lint: kalimat di `UCAP` (room.js) dan `suaraKalimat` (server.mjs) sama persis — kalau hanyut, "panaskan cache" jadi sia-sia dan tidak ada galat apa pun yang muncul |
| 11 | Daftar model **dan `supported_voices`** diteruskan (`null` tetap `null`, bukan `[]`); penyedia daftar mati → `ok:false` + daftar kosong, bukan 500 |
| 12 | Lint: setiap rute yang dipanggil `room.js` benar-benar dilayani `server.mjs` |
| 13 | Piket acak: 24 sesi berturut-turut di satu kursi memunculkan banyak orang berbeda, semuanya dari daftar, dan tiap orang membawa jabatannya sendiri |
| 14 | Piket acak tetap menghormati nama & jabatan yang kamu setel sendiri, walau diundi ulang lima kali |
| 15 | Mode `tetap` masih benar-benar tetap: delapan sesi bergantian di kursi yang sama = satu nama saja |

Lima mutasi disuntikkan untuk membuktikan ujinya menggigit, dan semuanya
tertangkap: `response_format` dicabut, voice dicabut dari kunci hash, dedupe
in-flight dimatikan, kalimat di `room.js` diubah satu kata, dan satu rute
diganti nama di sisi server saja.

## Pesan gagal harus jujur

Catatan dari kejadian sungguhan: waktu pertama kali kunci OpenRouter mau
disimpan, panel menjawab **"gagal menghubungi server"** — padahal servernya
menjawab baik-baik saja, cuma `404`, karena PROSES-nya masih memuat
`server.mjs` versi lama (`server.mjs` dibaca sekali saat start; menyimpan
berkasnya tidak memuat ulang proses yang sedang jalan). Pesan yang salah itu
mengarahkan curiga ke kuncinya, bukan ke tempat yang benar.

Sekarang semua panggilan panel lewat `panelJson()` di `room.js`, yang
membedakan empat keadaan:

| Keadaan | Pesan |
|---|---|
| `fetch` melempar | server tidak menjawab — apa `dinas` masih jalan? |
| `404` | server masih versi lama (<rute> belum dikenal) — hentikan lalu jalankan ulang dinas |
| `403` | ditolak server — buka ruangan lewat 127.0.0.1 atau localhost |
| lainnya | pesan dari server kalau ada, kalau tidak `HTTP <kode>` |

Aturannya: **jangan pernah menyebut "tidak bisa menghubungi" untuk server yang
menjawab.** Kasus 12 menjaga sisi lainnya — rute yang dipanggil halaman harus
benar-benar ada di server.
