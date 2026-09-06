# Ikut mengerjakan Agent Room

## Nol dependency — itu aturannya

`"dependencies": {}` di `package.json` sengaja ditulis kosong dan eksplisit.
Repo ini cuma butuh Node (≥ 18) dan `curl`; tidak ada `npm install`, tidak ada
`node_modules`, tidak ada langkah build. Semua yang dipakai — server HTTP,
sandbox uji, sintesis suara, cuaca — memakai modul bawaan Node atau API
peramban. Kalau sebuah fitur terasa butuh paket dari npm, kemungkinan besar
fiturnya yang perlu dipikir ulang, bukan aturannya. Alasan lengkap tiap
keputusan desain ada di [DESIGN.md](DESIGN.md).

Berkas lokal yang **tidak boleh** ikut ke repo maupun ke paket:
`token-riwayat*.jsonl`, `kliping-*`, `agenda/`. Semuanya
sudah ada di `.gitignore`, dan daftar `files` di `package.json` memang tidak
menyebutnya.

## Cara uji

```bash
npm test                        # semua gerbang sekaligus (daftar persisnya di package.json)
node uji-event.mjs <id>         # satu event, detail lengkap (termasuk hook gambar & rantai lanjutan)
node uji-event.mjs --daftar     # semua id yang valid
node uji-event.mjs --penjadwal  # cuma aturan bentrok / kelas panggung / pinjam aktor
node uji-zorder.mjs             # z-order frame() vs golden; --tampil untuk melihat urutannya
node uji-katalog.mjs            # papan skor katalog (event-acak.json vs kode); --gerbang untuk menggagalkan
node uji-ulang.mjs              # putar ulang satu hari buku agenda sungguhan; --sampai N / --laju 1 / --tampil
node uji-sisip.mjs              # bukaan ruang kadis vs golden: sapuan piksel, batas keras, klip
node uji-seragam.mjs            # seragam kantor cabang: jarak warna rompi vs semua baju harian
node uji-pagu.mjs               # pagu anggaran token: ambang, pagar minggu dua arah, metrik
node uji-pegawai.mjs            # formasi pegawai tetap: kursi, sapuan basi, ambient tidak menyentuh
node uji-jaringan.mjs           # gerbang nol-jaringan: nota cuma metadata, tiap harness menutup jalur keluar; --tampil untuk melihat notanya
node uji-mcp.mjs                # kontrak mcp-room.mjs lewat klien MCP palsu; --tampil untuk melihat tiap permintaan yang keluar
node selaras-dokumen.mjs        # laporan hanyut dokumen vs kode; --periksa untuk menggagalkan
node uji-telaah.mjs             # lembar telaah risiko: tiap pola, privasi tanda, pagar positif palsu
node telaah.mjs Bash "rm -rf x" # coba satu perintah dengan tangan
node --check server.mjs && node --check dinas.mjs
```

Harness `uji-event.mjs` memuat `public/room.js` + sambungan `public/event/*.js` (urutan dari `manifest.json`) apa
adanya ke sandbox `node:vm` dan memanggil `syarat()/mulai()/tick()/selesai()`
tiap event langsung, tanpa peramban. Hook `gambar*` ikut dipanggil terhadap
canvas 2D palsu yang **melempar** kalau ada argumen angka `NaN`/`undefined`
(di peramban kesalahan itu diam — gambarnya cuma tidak muncul); rantai
`lanjutan` diikuti sampai kedalaman 3; aturan `bentrok`/`kelas panggung`/
`perluAktor` diuji lewat fungsi asli `room.js`. `Date` di sandbox dikunci ke
Rabu 15 April 2026 supaya hasilnya tidak berubah mengikuti kalender. Hook
gambar yang memang melempar karena bug yang belum sempat diperbaiki dicatat
di `DIKETAHUI` (uji-event.mjs) supaya CI tetap hijau tanpa bug-nya hilang dari
laporan — hapus entrinya begitu diperbaiki.

`uji-zorder.mjs` memanggil `frame()` asli dengan pegawai fixture di posisi
tetap (pita lajur bawah, duduk di kursi rapat, di depan/belakang meja kerja,
prop event ber-`sortY`, dst.) dan merekam **urutan** gambar prop/pegawai —
disimpan sebagai daftar id di `uji-zorder.golden.json`, bukan angka y. Kalau
kamu sengaja mengubah aturan depth sort (`PROPS[].sortY`, pita 230–265,
`SORT_KURSI_DEKAT`) dan uji ini merah dengan diff yang memang kamu maksud,
perbarui golden-nya dan commit bersama perubahan kodenya:

```bash
node uji-zorder.mjs --perbarui
```

`uji-ulang.mjs` memutar ulang **satu hari kerja sungguhan** ke `frame()`/
`handle()` asli `room.js`, headless: 3.099 kejadian, 11.329 frame, 9,4 menit
ruangan virtual, ±27 detik di mesin lengang. Fixture-nya
`uji-ulang.fixture.jsonl`: buku agenda satu hari (`agenda/YYYY-MM-DD.jsonl`)
yang label & pengenalnya sudah diganti sintetis, dipadatkan jadi bentuk
kolumnar < 96 KB. Yang diperiksa **sifat sepanjang hari**, bukan golden urutan:
nol lemparan, nol `console.warn('[event]')`, tiap penghuni & prop digambar
tepat sekali tiap frame, tidak ada wadah yang bocor, `MOD` kembali ke bawaan
tiap kali tidak ada event hidup, dan `toolCount` sama persis dengan jumlah
baris `pre` di fixture — itu Aturan 2 yang diuji langsung, bukan dipercayai.
Laporannya berupa tabel puncak-tertinggi tiap penghitung terhadap ambangnya,
jadi sisa ruangnya kelihatan sebelum jadi merah. Uji ini **tidak** punya
golden apa pun tentang event mana yang menyala — kalau punya, menambah satu
definisi event akan memerahkannya.

Memperbarui fixture (perlu kalau bentuk buku agenda berubah, atau kalau kamu
ingin hari yang lebih representatif):

```bash
# 1. BEKUKAN sumbernya. Berkas hari ini masih ditulis server yang hidup —
#    membuat fixture dari berkas yang sedang tumbuh tidak bisa diulang.
cp agenda/2026-09-03.jsonl /tmp/hari.jsonl

# 2. Bikin ulang. Label diganti sintetis, dan tiap penggantian DIBUKTIKAN
#    mendarat di meja yang sama lewat stationFor() asli room.js; kalau ada
#    satu baris pun yang berpindah meja, perintah ini gagal dan menyebutnya.
node buat-fixture.mjs --dari /tmp/hari.jsonl --tanggal 2026-09-03

# 3. Periksa kesetiaannya terhadap sumber (opsional, tapi murah).
node buat-fixture.mjs --periksa --dari /tmp/hari.jsonl --tanggal 2026-09-03

# 4. Lihat dengan mata sendiri: bentangkan balik jadi buku agenda, lalu tonton.
node buat-fixture.mjs --keluarkan-agenda agenda/2026-04-15.jsonl
#    buka http://127.0.0.1:4517/?ulang=2026-04-15&laju=60 — pegawainya harus
#    berpindah meja dengan pola yang sama seperti hari aslinya.
#    Hapus berkasnya sesudah selesai (agenda/ memang di-gitignore).
```

Fixture **tidak boleh disunting tangan**. `periksaPrivasi()` dijalankan ulang
tiap kali `uji-ulang.mjs` jalan, per bidang, dan menolak nilai string apa pun
yang tidak cocok dengan pola pseudonim atau katalog enum bidangnya — jalur
berkas, URL, nama sungguhan, atau bidang yang tidak dikenal langsung
menggagalkan uji sebelum satu frame pun diputar.

`uji-katalog.mjs` cuma papan skor: mencetak berapa id `event-acak.json` yang
sudah terdaftar di `public/event/*.js`, yang belum (per kategori), dan id yang
terdaftar tapi tidak ada di katalog. Angka "berapa event sudah jadi kode" di
README/DESIGN diambil dari sini. CI (`.github/workflows/uji.yml`) menjalankan
ketiganya plus smoke test `/health` di tiap push.

## Jalur keluar: satu daftar, satu penutup

`npm test` tidak boleh menyentuh jaringan, dan itu sekarang dijaga mesin, bukan
kebiasaan. Dua aturan yang mengikuti:

1. **Menambah jalur keluar baru di `server.mjs`** (penyedia, webhook, API apa
   pun) berarti menambah nama env-nya ke `ENV_JALUR_KELUAR` di
   [`penyedia-palsu.mjs`](penyedia-palsu.mjs). Kalau tidak, gerbangnya tidak
   menjaganya dan tidak ada yang tahu.
2. **Harness baru yang melahirkan `server.mjs` sambil mewarisi `process.env`**
   wajib menutup jalur keluarnya: `envTanpaJalurKeluar()` dari berkas yang sama,
   atau menyapu sendiri semua env `AGENT_ROOM_*`. `uji-jaringan.mjs` kasus 4
   menolak yang lupa, lengkap dengan cara memperbaikinya.

Satu jebakan yang sudah pernah memakan korban: `AGENT_ROOM_CUACA: ''` **bukan**
mematikan cuaca — kosong berarti "tebak dari IP", dan server tetap boleh
menghubungi geojs.io serta open-meteo.com. Yang mematikan cuma `'off'`.

## Dokumen adalah kontrak, bukan pelengkap

Daftar di dokumentasi ini dibaca **agen**, bukan cuma manusia: yang memasang hook
membaca tabel "Event yang dipasang", yang memasang MCP membaca tabel tool, yang
memantau membaca tabel metrik. Karena itu empat permukaan dijaga mesin lewat
`node selaras-dokumen.mjs --periksa` di `npm test`:

| Kalau kamu menambah | Tambahkan juga barisnya di |
|---|---|
| hook di `install.mjs` | tabel **Event yang dipasang** di `docs/01-jalanin.md` (angka "Yang dipasang N" ikut dihitung dari daftarnya) |
| harness `uji-*.mjs` / `selaras-*.mjs` | `scripts.test` di `package.json`, langkah di `.github/workflows/uji.yml`, dan tabel di `docs/06-isi-repo.md` |
| env `AGENT_ROOM_*` | dokumen mana pun di `docs/` |
| metrik `agent_room_*` | tabel metrik di `docs/05-kendali-web.md` |

Skrip itu **tidak pernah menulis apa pun**: katalog boleh dibangkitkan mesin,
prosa tidak. Kalau sebuah hanyut memang disengaja, daftarkan di `PENGECUALIAN`
beserta alasannya — daftar kosong itu tujuannya, dan tiap baris di sana adalah
utang yang punya nama.

Satu lagi untuk MCP: **tool baru di `mcp-room.mjs` menambah barisnya di
`uji-mcp.mjs` pada commit yang sama.** Kalau tool itu perlu rute yang belum ada
di `RUTE_BOLEH`, pelebarannya harus terlihat di diff — itu yang menjaga aturan
"MCP tetap hanya-baca" tetap berupa fakta mesin, bukan niat baik.

## Gaya commit

Pesan commit berbahasa Indonesia, baris pertama kalimat perintah yang padat
(mis. `Jaga tick edar-amplop-patungan setelah rantai serah tuntas`), badan
pesan menjelaskan *kenapa*, bukan mengulang diff. Commit hanya hunk milik
tugasmu — repo ini sering dikerjakan beberapa sesi sekaligus, jadi jangan
`git add .` membabi buta.

## Event acak

Baca dulu **DESIGN.md → Event acak → "Tiga aturan yang tidak boleh
dilanggar"**. Ringkasnya: event tidak pernah menarik pegawai yang sedang
bekerja, event tidak masuk log dan tidak menaikkan statistik, dan semuanya
harus bisa dimatikan (`?event=0`) atau dipaksa (`?event=<id>`).
`mulai()` yang melempar membatalkan eventnya — jadi jangan biarkan `tick()`
bergantung pada state yang mungkin belum ada.

Event didaftarkan ke `daftarEvent(...)` di salah satu berkas `public/event/NN-*.js` (dipecah per tema; berkas baru wajib didaftarkan di `public/event/manifest.json` sesuai urutan, karena semuanya berbagi satu scope global); `id` harus
unik (yang kembar dilewati dengan peringatan). Bentuk minimalnya:

```js
daftarEvent({
  id: 'nama-event-pendek',            // unik, huruf kecil, pakai tanda hubung
  kelas: 'latar',                     // 'latar' boleh menumpuk; 'panggung' eksklusif
  bobot: B.sedang, cooldown: 180, durasi: 6,
  syarat: (S) => S.lampu > 0.15,      // opsional: kapan boleh terpilih
  mulai(E, S) {
    const a = pemeranDekat(E, 390, 164, 160);   // pinjam pegawai menganggur, boleh null
    if (a) { a.doingEvent = 'menengok rak server'; a.goTo('server'); }
  },
  tick(E, dt, S) {
    MOD.lampu = 0.45 + 0.55 * Math.abs(Math.sin(E.umur * 1.1));
    pada(E, 1, () => { const a = E.aktor[0]; if (a && !a.standby) a.say('lampunya lemes lagi'); });
  },
  // selesai(E, S) {}  — opsional; MOD.* dikembalikan ke bawaan tiap frame sendiri
});
```

Setelah menambah event: `node uji-event.mjs nama-event-pendek` sampai hijau,
lalu tambahkan barisnya ke katalog [EVENT-ACAK.md](EVENT-ACAK.md).
