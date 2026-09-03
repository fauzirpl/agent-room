/* agent-room :: katalog event acak
   ================================================================
   Kejadian yang muncul sendiri di ruangan. Mesinnya ada di room.js
   (daftarEvent, pinjamAktor, pada, MOD, RUANGAN); di sini isinya.

   Bentuk satu event:

     { id, kelas, bobot, cooldown, durasi, syarat(S), perluAktor,
       mulai(E,S), tick(E,dt,S), selesai(E,S),
       gambarDinding(E), gambarLantai(E), gambarProp(E), sortY,
       gambarAtas(E), lanjutan: [{id, peluang}] }

   kelas 'panggung' = eksklusif, cuma satu yang boleh jalan.
   kelas 'latar'    = boleh menumpuk dengan yang lain.

   Uji satu event tanpa menunggu: ?event=<id>. Matikan semua: ?event=0.

   Tiga event cuaca dari rapat (hujan-deras, hujan-petir-kedip) TIDAK ada di
   sini: hujan sudah nyata di kode ini lewat CUACA/kilatAktif yang membaca
   /cuaca. Memaksanya dari event acak akan melawan data sungguhan dan bikin
   log "hujan turun / hujan reda" berbohong. Yang tersisa dari kelompok itu —
   mendung tanpa hujan — memang belum ada, jadi itu yang dibuat. */

/* ------------------------------------------------------------------ bantu */
const acak = (a, b) => a + Math.random() * (b - a);
const pilih = (arr) => arr[(Math.random() * arr.length) | 0];
const jarakKe = (a, x, y) => Math.hypot(a.x - x, a.y - y);

/* Bobot bawaan menurut kelangkaan yang disepakati di rapat. Dipakai supaya
   angka di definisi event tidak jadi tebakan yang beda-beda per penulis. */
const B = { sering: 9, sedang: 5, jarang: 3, langka: 1 };

// Hadapkan orang ke satu titik tanpa memindahkannya.
function hadapkan(a, tx, ty) {
  const dx = tx - a.x, dy = ty - a.y;
  a.hadap = a.face = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}

/* Ambil satu pemeran, kalau bisa yang jabatannya cocok. Jabatan itu preferensi,
   bukan syarat: ruangan yang kebetulan tidak punya teknisi tetap harus bisa
   memperbaiki kipasnya sendiri. */
function pemeran(E, peran) {
  if (peran) {
    const a = pinjamAktor(E, 1, (o) => peran.indexOf(o.peran) >= 0)[0];
    if (a) return a;
  }
  return pinjamAktor(E, 1)[0];
}

// Pemeran terdekat ke sebuah titik — untuk event yang jelas punya lokasi.
function pemeranDekat(E, x, y, radius) {
  const calon = S.orang.filter((o) => bisaDipinjam(o)
    && (!radius || jarakKe(o, x, y) < radius));
  if (!calon.length) return null;
  calon.sort((p, q) => jarakKe(p, x, y) - jarakKe(q, x, y));
  const a = calon[0];
  a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
  return a;
}

// Pemeran yang SEDANG bekerja di satu stasiun — beda dari pemeran(): ini
// buat event yang justru mengINTERUPSI pekerjaan yang berlangsung (kucing naik
// ke keyboard, HP bergetar), bukan meminjam yang sedang menganggur.
function pemeranStasiun(E, station) {
  const calon = S.bekerja.filter((o) => o.station === station && !o.eventKerja);
  if (!calon.length) return null;
  const a = calon[(Math.random() * calon.length) | 0];
  a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
  return a;
}

/* --------------------------------------------- pemeran yang sudah direbut ---
   Aturan pertama proyek ini: tool call sungguhan selalu menang atas event.
   handle() memanggil lepasDariEvent() → lepaskanAktor(), yang memangkas
   E.aktor. Tapi POTRET pemeran yang disimpan sendiri oleh event (E.data.a,
   E.data.antre, atau variabel yang ditangkap closure) TIDAK ikut terpangkas —
   dan perintah tertunda (pada(), penjaga tenggat) tetap jalan beberapa detik
   kemudian. Akibatnya ruangan menyeret pegawai yang di panel jelas-jelas
   sedang mengerjakan tool call, atau melempar karena orangnya sudah undefined.

   Dua penyaring di bawah ini yang dipakai untuk itu. Pakai SEBELUM menyuruh
   siapa pun bergerak dari dalam callback tertunda. */
const masihMain = (E, a) => !!a && a.eventKerja === E;
const yangMasihMain = (E, daftar) => (daftar || []).filter((a) => a && a.eventKerja === E);

/* Untuk antrean yang dimutasi sendiri (q.shift()): buang yang sudah direbut
   DI TEMPAT, supaya urutan antreannya tetap utuh dan q[0] selalu orang yang
   benar-benar masih ikut. */
function pangkasLepas(E, daftar) {
  if (!daftar) return daftar;
  for (let i = daftar.length - 1; i >= 0; i--) {
    if (!daftar[i] || daftar[i].eventKerja !== E) daftar.splice(i, 1);
  }
  return daftar;
}

/* Orang yang cuma menonton: tidak dipinjam, cuma menoleh sebentar.

   Menulis `face` SAJA, tidak pernah `hadap`. Bedanya menentukan: `hadap`
   itu arah TETAP milik stasiun, dan tidak ada satu pun jalur di room.js
   yang mengembalikannya untuk orang yang sudah duduk di stasiunnya —
   handle() cuma memanggil goTo() kalau stasiun tujuannya BEDA, sedangkan
   stasiunPulang() memulangkan penganggur ke 'think', stasiun yang sedang
   ditempatinya. Versi lama memanggil hadapkan() (yang menulis keduanya),
   jadi pegawai yang kebetulan lewat di dekat sebuah event berdiri
   menyamping di depan laptopnya SELAMANYA. Terukur: masih menyamping 20
   detik sesudah eventnya mati, dan baru sembuh kalau ada tool call yang
   kebetulan memetakan ke stasiun lain.

   `face` juga tidak sembuh sendiri, jadi arah lamanya dititipkan di
   o.tolehBalik dan dikembalikan Agent#tickKongsi() begitu o.tolehSampai
   lewat — jalur yang sama yang sudah dipakai tolehan "rekan seproyek",
   dan yang juga membatalkan tolehnya begitu orangnya melangkah.

   Yang sedang mengerjakan tool call TIDAK ikut menoleh: menaikkan
   busyUntil-nya akan memperpanjang waktu kerja yang dicatat panel, dan
   aturan 1 melarang event menyentuh pegawai yang sedang bekerja. */
function menoleh(orang, tx, ty, lama) {
  const ms = lama || 1200;
  for (const o of orang) {
    if (o.path.length || o.eventKerja || o.state === 'work' || o.adaTugas) continue;
    const dx = tx - o.x, dy = ty - o.y;
    const arah = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    if (o.tolehBalik == null) o.tolehBalik = o.face;   // dipotret sekali saja
    o.face = arah;
    o.tolehSampai = Math.max(o.tolehSampai || 0, now + ms);
    o.busyUntil = Math.max(o.busyUntil, now + ms);
  }
}

/* Orang yang bukan pegawai: tamu, ojol, pedagang, kurir. Sengaja BUKAN turunan
   Agent — mereka tidak punya sesi, tidak boleh muncul di panel kru, dan tidak
   boleh ikut berebut slot stasiun. Yang mereka butuhkan cuma digambar, jadi
   dititipkan ke drawPerson lewat objek seadanya: pal buatan sendiri (kepala =
   warna rambut, atau helm buat ojol), menghadap penonton, tanpa sesi. Dengan
   begitu bentuknya seragam dengan pegawai — satu gaya sosok di ruangan ini,
   bukan tamu bergaya balok di antara pegawai bergaya sprite. */
function gambarOrangLuar(fx, fy, baju, motif, bawa, kepala) {
  drawPerson({
    x: fx, y: fy, face: 'down', state: 'idle', phase: now / 1000, slot: 0,
    pal: { main: baju, pants: '#3a3f45', skin: '#e0ae80', hair: kepala || '#2b2118', head: 'hair', pattern: motif || null },
    bawa,
  });
}

// Taksiran kalender Hijriah (aritmetik tabular, akurasi ±1 hari) — cukup
// buat menentukan "sedang bulan Ramadan atau bukan", bukan buat ibadah.
function taksirHijri(d) {
  const jd = Math.floor(d.getTime() / 86400000 + 2440587.5);
  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j = Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719)
    + Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 = l1 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const bulan = Math.floor((24 * l2) / 709);
  const tgl = l2 - Math.floor((709 * bulan) / 24);
  return { bulan, tgl };
}

const KOORD = {
  jam: [168, 38], garuda: [300, 16], jendela: [212, 138], stempel: [286, 140],
  filing: [132, 138], arsip: [54, 138], rak: [390, 141], pintu: [452, 140],
  dispenser: [466, 256], pot: [44, 268], kipas: [400, 268], tong: [439, 276],
  rapat: [246, 200], banner: [30, 240],
};

