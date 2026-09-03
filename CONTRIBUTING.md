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
`.agent-room-token`, `token-riwayat*.jsonl`, `kliping-*`, `agenda/`. Semuanya
sudah ada di `.gitignore`, dan daftar `files` di `package.json` memang tidak
menyebutnya.

## Cara uji

```bash
npm test                        # = uji-event --semua && uji-zorder && uji-katalog
node uji-event.mjs <id>         # satu event, detail lengkap (termasuk hook gambar & rantai lanjutan)
node uji-event.mjs --daftar     # semua id yang valid
node uji-event.mjs --penjadwal  # cuma aturan bentrok / kelas panggung / pinjam aktor
node uji-zorder.mjs             # z-order frame() vs golden; --tampil untuk melihat urutannya
node uji-katalog.mjs            # papan skor katalog (event-acak.json vs kode); --gerbang untuk menggagalkan
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

`uji-katalog.mjs` cuma papan skor: mencetak berapa id `event-acak.json` yang
sudah terdaftar di `public/event/*.js`, yang belum (per kategori), dan id yang
terdaftar tapi tidak ada di katalog. Angka "berapa event sudah jadi kode" di
README/DESIGN diambil dari sini. CI (`.github/workflows/uji.yml`) menjalankan
ketiganya plus smoke test `/health` di tiap push.

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
