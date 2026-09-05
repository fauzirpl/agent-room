# Event acak

> Bagian dari [DESIGN.md](../DESIGN.md). Judul-judul di bawah dipertahankan apa adanya supaya rujukan dari kode & README tetap berlaku.

## Event acak

Selain yang dipicu tool call, ruangan punya **337 kejadian yang muncul
sendiri** (angka dihitung otomatis: `node uji-katalog.mjs`): UPS berbunyi,
kalender disobek, kabel LAN longgar, gorengan naik ke
meja rapat, kucing tidur di karpet, tamu salah alamat, sirene lewat di jalan
depan. Katalog lengkapnya ada di [EVENT-ACAK.md](../EVENT-ACAK.md); definisinya di
[public/event/](../public/event/) (per tema, urutannya di `manifest.json`),
mesinnya di `room.js`.

Tidak semuanya berasal dari rapat desain. Satu gelombang ditambahkan
sesudahnya dan **sengaja berada di luar rancangan 373 itu**: 26 event *tamu
tenar* (`public/event/33-tamu-tenar-dasar.js` sampai `37-...`), yaitu sosok
terkenal yang datang ke kantor lalu menabrak prosedur — nomor antrean tetap
berlaku, paraf tetap harus ditunggu, dan yang berwenang tetap sedang rapat di
luar. Karena bukan bagian rancangan, papan skor `uji-katalog.mjs` mencatatnya
sebagai "terdaftar di luar katalog", dan itu memang benar: yang dihitung
persentasenya tetap 373 event hasil rapat, bukan total yang terpasang.

Tidak ada nama orang sungguhan di gelombang itu. Tokohnya dikenali dari
**siluet** — harmonika melingkar di leher, raket di punggung, jersey merah muda
bernomor sepuluh, wearpack berhelm yang tidak dibuka, kepang ungu, blangkon,
singlet merah-putih dengan barbel — dan pegawai yang menyebutnya cukup bilang
"itu... yang di TV itu, kan?". Alasan lengkapnya ada di komentar kepala
`33-tamu-tenar-dasar.js`; ringkasnya: balon kata di ruangan ini milik kita,
jadi menempelkannya ke orang yang benar-benar ada adalah batas yang tidak
dilewati — dan siluet lebih tahan lama daripada nama.

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

#### Aturan 1 punya jebakan yang tidak kelihatan

`handle()` melepas pemeran lewat `lepasDariEvent()` → `lepaskanAktor()`, dan itu
memangkas `E.aktor`. Tapi **potret** yang disimpan event sendiri tidak ikut
terpangkas: `E.data.a`, `E.data.antre`, atau variabel yang ditangkap closure
tetap menunjuk orangnya. Perintah tertunda — `pada()`, penjaga tenggat — lalu
tetap jalan beberapa detik kemudian dan **menyeret pegawai yang panelnya sedang
menulis tool call**. Bentuk paling parahnya melempar (`Cannot read properties of
undefined`) karena `E.aktor[0]` sudah kosong.

Tiga penyaring di `public/event/00-dasar.js` untuk itu, pakai sebelum menyuruh
siapa pun bergerak dari dalam callback tertunda:

| helper | untuk |
|---|---|
| `masihMain(E, a)` | satu pemeran |
| `yangMasihMain(E, daftar)` | potret banyak pemeran (barisan, penonton) |
| `pangkasLepas(E, antrean)` | antrean yang dimutasi sendiri (`q.shift()`), dibuang di tempat |

`node uji-tenggat.mjs` menjaganya: ia menjalankan tiap event, **merebut semua
pemerannya di tengah**, lalu menghitung apakah event itu masih menyuruh mereka
bergerak. Meminjam ulang orang yang sudah bebas tetap sah.

Penjaga itu cuma sekuat *fixture*-nya, dan fixture-nya pernah bolong. Orang
palsu di `uji-event.mjs` dulu cuma punya dua wujud: sibuk (`station: 'think'`,
`state: 'work'`) dan menganggur di ruang tunggu (`station: 'idle'`). Wujud
ketiga — **menganggur di mejanya sendiri** (`station: 'think'`, `state: 'idle'`)
— tidak pernah ada, padahal itu yang dibuat `stasiunPulang()` untuk siapa pun
yang baru selesai tool call. Karena `bisaDipinjam()` menolak `state 'work'`,
syarat sekelas `o.station === 'think' && bisaDipinjam(o)` **mustahil** benar di
seluruh 36 kombinasi: eventnya lapor "0/36 syarat", `mulai()`-nya tidak pernah
dapat aktor, dan Uji Rebutan melewatinya diam-diam lewat `if (!E.aktor.length)
continue`. Centang hijaunya menyesatkan. Sesudah fixture diberi dua orang
"diam di mejanya", jangkauan Uji Rebutan melompat dari 165 ke 213 event dan
langsung menemukan tiga bug rebutan yang sudah lama terpasang
(`lupa-mau-ngapain`, `gantian-jaga-loket`, `kipas-direbut-arah`). Pelajarannya
bukan tentang satu wujud yang kurang: **fixture yang tidak pernah memenuhi
sebuah syarat membuat event yang memakainya tidak pernah diuji, dan itu tidak
kelihatan sebagai kegagalan.**

Dan pelajarannya berlaku lagi, di tempat yang sama. Orang palsu itu masih
punya satu kebohongan: `face`-nya `'down'` untuk semua, padahal pegawai di meja
kerja sungguhan menghadap `'up'` (`STATIONS.think.face` — membelakangi
penonton, menghadap laptopnya) dan tidak ada satu pun peserta rapat di
fixture-nya. Selama itu, pagar apa pun yang bergantung pada **arah gambar**
tidak pernah teruji. Sesudah `face`/`hadap` diambil dari `STATIONS` dan dua
"duduk di kursi rapat" ditambahkan, satu event lagi ketahuan menulis `hadap`
ke penonton (`rapat-pimpinan-dadakan`) dan satu lagi ketahuan melanggar
Aturan 1 (`salah-duduk-kursi-kadis`) — jangkauan Uji Rebutan naik 213 → 215,
dan jumlah event yang syaratnya tidak pernah bisa benar turun 106 → 103.

Sisa 103 itu **belum tentu** lubang: banyak yang memang bergantung tanggal,
cuaca, jam, atau jabatan tertentu. Tapi angkanya layak dibaca tiap kali ada
bug yang "tidak mungkin lolos" ternyata lolos.

#### Arah hadap penonton: `menoleh()`, bukan `hadapkan()`

Orang di ruangan ini punya **dua** field arah, dan cuma satu yang aman
disentuh dari event.

| field | siapa yang mengembalikannya |
|---|---|
| `face` | dipasang ulang tiap langkah `update()`, dan dipulihkan `arrive()`, `setButuh()`, `tickPulang()`, `tickKongsi()` |
| `hadap` | **tidak ada** — cuma `goTo`/`goToXY`/`pulangKe`, dan ketiganya menuntut perjalanan baru |

`hadapkan(o, tx, ty)` menulis **dua-duanya**. Untuk pemeran yang dipinjam event
itu tidak apa-apa: dia berjalan lagi sesudah adegannya, dan langkah itu menulis
ulang `hadap`. Untuk **penonton** itu racun. Pegawai yang sudah duduk di
mejanya tidak pernah dapat perjalanan baru — `handle()` cuma memanggil `goTo()`
kalau stasiun tool-nya *berbeda*, dan `stasiunPulang()` orang yang sudah di
mejanya mengembalikan stasiun yang sedang ditempatinya. Jadi arah yang ditulis
event menempel **sampai sesinya berakhir**: pegawai berdiri menyamping di depan
laptopnya karena ada tikus lewat di plafon dua puluh menit lalu.

Yang benar untuk penonton:

| helper (`00-dasar.js`) | untuk |
|---|---|
| `menoleh(daftar, tx, ty, ms)` | lirikan sesaat ke satu titik |
| `mendongak(daftar, ms)` | "semua menengadah" — satu titik bersama tidak bisa menyatakannya |
| `menolehKe(daftar, tx, ty, ms)` | orang yang **menghampiri mejanya** — satu-satunya yang boleh memutar sprite punggung |

Keduanya cuma menulis `face`, menitipkan `face` lama di `o.tolehBalik` + arah
yang mereka pasang di `o.tolehArah`, lalu `tickKongsi()` yang mengembalikannya.
`tolehArah` itu **pagar kepemilikan**: kalau saat tolehnya habis `face`-nya
sudah bukan arah itu, ada yang menulisinya sesudah kita — dilepas, bukan
ditarik balik, supaya tolehan yang berakhir tidak menghapus arah milik event
tetangga.

`menoleh()` juga yang memegang daftar siapa yang tidak boleh diputar, supaya
tidak ada event yang perlu menulisnya sendiri: yang sedang berjalan, yang
sedang dipinjam event lain, dan **siapa pun yang `face`-nya sudah `'up'`**.
Yang terakhir itu pagar *sprite*, bukan pagar sopan santun: `drawPerson`
membaca `back = a.face === 'up'` dan menggambar orangnya membelakangi kamera,
tangan di laptop, wajah tidak terlihat. Memutarnya jadi `'left'`/`'right'`
tidak membuat dia melirik — seluruh siluetnya berbalik dan tangannya lepas
dari laptop, terbaca seperti dia berdiri lalu berputar 180 derajat. Pegawai di
meja kerja dan dua kursi rapat sisi dekat sama-sama duduk `'up'`, jadi
dua-duanya terlindungi oleh satu aturan.

Pagar itu punya pengecualian yang sah, dan `menolehKe()` yang memegangnya.
Bedanya maksud, bukan teknis: untuk **lirikan** (tikus di plafon, proyektor
menyala) memutar pegawai meja terbaca seperti dia berhenti bekerja dan
berbalik badan gara-gara suara kecil — salah. Untuk orang yang **berdiri di
sebelah mejanya** menyodorkan nota untuk diparaf, berbalik menghadap tamunya
justru yang benar. Kalau ragu, pakai `menoleh()`.

Dua pagar yang **sengaja tidak** ada di situ, dan dua-duanya pernah dicoba:

* `adaTugas` — itu pagar *pinjam* (`bisaDipinjam`), sedangkan menoleh tidak
  meminjam siapa pun: tidak memasang `eventKerja`, tidak memberi perjalanan,
  tidak memasang pose.
* `state === 'work'` — terdengar seperti Aturan 1, tapi salah sasaran. Yang
  merusak gambarnya bukan orangnya sedang sibuk, melainkan arah gambarnya
  kebetulan punggung; keduanya cuma **kelihatan** sama karena kebanyakan
  pegawai sibuk memang menghadap laptopnya.

Bedanya kelihatan di meja rapat. `class Peserta` ber-`state 'work'` **permanen**
selama dia duduk — sama strukturalnya dengan `adaTugas`, bukan "sedang sibuk
satu langkah" — padahal dia duduk menghadap kamera. Dengan pagar `state`, 5
dari 5 peserta rapat berhenti bereaksi ke apa pun: kerumunan paling terbaca di
ruangan diam di tempat untuk seluruh 39 pemanggilan `menoleh()`.

Aturan 1 tetap dijaga, cuma di tempat yang benar: **`busyUntil` tidak dinaikkan
untuk orang ber-`state 'work'`.** `busyUntil` persis yang menahan pose
kerjanya (`update()`: `if (state === 'work' && now > busyUntil) state =
'idle'`), jadi menaikkannya membuat ruangan menampilkan tool call yang sudah
selesai seolah masih jalan — bohong tentang sesi sungguhan gara-gara seekor
tikus lewat di plafon. Untuk yang menganggur angka itu justru perlu: ia yang
menahan langkah pulang `IDLE_AFTER` supaya orangnya tidak ngeloyor pergi di
tengah tolehan.

`node uji-arah.mjs` menjaganya, semantik bukan regex: tiap event dijalankan
sampai habis, siapa yang pernah masuk `E.aktor` dicatat kumulatif, lalu `hadap`
semua orang **di luar** daftar itu dibandingkan dengan potret sebelum event
mulai. Sembilan event pernah melanggarnya sekaligus, dan tidak satu pun harness
lain melihatnya: tidak ada exception, tidak ada NaN, tidak ada peringatan.

#### `durasi` itu pagar, dan tidak boleh dilucuti

`tickEvent()` menulis `E.umur += dt; E.sisa -= dt` — jadi `E.sisa` tidak lain
dari `durasi - umur`. Konsekuensinya: menulis `E.sisa` dari dalam `tick()`
**hanya bisa berarti satu hal**, yaitu membuat event hidup melewati durasinya.

`pesan-titipan-berubah-isi` pernah memasang `E.sisa = Math.max(E.sisa, 4)` tiap
frame selama kurirnya masih maju, dengan niat yang benar: pagar durasi tidak
boleh jatuh di tengah satu mata rantai. Akibatnya melampaui niat itu — pagarnya
tidak jatuh sama sekali. Sapuan 84 jalan mencatat **nol** kematian karena
durasi dan umur terpanjang 63,92 detik dengan `durasi: 40` tertulis di
registri, selama itu memegang tiga sesi sungguhan pada `betah = true`.

Kebiasaan yang dipakai sekarang, sama seperti `halal-bihalal-lebaran`: **durasi
= pagar terakhir, bukan panjang adegan.** Ukur umur terpanjang yang mungkin,
tulis angka itu plus margin, dan biarkan adegannya berakhir sendiri lewat
`E.selesaiCepat`. Jangan menahan `E.sisa`.

#### `MOD` milik bersama: tulis `true` saja

`resetMod()` mengosongkan `MOD` setiap frame, jadi tidak ada yang perlu
dibersihkan di `selesai()`. Menulis `false` ke sana bukan cuma mubazir, tapi
**salah**: satu flag bisa dipakai belasan event, dan `MOD.pintuKadis = false` di
`selesai()` membanting pintu yang sedang ditahan terbuka event lain di frame
yang sama. Bentuk yang sama liciknya adalah menulis sebuah perbandingan —
`MOD.pintuKadis = E.umur < 0.5` menulis `false` di setiap frame sesudah detik
0,5. Yang benar `if (E.umur < 0.5) MOD.pintuKadis = true;`.

Kalau dua event memang tidak boleh hidup bersamaan, itu urusan `bentrokDengan`,
bukan urusan saling menimpa `MOD`. `bentrok()` membacanya **dua arah**: cukup
salah satu yang mendaftarkan lawannya.

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

