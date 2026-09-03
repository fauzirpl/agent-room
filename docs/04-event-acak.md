# Event acak

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Event acak

Selain yang dipicu tool call, ruangan punya **272 kejadian yang muncul
sendiri** (angka dihitung otomatis: `node uji-katalog.mjs`): UPS berbunyi,
kalender disobek, kabel LAN longgar, gorengan naik ke
meja rapat, kucing tidur di karpet, tamu salah alamat, sirene lewat di jalan
depan. Katalog lengkapnya ada di [EVENT-ACAK.md](../EVENT-ACAK.md); definisinya di
[public/event-acak.js](../public/event/), mesinnya di `room.js`.

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

