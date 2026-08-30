# Katalog event acak — Agent Room

Hasil rapat desain 12 sudut pandang, disaring kelayakannya terhadap kode nyata
di [public/room.js](public/room.js). **373 event unik**, 346 di antaranya dinilai
bisa dikerjakan, dan **268 sudah jadi kode** di
[public/event-acak.js](public/event-acak.js) — ditandai **+** di katalog di bawah.

Yang dimaksud *event acak* di sini: kejadian yang muncul sendiri, **bukan** dipicu
tool call. Tool call sudah punya jalurnya — pegawai berjalan ke stasiun. Event acak
mengisi sisanya: yang terjadi di ruangan waktu tidak ada yang menyuruh.

| | |
|---|---|
| Event unik | 373 |
| Layak dikerjakan | 105 |
| Layak dengan catatan | 171 |
| Mahal (butuh sistem baru) | 70 |
| Ditolak | 27 |
| Kerumitan 1–2 (sepele/murah) | 156 |
| Kerumitan 3 | 132 |
| Kerumitan 4–5 | 85 |

Data lengkap tiap event (semua kolom, termasuk catatan teknis penilai dan
daftar varian yang digabung) ada di [event-acak.json](event-acak.json).

## Bagaimana daftarnya dikumpulkan

Sembilan peserta mengusulkan dari sudut pandang yang sengaja dibuat tidak
bertumpang tindih, lalu tiga kritikus mencari yang kelewat, lalu tiga engineer
menilai kelayakannya sambil membaca `room.js`:

| Peserta | Sudut pandang |
|---|---|
| Teknisi Jaringan | infrastruktur fisik: listrik, genset, UPS, AC, jaringan, rak |
| Kasubbag Umum | barang dan ruangan: perabot, kebersihan, inventaris |
| Sekretaris Dinas | ritual birokrasi: apel, disposisi, inspeksi, audit |
| Pegawai senior | kultur kantor sehari-hari |
| Perancang suasana | cuaca, waktu, kalender |
| Perancang gangguan | hewan dan tamu tak diundang |
| Engineer render | efek visual murni, dinilai dari tekniknya |
| Systems designer | event yang syaratnya membaca keadaan sesi |
| Perancang easter egg | kenyataan Claude Code jadi kejadian kantor |
| Kritikus celah kategori | bagian ruangan & prop yang belum pernah jadi panggung |
| Kritikus sunyi | event 2–4 detik yang nyaris tak terlihat |
| Kritikus interaksi | event dua orang, dan yang bergantung jabatan |

Duplikat dibuang dua kali: 28 waktu id-nya bentrok, 24 lagi waktu namanya
ternyata menyebut hal yang sama (mis. tiga usulan berbeda untuk "ember penadah
AC penuh"). Yang digabung tidak hilang — tercatat sebagai `varian` di JSON,
karena deskripsi yang kalah sering menyimpan detail yang lebih baik.

## Mesin event

**Sudah dibuat.** Yang di bawah ini rancangannya; yang terpasang di kode
mengikutinya, dengan dua tambahan yang muncul waktu dikerjakan: objek
`RUANGAN` untuk bekas yang sengaja hidup lebih lama dari eventnya, dan
pembatalan event yang `mulai()`-nya melempar.

### Titik sisip

| Tempat | Yang ditambah |
|---|---|
| `frame(ts)` | `tickEvent(dt)` sebelum `updateParts(dt)` |
| Susunan `layers` | event yang punya prop sendiri ikut *depth sort* lewat `sortY` |
| `drawAmbien()` | overlay event digambar **setelah** ambien, lewat `gambarAtas` |
| `spawn()` | parameter warna opsional + jenis `lembar`, `confetti`, `kantuk` |
| `ambien()` | dipecah dua tingkat supaya MOD terbaca tiap frame, bukan tiap detik |
| `class Agent` | `goToXY()`, `alpha`, `bawa`, `pose`, dan jalur pelepasan pemeran |

`dripT` di baris 2777 sudah jadi contoh event berjadwal paling sederhana yang
ada di kode: penghitung waktu, ambang, `spawn()`. Mesin ini generalisasi dari
pola itu.

### Bentuk registri

```js
const EVENT_ACAK = [
  {
    id: 'tegangan-turun-lampu-redup',
    kelas: 'latar',          // latar = boleh menumpuk, panggung = eksklusif
    bobot: 6,                // makin besar makin sering terpilih
    cooldown: 180,           // detik, per event
    durasi: 6,
    syarat: (S) => S.lampu > 0.5,      // opsional
    mulai(E, S) {},          // sekali, waktu event dipilih
    tick(E, dt, S) {},       // tiap frame selagi hidup
    gambar(E, S) {},         // dipanggil di lapisan yang benar
    sortY: null,             // null = overlay layar penuh; angka = ikut depth sort
    selesai(E, S) {},
    lanjutan: [{ id: 'ups-beep-baterai', peluang: 1 }],   // event berantai
  },
];
```

`S` adalah potret keadaan ruangan — semuanya sudah ada di kode, tinggal dikemas:

```js
const potret = () => {
  const orang = [...agents.values(), ...peserta, ...standby];
  return {
    jam: jamSekarang(),                 // dari ambien() / JAM_PAKSA
    lampu: ambien().lampu,
    sesi: agents.size, standby: standby.length, peserta: peserta.length,
    orang,
    nganggur: orang.filter((a) => a.state !== 'work' && !a.adaTugas),
    stasiunAktif: new Set(orang.filter((a) => a.state === 'work').map((a) => a.station)),
  };
};
```

### Penjadwal

Satu penghitung global, bukan satu timer per event:

```js
let jedaEvent = 0;
function tickEvent(dt) {
  for (const E of hidup) {
    E.sisa -= dt;
    E.def.tick?.(E, dt, S);
    if (E.sisa <= 0) matikan(E);
  }
  if ((jedaEvent -= dt) > 0) return;
  jedaEvent = JEDA_MIN + Math.random() * (JEDA_MAX - JEDA_MIN);
  const calon = EVENT_ACAK.filter((e) =>
    now > (cooldownSampai.get(e.id) || 0) && !bentrok(e) && (!e.syarat || e.syarat(S)));
  if (calon.length) nyalakan(pilihBerbobot(calon));
}
```

Angka awal yang masuk akal: `JEDA_MIN = 18`, `JEDA_MAX = 45` detik. Ruangan
yang ada kejadian tiap 5 detik jadi ramai palsu; yang tiap 3 menit terbaca mati.

### Empat aturan yang menjaga ini tidak jadi kacau

1. **Satu event panggung pada satu waktu.** Event `latar` (cicak, debu, awan
   lewat) boleh menumpuk; event `panggung` (mati lampu, inspeksi mendadak,
   kucing masuk) eksklusif — yang kedua ditunda, bukan dibatalkan.
2. **Event tidak boleh mencuri pegawai yang sedang bekerja.** Yang boleh
   direkrut hanya `state !== 'work' && !adaTugas`. Sesi nyata yang sedang
   memanggil tool tidak boleh ditarik. **Pegawai standby adalah pemeran utama
   event** — itu memang gunanya mereka ada.
3. **Event tidak masuk log dan tidak menaikkan statistik.** Panel kanan itu
   laporan sesi Claude Code; event ambien mencemarinya. Kalau perlu jejak,
   pakai kelas log sendiri yang bisa dimatikan.
4. **Semua bisa dimatikan.** `?event=0` untuk mematikan, `?event=<id>` untuk
   memaksa satu event jalan — tanpa ini, event langka mustahil diuji. Pola
   `?jam=` yang sudah ada di kode jadi contohnya.

### Interupsi pegawai

`Agent.update()` sekarang punya satu jalur pulang (`stasiunPulang`). Event yang
menyuruh orang pindah butuh jalur yang menang atas itu — dan benderanya sudah ada:

```js
interupsi(titik, lama, doing) {
  this.betah = true;        // sudah dipakai peserta rapat; tinggal dipinjam
  this.doing = doing;
  this.busyUntil = now + lama;
  this.pathKe(titik);       // route() ke koordinat, bukan ke stasiun
}
```

## Urutan kerja

Tiga gelombang, disusun supaya tiap gelombang berdiri sendiri — berhenti di
gelombang mana pun tetap dapat ruangan yang lebih hidup.

| Gelombang | Isi | Jumlah |
|---|---|---|
| **1 — murah** | vonis `layak`, kerumitan ≤ 2. **Sudah dikerjakan**: 102 dari 104 terpasang. | 104 |
| **2 — sedang** | `layak-dengan-catatan`, kerumitan ≤ 3. Butuh prop kecil atau interupsi pegawai. | 170 |
| **3 — besar** | sisanya yang tidak ditolak: butuh sistem baru (cuaca, kalender, aktor bukan-pegawai). | 72 |

Gelombang 1 dimulai dari **`tegangan-turun-lampu-redup`**, yang ditandai penilai
sebagai yang paling murah di seluruh daftar — dan itu memang uji penjadwal yang
benar: kalau penjadwalnya salah, langsung kelihatan, dan tidak ada kode lain yang
ikut tersangkut.

Dua dari 104 tidak dibuat: **`hujan-deras`** dan **`hujan-petir-kedip`**. Hujan di
ruangan ini sungguhan, dibaca dari `/cuaca`; memaksanya dari penjadwal akan
melawan data asli dan bikin baris log "hujan turun / hujan reda" berbohong.
Sisa kelompok itu — mendung tanpa hujan — memang belum ada, jadi itu yang dibuat.

Tiga pekerjaan infrastruktur yang muncul berulang di catatan penilai, dan lebih
baik dikerjakan sekali di depan daripada ditambal per event:

1. **Formula kedip neon ditulis dua kali** — di `drawWall()` dan `drawAmbien()`,
   dengan angka yang identik. Setiap event yang menyentuh lampu harus mengubah
   keduanya; kalau lupa, neonnya padam di satu tempat dan tetap menyala di
   tempat lain. Satukan jadi satu helper dulu.
2. **`spawn()` belum menerima warna** — belasan event minta partikel yang sudah
   ada dengan warna lain. Parameter warna opsional menyentuh ~15 pemanggil,
   sekali kerja, lalu dipakai semua.
3. **`jagaPopulasi()` memberi standby sebanyak `4 − jumlah sesi nyata`** — jadi
   begitu ada 4+ sesi, **tidak ada standby sama sekali**. Setiap event yang
   pemerannya standby wajib punya jalur cadangan, atau tidak akan pernah muncul
   justru waktu ruangan paling ramai. Standby juga tidak punya `this.el`, jadi
   dia tidak bisa berbalon.

## Katalog

Kolom **K** = kerumitan setelah diperiksa terhadap kode (1 sepele … 5 proyek
sendiri). Kolom **vonis**: `layak` · `catatan` (layak, ada yang perlu disiapkan)
· `mahal` (butuh sistem baru) · `tolak`.

### Infrastruktur — 46 event

Listrik, AC, jaringan, rak server, printer — badan kantornya sendiri.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Kabel UTP dirapikan** | Acak, hanya kalau stasiun server dipakai minimal 2 pegawai bersamaan dalam 5… | Tiga kabel menjuntai di sisi kanan rak (hijau, biru, kuning di sekitar x+w+1..x+w+3) awalnya digambar melengkung… | jarang | 34s | 1 | layak |
| **+** | **Tegangan turun sebentar** | Acak tiap 60 detik dengan peluang kecil | Bukan padam, tapi lemas: nilai A.lampu dikali faktor yang turun ke 0.45 lalu naik lagi dengan gelombang lambat… | sedang | 6s | 1 | layak |
| **+** | **Cat dinding mengelupas** | Acak, hanya di area dinding kosong (misal x 190-250 di atas wainscot, y 40-68) | Bercak cat mengelupas tumbuh bertahap: mulai 4x3 px lalu jadi 14x9 px tidak beraturan, warnanya semen abu (#b8b2a4)… | jarang | 30s | 2 | layak |
|  | **Ember penadah AC penuh** | Dihitung, bukan acak: counter tetesan di frame() (dripT, tiap 2.6 detik)… | Permukaan air di drawEmber naik bertahap: kotak biru di (342,124,12,8) tumbuh ke atas sampai tinggal 1 px dari… | sedang | 30s | 2 | catatan |
|  | **Galon dispenser habis** | Acak, tapi hanya kalau ada >=1 pegawai pernah singgah di stasiun idle dalam 3… | Galon di drawTunggu (bx+84, by-30, 14x12) luntur dari #7db8e8 jadi #dfe4e8 kosong, gelembung air berhenti, LED… | sering | 22s | 2 | tolak |
|  | **Genset menyala** | Rantai: hanya kalau mati-lampu-sekejap benar-benar berlangsung penuh (>= 2… | Setelah listrik balik, intensitas lampu ditahan di 0.6 dari normal dan kedipnya dipercepat (periode 95 ms jadi 60… | langka | 30s | 2 | catatan |
| **+** | **Internet lemot** | Acak sekali per 25-50 menit, atau otomatis 20 detik sesudah mati-lampu-sekejap | Di atas kepala tiap pegawai yang sedang 'work' muncul ikon tunggu: tiga titik 1 px yang menyala bergantian, warna… | sedang | 20s | 2 | layak |
|  | **Jaringan lemot** | Total pemakaian 'web' + 'search' >= 6 kali dalam 60 detik, ATAU tepat setelah… | Semua partikel 'ping' berubah warna jadi jingga pudar dan kecepatannya setengah selama event | sedang | 14s | 2 | tolak |
|  | **Jaringan megap-megap** | Acak 1x per 6 menit, cooldown 3 menit. Lebih sering kalau ada >=2 pegawai… | Glif sinyal di dinding atas rak (400, 28): 3 busur ctx.arc lebar 1 px radius 4/7/10, digambar dari busur terluar ke… | sering | 22s | 2 | catatan |
| **+** | **Kabel LAN kecolok longgar** | Acak, cooldown 9 menit. Peluang naik kalau ada penghuni sedang bekerja di… | Salah satu dari tiga kabel UTP di sisi kanan rak (yang hijau, kabel(x+w+1, y+16, 24, 2)) ujungnya turun 12 px dan… | sedang | 12s | 2 | layak |
| **+** | **Kipas berdiri macet** | Acak tiap 90 detik peluang kecil. Cooldown 5 menit | Baling-baling di drawKipas berhenti mendadak pada sudut acak dan diam (sudut disimpan, tidak lagi memakai now/90) | sedang | 14s | 2 | layak |
| **+** | **Meja kerja goyang** | Acak pada salah satu dari empat meja di MEJA_KERJA_X, hanya kalau meja itu… | Meja kerja yang bersangkutan bergetar 1 px vertikal setiap kali pegawainya bekerja (sinkron dengan animasi… | sedang | 20s | 2 | layak |
|  | **Mesin absensi ngambek** | Acak, cooldown 7 menit, lebih sering pada jam 07.00-08.30 dan 16.00-17.00 | Prop baru: mesin absensi sidik jari 9x13 px menempel di dinding kanan dekat pintu kadis (x=424, y=76) — kotak abu,… | sedang | 10s | 2 | catatan |
| **+** | **Patch panel akhirnya dilabeli** | Acak tiap 5 menit peluang sangat kecil, dan HANYA kalau kabel-utp-kesenggol… | Agen berdiri di depan rak menempel label: sepuluh kotak 3x2 px putih muncul satu per satu di atas port patch panel… | langka | 40s | 2 | layak |
|  | **Pengeras suara mendengung** | Acak tiap 75 detik peluang kecil; peluang naik 3x dalam 10 detik setelah… | Prop baru: corong TOA 12x9 px abu di dinding kiri atas (x=60, y=26) dengan tiang kecil | sedang | 5s | 2 | tolak |
|  | **Plafon melendut kena rembes** | Hanya setelah CUACA.hujan pernah > 0.6 dalam 15 menit terakhir | Di plafon atas lemari arsip (sekitar x40..80, y0..8) muncul noda coklat muda tak beraturan yang melebar pelan 3… | jarang | 20s | 2 | catatan |
| **+** | **Stabilizer berdengung** | Acak tiap 90 detik peluang kecil; peluang naik 3x selama 20 detik setelah… | Prop baru: stabilizer kotak 18x14 px krem ('#e2ddc8') di lantai kiri rak (x=344, y=104) dengan meter jarum kecil… | sedang | 12s | 2 | layak |
| **+** | **Tanaman pot layu lalu disiram** | Timer layu berjalan pelan sejak halaman dimuat (sekitar 8 menit) | Daun di drawPlant() berganti warna bertahap: #4f8a56 -> #7a7a3a -> #7a5f30, dan tiap leafP() dimiringkan turun 2-4… | sedang | 34s | 2 | layak |
| **+** | **Token listrik hampir habis** | Acak tiap 3 menit peluang kecil, lebih sering di atas jam 16.00 | Prop baru: meteran prabayar 16x12 px krem di dinding dekat pintu kadis (x=396, y=60), layar hitam 10x5 dengan empat… | jarang | 26s | 2 | layak |
| **+** | **UPS bunyi beep** | Acak tiap 45 detik peluang kecil; dipaksa muncul 2 detik setelah… | Panel UPS di dasar rak (x+3, y+h-15 pada drawServer) berkedip: strip status berganti hijau/merah tiap 0,55 detik,… | sering | 7s | 2 | layak |
| **+** | **UPS menjerit** | Selalu menyusul kedipan-listrik (jeda 2 detik), atau acak sendiri 1x per 25… | LED merah UPS di rak (x sekitar 372, y 108) berkedip 2 Hz penuh alpha, plus glow(372,108,10,'#ff4a4a',0.25*kedip) | sedang | 14s | 2 | layak |
|  | **AC bocor makin deras** | Acak tiap 60 detik peluang sedang. Cooldown 2 menit | dripT dipercepat: interval 2,6 detik jadi 0,35 detik, jadi ada 4–5 tetes di udara sekaligus | sering | 18s | 3 | catatan |
|  | **AC mati, ruangan gerah** | Acak tiap 3 menit peluang kecil, hanya jam 10.00–16.00 mesin penonton | LED AC padam, tetesan berhenti total (dripInterval = Infinity) | jarang | 60s | 3 | catatan |
|  | **Gorden lepas kait** | Acak, hanya pada siang-sore saat ambien().luar > 0.6 supaya perubahan cahaya… | Salah satu ujung gorden hijau di drawWindow() (rel di x-8, y-8, lebar w+16) melorot: kain di sisi kiri turun 10 px… | jarang | 26s | 3 | catatan |
|  | **Internet putus, cari sinyal** | Acak tiap 3 menit peluang kecil. Cooldown 15 menit | Semua partikel 'ping' dan 'scan' dimatikan sepanjang event. Di atas kepala tiap agen yang sedang bekerja muncul… | jarang | 30s | 3 | catatan |
|  | **Jam dinding kehabisan baterai** | Acak tiap 6 menit peluang sangat kecil. Cooldown 40 menit | drawClock berhenti mengikuti jam nyata: sudut jarum dibekukan pada nilai saat event mulai, dan jarum detik bergetar… | langka | 75s | 3 | catatan |
|  | **Jendela macet, didorong berdua** | Muncul saat event gerah/panas sedang berjalan, atau acak jam 12–14 kalau… | Daun jendela geser (bingkai 1 px di dalam kusen x186..238) bergetar di tempat tiga kali tanpa bergerak, lalu… | jarang | 16s | 3 | catatan |
|  | **Kabel lantai dilakban** | Terpicu setelah ada agen tersandung (lihat visual) atau acak tiap 4 menit… | Sebelum dilakban: kabel gulung digambar melintang di lantai (garis sinus 2 px '#3a3f45' dari (322,250) ke (352,254)) | jarang | 28s | 3 | catatan |
|  | **Kedipan listrik PLN** | Acak, 1x per 8-20 menit, cooldown keras 6 menit | Overlay hitam sekanvas: globalAlpha 0 -> 0.72 dalam 2 frame, tahan 8 frame, turun ke 0 dalam 6 frame | sedang | 9s | 3 | catatan |
|  | **Kipas menoleh** | Acak 1x per 4 menit, cooldown 2 menit. Wajib jalan kalau… | Kepala kipas menyapu cx 400 +-7 px dengan easing sin periode 7 detik | sering | 25s | 3 | catatan |
|  | **Mati lampu, genset nyala** | Acak, peluang kecil tiap 90 detik. Cooldown 8 menit | Flag global `listrikMati=true`. drawAmbien menimpa seluruh kanvas rgba(6,10,20,.72) selama 4 detik | jarang | 9s | 3 | catatan |
|  | **MCB satu jalur turun** | Acak tiap 2 menit peluang kecil. Cooldown 10 menit | Prop baru kecil: kotak panel MCB 14x18 px abu ('#dfe2e6') di dinding x=414,y=76, dengan tiga tuas 3x5 px | jarang | 22s | 3 | layak |
|  | **Neon sebelah mati** | Acak 1x per 15 menit, hanya kalau A.lampu > 0.3 (sore/malam) | Tabung kiri (cx=170) mati lewat 4 kedip acak (alpha 1 -> .2 -> 0 -> .6 -> 0 dalam 1,2 detik), lalu 0 selama 40… | sedang | 45s | 3 | catatan |
|  | **Printer nyangkut kertas** | Acak, cooldown 7 menit, lebih sering kalau stasiun 'web' baru dipakai <30… | LED hijau printer (x=219, y=87) berubah merah tetap (tidak berkedip — kerusakan, bukan proses) | sedang | 12s | 3 | catatan |
|  | **Rak server dibersihkan** | Acak tiap 4 menit peluang kecil, hanya jam 07.00–09.00 (sebelum jam pelayanan) | Semburan 'dust' padat (5 butir/detik) dari seluruh muka rak, menyebar ke kiri karena vx diperbesar | jarang | 35s | 3 | catatan |
|  | **Teknisi dipanggil ke kolong meja** | Ada teknisi di ruangan. Acak tiap 4-8 menit, cooldown 5 menit | Seorang pegawai di meja kerja mengangkat tangan dan monitornya menampilkan silang merah 3x3 px | sering | 16s | 3 | catatan |
|  | **Toner habis, dikocok dulu** | Acak tiap 2 menit peluang kecil; hanya bisa muncul setelah… | Kertas hasil cetak digambar PUDAR: partikel 'paper' yang keluar dari printer alpha-nya dikurangi setengah selama… | sedang | 22s | 3 | catatan |
|  | **Ubin retak nambah** | Acak, hanya boleh di petak lantai yang belum retak dan tidak tertutup… | Bunyi retak kecil lalu garis retak baru digambar bertahap dari titik tengah petak ke luar (3 segmen stroke, muncul… | jarang | 8s | 3 | catatan |
|  | **Uji genset bulanan** | Acak tiap 6 menit peluang sangat kecil, hanya jam 08.00–09.00 | Bukan mati lampu — ini uji beban terjadwal, jadi listrik tetap hidup tapi ruangan bergetar | langka | 20s | 3 | catatan |
|  | **Wifi lemah di pojok** | Acak tiap 2 menit peluang kecil, hanya kalau meja kerja x=444 (slot paling… | Prop baru: access point 10x10 px putih di plafon (x=300, y=14) dengan LED yang biasanya hijau | sedang | 25s | 3 | catatan |
|  | **Lampu neon diganti** | Didahului fase sekarat: satu tabung neon mulai kedip tidak beraturan selama… | Fase sekarat: satu tabung TL berkedip acak (alpha lompat 0.2/1.0 tanpa pola) dan glow oranye di bawahnya ikut… | jarang | 40s | 4 | mahal |
|  | **Neon kedip mau mati** | Acak tiap 80 detik peluang kecil, hanya kalau A.lampu>0.3 (senja sampai pagi) | Neon terpilih kedip parah: fl dipaksa ke pola acak 0.1–1 tiap 90–260 ms selama 15 detik, warna tabungnya bergeser… | sedang | 30s | 4 | mahal |
|  | **Teknisi AC naik tangga** | Acak per ~35 menit, prioritas kalau event tetesan AC sudah jalan lama | Teknisi berwearpack biru membawa tangga lipat 4x18 px, berjalan ke bawah titik tetesan AC (x 347), tangga dibuka… | jarang | 90s | 4 | mahal |
|  | **Teknisi servis AC datang** | Acak tiap 5 menit peluang sangat kecil, hanya jam 08.00–11.00 | Satu Standby berseragam wearpack masuk dari kiri layar membawa tangga lipat: prop tangga 10x26 px ('#9aa1a6' dua… | langka | 50s | 4 | mahal |
|  | **Tukang galon ganti air** | Acak tiap ~20 menit, atau dipaksa 60 dtk setelah dispenser 'habis' (dihitung… | Tukang galon memanggul galon biru 8x11 px di bahu, masuk dari kiri, jalan agak miring (badan digeser 1 px, langkah… | sedang | 40s | 4 | mahal |
|  | **Kisi plafon dibuka teknisi** | Acak jam 09–15, dan hanya kalau tidak ada rapat aktif di stasiun 'rapat' | Kursi lipat 8x10 px muncul di bawah plafon dekat rak server (x376, kaki y=150) | jarang | 26s | 5 | tolak |

### Insiden — 35 event

Yang tidak diharapkan: rusak, tumpah, macet, jatuh, bocor.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
|  | **Bendera terbelit tiang** | Hanya menyusul angin-kencang-gorden, peluang 35%, atau acak sangat jarang di… | drawBendera di x=132 berubah: 16 kolom kain tidak lagi berkibar sinus, melainkan 6 kolom pertama menggulung… | jarang | 40s | 2 | catatan |
| **+** | **Berkas jatuh berhamburan** | Acak dengan peluang 3% tiap kali seorang pegawai melintasi LANE_DOWN pada… | Pegawai tersandung: badan turun 3 px dan miring (kepala digeser 2 px) selama 0,4 detik, lalu spawn('paper') dua… | sedang | 20s | 2 | layak |
|  | **Berkas tumpah di koridor** | Peluang ~4% tiap kali seorang pegawai berjalan dari 'read'/'search' membawa… | Pegawai berhenti mendadak, map di tangannya hilang, dan 18 partikel 'paper' (s:2, gravitasi 40) berhamburan lalu… | sedang | 14s | 2 | tolak |
| **+** | **Kipas angin oleng** | Acak, tapi peluang naik kalau ada pegawai berdiri dalam radius 40 px dari… | Seluruh kepala kipas di drawKipas() bergoyang kiri-kanan +-2 px dengan periode 0.4 detik, tiang ikut miring 1 px,… | sering | 14s | 2 | layak |
|  | **Laci arsip macet** | Acak saat ada pegawai bekerja di stasiun read atau search | Laci lemari arsip di drawArsip() digambar terbuka 2 px lalu tertahan, bergetar 3 kali (1 px maju-mundur cepat) | sedang | 18s | 2 | catatan |
| **+** | **Printer macet kertas** | Terpicu 3 detik setelah ada agen mulai bekerja di stasiun 'web' dengan… | LED printer di drawWindow (x=219,y=87) berganti merah kedip cepat | sering | 18s | 2 | layak |
|  | **Pulpen jatuh menggelinding** | Acak di meja kerja atau meja rapat, kapan saja | Kotak 3x1 px warna biru tua jatuh dari tepi meja, memantul 2 px, lalu menggelinding pelan 10-14 px di lantai sampai… | sedang | 3.5s | 2 | catatan |
| **+** | **Switch badai broadcast** | Acak tiap 2 menit peluang kecil; peluang naik kalau 2+ agen sedang bekerja di… | Baris switch (u===4 di drawServer) semua LED menyala serempak dan berkedip 8 Hz — bukan pola acak seperti biasa,… | jarang | 20s | 2 | layak |
| **+** | **Terminal colokan kepenuhan** | Acak tiap 3 menit peluang kecil, hanya kalau minimal 3 meja kerja terisi | Prop baru: terminal colokan 16x6 px putih di lantai bawah meja kerja x=176 (x=150, y=336) dengan 4 kepala charger… | jarang | 16s | 2 | layak |
|  | **Tinta stempel habis** | Setelah stempel dipakai 12-20 kali (hitung dari event stempel-basah dan… | Cap pertama keluar pucat: partikel 'ink' hanya 2 butir dengan alpha 0.35 dan noda di map digambar tipis | jarang | 15s | 2 | tolak |
| **+** | **Ujung karpet terlipat** | Acak, hanya bisa aktif kalau minimal 3 pegawai melintasi tepi karpet (x… | Salah satu sudut karpet merah di drawFloor() digambar terlipat: segitiga 14x10 warna balik karpet (#5c2626, sisi… | sedang | 16s | 2 | layak |
|  | **Atap bocor, ember kedua** | Hanya saat hujan-deras-jendela sudah berjalan lebih dari 30 detik | Titik bocor baru di plafon x=118, y=12: noda kecokelatan '#a08a64' 10x3 px yang melebar pelan jadi 16x4, lalu… | jarang | 120s | 3 | catatan |
|  | **Bocor baru di atas arsip** | Rantai: peluang 50% saat hujan-deras-sore sudah berjalan > 40 detik | Titik tetes kedua muncul di (96, 30), tepat di atas lemari arsip: partikel 'drip' baru dengan target lantai y=136 | jarang | 60s | 3 | catatan |
|  | **Bocor baru di atas meja rapat** | Hanya bisa muncul dalam 3 menit setelah hujan-petir-kedip, peluang 1 dari 3 | Titik bocor baru di plafon tepat di atas meja rapat: partikel 'drip' baru di-spawn dari (246, 20) tiap 3,4 detik… | langka | 90s | 3 | catatan |
|  | **Cicak jatuh ke tumpukan berkas** | Hanya kalau event cicak-berburu-di-neon sedang jalan (peluang 8% saat… | Cicak lepas dari dinding, jatuh dengan gravitasi (pakai mekanika partikel: g=240) ke tumpukan berkas meja stempel… | jarang | 12s | 3 | catatan |
|  | **Genset kehabisan solar** | Hanya sebagai lanjutan mati-lampu-sekejap, peluang 1 dari 6, dan hanya kalau… | Enam detik setelah genset stabil, neon meredup berangsur (lampu dikali 1→0.15 dalam 1,5 detik) lalu padam lagi,… | langka | 14s | 3 | catatan |
|  | **Kabel UTP kesenggol** | Terpicu saat ada agen berjalan melewati x=418–432 di LANE_UP (persis di bawah… | Ketiga kabel menjuntai di drawServer berayun besar: amplitudo sinus dinaikkan dari 2–3 ke 7 lalu meredam ke normal… | sedang | 16s | 3 | catatan |
|  | **Kopi tumpah di meja rapat** | Acak, cooldown 16 menit, hanya kalau >=2 kursi meja rapat terisi | Salah satu gelas di drawRapat() digambar terguling (kotak 5x5 jadi 5x4 miring, isi coklatnya hilang) | jarang | 18s | 3 | catatan |
|  | **Kursi rapat patah** | Acak, hanya saat stasiun rapat sedang dipakai minimal 2 orang | Satu kursi di KURSI_JAUH/KURSI_DEKAT digambar miring: sandaran turun 3 px dan kaki kanan hilang 2 px, ditambah 4… | jarang | 26s | 3 | catatan |
|  | **Petir menyambar** | Hanya saat hujan-deras-jendela sedang berjalan | Dua tahap. (1) Kilat: fillRect putih '#f4f8ff' seluruh kanvas 480x356, alpha 0.55 selama 60 ms, padam 40 ms,… | sedang | 3s | 3 | tolak |
|  | **Rak server kepanasan** | Acak tiap 2 menit peluang kecil; peluang naik 3x kalau ac-mati-ruangan-panas… | Semua LED hijau di drawServer berganti oranye/merah bergantian, dan glow rak berubah dari hijau ke '#ff8a4a' alpha… | jarang | 40s | 3 | catatan |
|  | **Rebutan stempel** | Acak, cooldown 10 menit, hanya kalau ada >=2 penghuni yang tidak sedang duduk… | Dua penghuni ditarik ke stasiun 'edit' dan berdiri saling berhadapan (yang satu hadap 'right' di x=272, yang satu… | jarang | 13s | 3 | catatan |
|  | **Tumpukan berkas roboh** | Acak 1x per 18 menit, bobot naik kalau ada >=2 pegawai bekerja di stasiun… | Sembilan lapis tumpukan di meja stempel dilepas satu per satu: tiap lapis dapat offset x bertambah (l*2 px) dan… | jarang | 12s | 3 | catatan |
|  | **Tumpukan dus ambruk** | Hanya bisa terjadi kalau dusTumpuk >= 4 | Dua dus teratas terguling: digambar jatuh dalam 4 frame ke kanan-bawah lalu tergeletak miring di (420,286) dan… | langka | 38s | 3 | catatan |
|  | **UPS ngebul** | Acak, cooldown 25 menit, dan tidak boleh dalam 3 menit sesudah… | Partikel baru 'asap': kotak 2x2 abu (#8b8f86 -> #c9ced4 seiring life), vy -12, tanpa gravitasi, life 2,6, melebar… | langka | 16s | 3 | catatan |
|  | **X-Banner roboh** | Acak, peluang naik 3x kalau ada pegawai lewat di dekat x=16-42 pada… | X-banner di drawXBanner() (x=16, y=188) miring bertahap 3 langkah (0 -> 25 -> 60 derajat, digambar sebagai kotak… | jarang | 20s | 3 | catatan |
|  | **Angin kencang, kertas beterbangan** | Acak, 60% terjadi saat mendung-menggantung atau menjelang hujan | Gorden hijau di kedua sisi jendela (x178 dan x240 di drawWindow) bergoyang: tiap baris piksel gorden digeser… | sedang | 25s | 4 | mahal |
|  | **Ember luber, lantai licin** | Hanya kalau ac-bocor-deras selesai tanpa ada agen yang sempat mengosongkan… | Genangan elips piksel di lantai sekitar (347,124): tiga baris kotak biru-abu alpha .35 yang melebar dari 10 px ke… | jarang | 45s | 4 | mahal |
|  | **Gempa kecil** | Acak murni kapan saja, peluang sangat kecil (sekitar 1 per 45 menit tampilan) | Seluruh kanvas digetarkan lewat ctx.translate dengan amplitudo yang naik lalu turun (0 -> 2 px -> 0) selama 3.5… | langka | 9s | 4 | mahal |
|  | **Kecoa terbang** | Acak 1 kali per ~30 menit, lebih sering malam | Kecoa 4x2 px cokelat gelap keluar dari kolong dus arsip, lari lurus 30 px di lantai, lalu TERBANG: naik ke y 200… | jarang | 22s | 4 | mahal |
|  | **Kunci tertinggal, menunggu di depan** | Hanya di awal sesi pertama hari itu, jam 06.30–08.00, saat jumlah pegawai di… | Ruangan tetap remang (lampu neon mati, ambien dipaksa 0,15 lebih gelap dari seharusnya) | jarang | 22s | 4 | tolak |
|  | **Laba-laba turun di meja rapat** | Hanya saat rapat aktif (rapatAktif.length > 0) dan minimal 3 kursi terisi | Benang 1 px putih tipis turun dari plafon (246, 8) ke arah meja rapat, laba-laba 3x3 px turun di ujungnya sampai y… | jarang | 20s | 4 | mahal |
|  | **Meja rapat dilap bersih** | Acak, cooldown 15 menit, hanya kalau meja rapat sedang TIDAK penuh (<=4 kursi… | Sosok petugas kebersihan masuk dari tepi kiri di LANE_DOWN membawa lap 5x3 px, berdiri di sisi kiri meja rapat lalu… | jarang | 11s | 4 | mahal |
|  | **Penjual asuransi duduk di kursi rapat** | Jam 9-14, acak per ~20 menit, hanya kalau ada kursi rapat kosong | Penjual berjas gelap masuk cepat, langsung menuju kursi rapat kosong terdekat dan DUDUK tanpa dipersilakan, membuka… | jarang | 50s | 4 | mahal |
|  | **Simulasi kebakaran** | Acak tiap 8 menit peluang sangat kecil, hanya jam 09.00–11.00, dan hanya… | Alarm: overlay merah rgba(200,50,50,.10) berdenyut 1,2 Hz selama 12 detik pertama, ditambah lampu alarm baru 6x6 px… | langka | 45s | 5 | tolak |

### Birokrasi — 72 event

Ritual dinas: apel, disposisi, inspeksi, tamu, audit, tanda tangan.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
|  | **Absen finger print** | Jam mesin 07:00-08:15 dan 15:45-16:45, acak tiap 20-60 detik, satu antrean… | Prop baru: mesin absen 10x14 px menempel dinding kanan dekat pintu kadis di x=468 y=116, layar LED 6x3 px | sering | 12s | 2 | catatan |
|  | **Antre mesin absen** | Jam 07.15-08.00 dan 15.45-16.30, tiap ada pegawai yang baru masuk layar atau… | Prop baru: mesin absen 10x14 px abu-abu tertempel di dinding dekat pintu kadis (x=436, y=96) dengan layar kecil 6x4… | sering | 12s | 2 | tolak |
| **+** | **Antre tanda tangan kadis** | Acak tiap 5-12 menit jam kerja; bisa terpicu lebih cepat kalau tumpukan map… | Dua sampai tiga pegawai antre di LANE_UP pada x=470, 458, 446 hadap 'up' sambil memegang map | sedang | 30s | 2 | layak |
| **+** | **APAR diperiksa petugas** | Acak tiap 5 menit peluang sangat kecil, hanya jam 08.00–10.00 | Agen berdiri di depan APAR (x=335, y=LANE_UP), mengangkat tabungnya: APAR di drawServer digambar terangkat 6 px… | langka | 26s | 2 | layak |
|  | **APAR kadaluarsa dicek** | Acak, cooldown 40 menit. Peluang naik setelah event mati-lampu-sekejap… | Label kartu gantung kecil (kotak krem 5x7) muncul di leher APAR merah di (330,100) | jarang | 28s | 2 | tolak |
|  | **Bagan struktur diperbarui** | Acak, dan lebih mungkin muncul setelah ada sesi baru dengan jabatan yang… | Prop baru di dinding kiri (x=96..140, y=44..70): bagan struktur organisasi — satu kotak putih 8x6 px di atas, garis… | jarang | 24s | 2 | catatan |
| **+** | **Bantalan stempel kering** | Dihitung: tiap 25 hentakan stempel di stasiun edit (event 'ink' sudah… | Partikel 'ink' yang tersembur saat stempel menghantam berkurang drastis (6 jadi 1) dan warnanya pudar (#c93030 jadi… | sering | 20s | 2 | layak |
|  | **Basahi jari, hitung berkas** | Saat agen berhenti di lemari arsip (read) atau filing kabinet (search) lebih… | Tangan naik ke depan wajah 0.3 s, lalu turun ke tumpukan; tepi tumpukan kertas berkedip 1 px terangkat berulang 5… | sering | 3s | 2 | catatan |
| **+** | **Berkas kurang lampiran** | Peluang 15% tiap kali ada pegawai selesai bekerja di stasiun 'edit' (meja… | Di meja stempel, map diangkat 4 px lalu dibolak-balik (offset x -2/+2 px tiap 0,3 detik), stempel TIDAK jadi turun | sedang | 30s | 2 | layak |
|  | **Berkas lama dibuka lagi** | Acak, cooldown 8 menit. Peluangnya naik kalau ada sesi yang baru muncul <30… | Laci ketiga lemari arsip ditarik keluar penuh (8 px, dua kali lebih jauh dari animasi baca biasa), satu map coklat… | sedang | 9s | 2 | catatan |
| **+** | **Disposisi surat masuk** | Acak tiap 60-150 detik pada jam kerja (07-16) | Caraka (pegawai standby, seragam magang) masuk dari x=-14 di LANE_DOWN, memutar lewat LANE_L ke meja stempel x=286,… | sering | 18s | 2 | layak |
| **+** | **Kalender dinas diganti** | Dipicu waktu, bukan acak murni: saat jam penonton melewati pergantian tanggal… | Kalender dinding di (158,54,16,20) digambar dengan lembar teratas terangkat lalu disobek: lembar putih 16x14… | langka | 24s | 2 | layak |
|  | **Ketuk kertas biar rata** | Setelah printer selesai mencetak, setelah stempel, atau acak di meja rapat | Tumpukan kertas (kotak 8x5 px) diangkat 3 px lalu diketukkan ke permukaan meja tiga kali, tiap ketukan bergetar 1 px | sering | 2s | 2 | catatan |
| **+** | **Nota dinas keliling paraf** | Acak tiap 10-18 menit jam kerja, hanya kalau minimal 2 dari 4 meja kerja… | Satu pegawai (pilih arsiparis/magang, kalau tidak ada pakai standby) membawa map kuning 8x6 px di tangan kanan,… | sedang | 40s | 2 | layak |
| **+** | **Penilaian SKP** | Acak 1x per 30-50 menit, jam 08-15, minimal 2 penghuni | Pintu ruang kadis terbuka. Dua pegawai antre di LANE_UP x=468 dan x=456 | jarang | 45s | 2 | layak |
| **+** | **Pulpen macet, dicoret dulu** | Dipicu 1 dari 4 saat pegawai tiba di meja stempel (edit) atau saat antre… | Di sudut kertas muncul 3 goresan pendek 3x1 px berturut-turut (goresan 1 dan 2 nyaris tidak terlihat, goresan 3… | sedang | 3s | 2 | layak |
| **+** | **Rapat daring provinsi** | Acak 1x per 20-40 menit, jam 09-15, meja rapat sedang kosong | Satu laptop di meja rapat dibuka: layar 12x8 px menyala biru berkedip lembut (alpha sinus) dan memantulkan cahaya… | sedang | 55s | 2 | layak |
| **+** | **Rapat pleno** | Semua 9 kursi meja rapat terisi (kursiKosong() === 0) selama >= 6 detik | Di tengah meja rapat muncul tumpukan berkas kecil (kotak 10x4) dan mikrofon yang sudah ada diberi LED merah menyala | jarang | 12s | 2 | layak |
| **+** | **Setor laporan bulanan** | Tanggal mesin >= 28 atau jam menit ke-00 tiap dua jam | Pegawai antre di LANE_UP pada x=110, 126, 142 hadap 'up' menuju filing kabinet (x=132) | jarang | 55s | 2 | layak |
| **+** | **Stempel basah berkilau** | Bukan acak: menempel pada ayunan stempel yang sudah ada (stampUp jatuh),… | Bekas stempel r(x+7, y-16, 5, 3) yang warnanya di-lerp '#e05050' -> '#c03030' selama 2,5 detik (mengering) | sering | 5s | 2 | layak |
|  | **Surat edaran ditempel** | Acak 1x per 20-40 menit jam kerja. Cooldown 20 menit | Humas berjalan ke LANE_UP x=355 hadap 'up', tangan kanan naik penuh, lalu selembar kertas 9x11 px menempel di papan… | jarang | 25s | 2 | catatan |
| **+** | **Surat edaran minta paraf** | Acak 1-2 kali per jam. Cooldown 25 menit | Map plastik kuning 9x7 px dibawa keliling. Di tiap perhentian, muncul 3 partikel 'ink' merah di ujung map (paraf… | sedang | 28s | 2 | layak |
| **+** | **Surat pemberitahuan padam** | Acak tiap 4 menit peluang kecil; peluang naik 5x dalam 3 menit setelah… | Selembar kertas A4 12x16 px putih ditempel di dinding di sebelah kalender (x=178, y=52), dengan garis judul merah… | jarang | 30s | 2 | layak |
| **+** | **Tamu menunggu dilayani** | Acak jam 08.00-15.00, peluang ~1 per 8 menit | Tamu berbatik dengan map biru 8x6 px masuk dari kiri, berdiri di ruang tunggu (x≈300, y=288) | sedang | 50s | 2 | layak |
|  | **Apel singkat di depan bendera** | Hari Senin jam 07.30-08.15, sekali per hari | Semua berbaris menghadap kiri ke tiang bendera (x=132), dua saf | jarang | 26s | 3 | tolak |
|  | **Arsip dipinjam bidang lain** | Acak tiap 12-25 menit jam kerja, hanya kalau boks arsip di lemari masih… | Pegawai dari bidang lain (Standby dengan pal berbeda) masuk dari pintu kiri, berdiri di lemari arsip x=54, daun… | sedang | 35s | 3 | catatan |
|  | **Auditor mencatat temuan di rak** | Ada auditor dan minimal satu pegawai sedang di rak server | Auditor berdiri di depan rak server memegang papan jalan, menunjuk ke kabel UTP yang menjuntai | jarang | 21s | 3 | catatan |
|  | **Auditor minta bukti dukung** | Ada auditor dan minimal satu pegawai lain di meja kerja | Auditor berdiri di samping meja seorang pegawai sambil memegang papan jalan (kotak 4x5 px cokelat di tangan) | sedang | 22s | 3 | catatan |
|  | **Berkas menumpuk** | >= 3 amplop tergeletak (suratLantai.length >= 3) ATAU 3 kali disposisi… | Tumpukan dus arsip di sudut bertambah 1 dus tiap tingkat (maks 3 dus ekstra, digambar bertumpuk dengan offset 2… | sedang | 0s | 3 | catatan |
|  | **Cetak massal undangan** | Acak tiap 2 menit peluang kecil; peluang naik 4x kalau meja rapat sedang… | Printer mengeluarkan partikel 'paper' terus-menerus 2 butir/detik selama 24 detik | sedang | 30s | 3 | catatan |
|  | **Disposisi balik bercap ditolak** | Acak, cooldown 6 menit, lebih sering kalau dalam 60 detik terakhir ada… | Daun pintu kadis digeser 6 px ke kiri selama 0,5 detik lalu menutup lagi (celah gelap di kusen) | sedang | 9s | 3 | catatan |
|  | **Fotokopi kilat** | Acak 1x per 5 menit, cooldown 3 menit. Tidak jalan kalau kertas-printer-habis… | Bilah pindai di bawah tutup printer: r(203, 89, 20, 1, '#dff2ff') alpha .55 turun 6 px dalam 0,35 detik, diulang 3… | sering | 14s | 3 | catatan |
|  | **Hari kejepit nasional** | Kalau tanggal hari ini adalah hari kerja yang terjepit antara akhir pekan dan… | Ruangan sengaja lengang: MIN_DI_LAYAR ditekan ke 1, jadi hanya satu standby berkeliling | jarang | 150s | 3 | catatan |
|  | **Humas mengejar kutipan kadis** | Ada humas DAN kadis di ruangan. Acak tiap 8-15 menit, cooldown 12 menit | Humas berjalan cepat (kecepatan x1,4) ke pintu ruang kadis (x452), berhenti, mengetuk (lengan menyentuh pintu 3… | jarang | 20s | 3 | catatan |
|  | **Inspeksi mendadak** | >= 3 tool call gagal (a.gagal bertambah) di seluruh ruangan dalam 60 detik,… | Pegawai berperan auditor (kalau tidak ada, lahirkan satu Standby berperan auditor lewat jagaPopulasi paksa)… | jarang | 16s | 3 | catatan |
|  | **Isi buku pinjam dulu** | Seorang pegawai non-arsiparis menuju lemari arsip sementara arsiparis ada di… | Saat pegawai sampai di lemari arsip dan hendak membuka laci, arsiparis berjalan cepat dari posisinya dan berdiri di… | sedang | 13s | 3 | catatan |
|  | **Isi buku tamu dulu** | Dipicu tepat setelah tamu masuk ruang tunggu (event tamu apa pun) | Prop baru: meja kecil 14x8 px di sisi kiri ruang tunggu (x=262, kaki y=294) dengan buku terbuka 10x5 px putih dan… | sedang | 10s | 3 | catatan |
|  | **Kadis sidak keliling** | Acak sekali per 45-90 menit, hanya jika ada minimal 3 penghuni | Pintu ruang kadis (x=452) terbuka: daun pintu digambar menyempit dari 24 px ke 6 px dalam 0.5 detik | jarang | 24s | 3 | catatan |
|  | **Lapor diri pegawai baru** | agentFor() membuat Agent baru DAN agents.size sebelumnya >= 1 | Pegawai baru masuk dari x=-14 seperti biasa, tapi singgah dulu ke mesin absen sidik jari (prop baru 7x11 px… | sering | 9s | 3 | catatan |
|  | **Lemari arsip sudah tidak muat** | Acak, cooldown 8 menit, hanya kalau belum ada dus tambahan di lantai | Tiga punggung map di drawArsip() digambar miring 2 px keluar dari raknya dan pintu lemari tidak menutup (celah 3… | sedang | 20s | 3 | catatan |
|  | **Menunggu paraf kepala dinas** | Acak, cooldown 9 menit. Terjemahan dari: timeout — menunggu sesuatu yang… | Satu penghuni berdiri di stasiun 'agent' menghadap pintu, mengetuk tiap 3,5 detik (lengan naik 0,3 detik, tiga… | sedang | 20s | 3 | catatan |
|  | **Nomor antrean dipanggil** | Acak saat ada minimal satu tamu menunggu, jam 08–15 | Prop baru kecil: papan nomor antrean 16x10 px di dinding atas ruang tunggu (x=330, y=88), angka merah 2 digit… | sering | 8s | 3 | catatan |
|  | **Pemadatan arsip** | Hanya kalau arsipPenuh sedang aktif, 1-3 menit sesudahnya | Penghuni berjabatan arsiparis (fallback: terdekat) berdiri di samping dua dus | sedang | 12s | 3 | catatan |
|  | **Pemeriksaan BPK** | Acak sekali per 45-90 menit, minimal 3 penghuni, tidak tumpang tindih dengan… | Dua auditor duduk di kursi rapat sisi jauh dengan tumpukan dus arsip tambahan (3 dus 14x10 px) di samping karpet… | langka | 75s | 3 | catatan |
|  | **Penempelan stiker inventaris** | Acak, cooldown 35 menit. Hanya sekali sampai semua perabot terlabeli | Pegawai membawa lembar stiker (kotak putih 8x6 di tangan) dan berkeliling | jarang | 60s | 3 | catatan |
|  | **Pengarahan singkat kadis** | Acak tiap 6-14 menit jam kerja, minimal 2 penghuni di paruh kanan ruangan | Kadis berdiri di ambang pintu (x=452, y=140) tanpa keluar penuh, tangan kanan bergerak menunjuk-nunjuk tiap 0,6… | sedang | 22s | 3 | catatan |
|  | **Pengumuman lewat pengeras suara** | Acak sekali per 60-120 menit, hanya jam kerja | Prop baru: toa kotak 10x6 px abu di dinding atas dekat jam (x=196, y=24) | jarang | 12s | 3 | catatan |
|  | **Plang nama ruangan dipasang** | Acak sekali per sesi halaman, minimal 25 menit setelah dimuat | Plang baru dipasang di atas pintu ruang kadis, menimpa papan biru lama di (x+2,y-20,30x14): papan baru 34x12 warna… | langka | 32s | 3 | catatan |
|  | **Rapat evaluasi dadakan** | Rantai: inspektorat-mendadak terjadi 2 kali dalam 10 menit DAN kursi rapat… | Empat penghuni (prioritas: yang tercatat gagal, lalu standby) berjalan ke meja rapat dan duduk di kursi kosong | langka | 40s | 3 | catatan |
|  | **Rapat pimpinan dadakan** | Acak tiap 8-20 menit jam kerja, hanya jalan kalau ada minimal 3 pegawai… | Pintu ruang kadis terbuka (daun pintu digambar terbuka 6 px, rongga gelap), sosok kadis muncul di ambang dan… | sedang | 50s | 3 | catatan |
|  | **Sandiman razia kata sandi** | Ada pegawai berjabatan sandiman. Acak sekali per 12-20 menit, tidak muncul… | Sandiman berjalan menyusuri baris meja kerja (y=316), berhenti 4 detik di tiap meja yang ada orangnya | jarang | 26s | 3 | catatan |
|  | **Sobek kalender** | Pagi hari 07.00-09.00 pada tanggal 1 setiap bulan (atau, untuk demo, acak… | Kalender dinding di (158, 54, 16x20) berganti: lembar lama terangkat, terlepas, lalu jatuh sebagai partikel 'paper'… | jarang | 30s | 3 | catatan |
|  | **Sosialisasi aplikasi baru** | Acak 1x per 30-60 menit, jam 09-14, minimal 3 penghuni, tidak bersamaan… | Teks X-banner sementara berganti jadi 'SOSIALISASI APLIKASI' dan diberi glow() lembut | jarang | 70s | 3 | tolak |
|  | **SPPD turun** | Acak 1x per 25-45 menit jam kerja, hanya menyasar pegawai standby (bukan sesi… | Bendahara berjalan ke pegawai sasaran, menyerahkan amplop coklat 7x5 px (berpindah dari tangan kanan bendahara ke… | jarang | 90s | 3 | catatan |
|  | **Statistisi menagih angka** | Ada statistisi dan minimal 2 pegawai lain | Statistisi berjalan dari meja ke meja (maksimal 3 meja). Di tiap meja, tiga partikel 'data' hijau-teal melompat… | sedang | 24s | 3 | catatan |
|  | **Stok kertas printer habis** | Dihitung dari pemakaian: tiap pegawai selesai bekerja di stasiun web (meja… | LED printer di drawWindow()/meja printer (219,87) berubah dari hijau berkedip jadi merah menyala tetap, dan… | sering | 24s | 3 | catatan |
|  | **Tamu dinas kabupaten tetangga** | Acak 1x per 15-30 menit, hanya jam 08-15, tidak bersamaan dengan inspeksi… | Satu tamu berbatik (pal batik sogan) masuk pintu kiri, duduk berdiri di slot 'idle' dekat dispenser | jarang | 60s | 3 | catatan |
|  | **Tamu salah ruangan** | Acak, cooldown 8 menit, hanya jam kerja | Sosok tamu (Standby berpakaian polos, tanpa lidah bahu, tas selempang 5x4 px) masuk dari tepi kiri di LANE_DOWN,… | sedang | 16s | 3 | catatan |
|  | **Apel pagi** | Jam mesin 07:15-07:45, minimal 3 penghuni di ruangan, maksimal sekali per… | Semua penghuni berbaris dua saf di karpet merah: saf depan y=236, saf belakang y=248, x mulai 172 dengan jarak 22… | jarang | 45s | 4 | catatan |
|  | **Bendera kusam diganti** | Acak pagi (07–09), lebih mungkin di hari Senin | Bendera lama (warna dibuat 12% lebih pudar sejak awal event) turun perlahan sepanjang tiang sampai ke tangan… | langka | 30s | 4 | mahal |
|  | **Berkas dioper berputar** | Ada minimal 3 pegawai. Acak tiap 7-12 menit, cooldown 10 menit | Sebuah map kuning (4x5 px) berpindah tangan: A jalan ke B ('paper' loncat), B jalan ke C, C jalan kembali ke A | sedang | 28s | 4 | mahal |
|  | **Kadis dan sekdis rapat tertutup** | Ada kadis dan sekdis bersamaan di ruangan | Sekdis berjalan ke pintu ruang kadis, pintu terbuka lalu tertutup rapat | jarang | 30s | 4 | mahal |
|  | **Kepala dinas keluar ruangan** | Acak, cooldown 14 menit, hanya jam kerja | Pintu kadis membuka (daun bergeser 8 px), keluar sosok berjabatan kadis lengkap dengan peci dan map di ketiak,… | jarang | 24s | 4 | mahal |
|  | **Kiriman dus arsip** | Acak 1x per 30 menit, jam 9-15. Cooldown 25 menit | Tiga dus jatuh berurutan di 440,206 dari y-20 dengan g=400 dan satu pantulan 2 px | jarang | 45s | 4 | mahal |
|  | **Kuota fotokopi bulan ini habis** | Acak, cooldown 6 menit. Terjemahan dari: rate limit | Prop baru: mesin fotokopi 22x26 px berdiri di kiri meja printer (x=158, dasar 118) — kotak abu dengan tutup kaca,… | sedang | 14s | 4 | mahal |
|  | **Pemohon surat menunggu** | Jam 8-15, acak tiap ~4 menit. Cooldown 6 menit | Warga berkemeja polos membawa map cokelat masuk dari kiri, berjalan ke ruang tunggu, dan BERDIRI menunggu di slot… | sering | 65s | 4 | mahal |
|  | **Rak server tidak boleh dibuka sembarangan** | Ada teknisi dan sandiman, dan teknisi menuju rak server (x390) | Teknisi berdiri di depan rak dan mengulurkan tangan ke pintu rak | jarang | 16s | 4 | mahal |
|  | **Sekdis membagi tugas** | Ada sekdis dan minimal 3 pegawai lain. Acak tiap 10-16 menit, cooldown 12… | Sekdis berdiri di tengah karpet merah (x246, y=230) memegang map | jarang | 26s | 4 | mahal |
|  | **Sidak inspektorat** | Acak, cooldown 20 menit, hanya pada jam kerja (08.00-15.00) menurut… | Sosok auditor (Standby berseragam jabatan auditor, tidak pudar — alpha penuh, supaya kelihatan tamu penting) masuk… | langka | 22s | 4 | mahal |
|  | **Tamu datang ke ruang tunggu** | Acak 1x per 25 menit, jam 8-15 saja. Cooldown 20 menit | Sosok tamu masuk dari x=-14 di LANE_DOWN memakai batik gelap tanpa lidah bahu dan membawa tas map (rect 7x5… | jarang | 50s | 4 | tolak |
|  | **Undangan rapat disebar** | Acak, cooldown 10 menit, hanya kalau >=3 kursi meja rapat kosong | Caraka masuk dari pintu kadis membawa setumpuk undangan 8x5 px, menyusuri LANE_DOWN melewati keempat meja kerja… | sedang | 26s | 4 | mahal |
|  | **Rombongan studi banding** | Jam 9-13, sangat jarang (1 per ~90 menit tampilan) | Tiga tamu berseragam batik seragam (pal sama persis, biar terbaca rombongan) masuk beriringan dari kiri dengan… | langka | 120s | 5 | mahal |

### Kultur kantor — 84 event

Yang membuat kantor terasa kantor Indonesia: ojol, gorengan, arisan, ngobrol di dispenser.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Iuran duka cita** | Acak paling banyak sekali per sesi panjang (>2 jam) | Amplop putih polos 7x5 px, tanpa partikel meriah sama sekali | jarang | 20s | 1 | layak |
| **+** | **Main HP di meja** | Acak per pegawai yang duduk di 'think' dan tidak sedang 'work' lebih dari 10… | Kotak 3x5 px gelap dengan layar 2x3 px biru muda muncul di depan dada pegawai, sedikit di bawah bibir meja | sering | 12s | 1 | layak |
| **+** | **Ngobrol di dispenser** | Otomatis kalau dua penghuni sama-sama berada di stasiun 'idle' lebih dari 3… | Dua pegawai saling menghadap (face di-set 'left' dan 'right'), badan bergoyang 1 px bergantian | sering | 16s | 1 | layak |
| **+** | **Ngopi jam sepuluh** | Jam mesin 09:40-10:20 dan 14:30-15:00, acak tiap 60-120 detik | Dua sampai tiga pegawai berkumpul di dispenser (x=326, 340, 352 di LANE_DOWN) hadap 'up', spawn('steam', 335, 268)… | sering | 25s | 1 | layak |
| **+** | **Seduh kopi sachet** | Acak sepanjang jam kerja, peluang ~1 per 90 detik per pegawai yang sedang… | Pegawai berdiri di depan dispenser (x=326..344, y=266). Gelas 3x4 px putih di tangan kanan, lampu merah dispenser… | sering | 10s | 1 | layak |
| **+** | **Baling kipas dilap** | Acak, hanya di jam kerja (08:00-15:00 waktu penonton) dan hanya kalau kipas… | Baling kipas melambat sampai berhenti (now/90 diganti kecepatan yang meluruh) dan tampak 3 garis baling diam | jarang | 24s | 2 | layak |
| **+** | **Benerin peci** | Hanya untuk jabatan berpal.head==='peci' | Peci miring 1 px ke kanan selama 0.5 s, tangan naik ke kepala (kotak 2x2 px), peci kembali lurus, tangan turun | sering | 2s | 2 | layak |
| **+** | **Dus lama, debu, bersin** | Acak 1x per 10 menit kalau ada pegawai bekerja di stasiun 'read' atau 'search' | Saat dus atau ordner ditarik: 16 partikel 'dust' dengan sebaran 40 px, life 2,4 dan alpha awal .8 (lebih tebal dari… | sedang | 7s | 2 | layak |
| **+** | **Foto pejabat miring** | Acak. Peluang naik setelah event mati-lampu-sekejap atau xbanner-roboh… | Satu drawPortrait() digambar miring: bingkai digeser jadi jajaran genjang sederhana (baris piksel digeser 1 px tiap… | sering | 18s | 2 | layak |
| **+** | **Ganti sandal jepit** | Jam 14.30 ke atas, acak per pegawai yang duduk di meja kerja lebih dari 2… | Warna kaki pegawai (2 kotak 2x3 px di bawah badan) berubah dari gelap ke cokelat sandal dengan tali 1 px terang | sedang | 8s | 2 | layak |
| **+** | **Gelas dispenser tinggal satu** | Setelah 3 pemakaian dispenser berturut dalam ruangan penuh (penghuni >=5) | Tumpukan gelas di samping dispenser (kotak 4x8 px) menyusut jadi 4x2 px | sedang | 3s | 2 | layak |
| **+** | **Gorengan naik ke meja rapat** | Acak jam 09.30-11.00 dan 14.30-16.00, peluang ~1 per 3 menit | Nampan seng 20x8 px muncul di tengah meja rapat (x=246, y=196) berisi 6 bulatan cokelat 3x3 px (bakwan/risoles) | sering | 22s | 2 | layak |
| **+** | **HP bergetar di meja kosong** | Hanya saat penghuni >=4 dan pemilik meja sedang berada di stasiun lain (bukan… | Kotak 3x5 px gelap di meja bergetar: bergeser 1 px acak tiap 3 frame selama 1 s, jeda 0.5 s, getar lagi 1 s | sedang | 3.5s | 2 | catatan |
| **+** | **Jumat bersih** | Hari Jumat jam mesin 14:00-15:30, sekali per hari | Dua pegawai mengelap perabot: satu di meja stempel, satu di lemari arsip, tangan kanan bergerak horizontal 6 px… | jarang | 50s | 2 | catatan |
| **+** | **Kaca jendela dilap** | Acak pada pagi hari (06:30-09:00 waktu penonton) dan hanya kalau tidak ada… | Kaca jendela awalnya digambar berkabut: overlay abu alpha .10 di area kaca, dan Monas di kejauhan agak buram… | jarang | 36s | 2 | layak |
|  | **Kacamata dilap di ujung baju** | Untuk jabatan yang digambar berkacamata (auditor, statistisi, analis) | 1 px kacamata hilang dari wajah, muncul di depan dada sebagai kotak 3x1 px yang bergerak memutar kecil 4 kali, lalu… | jarang | 3s | 2 | catatan |
| **+** | **Kelamaan di ruang tunggu** | Satu penghuni ber-station 'idle' tanpa tugas selama > 75 detik | Penghuni itu mengambil air (3 'steam'), lalu berjalan ke meja rapat, duduk di kursi sisi dekat dan mencoret-coret:… | sedang | 20s | 2 | layak |
| **+** | **Kertas bekas dibalik** | Saat pegawai butuh mencatat sesuatu (setelah rapat bubar, atau setelah event… | Lembar 7x5 px diambil dari kotak kertas bekas di dekat printer, dibalik (warna sisi belakang lebih putih, sisi… | sedang | 3s | 2 | catatan |
| **+** | **Keset baru di pintu** | Acak sekali per sesi halaman, minimal 10 menit setelah dimuat | Keset lama (kalau ada, kotak coklat kusam 20x6) diangkat dan dibuang, keset baru digambar di depan pintu ruang… | jarang | 22s | 2 | catatan |
| **+** | **Kipas-kipas pakai map** | Hanya saat penghuni >=5 dan fase siang (atau saat event gerah lain sedang… | Map (kotak 6x4 px) di depan dada bergerak bolak-balik 2 px, 6 kali | sedang | 4s | 2 | layak |
| **+** | **Kopi tinggal ampas** | 1-2 jam (waktu tampilan) setelah event kopi/dispenser mana pun, atau acak… | Gelas 4x5 px diangkat, dimiringkan sampai hampir mendatar (2 px), ditahan 0.6 s, lalu diturunkan | sedang | 3s | 2 | layak |
| **+** | **Neon dimatikan siang hari** | Hanya pada 09:00-15:00 waktu penonton, saat ambien().luar > 0.9 dan lampu… | Pegawai menekan saklar di dinding dekat pintu (kotak krem 5x8 di (430,120), ada 2 tombol) | sedang | 18s | 2 | layak |
| **+** | **Nguap berantai** | Hanya kalau >=3 penghuni sedang diam di meja/kursi rapat, jam 13.00-14.30… | Satu pegawai duduk: kepala mundur 1 px, mulut jadi kotak gelap 2x2 px selama 0.6 s, bahu turun | sedang | 3.5s | 2 | layak |
| **+** | **Numpang print** | Acak tiap 4-10 menit jam kerja. Cooldown 4 menit | Pegawai dari bidang lain berdiri di meja printer (x=212) hadap 'up' | sering | 22s | 2 | layak |
| **+** | **Ojol datang bawa pesanan** | Acak jam 09.00-15.00, peluang ~1 per 4 menit | Kurir jaket hijau (voxel biasa, pal hijau + helm kotak 5x4 px) masuk dari tepi kiri di LANE_DOWN, berhenti di x=34 | sedang | 14s | 2 | layak |
| **+** | **Papasan lalu salaman** | Otomatis saat dua pegawai berjalan berlawanan arah di lajur yang sama… | Kedua pegawai berhenti tepat berhadapan, badan sedikit berputar (face saling menghadap) | sering | 2.2s | 2 | layak |
| **+** | **Pedagang keliling gelar dagangan** | Acak sekali per 60-120 menit, hanya jam 11.00-14.00 | Pedagang (voxel biasa, berjilbab, pal cerah) masuk dari kiri, berhenti di tepi karpet merah (x=180, y=262), lalu… | jarang | 40s | 2 | layak |
| **+** | **Pulpen diselipkan di telinga** | Saat agen selesai di meja stempel dan tujuan berikutnya bukan meja stempel | Kotak 3x1 px biru berpindah dari meja ke sisi kepala pegawai dan tetap tergambar di sana selama dia berjalan (ikut… | jarang | 2.5s | 2 | catatan |
| **+** | **Regang badan** | Pegawai duduk di meja kerja (station 'think') tanpa tool call >45 detik | Badan naik 2 px, dua lengan diangkat jadi dua kotak 1x3 px di atas bahu selama 1 s, lalu turun | sering | 2.5s | 2 | catatan |
| **+** | **Sisa teh disiram ke pot** | Acak 10–20 menit setelah event minum/kopi mana pun, atau acak jam 10–11 dan… | Pegawai membawa gelas 3x4 px (digambar di tangan lewat drawTool), berdiri di samping tanaman pot, memiringkan… | sering | 9s | 2 | layak |
| **+** | **Telepon kantor berdering** | Acak tiap 70 detik peluang sedang. Cooldown 2 menit | Prop baru: telepon meja 12x7 px abu tua dengan gagang, diletakkan di meja stempel (x=300, y=90) | sering | 12s | 2 | layak |
| **+** | **Tong sampah penuh** | Counter naik tiap kali ada partikel 'paper' yang mendarat atau tiap event… | Tong hijau di drawTunggu() (bx+106, by+6) digambar dengan gundukan kertas putih-krem menyembul 5 px di atas bibir,… | sedang | 30s | 2 | layak |
| **+** | **Tukang bakso lewat** | Acak jam 10.00-16.00, peluang ~1 per 6 menit | Di dalam pemandangan jendela (drawWindow, x=212), gerobak 10x6 px oranye bergerak pelan dari kanan ke kiri di garis… | sedang | 18s | 2 | layak |
| **+** | **Undangan kondangan diedarkan** | Acak, lebih sering hari Kamis-Jumat sore | Setumpuk undangan merah muda 6x8 px dengan pita emas 1 px di tangan seorang pegawai | sedang | 18s | 2 | layak |
| **+** | **Amplop patungan keliling** | Acak 1-2 kali per jam kerja. Cooldown 20 menit | Amplop cokelat 7x5 px dengan tulisan garis 3 px dibawa satu pegawai | sedang | 26s | 3 | catatan |
| **+** | **Analis kebijakan vs analis sistem** | Ada analis_kebijakan dan analis_sistem bersamaan | Keduanya berdiri di depan filing kabinet (x132), berhadapan | sedang | 18s | 3 | catatan |
| **+** | **Antre stempel** | Dua penghuni memanggil goTo('edit') dengan selisih < 2.5 detik, atau slot… | Yang datang belakangan berhenti satu slot di samping (offset 19 px seperti slotKe) tapi hadap 'left'/'right' ke… | sedang | 6s | 3 | catatan |
| **+** | **Arsiparis mengajari magang** | Ada arsiparis dan magang, lemari arsip (x54) sedang tidak dipakai sesi nyata | Keduanya berdiri berdampingan di depan lemari arsip menghadap up | sedang | 18s | 3 | catatan |
| **+** | **Berpapasan, saling minggir** | Dua agen berjalan berlawanan arah di lajur sama (LANE_UP/LANE_DOWN) dan… | Keduanya berhenti 0.4 s, salah satu (yang jabatannya lebih rendah) bergeser 5 px ke tepi lajur dan menunduk sedikit… | sering | 2.5s | 3 | catatan |
| **+** | **Bersandar, kursi diayun** | Agen duduk di meja kerja >60 detik tanpa event, jam kerja siang | Badan miring ke belakang 2 px, kaki kursi depan terangkat 1 px, badan ikut mengayun pelan (sinus, amplitudo 1 px, 3… | sedang | 4s | 3 | catatan |
| **+** | **Cari colokan pinjam charger** | Acak tiap 5-9 menit kalau ada minimal 3 pegawai | Seorang pegawai berdiri dan berjalan ke dua meja berturut-turut | sering | 18s | 3 | catatan |
| **+** | **Dus arsip ditumpuk** | Acak, peluang naik kalau stasiun read (lemari arsip) dipakai lebih dari 4… | Dus baru muncul di depan pintu ruang kadis (452, 300) — kotak coklat 24x18 dengan lakban krem | sedang | 28s | 3 | catatan |
| **+** | **Galon habis, angkat yang baru** | Terpicu setelah stasiun 'idle' dipakai kumulatif 90 detik (galon memang habis… | Galon biru di drawTunggu (bx+84, by-30) digambar kosong: warna dipucatkan ke '#cfe4f2' dan tidak ada gelembung | sering | 24s | 3 | catatan |
| **+** | **Gantian jaga ruang tunggu** | Ada tamu/pemohon di ruang tunggu (STATIONS.idle terisi) lebih dari 60 detik,… | Pegawai yang sedang di ruang tunggu melambai ke arah meja kerja | sedang | 12s | 3 | catatan |
| **+** | **Humas latihan sambutan** | Ada humas, dan ruangan sedang relatif sepi (kurang dari 3 sesi nyata) | Humas berdiri menghadap X-banner memegang kertas kecil. Tiap 3 detik satu tangan terangkat dalam pose berbeda (3… | jarang | 20s | 3 | catatan |
| **+** | **Istirahat sholat** | Jam 12.00-12.30 (dan 15.15-15.45), sekali per rentang | Sebagian pegawai (setengahnya, dibulatkan ke atas) berjalan keluar lewat tepi kiri di LANE_DOWN dan dihapus… | sering | 45s | 3 | catatan |
| **+** | **Kabar cuaca di grup** | Muncul 5-15 detik setelah salah satu dari mendung-menggantung, gempa-kecil,… | Tidak ada perubahan ruangan. Yang tampil: dua sampai tiga pegawai berhenti di tempat dan sebuah persegi 7x9 px… | sedang | 25s | 3 | catatan |
| **+** | **Kabid dan kasi beda pendapat** | Ada kabid dan kasi, keduanya sedang tidak di stasiun sibuk | Keduanya berdiri berhadapan di meja rapat (sisi berlawanan) | sedang | 15s | 3 | catatan |
| **+** | **Kasi mengecek meja stafnya** | Ada kasi dan minimal 2 pegawai di meja kerja | Kasi berjalan pelan menyusuri baris meja kerja, berhenti 4 detik di tiap meja berisi orang, tangan di belakang… | sering | 19s | 3 | catatan |
| **+** | **Kasi menyuruh magang fotokopi** | Butuh minimal satu pegawai berjabatan kasi/kabid dan satu magang (sesi nyata… | Kasi berdiri di mejanya dan mengangkat satu lengan (lambaian 2 frame) | sedang | 14s | 3 | catatan |
| **+** | **Kerja bakti berkas** | Rantai penyelesaian: berkasTunggak >= 2 DAN jumlah penghuni menganggur >= 3… | Tiga penghuni berbaris di antara sudut dus dan lemari arsip (x 40, 70, 100 pada LANE_UP) dan mengoper: tiap 1.5… | jarang | 35s | 3 | catatan |
| **+** | **Kopi pagi di dispenser** | Jam 7-9.30, acak 1x per 6 menit, butuh >=2 pegawai idle | Keran dispenser mengalir: garis air 1x6 px '#bcdcf0' alpha .7 selama 1,5 detik, gelas terisi 1 px tiap 0,3 detik | sering | 20s | 3 | catatan |
| **+** | **Kunci lemari hilang** | Acak saat ada pegawai menuju stasiun read (lemari arsip) | Lemari arsip digambar tertutup dengan gembok kecil 3x4 px kuning di tengah pintu, dan laci tidak bisa dibuka… | jarang | 30s | 3 | catatan |
| **+** | **Kupu-kupu masuk, katanya ada tamu** | Pagi-siang, acak 1 kali per ~20 menit. Cooldown 25 menit | Kupu-kupu 4x3 px kuning-cokelat masuk lewat jendela, terbang naik-turun pelan (langkah patah-patah 4 px, sayap dua… | jarang | 30s | 3 | catatan |
| **+** | **Kursi rapat diluruskan** | Ruangan sepi (penghuni <=2) dan ada >=2 kursi meja rapat yang tercatat… | Satu pegawai (biasanya standby) menyusuri sisi meja rapat, tiap kursi digeser masuk 2 px dengan jeda 0.6 s | sedang | 4s | 3 | catatan |
| **+** | **Rebutan arah kipas** | Acak jam 11.00-15.00 saat ada minimal 2 pegawai duduk di meja kerja | Kipas berdiri (x=400) yang biasanya diam arahnya diputar: kepala kipas digeser 3 px ke kiri lalu ke kanan, dan… | sedang | 18s | 3 | catatan |
|  | **Senam Jumat sehat** | Hanya hari Jumat pada jam mesin 07:30-08:10, sekali per hari (simpan tanggal… | Semua penghuni berbaris grid 3 kolom x 2 baris di karpet (x=190,246,302 | langka | 60s | 3 | tolak |
| **+** | **Senior menunggui layar junior** | Ada pranata_madya/analis_sistem dan pranata_pertama/pranata_muda yang sedang… | Yang senior berdiri di belakang kursi yang junior, sedikit membungkuk (kepala turun 2 px) | sering | 17s | 3 | catatan |
| **+** | **Tamu merokok, ditunjuk rambu** | Hanya kalau ada tamu di ruang tunggu (stasiun 'idle' terisi tamu) lebih dari… | Titik jingga 1 px muncul di depan wajah tamu, dari situ keluar partikel asap abu-abu naik pelan (varian 'steam'… | sedang | 14s | 3 | catatan |
|  | **Abang gorengan lewat** | Jam 9-11 atau 14-16, acak tiap ~15 menit | Penjual bertopi caping berhenti di ambang pintu kiri (tidak masuk) dengan keranjang gorengan 12x7 px di depan… | sedang | 45s | 4 | mahal |
|  | **Azan Zuhur** | Terikat jam: sekitar 12.00 (dan varian ringan pukul 15.15 untuk asar, dengan… | Tidak ada perubahan langit. Yang berubah: seluruh spawn partikel kerja dihentikan 8 detik pertama sehingga ruangan… | sering | 50s | 4 | mahal |
|  | **Gorengan sore** | Jam mesin 15:00–16:30 DAN >= 3 penghuni yang state!=='work' selama 20 detik… | Kardus gorengan (kotak 12x6 coklat dengan 3 titik kuning) muncul di ujung meja rapat sisi dekat | sedang | 26s | 4 | mahal |
|  | **Jam istirahat** | Terikat jam 12.15-13.00, dimulai sekali setelah azan-zuhur selesai | Di meja rapat muncul empat kotak nasi 7x5 px cokelat muda '#c9a86a' dengan tutup putih, plus dua gelas 3x4 px | sering | 110s | 4 | mahal |
|  | **Jam istirahat berdenting** | Tepat pukul 12.00 dan 16.00 waktu mesin penonton (toleransi 5 detik) | Kedua jarum jam dinding sejajar, lalu kilau: glow(168, 38, 7, '#ffe9a8', .35) selama 12 frame dan dua titik putih 1… | sedang | 45s | 4 | tolak |
|  | **Jam pulang, antre absen** | Terikat jam 16.00-16.30 (Jumat 16.30). Sekali per hari tampilan | Prop kecil baru permanen: mesin absen sidik jari di dinding dekat pintu kadis, kotak 10x14 px '#e4e8e2' dengan… | sedang | 85s | 4 | mahal |
|  | **Karpet rapat digulung** | Hanya kalau meja rapat kosong (tidak ada agent/peserta di stasiun 'rapat')… | Karpet merah di bawah meja rapat menyusut dari kedua sisi jadi gulungan 8 px di tepi kiri karpet, memperlihatkan… | langka | 34s | 4 | mahal |
|  | **Kotak dana sosial keliling** | >= 3 penghuni duduk di stasiun 'think' bersamaan selama 30 detik DAN tidak… | Seorang penghuni (humas kalau ada) membawa kotak 8x6 px bertutup di depan dada dan berjalan dari meja kerja ke meja… | jarang | 30s | 4 | mahal |
|  | **Kurir paket** | Jam kerja (8-16), acak tiap ~7 menit. Cooldown 9 menit | Kurir berjaket oranye + helm masuk 8 px dari pintu kiri, berhenti di ambang (tidak masuk jauh — sopan), memegang… | sering | 35s | 4 | mahal |
|  | **Kursi kurang** | agents.size > 6 (semua meja kerja penuh dan ruang tunggu terpakai) selama >=… | Seorang penghuni berjalan ke meja rapat, mengambil satu kursi dari sisi jauh (kursi itu hilang dari drawKursiJauh),… | jarang | 12s | 4 | mahal |
|  | **Kursi tambahan dari gudang** | Bukan acak murni: dijalankan saat jumlah peserta rapat melebihi KURSI_TOTAL,… | Pegawai keluar lewat pintu kadis, kembali 4 detik kemudian menyeret dua kursi plastik putih bertumpuk (kotak 8x14… | sedang | 26s | 4 | mahal |
|  | **Lepas sambut sesi purna** | Sesi berakhir (SessionEnd) setelah Date.now() - a.sejak > 30 menit DAN jumlah… | Sebelum pegawai itu berjalan keluar ke x=-20, penghuni lain yang tidak sedang state 'work' pindah ke lajur… | jarang | 10s | 4 | mahal |
|  | **Ngobrol di lorong** | Acak tiap 3-8 menit jam kerja kalau ada minimal 2 pegawai standby/idle | Dua pegawai berhenti berhadapan di LANE_DOWN sekitar x=196 dan x=214 (tepat di mulut koridor), hadap saling… | sering | 30s | 4 | mahal |
|  | **Ojol antar kopi** | Jam 9-11 dan 14-16, acak tiap ~8 menit. Cooldown 10 menit | Ojol berjaket hijau + helm masuk 6 px dari pintu kiri, memegang kantong plastik 6x7 px berisi dua gelas | sering | 30s | 4 | mahal |
|  | **Payung basah di pojok** | Hanya saat atau sampai 2 menit setelah hujan-deras-jendela | Prop kecil sementara: payung terlipat berdiri disandarkan di dinding dekat tanaman pot (x=36, y=250) — batang 1x22… | sedang | 75s | 4 | mahal |
|  | **Pel lantai** | Acak dengan jadwal: peluang jauh lebih besar pada 07:00-08:00 dan 15:30-16:30… | Pegawai kebersihan (pakai wearpack) menyeret ember pel dan mendorong kain pel: pita lantai basah selebar 20 px… | sedang | 50s | 4 | mahal |
|  | **Petugas kebersihan mengepel** | Acak jam 07.00-08.00 dan 16.00-17.00, sekali per rentang | Petugas berseragam biru dengan gagang pel 1x14 px berjalan pelan menyusuri LANE_DOWN dari x=60 ke x=420 | sedang | 35s | 4 | mahal |
|  | **Rapat molor, kopi masuk** | Ada entri rapatAktif dengan now - sejak > 5 menit DAN jumlah yang duduk >= 3 | Seorang penghuni yang tidak sedang bekerja (prioritas standby) mengambil gelas di dispenser (berdiri 2 detik, 3… | sedang | 20s | 4 | mahal |
|  | **Sales mesin fotokopi** | Jam 9-15, acak tiap ~12 menit. Cooldown 20 menit | Sales berkemeja putih + tas jinjing hitam masuk sampai tengah ruangan tanpa dipersilakan, membawa brosur mengkilap… | sedang | 55s | 4 | mahal |
|  | **Satpam patroli** | Acak tiap ~6 menit, dan selalu sekali saat pergantian fase ke malam | Satpam seragam biru tua + topi (pal baru di JABATAN: main '#2b3f6b', head 'topi') masuk dari kiri di LANE_DOWN,… | sering | 40s | 4 | mahal |
|  | **Senam Jumat pagi** | Bukan acak: hari Jumat, jam 07.00-08.00, sekali per hari, dan tidak boleh… | Semua penghuni berkumpul di karpet merah dalam formasi longgar (grid 3 kolom, jarak 26 px), badannya naik-turun 2… | jarang | 20s | 4 | mahal |
|  | **Anak pegawai ikut ke kantor** | Hanya di luar jam kerja inti (jam 6-8 atau 15-18), acak, cooldown 40 menit | Anak kecil (tinggi 2/3 pegawai, kaus merah, tanpa peci) berlari mengitari meja rapat: path melingkar tetap lewat… | jarang | 80s | 5 | tolak |
|  | **Mahasiswa magang kebingungan** | Jam 8-12, acak tiap ~15 menit. Cooldown 25 menit | Mahasiswa berjaket almamater (warna kuning/hijau, pal baru) berdiri di depan filing kabinet memegang setumpuk map | sedang | 60s | 5 | mahal |
|  | **Pel lantai, awas licin** | Acak 1x per 12 menit, hanya jam 7-9 atau 15-16, atau langsung setelah… | Magang berjalan menyusuri LANE_DOWN kiri ke kanan dengan kecepatan 0,6x, tangan memegang gagang pel (garis 1x14 px… | sedang | 35s | 5 | mahal |
|  | **Petugas kebersihan ngepel** | Acak sekali di fase pagi (jam 6-8) dan sekali di sore (16-18) | Petugas berbaju kaus abu + celemek masuk dari kiri membawa ember pel (kotak 8x6 px) dan gagang pel 1x14 px | sedang | 70s | 5 | tolak |

### Cuaca & waktu — 13 event

Yang datang dari luar jendela dan dari tanggal.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
|  | **Hujan deras** | Acak 1x per 40 menit, bobot naik saat jam 14-17 | Semua di dalam ctx.clip kaca (186,26,52,42): 26 garis 1x3 px '#9fb6cc' alpha .5, vy 240 px/detik, vx -30 (miring),… | sedang | 150s | 1 | layak |
|  | **Hujan deras, petir menyambar** | Acak tiap 3 menit peluang kecil, lebih sering sore (15.00–18.00) | Di dalam klip kaca jendela drawWindow: 30 partikel hujan (garis 1x3 px '#9db4c4' alpha .5) turun miring, digambar… | jarang | 60s | 2 | layak |
| **+** | **Kilat menyambar** | Hanya selagi hujan-deras berjalan; peluang 12% tiap 15 detik | Dua kilat: frame 1 fillRect sekanvas '#ffffff' alpha .55, frame 2 alpha .18, jeda 4 frame, kilat kedua 1 frame… | jarang | 3s | 2 | catatan |
| **+** | **Mendung menggantung** | Acak sepanjang jam 09.00-16.30, peluang ~1 per 6 menit | Modifier cuaca global yang mengalikan hasil ambien(): A.luar turun ke 0.35 dalam 6 detik, A.awan digeser ke kelabu… | sering | 70s | 2 | layak |
| **+** | **Gelombang panas siang** | Jam 11-14, A.luar > 0.9, tidak hujan. Menyala 1x per 20 menit, cooldown 15… | Pita lantai y=110..150 dekat jendela digeser per baris: untuk tiap y, dx = round(sin(now/260 + y*0.5)*1.5), lalu… | sering | 120s | 3 | catatan |
|  | **Istirahat solat** | Jam mesin 11:50-12:15 dan 15:00-15:20, sekali per rentang | Sebagian pegawai berjalan keluar lewat pintu kiri satu per satu berjeda 1,5 detik dan hilang dari layar | sering | 75s | 3 | tolak |
| **+** | **Kabut asap** | Acak, hanya jam 06.00-10.00, peluang kecil dan tidak boleh berbarengan dengan… | cuaca menggeser awan dan langit ke kuning kecokelatan ('#b09a68' untuk awan, atas '#9a8a68', bawah '#c8b184'),… | langka | 130s | 3 | catatan |
| **+** | **Kaca berembun** | Jam 5.4-7.2, atau 0-3 menit setelah hujan-deras berhenti | Kaca dilapisi mask sel 2x2 px (26x21 sel). Sel bernilai 1 digambar r(...,2,2,'#dfe8ee') alpha .22 — hasilnya buram… | sedang | 120s | 3 | catatan |
| **+** | **Panas terik** | Acak jam 11.00-14.30 saat tidak ada event cuaca lain | cuaca menaikkan A.luar ke 1 dan menggeser amb ke '#ffd9a0' dengan ambA 0.06 — seluruh ruangan menguning | sering | 80s | 3 | catatan |
| **+** | **Senyap magrib** | Sekali sehari saat jam melewati 17.9 (mengikuti FASE_HARI yang sudah ada) | Selubung ruangan di-lerp tambahan ke '#c8642e' dengan alpha +0,04 selama 8 detik lalu kembali | sedang | 70s | 3 | catatan |
|  | **Azan dari masjid sebelah** | Otomatis saat jam mesin melewati 12.0 dan 15.3 (perkiraan zuhur/asar) | Tidak ada sprite baru: kubah kecil 6x4 px sudah bisa ditambahkan di kejauhan pada pemandangan jendela dan diberi… | sedang | 100s | 4 | tolak |
|  | **Banjir di luar** | Hanya setelah dua hujan-deras-jendela dalam satu sesi tampilan, dan jam… | Di dalam kaca, delapan baris terbawah siluet kota diganti bidang air '#5f7f96' dengan dua garis riak 1 px yang… | langka | 110s | 4 | mahal |
|  | **Laron menyerbu lampu** | Malam (lampu > 0.8) dan acak 1 kali per ~30 menit | 30-40 partikel 'laron' (1 px krem) berputar tak beraturan di bawah dua lampu neon, radius 10-26 px | jarang | 75s | 4 | mahal |

### Hewan & tamu — 20 event

Makhluk dan orang yang tidak diundang masuk ruangan.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Ada yang lari di atas plafon** | Acak, lebih sering malam dan jam sepi. Cooldown 18 menit | Tidak ada hewan yang terlihat. Yang tampak: getaran kecil pada garis sambungan plafon (baris y=2..4 bergeser 1 px… | sedang | 5s | 2 | catatan |
| **+** | **Burung hinggap di kusen** | Acak jam 06.00-17.00 saat ambien().luar > 0.5 | Burung gereja 4x4 px cokelat hinggap di kusen bawah jendela (x≈230, y = kusen) | sedang | 18s | 2 | layak |
|  | **Cicak berburu di lampu neon** | Acak tiap ~45 dtk, prioritas malam. Cooldown 3 menit | Cicak 6x2 px abu pucat merayap di dinding di sekitar lampu neon (cx 170 atau 410, y 16..30): diam 2 dtk, lalu… | sering | 25s | 2 | catatan |
| **+** | **Kucing kantor mampir** | Acak sekali per 30-60 menit. Cooldown 30 menit | Kucing oranye 9x5 px (badan 3 px, kepala 3x3 px, ekor 1x4 px yang bergoyang) masuk dari tepi kiri di y=262,… | jarang | 45s | 2 | layak |
| **+** | **Lalat nabrak kaca jendela** | Siang (luar > 0.6), acak tiap ~2 menit. Cooldown 5 menit | Titik 1 px hitam memantul di dalam bingkai jendela (186..238, 26..68): gerak lurus cepat, membentur kaca, berbalik… | sering | 16s | 2 | catatan |
| **+** | **Tamu salah alamat** | Acak tiap 15-30 menit jam kerja. Cooldown 12 menit | Orang berbaju bebas (pal abu polos, tanpa lidah bahu) masuk dari pintu kiri, berhenti di tengah LANE_DOWN (x=200),… | sedang | 20s | 2 | layak |
| **+** | **Tikus lewat kolong** | Acak tiap ~5 menit, malam lebih sering. Cooldown 10 menit | Bayangan tikus 5x2 px berlari cepat (110 px/dtk) menyusuri garis kaki dinding di y 118, dari kolong lemari arsip (x… | sedang | 6s | 2 | layak |
| **+** | **Tokek bunyi dari plafon** | Hanya malam (ambien().lampu > 0.7), acak tiap ~4 menit | Tidak ada sprite tokeknya — cuma bayangan gelap 8x3 px bergeser pelan di sudut plafon kiri atas (x 20, y 6), lalu… | sedang | 14s | 2 | catatan |
| **+** | **Capung masuk, tanda mau hujan** | Hanya 3–8 menit SEBELUM CUACA.hujan naik di atas 0.3 (dipicu saat… | Capung 3x1 px dengan dua sayap 1 px yang berkedip tiap frame, terbang zig-zag rendah dari jendela ke tengah ruangan… | jarang | 12s | 3 | catatan |
| **+** | **Kucing kantor lewat** | Acak 1x per 15 menit, cooldown 12 menit | Entitas ringan, bukan Agent: badan 7x4 '#c9a06a' dengan garis punggung 1 px lebih gelap, kepala 4x4, dua telinga 1… | sedang | 40s | 3 | catatan |
| **+** | **Kucing naik ke laptop** | Acak, hanya kalau ada pegawai berstatus 'work' di stasiun think minimal 10 dtk | Kucing melompat dari lantai ke papan meja kerja yang sedang dipakai (MEJA_KERJA_X[i], y=306): 3 frame lompat (y… | sedang | 35s | 3 | catatan |
| **+** | **Kucing tidur di rak server** | Acak, lebih sering malam (ambien().lampu > 0.5) karena rak hangat | Kucing meringkuk di puncak rak PC server (x 380, y 30), menutupi dua LED bagian atas — LED itu tidak berkedip… | jarang | 70s | 3 | catatan |
| **+** | **Laron mengerubungi neon** | Hanya saat A.lampu>0.7 (malam) dan tidak sedang mati lampu | 12–18 partikel baru 'laron': kotak 1 px '#e6d8a8' yang tidak jatuh (g=0) tapi mengorbit acak dalam radius 14 px di… | jarang | 35s | 3 | catatan |
| **+** | **Nyamuk jam pulang** | Jam 16.5-19 (senja) atau setelah event laron | Titik 1 px gelap terbang dengan lintasan sinus ganda (amplitudo 6 px, frekuensi beda di x dan y) mengelilingi… | sering | 20s | 3 | catatan |
|  | **Anak kucing di dus arsip** | Acak, peluang kecil per 5 menit, hanya jam 07-16 (ambien().jam) | Dua kepala anak kucing 3x3 px muncul dari bibir dus arsip (prop drawDus), bergantian nongol-sembunyi tiap 1,5 dtk | jarang | 60s | 4 | mahal |
|  | **Burung nyasar masuk jendela** | Siang (luar > 0.8), acak 1 kali per ~25 menit | Burung gereja 5x4 px masuk dari jendela (212, 60), terbang dalam lintasan bezier acak melintasi ruangan setinggi y… | jarang | 18s | 4 | mahal |
|  | **Kucing tidur di karpet rapat** | Acak, peluang kecil tiap 60 dtk, hanya kalau kursi rapat terisi < 3 | Kucing oranye 9x5 px meringkuk di karpet merah pada (238, 244), tepat di depan sisi meja rapat | sering | 90s | 4 | mahal |
|  | **Laron selepas hujan** | Hanya 0-60 detik setelah hujan-deras berhenti DAN A.lampu > 0.7 (malam) | Partikel baru 'laron': 1 px '#e8dcb8' dengan sepasang sayap 1 px alpha .4 di kiri-kanan, 14 butir mengorbit tiap… | jarang | 60s | 4 | tolak |
|  | **Semut mengular ke gorengan** | Hanya kalau event abang-gorengan sudah pernah jalan dan bungkus gorengan… | Barisan 14 titik 1 px hitam bergerak berurutan sepanjang jalur tetap dari ubin retak di (120, 300) memanjat kaki… | sedang | 50s | 4 | mahal |
|  | **Tamu datang** | agents.size === 0 (cuma standby di ruangan) selama >= 90 detik, jam mesin… | Sosok tamu (Agent khusus, palet batik gelap + tas kotak 5x4 di tangan, bukan sesi) masuk dari x=-14, singgah ke… | jarang | 60s | 4 | mahal |

### Perayaan — 21 event

Tujuh belasan, Korpri, hari batik, ulang tahun, lebaran.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Hari batik** | Tanggal 2 Oktober, berlaku sepanjang hari tampilan | Semua pegawai berganti seragam: palet setiap agen ditimpa varian batik — main diganti cokelat sogan '#6b4a2a' atau… | langka | 40s | 2 | layak |
| **+** | **Hari Korpri** | Tanggal 29 November, jam 07.00-10.00. Sekali per hari | Semua pegawai berganti ke seragam Korpri: main biru tua '#28406b' dengan pattern motif '#4a6a9c' — beda jelas dari… | langka | 60s | 2 | catatan |
| **+** | **Hormat bendera** | Tanggal 17 (bulan apa pun) atau Senin jam mesin 07:20-07:50, sekali per hari | Semua penghuni berhenti di tempat dan hadapnya diputar ke tiang bendera, tangan kanan diangkat ke dahi (pose… | langka | 12s | 2 | catatan |
| **+** | **Kocok arisan bulanan** | Acak sekali per 2 jam, hanya jika ada minimal 4 penghuni | Toples bening 10x12 px dengan gulungan kertas 1x3 px di dalamnya, digoyang kiri-kanan 2 px pada 4 Hz di atas meja… | jarang | 22s | 2 | layak |
| **+** | **Oleh-oleh dinas luar** | Acak sekali per 90 menit. Cooldown 90 menit | Kardus oleh-oleh 18x12 px cokelat dengan pita merah, diletakkan di meja rapat, tutupnya terbuka jadi dua flap 2 px | jarang | 20s | 2 | layak |
| **+** | **Ulang tahun pegawai** | Acak sekali per 2 jam, atau dipicu saat jumlah sesi mencapai kelipatan… | Kue 14x8 px cokelat dengan krim putih di meja rapat, satu lilin 1x3 px dan api 1x1 px yang berkedip | jarang | 24s | 2 | layak |
| **+** | **Foto bersama untuk grup WA** | Acak sekali per 2 jam, atau otomatis 10 detik setelah event… | Semua peserta berbaris di karpet merah menghadap ke depan (face 'down'), satu orang berdiri di y=270 memegang HP… | jarang | 16s | 3 | catatan |
| **+** | **Kembang api tahun baru** | 31 Desember jam 23.30 sampai 1 Januari jam 00.30 | Di dalam clip kaca jendela, roket 1 px naik dari siluet kota ke y sekitar 34, lalu meledak jadi 16 partikel yang… | langka | 45s | 3 | catatan |
| **+** | **Penghargaan zona integritas** | Acak 1x per 90-150 menit, minimal 4 penghuni, jam 09-15 | X-banner ZONA INTEGRITAS diberi glow(x, y, 26, P.gold, 0.12) yang berdenyut | langka | 35s | 3 | catatan |
| **+** | **Piala voli Antar-OPD dipajang** | Acak, peluang kecil, mengikuti event perayaan lain (mis | Piala kecil 6x9 px emas (mangkuk 6x4, batang 2x3, alas 4x2) diletakkan di atas lemari arsip (x=54, y=~118 di sisi… | langka | 16s | 3 | catatan |
| **+** | **Tumpeng syukuran** | Acak 1x per 60 menit, jam 9-14, butuh >=3 pegawai di ruangan dan meja rapat… | Prop kerucut di tengah meja rapat: 12 baris trapesium '#f2c14e' yang menyempit ke atas (lebar 18 -> 2), puncak 2 px… | langka | 45s | 3 | catatan |
|  | **Buka puasa bersama** | Hanya saat ramadan-siang-sunyi aktif dan jam mencapai 17.45-18.15 | Meja rapat disulap: sembilan kotak takjil 6x4 px '#d9b46a' berjajar di sepanjang meja, tiga gelas teh 3x5 px… | jarang | 100s | 4 | mahal |
|  | **Foto bersama** | Acak 1x per 60-120 menit, minimal 4 penghuni, atau selalu setelah event… | Semua penghuni berbaris dua saf rapat di karpet merah (saf depan y=240, belakang y=250, jarak 18 px) hadap 'down' | langka | 25s | 4 | mahal |
|  | **Jatah kuota cair** | Hanya boleh jalan 2-4 menit setelah kuota-fotokopi-habis pernah terjadi,… | Caraka (sosok Standby berjalan sekali lewat) masuk dari tepi kiri di LANE_DOWN membawa rim kertas 10x6 px putih di… | jarang | 10s | 4 | mahal |
|  | **Nasi kotak datang** | Bukan acak murni: hanya kalau >=3 kursi meja rapat terisi terus-menerus… | Caraka masuk dari pintu kadis membawa tiga kotak putih 9x5 px bertumpuk, berjalan ke ujung kanan meja rapat dan… | sedang | 34s | 4 | mahal |
|  | **Wartawan motret di depan X-Banner** | Jam 9-15, acak per ~25 menit. Cooldown 40 menit | Wartawan berompi cokelat dengan kamera 6x4 px + lensa masuk, berdiri di LANE_DOWN menghadap X-banner ZONA INTEGRITAS | jarang | 45s | 4 | mahal |
|  | **Halal Bihalal** | Hari pertama masuk kerja setelah Idulfitri (tanggal dari konfigurasi), jam… | Dekorasi: dua ketupat 7x7 px anyaman hijau '#4f8a56' digantung di kiri-kanan Garuda dengan benang 1 px, bergoyang… | langka | 120s | 5 | mahal |
|  | **Hari berpakaian adat** | Tanggal tertentu (mis. 2 Mei, hari jadi daerah) atau acak sangat kecil di… | Seragam semua pegawai berganti: kain bermotif garis-garis (2 warna berselang tiap 2 px) di badan, ikat… | langka | 45s | 5 | tolak |
|  | **Lomba makan kerupuk** | Hanya di bulan Agustus, siang hari (13.00-15.00), dan hanya kalau minimal… | Tali rafia 1 px '#e8d8a0' direntang mendatar di y=200 dari x=180 sampai x=310, di atas karpet merah | langka | 90s | 5 | mahal |
|  | **Tumpengan syukuran** | Sangat jarang: sekali per sesi yang berjalan lebih dari 3 jam, atau saat… | Kerucut nasi kuning 16 px tinggi (segitiga bertingkat dari kotak: 14x2, 10x2, 6x2, 3x2 px) di atas tampah… | langka | 35s | 5 | tolak |
|  | **Upacara tujuh belasan** | Tanggal 17 Agustus, jam 07.00-09.00. Sekali | Dekorasi bulan Agustus: sembilan bendera segitiga merah-putih 5x4 px digantung berjajar di sepanjang dinding atas… | langka | 100s | 5 | mahal |

### Suasana — 31 event

Efek visual murni — bagus karena caranya digambar, bukan karena ceritanya.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Detak jam terdengar** | Hanya saat penghuni <=1 (termasuk standby) dan tidak ada tool call >30 detik | Jarum detik di drawClock digambar melompat tegas tiap detik (bukan geser mulus) dan 1 px lebih tebal | sedang | 4s | 1 | layak |
| **+** | **Ngelirik jam dinding** | Acak, bobot naik tajam pada menit 45-59 tiap jam dan pada fase senja | Pegawai menoleh ke arah jam dinding (168,38): face berubah ke 'up', kepala geser 1 px ke arah jam | sering | 2s | 1 | layak |
| **+** | **Sorot mobil menyapu plafon** | Acak saat malam (lampu > 0.6). Cooldown pendek 3–6 menit, boleh muncul… | Pita cahaya pucat (#dfe8ff, alpha 0.06) selebar 26 px meluncur dari kanan ke kiri di dinding atas (y0..70) lalu… | sering | 3s | 1 | layak |
| **+** | **Usap tengkuk sebentar** | Setelah agen menyelesaikan rangkaian tool call panjang (>=4 stasiun berturut)… | Satu tangan naik ke belakang leher (kotak 2x2 px muncul di sisi kepala), kepala menunduk 1 px, lalu tangan turun | sering | 2s | 1 | layak |
| **+** | **Bayangan awan lewat** | Acak 1x per 3 menit, hanya kalau A.luar > 0.6 dan tidak sedang hujan | Satu pita gelap miring melintas lantai: poligon lebar 130 px condong 18 derajat, bergerak x dari -140 ke W+40… | sering | 11s | 2 | layak |
| **+** | **Bersiul pelan sendirian** | Tepat satu penghuni nyata di ruangan, sudah >2 menit tanpa teman, jam kerja | Tiga partikel 'talk' sangat kecil (s:1, alpha 0.5) keluar berjeda 1 s dari depan wajah, naik lebih pelan dari… | jarang | 4s | 2 | layak |
| **+** | **Bulan purnama** | Malam saja (A.bulan > 0.6, jam 19.30-04.00) dan hanya kalau langit cerah | Bulan di drawWindow (x226, y37) dibesarkan radius 4 -> 7 px, glow dinaikkan radius 10 -> 18 dengan alpha 0.5, kawah… | jarang | 90s | 2 | layak |
| **+** | **Debu menari di berkas cahaya** | Selama A.sinarA > 0.09: 1 butir per detik acak, plus 6 butir sekaligus tiap… | Partikel baru 'motes': 1 px '#e8dcc0', life 6, vy -3, vx dihitung ulang tiap frame sebagai sin(life*3)*4 sehingga… | sering | 6s | 2 | catatan |
| **+** | **Gelas menumpuk di meja yang paling lama** | Seorang agen sesi nyata sudah hidup lebih dari 30 menit | Satu gelas kecil (3x4 px, cincin putih di bibirnya) ditambahkan di sudut meja kerja pegawai itu, jadi tumpukannya… | sedang | 8s | 2 | layak |
| **+** | **Kucing berantem di parkiran** | Malam (lampu > 0.7), acak tiap ~8 menit | Tidak ada yang masuk ruangan: dua siluet gelap 4x3 px berkelebat cepat di bagian bawah pemandangan jendela (di… | sedang | 8s | 2 | layak |
| **+** | **Kursi digeser, berdecit** | Setiap kali agen berdiri dari meja kerja atau kursi rapat, peluang 1 dari 3 | Kursi bergeser mundur 3 px dalam 0.4 s lalu berhenti; dua partikel 'dust' kecil di kaki kursi | sering | 2s | 2 | catatan |
| **+** | **Langkah bergema** | Ruangan sepi: penghuni <=2 dan tidak ada yang duduk di meja rapat | Partikel 'step' dibuat dobel: satu di titik kaki dan satu bayangan alpha 0.3 yang muncul 0.15 s kemudian dan hidup… | sedang | 4s | 2 | layak |
| **+** | **Laptop ditutup pelan** | Saat sebuah sesi Claude berakhir dengan wajar, atau saat lewat jam 16.00 dan… | Layar di meja kerja (kotak 8x6 px menyala) turun bertahap dalam 1.2 s sampai rata dengan meja | sedang | 3s | 2 | catatan |
| **+** | **Layangan nyangkut di kabel** | Acak, hanya siang–sore (jam 10–17) dan saat CUACA.hujan < 0.1 | Di dalam kaca jendela (x186..238, y26..68) muncul dua garis kabel listrik miring di kejauhan, lalu sebuah layangan… | jarang | 14s | 2 | layak |
| **+** | **Merenung di depan kipas** | Acak, cooldown 3 menit, hanya kalau ada penghuni yang sudah idle >12 detik | Penghuni itu berjalan ke depan kipas angin berdiri (berdiri di x=400, y=272, hadap 'up') | sering | 12s | 2 | catatan |
| **+** | **Puncak Monas menyala** | Hanya saat FASE_HARI malam (ambien().lampu > 0.7) dan CUACA.hujan < 0.2 | Puncak Monas di kejauhan (siluet yang sudah ada di drawWindow) mendapat titik emas 2x2 px yang berdenyut pelan +… | sedang | 18s | 2 | layak |
| **+** | **Sehelai daun jatuh** | Acak, bobot naik saat kipas angin sedang menghadap tanaman pot atau saat… | Kotak 2x2 px hijau lepas dari tanaman pot, turun berayun (vx berganti tanda tiap 0.4 s, gravitasi kecil), mendarat… | jarang | 4s | 2 | catatan |
| **+** | **Sirene lewat di jalan depan** | Acak sepanjang jam kerja, sedikit lebih sering sore (16–18) | Kilau biru-merah bergantian menyapu dari kanan ke kiri: strip cahaya lebar ~40 px berjalan di dinding krem (y0..70)… | jarang | 7s | 2 | layak |
| **+** | **Tetes terakhir di ember** | Setelah hujan berhenti (CUACA.hujan turun ke 0) atau 3-5 menit setelah event… | Interval partikel 'drip' melambat: 1.2 s, lalu 2.5 s, lalu satu tetes terakhir yang jatuh dan bunyi 'splash' lebih… | sedang | 4s | 2 | catatan |
| **+** | **Berkas pagi berdebu** | Hanya jam 06.30-08.30 dan A.luar > 0.4. Peluang tinggi tapi hanya sekali per… | Berkas cahaya jendela di drawFloor dinaikkan sinarA ke 0.18 dan tepinya dipertegas dengan satu poligon lebih sempit… | sering | 55s | 3 | catatan |
| **+** | **Hujan pertama** | Hujan-deras-jendela yang pertama kali terjadi setelah minimal 20 menit… | Berjalan menumpang di atas hujan-deras-jendela. Dua daun jendela atas digambar terbuka: kaca bagian atas (rect… | langka | 35s | 3 | catatan |
| **+** | **Jeda maghrib** | Jam mesin melewati 18:00 (sekali per hari, jendela 18:00–18:20) DAN ada >= 1… | Selubung ruangan dihangatkan sebentar: warna sinar jendela digeser lebih jingga dan alpha-nya naik 0.04 selama 8… | sering | 8s | 3 | catatan |
| **+** | **Lembur sampai malam** | Jam di atas 20.00 dan masih ada minimal satu sesi Claude Code nyata yang aktif | Neon kiri (cx=170) dipadamkan total; hanya neon kanan (cx=410) menyala dengan A.lampu 0.75 dan kerucut cahayanya… | sedang | 120s | 3 | catatan |
| **+** | **Pelangi selepas hujan** | Hanya 25% saat hujan-deras-jendela berakhir dan jam antara 15.00-17.30… | Di dalam clip kaca, tujuh busur ctx.arc setebal 1 px (merah-jingga-kuning-hijau-biru-nila-ungu, alpha 0.45)… | jarang | 50s | 3 | catatan |
| **+** | **Ramadan, siang sunyi** | Sepanjang bulan Ramadan (dihitung dari tanggal yang dipasang di konfigurasi),… | Dispenser di ruang tunggu ditutup kain: kotak 20x36 px '#c9c3b0' menyelimuti badan dispenser, sudutnya digambar… | jarang | 140s | 3 | catatan |
| **+** | **Silau kena monitor** | Hanya jam 15.30-17.00 (matahari sudah rendah di barat) dan A.luar > 0.6 | Berkas cahaya jendela di drawFloor dimiringkan ke kanan sehingga ujungnya jatuh di rak PC server (x360..420, y… | sedang | 45s | 3 | catatan |
| **+** | **Silau sore, gorden ditarik** | Jam 16.5-17.8, sekali per sore, hanya kalau A.luar > 0.5 | Silau dari matahari rendah: poligon terang di lantai dari bibir jendela (186..238) melebar ke (150..300) di y=200,… | sedang | 60s | 3 | catatan |
|  | **Bayangan panjang senja** | Otomatis jam 17.2-18.4 selama A.luar > 0.15 — bukan acak, tapi ia hanya… | Bayangan kaki tiap orang diganti dari elips pendek menjadi jajaran genjang memanjang: 12 baris r(x-5 + i*k, y +… | sering | 90s | 4 | mahal |
|  | **Jam pulang, berbaris ke pintu** | Jam 15.55-16.30, sekali saja per hari, hanya untuk pegawai standby (sesi… | Standby satu per satu (jeda 2 detik) berjalan menyusuri LANE_DOWN ke tepi kiri dan keluar layar | sedang | 40s | 4 | tolak |
|  | **Pamit pulang, salaman keliling** | Sesi nyata berakhir secara wajar (bukan hilang mendadak) dan masih ada… | Pegawai yang mau pulang berjalan ke maksimal 3 pegawai terdekat, berhenti 2 detik di tiap orang, dan tiap kali… | sedang | 16s | 4 | mahal |
|  | **Patroli Subuh** | Jam 04.30-05.30 saja, dan hanya kalau tidak ada sesi nyata (ruangan… | Satu pegawai bersegam gelap (pakai palet jabatan 'teknisi jaringan' dengan main digelapkan) masuk dari tepi kanan… | jarang | 65s | 4 | tolak |

### Easter egg — 27 event

Langka, dicari, dan menyenangkan waktu ketemu.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Cocokkan jam tangan** | Sekali per sesi tampilan, hanya saat pegawai berhenti di lorong tepat di… | Pegawai berhenti, satu lengan diangkat setinggi dada (kotak 2x2 px dengan 1 px terang = kaca jam tangan), menoleh… | jarang | 3s | 1 | layak |
| **+** | **Kursi kosong berputar sendiri** | Hanya saat tidak ada satu pun penghuni nyata (semua standby atau ruangan… | Sandaran salah satu kursi meja rapat berputar pelan: lebar sandaran menyusut dari 7 px ke 3 px lalu melebar lagi… | jarang | 4s | 1 | layak |
| **+** | **Salah seragam** | Peluang kecil saat sesi baru dimulai (pegawai baru masuk layar), maksimal… | Satu pegawai muncul dengan palet seragam yang berbeda dari rekan-rekannya (misal semua khaki PDH, dia batik sogan) | langka | 14s | 1 | layak |
| **+** | **Semut antre di ubin retak** | Acak, cooldown 30 menit. Tidak pernah bersamaan dengan event lain yang… | Empat belas titik hitam 1x1 px berbaris menyusuri nat ubin dari salah satu ubin retak yang sudah ada di drawFloor()… | langka | 28s | 1 | layak |
| **+** | **Titip absen** | Peluang sangat kecil (~2%) saat event antre-mesin-absen berjalan dan hanya… | Pegawai menempel dua kali berturut-turut: jempol kanan, lalu jempol kiri (tangan kiri naik ke -7) | langka | 8s | 1 | layak |
| **+** | **Berdiri, lupa mau ke mana** | Saat agen berdiri dari meja kerja tanpa perintah (idle roam) — peluang 1 dari… | Pegawai berdiri, jalan 8 px ke lorong, berhenti mendadak, badan menghadap kiri 0.7 s lalu kanan 0.7 s, kemudian… | jarang | 4s | 2 | catatan |
| **+** | **Bolpoin jatuh ke kolong meja** | Acak saat ada pegawai duduk di stasiun 'think' lebih dari 20 detik | Titik biru 1x2 px meluncur dari tepi meja (y=314) jatuh ke lantai dan menggelinding 10 px ke bawah meja, berhenti… | sedang | 10s | 2 | catatan |
| **+** | **Cicak di dinding** | Acak sekali per 5-10 menit, hanya kalau lampu neon menyala (fase sore/malam) | Cicak 5x2 px abu kecokelatan merayap di dinding krem antara jam dinding (x=168) dan foto pejabat (x=268), di… | sering | 25s | 2 | layak |
| **+** | **Dua sesi sejabatan** | Dua Agent (sesi nyata) punya peran sama DAN jarak keduanya < 36 px DAN… | Keduanya berhenti, saling menghadap (face ke arah lawan), lalu bergantian mengangkat tangan hormat: lengan naik 3… | jarang | 5s | 2 | layak |
| **+** | **Huruf spanduk lepas** | Acak, boleh kapan saja. Cooldown 50 menit | Satu huruf pada spanduk "MELAYANI SEPENUH HATI" (teks di 24,15) memudar lalu hilang, jadi terbaca mis | jarang | 30s | 2 | catatan |
| **+** | **Kesandung ubin retak** | Penghuni berjalan melewati salah satu titik ubin retak (daftar koordinat yang… | Pegawai tersentak: naik 2 px lalu turun dalam 0.35 detik, kecepatannya turun ke 0 sesaat, dan 4 partikel 'dust'… | sering | 1s | 2 | catatan |
| **+** | **Kilau Garuda** | Acak 1x per 45 menit, atau dipicu bersamaan hormat-bendera dan tujuh-belasan | ctx.save + clip ke kotak Garuda (sekitar 292..318, 4..30), lalu satu pita spekular miring 30 derajat selebar 3 px… | langka | 2s | 2 | layak |
| **+** | **Kursi kepala dicoba magang** | Hanya saat meja rapat kosong dan ada pegawai berperan magang di ruangan | Magang duduk di kursi ujung meja rapat (kursi kepala), badannya digambar 2 px lebih tinggi (dagu naik), tangan… | jarang | 13s | 2 | catatan |
| **+** | **Magang salah menyebut jabatan** | Ada magang dan seorang pejabat (kadis/sekdis/kabid) | Magang berpapasan dengan pejabat, berhenti, dan balonnya menyebut jabatan yang salah | jarang | 9s | 2 | catatan |
| **+** | **Monitor tabung bergaris** | Acak 1x per 12 menit, cooldown 10 menit | Prop kecil baru: monitor CRT 16x14 di atas filing kabinet (sekitar 120,96) | sedang | 25s | 2 | catatan |
|  | **Nyamuk sore** | Jam mesin 17:00–19:00 DAN ada >= 1 penghuni duduk di meja kerja (station… | Satu titik 1 px gelap terbang mengitari kepala penghuni terpilih dengan lintasan lingkaran radius 8–12 px yang… | sedang | 10s | 2 | tolak |
| **+** | **Stapler kosong dijepret** | Acak saat ada berkas yang baru dicetak atau dirapikan | Prop kecil baru: stapler 5x3 px di meja printer. Ditekan tiga kali (turun 1 px tiap tekan) tanpa partikel apa pun —… | jarang | 3s | 2 | catatan |
| **+** | **CCTV menyapu ruangan** | Acak tiap 2 menit peluang kecil. Cooldown 6 menit | Prop baru: CCTV kubah 10x8 px abu di pojok kanan atas (x=462, y=18) dengan LED merah kecil yang berkedip 0,5 Hz | sedang | 18s | 3 | catatan |
| **+** | **Cicak jatuh dari plafon** | Acak, cooldown 20 menit, hanya kalau ada penghuni di stasiun 'edit' (biar ada… | Cicak 6x2 px abu (badan 4x2, kepala 2x2, ekor 2x1) merayap di dinding krem pada y=62 dari x=110 ke x=270 selama 8… | langka | 13s | 3 | catatan |
| **+** | **Gerhana sebagian** | Acak sangat jarang (sekitar 1 per 3 jam tampilan), hanya siang cerah… | Matahari di drawWindow digigit: setelah menggambar matahari 3x3 px dan glow-nya, sebuah kotak 2x3 px warna langit… | langka | 80s | 3 | catatan |
| **+** | **Map tertukar di meja rapat** | Setelah rapat bubar dengan >=4 peserta. Cooldown 12 menit | Dua map identik (6x4 px, warna sama, hanya beda 1 px label) tertinggal di meja rapat | jarang | 4s | 3 | catatan |
| **+** | **Nama kadis salah ketik** | Peluang 2% tiap kali event numpang-print atau stempel-basah selesai | Pegawai berdiri membaca kertas yang baru dicetak (kertas 8x10 px diangkat setinggi dada), lalu tersentak: badan… | langka | 25s | 3 | catatan |
| **+** | **Salah duduk di kursi kadis** | Seorang pegawai non-kadis mengambil kursi ujung meja rapat (slot pertama)… | Pegawai duduk normal di kursi ujung. Setelah 3 detik, tanda seru kuning 2x5 px muncul di atas kepala pegawai di… | jarang | 9s | 3 | catatan |
|  | **Jam dinding mati** | Acak murni, sangat jarang (sekitar 1 per 90 menit tampilan), hanya jam kerja | Jarum jam dinding di (168, 38) berhenti total dan tidak lagi mengikuti waktu mesin — dia beku di posisi terakhir,… | langka | 95s | 4 | mahal |
|  | **Spanduk salah ketik** | Acak, cooldown 40 menit. Sekali per pemuatan halaman saja — leluconnya tidak… | Teks spanduk merah di drawWall() berubah dari 'MELAYANI SEPENUH HATI' jadi 'MELAYANI SEPENUH HTAI' — dua huruf… | langka | 22s | 4 | mahal |
|  | **Titip pesan, isinya berubah** | Ada minimal 3 pegawai dan target akhirnya berjabatan kabid/kadis | Tiga balon berurutan di tiga orang berbeda, tiap kali isinya sedikit berbeda dari sebelumnya | jarang | 22s | 4 | mahal |
|  | **Ayam tetangga nyelonong** | Pagi (jam 6-9), peluang sangat kecil (1 per ~2 jam tampilan) | Ayam kampung 7x8 px masuk dari pintu kiri di LANE_DOWN, jalan patah-patah dengan kepala maju-mundur tiap langkah… | langka | 30s | 5 | mahal |

### Meta Claude Code — 24 event

Kenyataan sesi Claude Code diterjemahkan jadi kejadian kantor.

| | Event | Kapan | Yang terjadi | Langka | Dur | K | Vonis |
|:-:|---|---|---|---|---:|---:|---|
| **+** | **Semua layar berkedip serempak** | Acak 1x per 20 menit, atau saat jumlah sesi berubah (ada sesi baru masuk /… | Semua laptop yang menyala dipaksa putih penuh 2 frame, lalu satu garis pindai 1 px putih turun dari atas ke bawah… | jarang | 3s | 1 | layak |
| **+** | **Audit pemakaian token** | Acak 1x per 60-120 menit, hanya kalau toolCount sesi berjalan sudah melewati… | Auditor masuk membawa gulungan kertas panjang: strip 3 px lebar yang menjuntai 40 px ke bawah dari tangannya,… | langka | 25s | 2 | layak |
| **+** | **Bengong menatap layar** | Agen duduk di meja kerja, tidak ada tool call 25-60 detik, dan tidak sedang… | Sprite benar-benar diam (fase animasi dibekukan), hanya kursor di layar berkedip 2 px setiap 0.5 s | sering | 4s | 2 | catatan |
| **+** | **Ditanya, standby diam saja** | Ada minimal satu sesi nyata dan satu Standby yang sedang berdiri diam di… | Pegawai sesi nyata menghadap standby dan mengeluarkan balon pertanyaan plus dua 'talk' | sedang | 10s | 2 | layak |
| **+** | **Kantor mengantuk** | Otomatis kalau tidak ada satu pun event tool selama 3 menit | Semua layar laptop masuk mode tidur: isi layar berhenti berganti dan alpha-nya bernapas antara .25 dan .55 dengan… | sering | 180s | 2 | layak |
| **+** | **Ketikan serempak sesaat** | Hanya saat >=4 pegawai duduk di meja kerja bersamaan dan semuanya sedang… | Satu gelombang: tiap meja mengeluarkan 2 partikel 'glyph' berurutan dari kiri ke kanan dengan jeda 0.12 s, jadi… | jarang | 2.5s | 2 | layak |
| **+** | **Laptop restart sendiri** | Acak, cooldown 9 menit, hanya kalau ada penghuni benar-benar duduk di salah… | Layar satu laptop di drawMejaKerja() berubah biru penuh (#1c4e8a) selama 3 detik dengan dua baris teks mikro 1 px… | sedang | 13s | 2 | layak |
| **+** | **Layar rak idle** | Stasiun 'server' tidak dipakai siapa pun selama >= 150 detik DAN jam mesin… | Layar kecil di rak server berganti jadi screensaver: bintang delapan-cabang 7x7 px (garis 1 px, warna P.amber) yang… | jarang | 16s | 2 | catatan |
| **+** | **Mapnya tidak ada di laci mana pun** | Acak, cooldown 8 menit, hanya kalau ada penghuni di stasiun 'search' | Laci filing kabinet ditarik keluar penuh dan digambar KOSONG (rongga gelap tanpa punggung map) | sedang | 17s | 2 | layak |
| **+** | **Menunggu disposisi di depan pintu** | Muncul kalau tidak ada event tool sama sekali selama 45 detik padahal sesi… | Pegawai berdiri di depan pintu kadis (x=452, LANE_UP), memegang map, badannya bergoyang sangat pelan kiri-kanan 1… | sering | 40s | 2 | layak |
| **+** | **Peserta rapat ketiduran** | Bukan acak murni: hanya kalau ada peserta rapat yang sudah duduk >100 detik… | Kepala peserta itu turun 3 px lalu naik pelan dalam siklus 2,4 detik (bukan sinus rata — turunnya cepat, naiknya… | sering | 25s | 2 | layak |
| **+** | **Sudah dicap, ditarik lagi** | Muncul saat ada tool 'edit' yang disusul tool 'edit' lain di berkas yang sama… | Kertas yang tadi sudah bercap merah (partikel 'ink' sempat terbit) ditarik kembali: lembar 6x4 px meluncur mundur… | sedang | 11s | 2 | layak |
| **+** | **Cap miring, ulang lagi** | Acak, cooldown 4 menit, hanya kalau ada penghuni benar-benar sedang di… | Cap pertama: kertas di meja stempel dapat kotak merah 6x3 yang miring 12 derajat, jelas melenceng dari kolomnya | sering | 10s | 3 | catatan |
| **+** | **Ditinggal tanpa pamit** | Acak, cooldown 13 menit, hanya kalau ada >=2 meja kerja terisi | Di salah satu meja kerja, laptopnya TETAP MENYALA hijau tapi kursinya kosong, dan sebuah jaket 7x9 px abu-kebiruan… | jarang | 22s | 3 | catatan |
| **+** | **Map setebal bantal** | Acak, cooldown 10 menit, lebih sering kalau stasiun 'read' baru dipakai <45… | Penghuni keluar dari stasiun 'read' membawa tumpukan map setinggi 20 px di depan dada (empat map bertumpuk dengan… | sedang | 26s | 3 | catatan |
| **+** | **Nota dinas mentok di standby** | Sedang ada minimal 3 orang di layar dan minimal satu di antaranya Standby | Sehelai kertas (kotak 4x5 px putih) dipegang bergiliran: pegawai A jalan ke B, 'paper' berpindah, B jalan ke C | jarang | 20s | 3 | catatan |
| **+** | **Rangkap tiga, sesuai ketentuan** | Muncul kalau satu pegawai memakai stasiun 'edit' tiga kali beruntun dalam 40… | Dari meja stempel keluar tiga lembar kertas identik (partikel 'paper' berkelompok tiga, jatuh berdekatan) yang lalu… | sedang | 13s | 3 | catatan |
| **+** | **Saling menunggu notulen** | Ada minimal 2 orang duduk di meja rapat selama lebih dari 40 detik tanpa… | Dua pegawai di meja rapat sama-sama membuka buku catatan (kotak putih 4x3 px di depan masing-masing) yang tetap… | sedang | 14s | 3 | catatan |
| **+** | **Serah terima map antar bidang** | Dipicu saat sesi memakai stasiun 'rapat' (Task/Agent) dan ada minimal satu… | Map 5x7 px berpindah tangan: digambar di tangan pegawai pengirim, lalu selama 1 detik melayang di antara dua tubuh… | sedang | 12s | 3 | catatan |
| **+** | **Undangan belum juga pulang** | Ada objek Peserta yang sudah duduk di meja rapat lebih dari 5 menit sementara… | Peserta yang kelamaan duduk mulai bergerak kecil: kepala miring 1 px kiri-kanan tiap 2 detik | sedang | 12s | 3 | catatan |
|  | **Bikin bagan dulu di flipchart** | Acak, cooldown 11 menit, hanya kalau ada >=1 penghuni di meja rapat | Prop baru: flipchart 26x36 px berdiri di kiri meja rapat (x=138, dasar 250) — tiga kaki 1 px, kertas krem, penjepit… | sedang | 18s | 4 | mahal |
|  | **Nomor surat karangan** | Acak, cooldown 12 menit, hanya kalau ada >=2 penghuni tidak sedang rapat | Satu penghuni di stasiun 'edit' mengecap dengan mantap tiga kali berturut-turut (ink penuh tiap hantaman, ritme… | jarang | 15s | 4 | mahal |
|  | **Nota dinas dari pusat** | Total tool call seluruh ruangan menembus kelipatan 100 (100, 200, 300, ...)… | Lampu di atas pintu ruang kadis menyala dan pintu digambar terbuka 4 px selama event | jarang | 18s | 4 | mahal |
|  | **Foto pejabat diganti** | Acak, cooldown 30 menit. Peluang naik besar kalau ada sesi baru dengan nilai… | Petugas masuk membawa tangga lipat 9x16 px, memasangnya di bawah salah satu foto pejabat (x=268 atau x=320), naik… | langka | 18s | 5 | tolak |

## Yang ditolak, dan kenapa

Dicantumkan supaya tidak diusulkan lagi enam bulan lagi. Dari 27 yang
ditolak, 17 sebenarnya kembar yang lolos dari penggabungan berbasis nama —
penilai menangkapnya karena membaca isinya, bukan judulnya. Sepuluh sisanya
ditolak karena alasan teknis yang nyata, dan alasan-alasan itu memberi tahu
lebih banyak tentang keterbatasan ruangan ini daripada event yang lolos:
koordinat prop yang bertabrakan, jarak dinding-ke-lantai yang tidak bisa
dijangkau tangga, dan aturan "satu jabatan satu seragam" yang tidak boleh
diacak. Beberapa catatan menyebut detail bagus yang layak dipindahkan ke
event lain — itu ditulis di kolomnya.

| Event | Alasan penilai |
|---|---|
| Anak pegawai ikut ke kantor | Skala tubuh 0.7 menuntut drawPerson diparameterkan — seluruh isinya koordinat piksel literal lewat box3/r, dan ctx.scale(0.7) menghasilkan piksel pecahan yang merusak grid pixel-art yang… |
| Antre mesin absen | Duplikat absen-fingerprint, dan posisinya lebih buruk: (436,96) dengan lebar 10 menembus kusen pintu kadis yang mulai di x=440. Cabang 'satu dari empat kali gagal' boleh diserap ke event… |
| APAR kadaluarsa dicek | Tumpang tindih penuh dengan apar-diperiksa: tabung diangkat, kartu gantung berubah warna permanen, manometer, penonton berhenti. Gabungkan kartunya ke event itu. |
| Apel singkat di depan bendera | Duplikat apel-pagi dengan arah hadap berbeda. Bendera naik 10 px lewat parameter offsetY di drawBendera itu satu detail bagus — pindahkan ke apel-pagi, jangan jadi event sendiri. |
| Azan dari masjid sebelah | Duplikat azan-zuhur. Dan menghentikan produksi partikel kerja 20 detik plus menyembunyikan dua pegawai 80 detik menghapus sinyal utama monitor selama hampir dua menit — akibatnya bukan… |
| Berkas tumpah di koridor | Sama dengan berkas-jatuh sampai ke detailnya (18 vs 12 partikel, lembar menetap, satu penolong ikut memungut dari sisi berlawanan). Pilih salah satu; berkas-jatuh sudah menyebut mekanisme… |
| Foto pejabat diganti | Foto ada di y=6..21 sementara kaki pegawai paling atas di y=138 dan kepalanya di y≈115 — tangga 16 px tidak menutup jarak 100 px, jadi seluruh adegan naik-pasang tidak bisa dipentaskan… |
| Galon dispenser habis | Bagian sejati dari galon-habis-diganti (galon pucat, LED merah, pemasangan, steam) tanpa tambahan apa pun. Tiga event galon di satu daftar itu kemubaziran, bukan variasi. |
| Hari berpakaian adat | Melanggar aturan identitas yang jadi cara penonton membaca ruangan: kode sengaja menetapkan satu jabatan = satu seragam, dan batik/PDH dibedakan lewat ada-tidaknya lidah bahu. Mengacak… |
| Istirahat solat | Kembar dengan istirahat-sholat-dzuhur, dan versi ini justru salah arah: 'dihapus sementara' berisiko memanggil destroy() pada sesi nyata (kartunya ikut mati lewat tutupKartu). Versi satunya… |
| Jam istirahat berdenting | Duplikat jam-istirahat-siang. Selain itu rencananya cacat: 'mengular di sekitar dispenser, sisanya berdiri berimpit' tidak jalan — slotBebas() sengaja MELEWATI slot yang x-nya < 16 atau >… |
| Jam pulang, berbaris ke pintu | Bertabrakan dengan jagaPopulasi(): standby yang keluar langsung dilahirkan ulang (perlu MIN_DI_LAYAR variabel), dan 'mampir absen' butuh prop yang baru ada di event lain. Duplikat… |
| Jaringan lemot | Duplikat wifi-megap-megap. Ambil reaksi teknisi (cabut-pasang kabel, semburan 'data', busyUntil pegawai 'web') dan pindahkan ke entri itu; sisanya identik. |
| Kisi plafon dibuka teknisi | Panel di y=0..7 sementara pegawai berdiri di y≥138 — jarak 130 px, kursi 8 px tidak relevan. Ditambah 'pegawai lain memutar 10 px menghindari kursi' yang menuntut konsep rintangan di… |
| Kunci tertinggal, menunggu di depan | Menahan antrean event tool call demi lelucon berarti halaman berhenti melaporkan apa yang benar-benar sedang dikerjakan Claude Code — itu membatalkan guna seluruh visualisasi. Ruangan gelap… |
| Laron selepas hujan | Duplikat laron-menyerbu-lampu. Keduanya butuh partikel orbit + sayap menetap; versi ini menambah gelas tertutup permanen dan magang menyapu, yaitu tiga state persisten untuk satu malam.… |
| Nyamuk sore | Duplikat nyamuk-sore yang reaksinya lebih lengkap. Kalau mau, pindahkan cabang '25% nyamuk lolos ke penghuni lain' ke entri itu — itu satu-satunya bagian yang menambah nilai. |
| Patroli Subuh | Duplikat satpam-patroli. Selain itu 'prop yang tersapu senter digambar 15% lebih terang' praktis tidak bisa rapi: prop adalah fungsi gambar tanpa bounding box, tidak ada data kotak yang… |
| Pengeras suara mendengung | Titik (60,26) menabrak dus arsip di atas lemari (drawArsip menggambar dus di x+6..x+30, y-14..y-2 = x 32..70, y 16..28). Selain itu ini bagian kecil dari pengumuman-pengeras-suara yang… |
| Petir menyambar | Hampir seluruhnya sudah ada: kilatAktif() dengan kedip ganda, kilat di langit drawWindow, pantulan sekanvas di drawAmbien, plus gemuruh() audio. Sisanya (goyang layar + LED panik) sudah… |
| Petugas kebersihan ngepel | Duplikat pel-lantai-licin yang lebih murah karena memakai magang (Standby) alih-alih kelas Tamu. Bagian paling berisiko sama di keduanya: memberi route() larangan lajur — itu satu-satunya… |
| Senam Jumat sehat | Kembar dengan senam-jumat-pagi yang catatan implementasinya lebih matang (poseSenam(phase) sejajar workArms). Partikel 'nada' boleh dipindah ke sana; dua event senam di satu ruangan tidak… |
| Simulasi kebakaran | Butuh mode yang mem-bypass goTo/IDLE_AFTER untuk SEMUA agen termasuk sesi nyata selama ~30 detik, padahal handle() 'pre' memanggil a.goTo(st) tanpa syarat — tool call yang masuk saat… |
| Sosialisasi aplikasi baru | Premis utamanya salah: drawXBanner tidak punya teks sama sekali, cuma tiga bar abu-abu 1 px sebagai tiruan tulisan — 'teks berganti' tidak ada yang bisa diganti. Sisanya adalah event… |
| Tamu datang ke ruang tunggu | Duplikat tamu-masyarakat-menunggu (dan sebagian pemohon-surat-di-loket). Tiga entri tamu-menunggu di satu daftar; pilih satu, dan pilih yang catatan implementasinya paling benar soal tidak… |
| Tinta stempel habis | Sama dengan stempel-tinta-kering: cap pucat, bantalan diisi, cap berikutnya lebih tebal. Yang unik cuma antrean di x=300 dan parameter vy terbalik pada spawn('ink') — pindahkan dua detail… |
| Tumpengan syukuran | Duplikat id tumpeng-syukuran yang jauh lebih murah (prop sementara + goTo('rapat') yang sudah ada). Versi ini menambah antrean event global, pemilihan senior/junior, pose… |

---

Disusun dari rapat 15 agent (9 pengusul, 3 kritikus kelengkapan, 3 penilai
kelayakan). Angka mentah sebelum penggabungan: 397 event, 28 duplikat id.
