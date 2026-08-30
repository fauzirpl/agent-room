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

// Orang yang cuma menonton: tidak dipinjam, cuma menoleh sebentar.
function menoleh(orang, tx, ty, lama) {
  for (const o of orang) {
    if (o.path.length || o.eventKerja) continue;
    hadapkan(o, tx, ty);
    o.busyUntil = Math.max(o.busyUntil, now + (lama || 1200));
  }
}

/* Orang yang bukan pegawai: tamu, ojol, pedagang, kurir. Sengaja BUKAN turunan
   Agent — mereka tidak punya sesi, tidak boleh muncul di panel kru, dan tidak
   boleh ikut berebut slot stasiun. Yang mereka butuhkan cuma digambar. */
function gambarOrangLuar(fx, fy, baju, motif, bawa, kepala) {
  const x = Math.round(fx), y = Math.round(fy);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#20301f';
  ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  box3(x - 5, y, 3, 5, 2, '#3a3f45');
  box3(x + 1, y, 3, 5, 2, '#3a3f45');
  box3(x - 5, y - 5, 10, 8, 4, baju);
  if (motif) for (let i = 0; i < 6; i++) r(x - 4 + ((i * 3) % 9), y - 12 + ((i * 5) % 6), 1, 1, motif);
  box3(x - 4, y - 13, 8, 6, 4, '#e0ae80');
  box3(x - 4, y - 19, 8, 2, 4, kepala || '#2b2118');
  r(x - 2, y - 11, 1, 2, P.ink);
  r(x + 1, y - 11, 1, 2, P.ink);
  if (bawa) drawBawaan({ bawa, face: 'right' }, x, y);
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
  dispenser: [330, 268], pot: [44, 268], kipas: [400, 268], tong: [352, 288],
  rapat: [246, 200], banner: [30, 240],
};

/* ==========================================================================
   INFRASTRUKTUR — listrik, jaringan, AC, perabot yang rusak sendiri
   ========================================================================== */

daftarEvent(

/* Yang paling murah di seluruh daftar, dan sengaja ditulis paling dulu: tidak
   ada prop baru, tidak ada partikel baru, tidak menyentuh Agent. Kalau
   penjadwalnya salah, ini yang paling cepat memperlihatkannya. */
{
  id: 'tegangan-turun-lampu-redup',
  kelas: 'latar', bobot: B.sedang, cooldown: 180, durasi: 6,
  syarat: (S) => S.lampu > 0.15,
  mulai(E) {
    const a = pemeranDekat(E, 390, 164, 160);
    if (a) { a.doingEvent = 'menengok rak server'; a.goTo('server'); }
  },
  tick(E) {
    // bukan padam, tapi lemas: turun ke 0,45 lalu pulih dengan gelombang lambat
    const g = 0.45 + 0.55 * Math.abs(Math.sin(E.umur * 1.1));
    MOD.lampu = g;
    MOD.layar = 0.36;          // baris di layar laptop ikut melambat
    MOD.kipas = 0.45;
    pada(E, 1, () => {
      const a = E.aktor[0];
      if (a && !a.standby) a.say('lampunya lemes lagi');
      menoleh(S.bekerja, 240, 0, 900);
    });
  },
  lanjutan: [{ id: 'ups-beep-baterai', peluang: 0.5 },
             { id: 'stabilizer-berdengung', peluang: 0.35 }],
},

{
  id: 'ups-beep-baterai',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 7,
  mulai(E) {
    const a = pemeranDekat(E, 390, 164, 130);
    if (a) { a.doingEvent = 'membungkam UPS'; a.goTo('server'); }
    else E.data.takAdaYangDengar = true;
  },
  tick(E) {
    if (E.data.selesai) return;
    MOD.upsSiaga = 1;
    // satu 'ping' merah tiap kedip: bunyinya digambar, bukan cuma didengar
    if (Math.floor(E.umur / 0.55) !== E.data.k) {
      E.data.k = Math.floor(E.umur / 0.55);
      spawn('ping', 404, 130, '#e8453f');
      blip(1000, 0.06);
    }
    glow(404, 130, 8, '#ff5a52', 0.18);
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'server') {
      a.pose = 'jongkok';
      pada(E, 4, () => { E.data.selesai = true; a.say('itu UPS-nya minta di-mute'); });
    }
  },
},

{
  id: 'ups-menjerit',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 14,
  bentrokDengan: ['ups-beep-baterai'],
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) { a.doingEvent = 'menekan tombol UPS'; a.goTo('server'); }
  },
  tick(E) {
    if (E.data.diam) return;
    MOD.upsSiaga = 1;
    const kedip = Math.sin(now / 125) > 0;
    if (kedip) glow(404, 130, 10, '#ff4a4a', 0.25);
    if (Math.random() < 0.05) spawn('ping', 404, 128, '#ff6a6a');
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'server') {
      a.pose = Math.sin(a.phase * 6) > 0 ? 'angkat' : null;
      pada(E, 8, () => {
        E.data.diam = true;
        a.pose = null;
        a.say('aman, cuma baterainya');
        for (let i = 0; i < 8; i++) spawn('data', 390, 130);
      });
    }
  },
},

{
  id: 'stabilizer-berdengung',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 12,
  sortY: 119,
  mulai(E) {
    E.data.jarum = 0;
    const a = pemeranDekat(E, 346, 164, 150);
    if (a) { a.doingEvent = 'menyentuh stabilizer'; a.goToXY(346, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!E.data.diam) {
      E.data.jarum = 0.15 + 0.2 * Math.abs(Math.sin(now / 40));
      if (a && a.diam) pada(E, 5, () => {
        E.data.diam = true;
        E.data.jarum = 0.5;
        a.say('bukan ditendang, disentuh saja');
      });
    }
  },
  gambarProp(E) {
    const gx = 344 + (E.data.diam ? 0 : (Math.sin(now / 42) > 0 ? 1 : 0));
    const y = 104;
    r(gx, y, 18, 14, '#e2ddc8');                 // badan stabilizer
    r(gx, y, 18, 1, '#f2eeda');
    r(gx + 1, y + 11, 16, 2, '#cdc7ad');
    r(gx + 14, y + 2, 2, 2, E.data.diam ? '#3e6b4f' : '#c22b2b');
    ctx.strokeStyle = '#8b98a6'; ctx.lineWidth = 1;   // meter jarum
    ctx.beginPath(); ctx.arc(gx + 7, y + 8, 5, Math.PI, 0); ctx.stroke();
    const su = Math.PI + Math.PI * (E.data.jarum || 0);
    ctx.strokeStyle = '#2c3440';
    ctx.beginPath(); ctx.moveTo(gx + 7, y + 8);
    ctx.lineTo(gx + 7 + Math.cos(su) * 4, y + 8 + Math.sin(su) * 4); ctx.stroke();
  },
},

{
  id: 'kabel-lan-lepas',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 12,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda', 'analis_sistem']);
    if (a) { a.doingEvent = 'mengecek kabel LAN'; a.goTo('server'); }
  },
  tick(E) {
    if (E.data.beres) return;
    MOD.lanPutus = true;
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'server') {
      a.pose = 'jongkok';
      pada(E, 6, () => {
        E.data.beres = true;
        a.pose = null;
        a.say('tadi cuma longgar');
        for (let i = 0; i < 6; i++) spawn('data', 392, 132);
      });
    }
  },
  gambarProp(E) {
    if (E.data.beres) return;
    // kabel hijau yang ujungnya lepas dan menggantung lurus
    for (let i = 0; i < 12; i++) r(417, 66 + i, 1, 1, '#3d7a4c');
  },
  sortY: 119,
},

{
  id: 'kabel-utp-dirapikan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1320, durasi: 34,
  perluAktor: true,
  syarat: () => !RUANGAN.kabelRapi,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) { a.doingEvent = 'merapikan kabel rak'; a.goTo('server'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'jongkok';
    // tiap 7 detik satu kabel selesai; di antaranya dia meregangkan punggung
    pada(E, 12, () => { a.pose = null; a.say('biar tidak tersangkut kaki'); });
    pada(E, 14, () => { a.pose = 'jongkok'; });
    pada(E, 30, () => { RUANGAN.kabelRapi = true; a.pose = null; });
  },
},

{
  id: 'patch-panel-dilabeli',
  kelas: 'panggung', bobot: B.langka, cooldown: 1800, durasi: 40,
  perluAktor: true,
  syarat: () => RUANGAN.labelPatch < 10,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda', 'analis_sistem']);
    if (a) { a.doingEvent = 'melabeli patch panel'; a.goTo('server'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // satu label per 3 detik, dan labelnya TIDAK pernah hilang lagi
    const target = Math.min(10, Math.floor(E.umur / 3.2));
    while (RUANGAN.labelPatch < target) {
      RUANGAN.labelPatch++;
      spawn('paper', 392, 60);
    }
    pada(E, 6, () => a.say('biar yang piket besok tidak menebak-nebak'));
    pada(E, 36, () => { a.goToXY(390, 176, 'up'); });   // mundur, memandangi hasilnya
  },
},

{
  id: 'internet-lemot',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 20,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) { a.doingEvent = 'mencabut-pasang kabel'; a.goTo('server'); }
  },
  tick(E, dt, S) {
    if (E.data.beres) return;
    MOD.lemot = 0.75;
    MOD.switchBadai = 0;
    // ikon tunggu di atas kepala yang sedang bekerja: tiga titik bergantian
    for (const o of S.bekerja) {
      const k = Math.floor(now / 260) % 3;
      for (let i = 0; i < 3; i++) {
        r(o.x - 2 + i * 2, o.y - 30, 1, 1, i === k ? '#e8c86a' : '#7a6f4a');
      }
    }
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'server') pada(E, 12, () => {
      E.data.beres = true;
      a.say('ini jaringannya atau HP saya?');
      for (let i = 0; i < 5; i++) spawn('data', 392, 130);
    });
  },
},

{
  id: 'blink-storm-switch',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 20,
  bentrokDengan: ['kabel-lan-lepas'],
  mulai(E) {
    const a = pemeranDekat(E, 390, 164, 220);
    if (a) { a.doingEvent = 'mencabut kabel switch'; a.goTo('server'); }
  },
  tick(E) {
    if (E.data.reda) return;
    MOD.switchBadai = 1;
    if (Math.random() < 0.14) spawn('data', 390, 122);
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'server') {
      pada(E, 6, () => a.say('ada yang colok dua ujung ke switch yang sama'));
      pada(E, 12, () => { E.data.reda = true; });
    }
  },
},

{
  id: 'kipas-berdiri-macet',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 14,
  mulai(E) {
    const a = pemeranDekat(E, 400, 252, 200);
    if (a) { a.doingEvent = 'memutar baling kipas'; a.goToXY(400, 266, 'up'); }
  },
  tick(E) {
    if (E.data.jalan) return;
    MOD.kipas = 0;               // baling berhenti di sudut apa pun ia berada
    MOD.kipasGetar = 1;          // motornya bergetar, itu bedanya dengan mati
    if (Math.random() < 0.06) spawn('dust', 400, 254);
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'angkat';
      pada(E, 6, () => {
        E.data.jalan = true; a.pose = null;
        a.say('dinamonya panas, dikasih napas dulu');
      });
    }
  },
},

{
  id: 'kipas-oleng',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 14,
  mulai(E) {
    const a = pemeranDekat(E, 400, 300, 180);
    if (a) { a.doingEvent = 'mengganjal kaki kipas'; a.goToXY(400, 296, 'up'); }
  },
  tick(E) {
    const redam = E.data.tahanSejak ? Math.max(0, 1 - (E.umur - E.data.tahanSejak) / 2) : 1;
    MOD.kipasGoyang = 2 * redam;
    if (redam > 0.4 && Math.random() < 0.08) spawn('dust', 400, 292);
    // kertas di meja kerja kanan ikut beterbangan selama kipasnya masih oleng
    if (redam > 0.4 && Math.random() < 0.05) spawn('paper', 374, 300);
    const a = E.aktor[0];
    if (a && a.diam && !E.data.tahanSejak) {
      E.data.tahanSejak = E.umur;
      a.pose = 'jongkok';
      a.say('ganjal dulu, ganjal');
    }
  },
},

{
  id: 'kipas-dibersihkan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 24,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 15,
  mulai(E) {
    const a = pemeran(E, ['magang', 'arsiparis']);
    if (a) { a.doingEvent = 'melap baling kipas'; a.goToXY(388, 292, 'right'); }
  },
  tick(E) {
    MOD.kipas = Math.max(0, 1 - E.umur / 4);      // melambat sampai berhenti
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'lap';
    if (E.umur > 6 && E.umur < 18 && Math.random() < 0.3) {
      spawn('dust', 400, 254, '#cbb897');
    }
    pada(E, 8, () => a.say('debunya setahun tidak dilap'));
    pada(E, 20, () => { a.pose = null; });
  },
},

{
  id: 'meja-kerja-goyang',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 20,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam),
  mulai(E) {
    const duduk = S.orang.filter((o) => o.station === 'think' && o.diam);
    const korban = pilih(duduk);
    if (!korban) return;
    E.data.slot = korban.slotIdx;
    const a = pemeranDekat(E, korban.x, korban.y, 30) || korban;
    if (a.eventKerja) { a.doingEvent = 'mengganjal kaki meja'; }
    E.data.a = a;
  },
  tick(E) {
    if (E.data.ganjal) return;
    MOD.mejaGetar = E.data.slot;
    const a = E.data.a;
    if (!a || !a.eventKerja) return;
    pada(E, 1.5, () => a.say('goyang terus dari kemarin'));
    pada(E, 3, () => { a.doingEvent = 'ambil karton'; a.goToXY(440, 250, 'up'); });
    pada(E, 10, () => { a.bawa = 'kardus'; a.goToXY(MEJA_KERJA_X[E.data.slot], 300, 'down'); });
    pada(E, 16, () => { a.pose = 'jongkok'; });
    pada(E, 19, () => { E.data.ganjal = true; a.pose = null; a.bawa = null; });
  },
},

{
  id: 'cat-dinding-mengelupas',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 30,
  syarat: () => RUANGAN.catMengelupas < 0.9,
  mulai(E) {
    const a = pemeran(E, ['humas', 'magang']);
    if (a) { a.doingEvent = 'menutup bercak cat'; a.goToXY(200, 152, 'up'); }
  },
  tick(E, dt) {
    // bercaknya tumbuh dulu, baru ditutup — dan kertas penutupnya tinggal
    if (E.umur < 12) RUANGAN.catMengelupas = Math.min(0.9, RUANGAN.catMengelupas + dt * 0.07);
    if (E.umur < 12 && Math.random() < 0.06) spawn('dust', 200, 58, '#d8d2c2');
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'duaangkat';
      pada(E, 16, () => a.say('ditutup dulu, anggarannya tahun depan'));
      pada(E, 24, () => { E.data.tutup = true; a.pose = null; });
    }
  },
  gambarDinding(E) {
    if (!E.data.tutup) return;
    r(194, 36, 10, 13, P.paper);            // kertas A4 penutup, menetap
    for (const [dx, dy] of [[0, 0], [9, 0], [0, 12], [9, 12]]) r(194 + dx, 36 + dy, 1, 1, '#c9c2ae');
  },
  selesai(E) {
    if (E.data.tutup) RUANGAN.catMengelupas = 0;   // ditutup kertas, bukan dicat
  },
},

{
  id: 'tanaman-layu-disiram',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 34,
  perluAktor: true,
  mulai(E) {
    RUANGAN.tanamanLayu = 1;
    const a = pemeran(E, ['magang', 'arsiparis', 'humas']);
    if (a) { a.doingEvent = 'menyiram tanaman'; a.goToXY(330, 268, 'up'); }
  },
  tick(E, dt) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 6, () => { a.bawa = 'gelas'; a.goToXY(44, 268, 'left'); });
    pada(E, 18, () => a.say('kasihan, kering'));
    if (E.umur > 18 && E.umur < 26) {
      a.pose = 'jongkok';
      if (Math.random() < 0.25) spawn('drip', 34, 262);
      RUANGAN.tanamanLayu = Math.max(0, RUANGAN.tanamanLayu - dt * 0.14);
    }
    pada(E, 27, () => { a.pose = null; a.bawa = null; });
  },
},

{
  id: 'token-listrik-hampir-habis',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 26,
  sortY: 118,
  mulai(E) {
    E.data.sisa = 12.4;
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (a) { a.doingEvent = 'memasukkan token listrik'; a.goToXY(396, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (E.umur < 12) {
      E.data.sisa = [12.4, 9.8, 6.1][Math.min(2, Math.floor(E.umur / 4))];
    }
    if (a && a.diam) {
      a.pose = 'angkat';
      a.bawa = 'kertas';
      // dua puluh digit, satu per satu — itu inti leluconnya
      if (E.umur > 10 && E.umur < 18 && Math.random() < 0.35) spawn('glyph', 400, 128);
      pada(E, 12, () => a.say('dua puluh digit, jangan diajak ngomong'));
      pada(E, 19, () => { E.data.sisa = 84.6; E.data.hijau = true; a.pose = null; a.bawa = null; });
    }
  },
  gambarDinding(E) {
    const x = 390, y = 60;
    r(x, y, 16, 12, '#e2ddc8');
    r(x, y, 16, 1, '#f2eeda');
    const merah = !E.data.hijau && Math.sin(now / 300) > 0;
    r(x + 3, y + 3, 10, 5, merah ? '#3a1414' : '#141a20');
    ctx.fillStyle = E.data.hijau ? '#7ee787' : (merah ? '#e8453f' : '#8a5a5a');
    ctx.font = '5px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(E.data.sisa), x + 4, y + 6);
    r(x + 4, y + 9, 8, 1, '#b9b2a0');
  },
},

/* ==========================================================================
   INSIDEN — yang rusak, tumpah, jatuh, dan macet
   ========================================================================== */

{
  id: 'printer-macet-kertas',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 18,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 250);
    if (a) { a.doingEvent = 'menarik kertas printer'; a.goTo('web'); }
  },
  tick(E) {
    if (E.data.beres) return;
    MOD.printerMacet = true;
    const a = E.aktor[0];
    if (a && a.diam && a.station === 'web') {
      a.pose = 'jongkok';
      pada(E, 5, () => a.say('ditarik pelan, jangan dilawan'));
      pada(E, 9, () => {
        E.data.beres = true; a.pose = null;
        spawn('paper', 214, 96); spawn('paper', 214, 96);
        const p = spawn('paper', 212, 96); if (p) p.g = 120;    // sobek, satu jatuh
      });
    }
  },
},

{
  id: 'berkas-jatuh',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 20,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'memungut berkas';
    a.bawa = 'map';
    a.goToXY(acak(200, 240), LANE_DOWN, 'down');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    if (!E.data.jatuh && a.diam) {
      E.data.jatuh = true;
      a.bawa = null;
      a.say('aduh, maaf');
      for (let i = 0; i < 12; i++) spawn('paper', a.x, a.y - 12);
      for (let i = 0; i < 8; i++) {
        RUANGAN.kertasLantai.push({ x: a.x + acak(-26, 26), y: a.y + acak(-6, 8), sisa: 14 });
      }
      // dua orang terdekat ikut memungut, bukan cuma menonton
      const bantu = pinjamAktor(E, 2, (o) => jarakKe(o, a.x, a.y) < 110);
      for (const b of bantu) { b.doingEvent = 'membantu memungut'; b.goToXY(a.x + acak(-20, 20), a.y + 4, 'down'); }
      E.data.mulaiPungut = E.umur + 4;
    }
    if (E.data.jatuh && E.umur > E.data.mulaiPungut) {
      for (const o of E.aktor) if (o.diam) o.pose = 'jongkok';
      // satu lembar hilang tiap setengah detik, jadi lantainya bersih pelan-pelan
      if (Math.floor(E.umur * 2) !== E.data.p) {
        E.data.p = Math.floor(E.umur * 2);
        RUANGAN.kertasLantai.pop();
      }
    }
  },
  selesai(E) {
    for (const o of E.aktor) o.pose = null;
  },
},

{
  id: 'karpet-terlipat',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 16,
  mulai(E) {
    E.data.sudut = pilih([[156, 178], [330, 178], [156, 244], [330, 244]]);
    const a = pemeranDekat(E, E.data.sudut[0], LANE_DOWN, 220);
    if (a) { a.doingEvent = 'meratakan karpet'; a.goToXY(E.data.sudut[0], 250, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam && !E.data.rata) {
      pada(E, 6, () => a.say('aduh'));
      pada(E, 8, () => { a.pose = 'jongkok'; });
      pada(E, 13, () => {
        E.data.rata = true; a.pose = null;
        for (let i = 0; i < 4; i++) spawn('dust', E.data.sudut[0], E.data.sudut[1]);
      });
    }
  },
  gambarLantai(E) {
    if (E.data.rata) return;
    const [sx, sy] = E.data.sudut;
    const kiri = sx < 240;
    ctx.fillStyle = '#5c2626';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (kiri ? 14 : -14), sy);
    ctx.lineTo(sx, sy + (sy < 200 ? 10 : -10));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.25;
    r(sx + (kiri ? 0 : -14), sy + (sy < 200 ? 10 : -12), 14, 2, '#2c1414');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'colokan-terminal-penuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 1080, durasi: 16,
  syarat: (S) => S.orang.filter((o) => o.station === 'think').length >= 3,
  sortY: 340,
  mulai(E) {
    const a = pemeranDekat(E, 176, 316, 90);
    if (a) { a.doingEvent = 'mencabut charger'; a.goToXY(160, 330, 'down'); }
  },
  tick(E) {
    if (!E.data.cabut) {
      pada(E, 1, () => { for (let i = 0; i < 3; i++) spawn('idea', 158, 332, '#ffd06a'); });
      pada(E, 2.5, () => { for (let i = 0; i < 3; i++) spawn('idea', 158, 332, '#ffd06a'); });
      MOD.mejaPadam = 0;
    }
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'jongkok';
      pada(E, 8, () => a.say('jangan ditumpuk sambung-sambung, Bu'));
      pada(E, 11, () => { E.data.cabut = true; a.pose = null; });
    }
  },
  gambarProp(E) {
    r(150, 336, 16, 5, '#eef0ea');                 // terminal colokan
    r(150, 336, 16, 1, '#ffffff');
    const n = E.data.cabut ? 3 : 4;
    for (let i = 0; i < n; i++) r(152 + i * 4, 333, 3, 3, '#c9cdd1');
    for (let i = 0; i < 3; i++) {                   // kabel semrawut
      for (let k = 0; k < 10; k++) {
        r(152 + i * 4 + Math.round(Math.sin(k / 2 + i) * 2), 341 + k, 1, 1, '#4a5058');
      }
    }
  },
},

);

/* ==========================================================================
   BIROKRASI — ritual dinas: disposisi, paraf, stempel, tamu, inspeksi
   ========================================================================== */

daftarEvent(

{
  id: 'disposisi-surat-masuk',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 18,
  syarat: (S) => S.kerjaJam && RUANGAN.mapDisposisi < 5,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang', 'arsiparis']);
    if (!a) return;
    a.doingEvent = 'mengantar surat masuk';
    a.bawa = 'map-pink';
    a.goToXY(286, 152, 'up');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a) return;
    if (a.diam && !E.data.taruh) {
      E.data.taruh = true;
      RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
      a.bawa = null;
      a.say('surat masuk, Bu');
      // yang sedang di meja stempel berhenti sebentar dan menerimanya
      const tuan = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
      if (tuan) {
        hadapkan(tuan, a.x, a.y);
        tuan.busyUntil = Math.max(tuan.busyUntil, now + 1500);
        spawn('paper', 292, 130); spawn('paper', 292, 130);
      }
    }
    pada(E, 12, () => a.goToXY(-20, LANE_DOWN, 'left'));
  },
},

/* Mekanisme "hilang di balik pintu" dipakai ulang penilaian-skp: yang masuk
   ruang kadis memudar di ambang, bukan menghilang mendadak. */
{
  id: 'antre-tanda-tangan-kadis',
  kelas: 'panggung', bobot: B.sedang, cooldown: 240, durasi: 30,
  perluAktor: true,
  syarat: (S) => S.kerjaJam,
  mulai(E) {
    const orang = pinjamAktor(E, 3);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'antre tanda tangan';
      a.bawa = 'map';
      a.goToXY(470 - i * 12, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    MOD.pintuKadis = E.data.diDalam != null;
    if (E.data.diDalam == null && E.umur > (E.data.berikut || 3)) {
      E.data.diDalam = 0;
      E.data.masukPada = E.umur;
      q[0].goToXY(456, 146, 'up');
    }
    if (E.data.diDalam != null) {
      const t = E.umur - E.data.masukPada;
      const a = q[0];
      if (!a) return;
      a.alpha = t < 0.8 ? Math.max(0, 1 - t / 0.8) : (t > 4.8 ? Math.min(1, (t - 4.8) / 0.8) : 0);
      if (t > 5.6) {
        a.alpha = 1;
        const ditolak = Math.random() < 0.25;
        if (!ditolak) { spawn('ink', 452, 132); spawn('ink', 452, 132); a.say('acc, tinggal dicap'); }
        a.doingEvent = ditolak ? 'mapnya dikembalikan' : 'mencapkan berkas';
        a.goTo(ditolak ? 'read' : 'edit');
        lepaskanAktor(a);
        q.shift();
        q.forEach((o, i) => o.goToXY(470 - i * 12, 152, 'up'));   // antrean maju
        E.data.diDalam = null;
        E.data.berikut = E.umur + 3;
      }
    }
  },
},

{
  id: 'penilaian-skp',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 45,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && S.orang.length >= 2,
  bentrokDengan: ['antre-tanda-tangan-kadis'],
  mulai(E) {
    const orang = pinjamAktor(E, 2);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'menghadap penilaian SKP';
      a.goToXY(468 - i * 12, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    MOD.pintuKadis = true;
    if (E.data.masuk == null && E.umur > (E.data.berikut || 4)) {
      E.data.masuk = E.umur;
      q[0].goToXY(456, 146, 'up');
    }
    if (E.data.masuk != null) {
      const t = E.umur - E.data.masuk, a = q[0];
      if (!a) return;
      a.alpha = t < 0.8 ? Math.max(0, 1 - t / 0.8) : (t > 9 ? Math.min(1, (t - 9) / 0.8) : 0);
      if (t > 9.9) {
        a.alpha = 1;
        // dua nasib berbeda; itu yang memberi ceritanya, bukan animasinya
        const baik = Math.random() < 0.55;
        a.bawa = baik ? 'map-hijau' : 'map-merah';
        a.say(baik ? 'nilainya baik, alhamdulillah' : 'uraian tugasnya disuruh dirapikan');
        if (baik) for (let i = 0; i < 3; i++) spawn('idea', a.x, a.y - 26);
        a.doingEvent = baik ? 'kembali ke meja' : 'merapikan uraian tugas';
        a.goTo(baik ? 'think' : 'read');
        if (!baik) { RUANGAN.laciBuka = 6; spawn('dust', 60, 130); }
        lepaskanAktor(a);
        q.shift();
        q.forEach((o, i) => o.goToXY(468 - i * 12, 152, 'up'));
        E.data.masuk = null;
        E.data.berikut = E.umur + 4;
      }
    }
  },
},

{
  id: 'nota-dinas-keliling',
  kelas: 'panggung', bobot: B.sedang, cooldown: 600, durasi: 40,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E) {
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (!a) return;
    a.doingEvent = 'mengedarkan nota dinas';
    a.bawa = 'map';
    E.data.i = 0;
    a.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    if (E.umur - E.data.tibaPada > 3) {
      const mejaX = MEJA_KERJA_X[E.data.i];
      // meja kosong dilewati tanpa berhenti — tidak ada yang diparaf di situ
      const tuan = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - mejaX) < 8);
      if (tuan) {
        hadapkan(tuan, a.x, a.y);
        tuan.busyUntil = Math.max(tuan.busyUntil, now + 1200);
        spawn('ink', mejaX, 300);
      }
      E.data.i++;
      E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) {
        if (!E.data.pulang) {
          E.data.pulang = true;
          a.doingEvent = 'menyimpan nota';
          a.goToXY(132, 152, 'up');
        } else if (a.bawa) {
          RUANGAN.tumpukanFiling = Math.min(6, RUANGAN.tumpukanFiling + 1);
          RUANGAN.laciBuka = 3;
          a.bawa = null;
        }
      } else {
        a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
      }
    }
    pada(E, 4, () => a.say('paraf dulu, Pak, nota dinasnya'));
  },
},

{
  id: 'laporan-bulanan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2100, durasi: 55,
  perluAktor: true,
  syarat: (S) => S.tanggal >= 25 || (S.jam >= 8 && S.jam < 10),
  mulai(E) {
    const orang = pinjamAktor(E, 3);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'menyetor laporan bulanan';
      a.bawa = 'map';
      a.goToXY(110 + i * 16, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    if (E.umur > (E.data.berikut || 5)) {
      const a = q.shift();
      if (a) {
        a.bawa = null;
        a.say('laporan bulanan, sudah lengkap');
        RUANGAN.laciBuka = 3;
        // tumpukan di ATAS kabinet: bekas yang masih terlihat lama sesudahnya
        RUANGAN.tumpukanFiling = Math.min(6, RUANGAN.tumpukanFiling + 1);
        spawn('dust', 138, 130); spawn('dust', 138, 130);
        lepaskanAktor(a);
      }
      E.data.berikut = E.umur + 6;
      q.forEach((o, i) => o.goToXY(110 + i * 16, 152, 'up'));
    }
  },
},

{
  id: 'surat-edaran-berparaf',
  kelas: 'panggung', bobot: B.sedang, cooldown: 1500, durasi: 28,
  perluAktor: true,
  mulai(E, S) {
    const a = pemeran(E, ['arsiparis', 'humas', 'magang']);
    if (!a) return;
    a.doingEvent = 'mengedarkan surat edaran';
    a.bawa = 'map';
    E.data.tujuan = S.orang.filter((o) => o !== a).slice(0, 3);
    E.data.i = 0;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    const t = E.data.tujuan[E.data.i];
    if (!t) {
      MOD.pintuKadis = true;
      pada(E, 24, () => { a.bawa = null; a.goToXY(452, 152, 'up'); });
      return;
    }
    if (!E.data.menuju) { E.data.menuju = true; a.goToXY(t.x + 14, t.y, 'left'); }
    if (a.diam) {
      if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
      // yang sedang bekerja tidak diganggu: pembawanya menunggu di sampingnya
      const tunda = t.state === 'work' ? 3 : 0;
      if (E.umur - E.data.tibaPada > 2.5 + tunda) {
        spawn('ink', t.x, t.y - 14); spawn('ink', t.x, t.y - 14);
        hadapkan(t, a.x, a.y);
        E.data.i++; E.data.menuju = false; E.data.tibaPada = null;
      }
    }
    pada(E, 3, () => a.say('paraf sebelah sini, Bu'));
  },
},

{
  id: 'berkas-kurang-lampiran',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 30,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mencari lampiran';
    a.bawa = 'map';
    a.goToXY(286, 152, 'up');
    RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 4, () => a.say('kurang lampiran SPTJM, ambil dulu di arsip'));
    pada(E, 6, () => a.goToXY(54, 152, 'up'));
    pada(E, 14, () => {
      RUANGAN.laciBuka = 4;
      for (let i = 0; i < 3; i++) spawn('dust', 60, 130);
      a.bawa = 'kertas';
    });
    pada(E, 17, () => a.goToXY(286, 152, 'up'));
    pada(E, 26, () => {
      a.bawa = null;
      hentakkanStempel(a);
      RUANGAN.mapDisposisi = Math.max(0, RUANGAN.mapDisposisi - 2);
    });
  },
},

{
  id: 'stempel-tinta-kering',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 20,
  perluAktor: true,
  mulai(E) {
    RUANGAN.bantalanKering = true;
    const a = pemeranDekat(E, 286, 164, 400);
    if (a) { a.doingEvent = 'mengisi bantalan stempel'; a.goToXY(286, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 2, () => a.say('tintanya kering'));
    pada(E, 4, () => { a.doingEvent = 'ambil botol tinta'; a.goToXY(132, 152, 'up'); });
    pada(E, 10, () => { a.bawa = 'botol'; a.goToXY(286, 152, 'up'); });
    pada(E, 16, () => {
      for (let i = 0; i < 5; i++) spawn('ink', 278, 92);
      RUANGAN.bantalanKering = false;
      // noda di meja tidak pernah hilang; itu bekas yang jujur
      RUANGAN.nodaMeja.push({ x: 22 + ((Math.random() * 12) | 0), y: 24 });
      a.bawa = null;
    });
  },
  selesai() { RUANGAN.bantalanKering = false; },
},

/* Menempel pada kode yang sudah jalan: update() sudah tahu momen stempel
   menghantam meja. Ini cuma menambahkan tiupan supaya capnya cepat kering. */
{
  id: 'stempel-basah-berkilau',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 5,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      for (let i = 0; i < 5; i++) {
        const p = spawn('steam', a.x + 4, a.y - 20);
        if (p) { p.vx = 18; p.vy = -2; }        // ditiup mendatar, bukan naik
      }
    });
  },
},

{
  id: 'coret-coret-pulpen-macet',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 3,
  syarat: (S) => S.stasiunAktif.has('edit') && RUANGAN.coretKertas < 3,
  tick(E) {
    // tiga goresan: dua nyaris tak terlihat, yang ketiga baru pekat
    RUANGAN.coretKertas = Math.min(3, Math.floor(E.umur / 0.8) + 1);
    pada(E, 2.4, () => spawn('ink', 262, 104));
  },
},

{
  id: 'tamu-di-ruang-tunggu',
  kelas: 'panggung', bobot: B.sedang, cooldown: 600, durasi: 50,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 15,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'melayani tamu';
    E.data.tamu = { x: -14, y: 288, fase: 'masuk' };
    a.goToXY(288, 282, 'right');
  },
  tick(E, dt) {
    const T = E.data.tamu, a = E.aktor[0];
    if (!T || !a) return;
    if (T.fase === 'masuk') {
      T.x = Math.min(300, T.x + 46 * dt);
      if (T.x >= 300) T.fase = 'tunggu';
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
    } else if (T.fase === 'ikut') {
      T.x += (292 - T.x) * Math.min(1, dt * 1.6);
      T.y += (168 - T.y) * Math.min(1, dt * 1.6);
    }
    if (a.diam && T.fase === 'tunggu') {
      hadapkan(a, T.x, T.y);
      if (Math.random() < 0.05) spawn('talk', T.x, T.y - 26);
      if (Math.random() < 0.05) spawn('talk', a.x, a.y - 26);
      pada(E, 16, () => a.say('mau legalisir, Pak'));
      pada(E, 26, () => { T.fase = 'ikut'; a.goToXY(286, 152, 'up'); });
    }
    pada(E, 38, () => { for (let i = 0; i < 5; i++) spawn('ink', 292, 140); });
    pada(E, 42, () => { T.fase = 'pulang'; T.y = 288; });
  },
  gambarProp(E) {
    const T = E.data.tamu;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#6b4a2a', '#d9ab5e', 'map-biru');
  },
  sortY: 300,
},

{
  id: 'apar-diperiksa',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 26,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 10 && !RUANGAN.kartuAPAR,
  mulai(E) {
    const a = pemeran(E, ['auditor', 'sandiman', 'teknisi']);
    if (a) { a.doingEvent = 'memeriksa APAR'; a.goToXY(335, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    // diangkat, lalu diguncang pelan untuk mengecek isinya
    if (E.umur > 4 && E.umur < 14) RUANGAN.aparAngkat = 6 + (Math.sin(now / 60) > 0 ? 1 : 0);
    pada(E, 14, () => { RUANGAN.aparAngkat = 0; });
    pada(E, 16, () => { for (let i = 0; i < 5; i++) spawn('ink', 341, 108); });
    pada(E, 18, () => { RUANGAN.kartuAPAR = true; a.say('kedaluwarsa bulan depan, dicatat dulu'); });
    pada(E, 23, () => { a.pose = 'salam'; });      // hormat kecil ke APAR
  },
  selesai(E) { RUANGAN.aparAngkat = 0; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'kalender-dinas-diganti',
  kelas: 'latar', bobot: B.langka, cooldown: 2700, durasi: 24,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menyobek kalender'; a.goToXY(166, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    pada(E, 4, () => {
      RUANGAN.kalenderBulan++;
      RUANGAN.bulanKalenderTanggal = new Date().getDate();
      spawn('lembar', 164, 76);
    });
    pada(E, 8, () => { a.pose = null; a.say('tanggal merahnya cuma satu'); });
    pada(E, 10, () => {
      const b = pemeranDekat(E, 200, 300, 220);
      if (b) { b.doingEvent = 'ikut menghitung tanggal'; b.goToXY(180, 152, 'up'); }
    });
  },
  selesai(E) { for (const o of E.aktor) o.pose = null; },
},

/* Penghitung `baca` yang menghentikan perilaku setelah tiga orang adalah inti
   event ini: sesudah itu seisi kantor sudah tahu isinya, dan berhenti berhenti
   membaca. Satu integer, tapi perubahannya benar-benar terlihat. */
{
  id: 'pengumuman-padam-ditempel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 30,
  perluAktor: true,
  mulai(E) {
    E.data.baca = 0;
    const a = pemeran(E, ['humas', 'arsiparis']);
    if (a) { a.doingEvent = 'menempel pengumuman'; a.goToXY(178, 152, 'up'); }
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (a && a.diam && !E.data.tempel) {
      a.pose = 'duaangkat';
      pada(E, 4, () => {
        E.data.tempel = true;
        a.pose = null;
        for (let i = 0; i < 4; i++) spawn('paper', 184, 60);
        a.say('rabu depan padam dari jam sembilan');
      });
    }
    if (E.data.tempel && E.data.baca < 3) {
      for (const o of S.orang) {
        if (o.eventKerja || o.path.length || o.y > 200) continue;
        if (Math.abs(o.x - 184) > 16) continue;
        if (o.bacaSampai && now < o.bacaSampai) continue;
        o.bacaSampai = now + 2000;
        hadapkan(o, 184, 60);
        o.busyUntil = Math.max(o.busyUntil, now + 2000);
        E.data.baca++;
        if (E.data.baca === 2) o.say('wah, rabu depan');
        break;
      }
    }
  },
  gambarDinding(E) {
    if (!E.data.tempel) return;
    const x = 178, y = 52;
    const goyang = Math.sin(now / 900) > 0.9 ? 1 : 0;   // kena angin kipas
    r(x + goyang, y, 12, 16, P.paper);
    r(x + 2 + goyang, y + 2, 8, 1, P.red);
    for (let i = 0; i < 4; i++) r(x + 2 + goyang, y + 5 + i * 2, 8 - (i % 2) * 2, 1, '#b9c0ca');
    r(x + 10 + goyang, y + 14, 2, 2, '#e4e0d2');        // sudut menggulung
  },
},

{
  id: 'rapat-daring',
  kelas: 'panggung', bobot: B.sedang, cooldown: 1080, durasi: 55,
  perluAktor: true,
  syarat: (S) => S.jam >= 9 && S.jam < 15 && kursiKosong() >= 8,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a) => {
      a.doingEvent = 'rapat daring provinsi';
      a.goTo('rapat');
    });
  },
  tick(E) {
    // yang lewat depan meja rapat memelankan langkah — menjaga suara
    MOD.senyapDari = 152; MOD.senyapSampai = 340;
    const beku = Math.sin(E.umur / 8 * Math.PI * 2) > 0.86;
    E.data.beku = beku;
    if (!beku && Math.random() < 0.02) spawn('ping', 246, 178);
    if (beku && !E.data.sempatBicara) {
      E.data.sempatBicara = true;
      const a = E.aktor[0];
      if (a) a.say(pilih(['suaranya putus-putus, Pak', 'mohon izin, jaringan kami kurang stabil']));
    }
    if (!beku) E.data.sempatBicara = false;
  },
  gambarProp(E) {
    const x = 240, y = 178;
    r(x, y, 12, 8, E.data.beku ? '#6a7078' : '#1c4e8a');
    r(x, y - 1, 12, 1, '#9aa1a6');
    if (!E.data.beku) {
      const k = Math.floor(now / 260) % 3;
      for (let i = 0; i < 3; i++) r(x + 2, y + 2 + i * 2, 3 + i * 2, 1, i === k ? '#ffffff' : '#7aa5e8');
    }
    r(x - 1, y + 8, 14, 2, '#b6bcc1');
  },
  sortY: 200,
},

/* Paling jujur di kelompok rapat: tidak memindahkan siapa pun. Dipicu justru
   saat sembilan kursi memang penuh oleh peserta nyata dari Task/Workflow. */
{
  id: 'rapat-pleno-kursi-penuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 300, durasi: 12,
  syarat: () => kursiKosong() === 0,
  tick(E) {
    MOD.lampuMin = Math.max(MOD.lampuMin, 0.15);
    const giliran = Math.floor(E.umur / 1.2);          // searah jarum jam
    if (giliran !== E.data.g) {
      E.data.g = giliran;
      const duduk = [...penghuni()].filter((o) => o.station === 'rapat');
      const o = duduk[giliran % Math.max(1, duduk.length)];
      if (o) { spawn('talk', o.x, o.y - 26); spawn('talk', o.x, o.y - 26); }
    }
    pada(E, 10, () => {
      for (const o of penghuni()) {
        if (o.station !== 'rapat') continue;
        spawn('paper', o.x, o.y - 20); spawn('paper', o.x, o.y - 20);
      }
    });
  },
  gambarProp() {
    r(238, 196, 10, 4, P.paper);          // tumpukan berkas di tengah meja
    r(238, 196, 10, 1, '#d9d4c2');
    r(252, 198, 2, 2, Math.sin(now / 300) > 0 ? '#e8453f' : '#5c2222');   // LED mik
  },
  sortY: 205,
},

);

/* ==========================================================================
   KULTUR KANTOR — yang bikin ruangan ini terbaca kantor Indonesia
   ========================================================================== */

daftarEvent(

{
  id: 'kopi-sachet-di-dispenser',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 10,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menyeduh kopi';
    a.goToXY(334, 268, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    if (Math.random() < 0.3) spawn('steam', a.x + 6, a.y - 18);
    pada(E, 4, () => { a.bawa = 'gelas'; a.bawaSampai = now + 60000; });
    pada(E, 6, () => { spawn('paper', 352, 280, '#8a6844'); });   // sachet ke tong
    pada(E, 8, () => { a.pose = null; RUANGAN.gelasDispenser = Math.max(0, RUANGAN.gelasDispenser - 1); });
  },
},

{
  id: 'kopi-jam-sepuluh',
  kelas: 'panggung', bobot: B.sering, cooldown: 180, durasi: 25,
  perluAktor: true,
  syarat: (S) => (S.jam >= 9.6 && S.jam < 10.4) || (S.jam >= 14.5 && S.jam < 15),
  mulai(E) {
    pinjamAktor(E, 3).forEach((a, i) => {
      a.doingEvent = 'ngopi bareng';
      a.goToXY(326 + i * 13, 268, 'up');
    });
  },
  tick(E) {
    const siap = E.aktor.filter((a) => a.diam);
    if (siap.length >= 2) {
      if (Math.random() < 0.09) spawn('steam', 335, 262);
      // 'talk' bergantian, tidak pernah bersamaan — itu yang bikin terbaca ngobrol
      const giliran = Math.floor(E.umur / 1.2) % siap.length;
      if (Math.floor(E.umur / 1.2) !== E.data.g) {
        E.data.g = Math.floor(E.umur / 1.2);
        spawn('talk', siap[giliran].x, siap[giliran].y - 26);
      }
    }
    pada(E, 5, () => { const a = E.aktor[0]; if (a) a.say('kopi dulu, baru berkas'); });
    pada(E, 20, () => {
      for (const a of E.aktor) { a.bawa = 'gelas'; a.bawaSampai = now + 60000; }
    });
  },
},

{
  id: 'ngobrol-di-dispenser',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 16,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => o.station === 'idle' && o.diam).length >= 2,
  mulai(E, S) {
    const di = S.orang.filter((o) => o.station === 'idle' && o.diam && bisaDipinjam(o)).slice(0, 2);
    for (const a of di) {
      a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
      a.doingEvent = 'ngobrol di dispenser';
    }
  },
  tick(E) {
    const [a, b] = E.aktor;
    if (!a || !b) return;
    hadapkan(a, b.x, b.y);
    hadapkan(b, a.x, a.y);
    const giliran = Math.floor(E.umur * 2) % 2;
    if (Math.floor(E.umur * 2) !== E.data.g) {
      E.data.g = Math.floor(E.umur * 2);
      const o = giliran ? a : b;
      spawn('talk', o.x, o.y - 26);
    }
    pada(E, 3, () => a.say('eh, sudah dengar belum...'));
  },
},

{
  id: 'gelas-kertas-dispenser-habis',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 3,
  syarat: (S) => RUANGAN.gelasDispenser <= 1 && S.orang.length >= 5,
  mulai(E) {
    const a = pemeranDekat(E, 330, 268, 220);
    if (a) { a.doingEvent = 'mengintip baki gelas'; a.goToXY(330, 268, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam) pada(E, 2, () => { RUANGAN.gelasDispenser = 0; a.say('gelasnya habis'); });
  },
},

{
  id: 'tegukan-terakhir-tinggal-ampas',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 3,
  syarat: (S) => S.orang.some((o) => o.bawa === 'gelas'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.bawa === 'gelas');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    // tidak ada 'steam' sama sekali — itu petunjuknya sudah dingin dan habis
    pada(E, 1, () => { a.pose = 'angkat'; });
    pada(E, 2.2, () => { a.pose = null; a.bawa = null; a.bawaSampai = 0; hadapkan(a, 330, 268); });
  },
},

{
  id: 'sisa-teh-disiram-ke-pot',
  kelas: 'latar', bobot: B.sering, cooldown: 840, durasi: 9,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menyiram sisa teh';
    a.bawa = 'gelas';
    a.goToXY(44, 268, 'left');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 3, () => { for (let i = 0; i < 5; i++) spawn('ink', 34, 262, '#8a6844'); a.say('biar subur'); });
    pada(E, 5, () => a.goToXY(352, 282, 'up'));       // buang gelas ke tong
    pada(E, 8, () => { a.bawa = null; a.bawaSampai = 0; });
  },
},

{
  id: 'gorengan-di-meja-rapat',
  kelas: 'panggung', bobot: B.sering, cooldown: 300, durasi: 22,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 3
    && ((S.jam >= 9.5 && S.jam < 11) || (S.jam >= 14.5 && S.jam < 16)),
  mulai(E) {
    E.data.sisa = 6;
    pinjamAktor(E, 4).forEach((a, i) => {
      a.doingEvent = 'mampir ke nampan';
      a.goToXY(214 + i * 22, 240, 'up');
    });
  },
  tick(E) {
    if (Math.random() < 0.04) spawn('steam', 246, 192);
    for (const a of E.aktor) {
      if (!a.diam || a.sudahAmbil) continue;
      a.sudahAmbil = true;
      if (E.data.sisa > 0) {
        E.data.sisa--;
        for (let i = 0; i < 3; i++) spawn('idea', a.x, a.y - 26, P.amber);
      } else {
        a.say('kehabisan');       // yang datang terakhir dapat nampan kosong
      }
    }
    pada(E, 4, () => { const a = E.aktor[0]; if (a) a.say('mumpung anget'); });
  },
  selesai(E) { for (const a of E.aktor) a.sudahAmbil = false; },
  gambarProp(E) {
    const x = 236, y = 196;
    r(x, y, 20, 5, '#c9cdd1');                        // nampan seng
    r(x, y, 20, 1, '#eef0f2');
    for (let i = 0; i < E.data.sisa; i++) {
      r(x + 1 + i * 3, y - 3, 3, 3, i % 2 ? '#b5762e' : '#c98a3a');
    }
  },
  sortY: 202,
},

{
  id: 'ojol-datang-bawa-pesanan',
  kelas: 'panggung', bobot: B.sedang, cooldown: 360, durasi: 14,
  perluAktor: true,
  syarat: (S) => S.jam >= 9 && S.jam < 15,
  mulai(E) {
    E.data.kurir = { x: -14, fase: 'masuk' };
    const a = pemeran(E);
    if (a) { a.doingEvent = 'mengambil pesanan'; a.goToXY(52, LANE_DOWN, 'left'); }
  },
  tick(E, dt) {
    const K = E.data.kurir, a = E.aktor[0];
    if (!K) return;
    if (K.fase === 'masuk') {
      K.x = Math.min(34, K.x + 52 * dt);
      if (K.x >= 34 && a && a.diam) {
        pada(E, 6, () => {
          for (let i = 0; i < 4; i++) spawn('paper', 44, LANE_DOWN - 14);
          a.say('atas nama Bu Sri ya, Pak');
          a.bawa = 'amplop';
          a.bawaSampai = now + 90000;
          K.fase = 'pulang';
        });
      }
    } else {
      K.x -= 52 * dt;
    }
  },
  gambarProp(E) {
    const K = E.data.kurir;
    if (!K || K.x < -12) return;
    gambarOrangLuar(K.x, LANE_DOWN, '#2f7a4a', null, null, '#3a7f52');
    r(Math.round(K.x) + 6, LANE_DOWN - 14, 6, 7, '#f2f0e6');    // kantong kresek
  },
  sortY: 260,
},

{
  id: 'tukang-bakso-lewat',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 18,
  syarat: (S) => S.jam >= 10 && S.jam < 16 && S.luar > 0.4,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 200);
    if (a) { a.doingEvent = 'menengok ke jendela'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('tok... tok... tok...'); });
  },
  gambarDinding(E) {
    // gerobaknya di kejauhan, jadi kecil dan terpotong bingkai jendela
    klipJendela(() => {
      const gx = JENDELA.x + JENDELA.w - (E.umur / 18) * (JENDELA.w + 16);
      const gy = JENDELA.y + JENDELA.h - 9;
      r(gx, gy, 10, 6, '#c96a2a');
      r(gx, gy, 10, 1, '#e08a44');
      r(gx + 1, gy + 6, 2, 2, '#3a3f45');
      r(gx + 7, gy + 6, 2, 2, '#3a3f45');
      r(gx - 3, gy - 1, 2, 5, '#2c3440');       // yang mendorong
    });
  },
},

{
  id: 'pedagang-gelar-dagangan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 3600, durasi: 40,
  perluAktor: true,
  syarat: (S) => S.jam >= 11 && S.jam < 14,
  mulai(E) {
    E.data.pedagang = { x: -14, fase: 'masuk' };
    pinjamAktor(E, 2).forEach((a, i) => {
      a.doingEvent = 'melihat dagangan';
      a.goToXY(196 + i * 18, 268, 'up');
    });
  },
  tick(E, dt) {
    const P2 = E.data.pedagang;
    if (P2.fase === 'masuk') {
      P2.x = Math.min(180, P2.x + 48 * dt);
      if (P2.x >= 180) { P2.fase = 'gelar'; }
    } else if (P2.fase === 'pulang') {
      P2.x -= 48 * dt;
    }
    for (const a of E.aktor) if (a.diam) a.pose = 'jongkok';
    pada(E, 12, () => { const a = E.aktor[0]; if (a) a.say('boleh bayar bulan depan?'); });
    pada(E, 32, () => {
      const a = E.aktor[0];
      if (a) { a.bawa = 'amplop'; a.bawaSampai = now + 90000; }
      P2.fase = 'pulang';
    });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
  gambarProp(E) {
    const P2 = E.data.pedagang;
    if (!P2 || P2.x < -12) return;
    if (P2.fase === 'gelar') {
      r(168, 264, 26, 10, '#8a5f8a');                 // kain digelar di lantai
      r(168, 264, 26, 1, '#a67fa6');
      for (let i = 0; i < 8; i++) {
        r(170 + (i % 4) * 6, 266 + ((i / 4) | 0) * 4, 4, 3,
          ['#c9a03a', '#3e6b4f', '#b03030', '#3565b0'][i % 4]);
      }
    }
    gambarOrangLuar(P2.x, 262, '#a4548a', '#e8c0d8', null, '#7a3a62');
  },
  sortY: 266,
},

{
  id: 'numpang-print',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 22,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'numpang print';
    a.goTo('web');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // tiga lembar berturut-turut, masing-masing satu semburan kertas
    const lembar = Math.floor((E.umur - 4) / 5);
    if (lembar >= 0 && lembar < 3 && lembar !== E.data.l) {
      E.data.l = lembar;
      spawn('paper', 214, 118); spawn('paper', 214, 118);
    }
    pada(E, 3, () => a.say('numpang print sebentar ya, tinta bidang saya habis'));
    pada(E, 19, () => { a.bawa = 'kertas'; a.bawaSampai = now + 30000; });
  },
},

{
  id: 'telepon-kantor-berdering',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 12,
  mulai(E) {
    const a = pemeranDekat(E, 300, 164, 200);
    if (a) { a.doingEvent = 'mengangkat telepon'; a.goTo('edit'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!E.data.diangkat) {
      if (Math.floor(E.umur / 1.2) !== E.data.d) {
        E.data.d = Math.floor(E.umur / 1.2);
        blip(720, 0.08);
      }
      if (a && a.diam && a.station === 'edit') {
        E.data.diangkat = true;
        a.say('halo, Dinas, dengan siapa ya?');
      }
    } else if (Math.random() < 0.04 && a) {
      spawn('talk', a.x, a.y - 26);
    }
    // tidak ada yang mengangkat sampai habis: deringnya berhenti sendiri
    pada(E, 11.5, () => { if (!E.data.diangkat) { spawn('talk', 300, 92); spawn('talk', 300, 92); } });
  },
  gambarProp(E) {
    const x = 300, y = 90;
    const getar = !E.data.diangkat && Math.sin(now / 50) > 0 ? 1 : 0;
    r(x, y, 12, 5, '#6a7078');
    r(x, y, 12, 1, '#8b9098');
    r(x + 1 + getar, y - 3, 10, 3, '#4a5058');        // gagang
    if (!E.data.diangkat) {
      ctx.strokeStyle = '#8b9098'; ctx.lineWidth = 1;
      const p2 = (Math.sin(now / 190) + 1) / 2;
      ctx.globalAlpha = 1 - p2;
      ctx.beginPath(); ctx.arc(x + 6, y, 4 + p2 * 4, Math.PI, 0); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  sortY: 118,
},

{
  id: 'tong-sampah-penuh',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 30,
  perluAktor: true,
  mulai(E) {
    RUANGAN.tongPenuh = 1;
    const a = pemeran(E, ['magang']);
    if (a) { a.doingEvent = 'mengganti kantong sampah'; a.goToXY(352, 292, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    if (a.diam && !E.data.ikat) pada(E, 6, () => { E.data.ikat = true; a.pose = 'jongkok'; a.say('sudah bau ini'); });
    pada(E, 10, () => { a.pose = null; a.bawa = 'kardus'; a.goToXY(452, 300, 'right'); });
    pada(E, 18, () => { RUANGAN.tongPenuh = 0; a.alpha = 0; });
    pada(E, 22, () => { a.alpha = 1; a.goToXY(352, 292, 'up'); });
    pada(E, 28, () => { a.bawa = null; });
  },
  gambarAtas(E) {
    if (RUANGAN.tongPenuh < 0.5) return;
    // dua lalat berputar pelan di atas tong; ini yang bikin orang memutar
    for (let i = 0; i < 2; i++) {
      const t = now / 420 + i * 3.1;
      r(350 + Math.cos(t) * 5, 282 + Math.sin(t * 1.3) * 3, 1, 1, '#2c3440');
    }
  },
},

{
  id: 'foto-pejabat-miring',
  kelas: 'latar', bobot: B.sering, cooldown: 420, durasi: 18,
  perluAktor: true,
  syarat: () => !RUANGAN.fotoMiring,
  mulai(E) {
    RUANGAN.fotoMiring = 0.09;
    const a = pemeran(E);
    if (a) { a.doingEvent = 'meluruskan foto'; a.goToXY(326, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'duaangkat';
    pada(E, 6, () => a.say('sedikit lagi ke kiri'));
    pada(E, 9, () => {
      RUANGAN.fotoMiring = 0;
      a.pose = null;
      spawn('dust', 326, 22); spawn('dust', 326, 22);
      // mundur dua langkah, memastikan sudah lurus — itu bagian terbaiknya
      a.goToXY(326, 176, 'up');
    });
  },
  selesai(E) { RUANGAN.fotoMiring = 0; for (const a of E.aktor) a.pose = null; },
},

{
  id: 'jendela-dilap',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1800, durasi: 36,
  perluAktor: true,
  syarat: (S) => S.jam >= 6.5 && S.jam < 9 && !S.stasiunAktif.has('web'),
  mulai(E) {
    E.data.buram = 1;
    const a = pemeran(E, ['magang', 'arsiparis']);
    if (a) { a.doingEvent = 'melap kaca jendela'; a.goToXY(212, 150, 'up'); }
  },
  tick(E, dt) {
    MOD.kacaBuram = E.data.buram;
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'lap';
    // enam sapuan mendatar; tiap sapuan menghapus sebagian kabut
    if (E.umur > 6) E.data.buram = Math.max(0, E.data.buram - dt * 0.05);
    pada(E, 30, () => { a.pose = null; a.say('kelihatan Monas-nya sekarang'); });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'saklar-hemat-energi',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 18,
  perluAktor: true,
  syarat: (S) => S.jam >= 9 && S.jam < 15 && S.luar > 0.9 && S.lampu < 0.05,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'mematikan neon'; a.goToXY(436, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam && !E.data.tekan) {
      a.pose = 'angkat';
      pada(E, 4, () => { E.data.tekan = true; a.pose = null; a.say('terang kok dari jendela'); });
    }
    if (E.data.tekan) { MOD.neonMati = [1, 1]; MOD.lampu = 0; }
  },
  gambarDinding() {
    r(430, 120, 5, 8, '#e2ddc8');            // saklar dinding
    r(431, 121, 3, 3, '#c9c2ae');
    r(431, 125, 3, 2, '#c9c2ae');
  },
},

{
  id: 'iuran-duka-cita',
  kelas: 'panggung', bobot: B.jarang, cooldown: 10800, durasi: 20,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['sekdis', 'kabid', 'humas']);
    if (!a) return;
    a.doingEvent = 'mengedarkan amplop';
    a.bawa = 'amplop';
    a.goToXY(246, 262, 'down');
  },
  /* Nada event ini dijaga: tidak ada partikel meriah, tidak ada balon kedua,
     neon berhenti berkedip, dan semua orang cuma berhenti sebentar. Yang
     membuatnya terasa justru karena ruangan mendadak tidak melakukan apa-apa. */
  tick(E, dt, S) {
    MOD.hening = true;
    MOD.ambPlus = 0.04;
    const a = E.aktor[0];
    if (!a) return;
    if (a.diam) menoleh(S.orang.filter((o) => o !== a), a.x, a.y, 4000);
    pada(E, 6, () => a.say('turut berdukacita'));
  },
},

{
  id: 'undangan-kondangan-diedarkan',
  kelas: 'latar', bobot: B.sedang, cooldown: 2700, durasi: 18,
  perluAktor: true,
  mulai(E, S) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mengedarkan undangan';
    a.bawa = 'amplop';
    E.data.tujuan = S.orang.filter((o) => o !== a).slice(0, 3);
    E.data.i = 0;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    const t = E.data.tujuan[E.data.i];
    if (!t) return;
    if (!E.data.menuju) { E.data.menuju = true; a.goToXY(t.x + 14, t.y, 'left'); }
    if (a.diam) {
      for (let i = 0; i < 4; i++) spawn('idea', t.x, t.y - 26);
      hadapkan(t, a.x, a.y);
      t.busyUntil = Math.max(t.busyUntil, now + 1600);
      if (E.data.i === 1) t.say('sabtu ya, jangan lupa');
      E.data.i++; E.data.menuju = false;
    }
    pada(E, 3, () => a.say('sabtu depan, di gedung serbaguna'));
  },
},

{
  id: 'main-hp-lalu-disimpan',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 12,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam && bisaDipinjam(o)),
  mulai(E, S) {
    const duduk = S.orang.filter((o) => o.station === 'think' && o.diam && bisaDipinjam(o));
    const a = pilih(duduk);
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'main HP sebentar';
    a.bawa = 'hp';
    a.pose = 'hp';
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || E.data.simpan) return;
    // ada yang lewat dekat: HP hilang dalam satu frame, lalu pura-pura mikir
    const lewat = S.orang.some((o) => o !== a && o.path.length && jarakKe(o, a.x, a.y) < 42);
    if (lewat || E.umur > 10) {
      E.data.simpan = true;
      a.bawa = null; a.pose = null;
      spawn('idea', a.x, a.y - 26); spawn('idea', a.x, a.y - 26);
      E.selesaiCepat = true;
    }
  },
},

{
  id: 'nguap-berantai',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 3.5,
  syarat: (S) => S.orang.filter((o) => o.diam).length >= 3
    && ((S.jam >= 13 && S.jam < 14.5) || S.jam >= 21),
  mulai(E, S) {
    const diam = S.orang.filter((o) => o.diam);
    const bibit = pilih(diam);
    if (!bibit) return;
    E.data.rantai = [bibit];
    for (const o of diam) {
      if (E.data.rantai.length >= 3) break;
      if (o === bibit) continue;
      if (jarakKe(o, bibit.x, bibit.y) < 95) E.data.rantai.push(o);
    }
  },
  tick(E) {
    const R = E.data.rantai;
    if (!R) { E.selesaiCepat = true; return; }   // mulai() tidak dapat bibit: batalkan, jangan meledak
    // menular berurutan; rantainya sendiri yang jadi reaksinya
    R.forEach((o, i) => {
      const mulai = i * 0.8;
      o.mulut = E.umur > mulai && E.umur < mulai + 0.6;
      if (o.mulut && !o.sudahNguap) {
        o.sudahNguap = true;
        spawn('steam', o.x, o.y - 24);
        spawn('steam', o.x, o.y - 24);
      }
    });
  },
  selesai(E) { for (const o of E.data.rantai || []) { o.mulut = false; o.sudahNguap = false; } },
},

{
  id: 'benerin-peci',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 2,
  syarat: (S) => S.orang.some((o) => o.pal.head === 'peci' && o.diam),
  mulai(E, S) {
    E.data.a = pilih(S.orang.filter((o) => o.pal.head === 'peci' && o.diam));
    if (!E.data.a) return;
    E.data.a.peciMiring = 1;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.5, () => { a.pose = 'angkat'; });
    pada(E, 1.4, () => { a.peciMiring = 0; a.pose = null; });
  },
  selesai(E) { if (E.data.a) { E.data.a.peciMiring = 0; E.data.a.pose = null; } },
},

{
  id: 'kipas-kipas-pakai-map',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 4,
  syarat: (S) => S.orang.length >= 5 && S.jam >= 11 && S.jam < 15,
  mulai(E, S) {
    const diam = S.orang.filter((o) => o.diam && bisaDipinjam(o));
    if (!diam.length) return;
    const a = pilih(diam);
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'kipas-kipas'; a.bawa = 'map'; a.pose = 'kipas';
    // tetangga ikut sedetik kemudian; gerah itu memang menular
    const b = diam.find((o) => o !== a && jarakKe(o, a.x, a.y) < 70);
    if (b && bisaDipinjam(b)) {
      b.eventKerja = E; b.betahAsli = b.betah; b.betah = true; E.aktor.push(b);
      E.data.b = b;
    }
  },
  tick(E) {
    if (Math.random() < 0.2 && E.aktor[0]) spawn('dust', E.aktor[0].x + 8, E.aktor[0].y - 18);
    pada(E, 1.5, () => {
      const b = E.data.b;
      if (b) { b.bawa = 'map'; b.pose = 'kipas'; }
    });
  },
},

{
  id: 'sandal-jepit-sore',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 8,
  syarat: (S) => S.jam >= 14.5 && S.orang.some((o) => o.station === 'think' && o.diam && !o.sandal),
  mulai(E, S) {
    const a = pilih(S.orang.filter((o) => o.station === 'think' && o.diam && !o.sandal));
    E.data.a = a;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 2, () => { a.pose = 'jongkok'; });
    pada(E, 5, () => { a.pose = null; a.sandal = true; });    // menetap sampai sesinya habis
  },
},

{
  id: 'dus-berdebu-bersin',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 7,
  syarat: (S) => S.stasiunAktif.has('read') || S.stasiunAktif.has('search'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => (o.station === 'read' || o.station === 'search') && o.state === 'work');
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { for (let i = 0; i < 16; i++) spawn('dust', a.x, a.y - 20); });
    pada(E, 2.2, () => {
      a.mulut = true;
      // bersin: enam 'talk' mendatar, bukan naik
      for (let i = 0; i < 6; i++) {
        const p = spawn('talk', a.x, a.y - 24);
        if (p) { p.vx = a.face === 'left' ? -30 : 30; p.vy = -2; }
      }
      a.say('hatsyi!');
      menoleh(S.orang.filter((o) => o !== a && jarakKe(o, a.x, a.y) < 80), a.x, a.y, 700);
    });
    pada(E, 2.9, () => { a.mulut = false; });
  },
  selesai(E) { if (E.data.a) E.data.a.mulut = false; },
},

{
  id: 'lama-menunggu-di-ruang-tunggu',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 20,
  perluAktor: true,
  syarat: (S) => S.orang.some((o) => o.station === 'idle' && o.diam && bisaDipinjam(o)),
  mulai(E, S) {
    const a = pilih(S.orang.filter((o) => o.station === 'idle' && o.diam && bisaDipinjam(o)));
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'menunggu kelamaan';
    a.goTo('rapat');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (Math.random() < 0.03) spawn('ink', a.x + 6, a.y - 16);
    if (Math.random() < 0.01) spawn('idea', a.x, a.y - 26);
    // sesekali melirik jam; menunggu itu memang mengukur waktu
    if (Math.floor(E.umur / 7) !== E.data.l) {
      E.data.l = Math.floor(E.umur / 7);
      hadapkan(a, 168, 38);
      MOD.jamSorot = 1;
    }
    pada(E, 3, () => a.say('masih nunggu disposisi'));
  },
},

{
  id: 'papasan-salaman-lorong',
  kelas: 'latar', bobot: B.sering, cooldown: 25, durasi: 2.2,
  syarat: (S) => cariPapasan(S) != null,
  mulai(E, S) {
    const p = cariPapasan(S);
    if (!p) return;
    E.data.p = p;
    for (const o of p) { o.busyUntil = Math.max(o.busyUntil, now + 2200); }
  },
  tick(E) {
    const p = E.data.p;
    if (!p) return;
    const [a, b] = p;
    hadapkan(a, b.x, b.y);
    hadapkan(b, a.x, a.y);
    pada(E, 0.4, () => { a.pose = 'salam'; b.pose = 'salam'; });
    pada(E, 0.9, () => spawn('talk', (a.x + b.x) / 2, a.y - 28));
    pada(E, 1.6, () => { a.pose = null; b.pose = null; });
  },
  selesai(E) { for (const o of E.data.p || []) o.pose = null; },
},

);

/* Dua pejalan berlawanan arah di lajur yang sama, sudah cukup dekat untuk
   berpapasan. Dipisah jadi fungsi karena dipakai dua kali: sebagai syarat dan
   sebagai pemilihan pemeran — dan keduanya harus melihat pasangan yang sama. */
function cariPapasan(S) {
  const jalan = S.orang.filter((o) => o.path.length && !o.eventKerja);
  for (let i = 0; i < jalan.length; i++) {
    for (let k = i + 1; k < jalan.length; k++) {
      const a = jalan[i], b = jalan[k];
      if (Math.abs(a.y - b.y) > 4) continue;
      if (Math.abs(a.x - b.x) > 14 || Math.abs(a.x - b.x) < 5) continue;
      if (a.face === b.face) continue;             // searah: tidak berpapasan
      return [a, b];
    }
  }
  return null;
}

/* ==========================================================================
   HEWAN & TAMU — yang masuk tanpa diundang
   ========================================================================== */

daftarEvent(

/* Kucing bukan Agent: dia tidak punya sesi, tidak boleh muncul di panel kru,
   dan tidak boleh ikut berebut kursi. Yang dia perlukan cuma ikut depth sort,
   supaya pegawai yang lewat di depannya benar-benar menutupinya. */
{
  id: 'kucing-kantor-mampir',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1800, durasi: 45,
  mulai(E) {
    E.data.k = { x: -10, y: 262, fase: 'masuk', jeda: 0, elus: 0 };
  },
  tick(E, dt, S) {
    const K = E.data.k;
    if (K.fase === 'masuk') {
      // jalan patah-patah: berhenti 1-2 detik tiap 20 px
      K.jeda -= dt;
      if (K.jeda <= 0) K.x += 26 * dt;
      if (K.x > K.tandaBerikut) { K.tandaBerikut = K.x + 20; K.jeda = acak(1, 2); }
      if (K.x >= 230) { K.fase = 'tidur'; K.x = 230; K.y = 258; }
    } else if (K.fase === 'pergi') {
      K.x += 40 * dt;
    }
    if (K.fase === 'tidur') {
      // yang lewat dekat berhenti mengelus; tiga elusan dan dia bangun
      for (const o of S.orang) {
        if (o.eventKerja || jarakKe(o, K.x, K.y) > 30) continue;
        if (o.elusSampai && now < o.elusSampai) continue;
        o.elusSampai = now + 6000;
        hadapkan(o, K.x, K.y);
        o.busyUntil = Math.max(o.busyUntil, now + 3000);
        o.pose = 'jongkok';
        spawn('idea', o.x, o.y - 26); spawn('idea', o.x, o.y - 26);
        if (K.elus === 0) o.say('pus, pus');
        if (++K.elus >= 3) K.fase = 'pergi';
        break;
      }
    }
  },
  gambarProp(E) {
    const K = E.data.k;
    if (!K || K.x < -8 || K.x > W + 8) return;
    const x = Math.round(K.x), y = Math.round(K.y);
    const tidur = K.fase === 'tidur';
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#20301f';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (tidur) {
      r(x, y - 4, 7, 4, '#d98a3a');                 // meringkuk jadi gumpalan
      r(x, y - 4, 7, 1, '#e8a45a');
      r(x + 5, y - 6, 3, 3, '#d98a3a');
      r(x + 6, y - 5, 1, 1, '#3a2a20');
      const ek = Math.sin(now / 900) > 0 ? 0 : 1;
      r(x - 2, y - 2 + ek, 3, 1, '#c97a2a');
    } else {
      r(x, y - 3, 6, 3, '#d98a3a');
      r(x + 5, y - 6, 3, 3, '#d98a3a');
      r(x + 6, y - 5, 1, 1, '#3a2a20');
      r(x + 5, y - 7, 1, 1, '#d98a3a'); r(x + 7, y - 7, 1, 1, '#d98a3a');
      r(x - 2, y - 5 + (Math.sin(now / 200) > 0 ? 0 : 1), 3, 1, '#c97a2a');
      r(x + 1, y, 1, 2, '#c97a2a'); r(x + 4, y, 1, 2, '#c97a2a');
    }
  },
  sortY: 264,
  selesai(E) { for (const o of S.orang) o.pose = null; },
},

{
  id: 'tikus-lewat-kolong',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 6,
  mulai(E) { E.data.x = 40; },
  tick(E, dt, S) {
    // berhenti sebentar tepat di bawah ember penadah — detail yang lucu
    const rem = E.data.x > 340 && E.data.x < 352 && E.umur < 4 ? 0.15 : 1;
    E.data.x += 110 * dt * rem;
    // HANYA yang kebetulan menghadap ke atas yang sadar; sisanya tidak tahu
    if (!E.data.sadar) {
      const saksi = S.orang.find((o) => o.face === 'up' && o.diam && Math.abs(o.x - E.data.x) < 60);
      if (saksi) {
        E.data.sadar = true;
        saksi.busyUntil = Math.max(saksi.busyUntil, now + 2000);
        saksi.say('...');
      }
    }
  },
  gambarProp(E) {
    const x = Math.round(E.data.x);
    if (x > 420) return;
    r(x, 116, 5, 2, '#4a4238');
    r(x + 4, 115, 2, 2, '#4a4238');
    r(x - 3, 116, 3, 1, '#5c5348');            // ekor
  },
  sortY: 117,                                   // di belakang perabot: lewat kolong
},

{
  id: 'burung-di-kusen-jendela',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 18,
  syarat: (S) => S.jam >= 6 && S.jam < 17 && S.luar > 0.5,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 160);
    if (a) { a.doingEvent = 'memandangi burung'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 14, () => {
      E.data.terbang = true;
      for (let i = 0; i < 3; i++) spawn('dust', 230, 66, '#8a6844');
    });
  },
  gambarDinding(E) {
    if (E.data.terbang) return;
    const x = 228, y = JENDELA.y + JENDELA.h - 4;
    const toleh = Math.sin(now / 1500) > 0 ? 1 : -1;
    r(x, y, 4, 3, '#8a6844');
    r(x + (toleh > 0 ? 3 : 0), y - 2, 2, 2, '#7a5c3e');
    r(x + (toleh > 0 ? 5 : -1), y - 2, 1, 1, '#d9b96a');   // paruh
    r(x + 1, y + 3, 1, 1, '#5c4530'); r(x + 3, y + 3, 1, 1, '#5c4530');
  },
},

{
  id: 'tamu-salah-alamat',
  kelas: 'panggung', bobot: B.sedang, cooldown: 720, durasi: 20,
  perluAktor: true,
  syarat: (S) => S.kerjaJam,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menunjukkan arah'; a.goToXY(216, LANE_DOWN, 'left'); }
  },
  tick(E, dt) {
    const T = E.data.t, a = E.aktor[0];
    if (T.fase === 'masuk') {
      T.x = Math.min(200, T.x + 46 * dt);
      if (T.x >= 200) T.fase = 'bingung';
    } else if (T.fase === 'salah') {
      T.x = Math.min(240, T.x + 30 * dt);     // sempat melangkah ke arah rak server
    } else if (T.fase === 'pulang') {
      T.x -= 52 * dt;
    }
    if (T.fase === 'bingung' && Math.random() < 0.06) spawn('talk', T.x, T.y - 28);
    pada(E, 6, () => { T.fase = 'salah'; });
    pada(E, 10, () => { T.fase = 'bingung'; });
    if (a && a.diam) {
      pada(E, 12, () => { a.pose = 'nunjuk'; hadapkan(a, T.x, T.y); a.say('bidangnya di lantai bawah, Pak, pintu sebelah kiri'); });
      pada(E, 16, () => { a.pose = null; T.fase = 'pulang'; });
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#8b9098', null, null, '#3a3f45');
  },
  sortY: 258,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

);

/* ==========================================================================
   META CLAUDE CODE — kenyataan sesi diterjemahkan jadi kejadian kantor
   ========================================================================== */

daftarEvent(

/* Terjemahan dari: tidak ada tool call sama sekali. Bukan ruangan yang mati,
   tapi ruangan yang menunggu — dan itu beda tampilannya. */
{
  id: 'layar-mengantuk',
  kelas: 'latar', bobot: B.sering, cooldown: 60, durasi: 180,
  syarat: () => now - (toolTerakhir || 0) > 180000,
  tick(E, dt, S) {
    const naik = Math.min(1, E.umur / 5);
    MOD.layarPucat = naik;
    MOD.vignette = 0.3 + 0.12 * naik;
    // begitu ada tool call masuk, event ini berhenti seketika
    if (now - (toolTerakhir || 0) < 2000) { E.selesaiCepat = true; return; }
    for (const o of S.orang) {
      if (o.station !== 'think' || !o.diam) continue;
      const f = (E.umur + o.slot * 3) % 12;
      o.mulut = f > 11.2;
      if (f > 11.2 && Math.random() < 0.1) spawn('kantuk', o.x + 6, o.y - 26);
    }
  },
  selesai(E) { for (const o of S.orang) o.mulut = false; },
},

{
  id: 'menunggu-disposisi-di-depan-pintu',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 40,
  perluAktor: true,
  syarat: (S) => S.sesi > 0 && now - (toolTerakhir || 0) > 45000,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu disposisi';
    a.bawa = 'map';
    a.goToXY(452, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // helaan napas tiap delapan detik; itu satu-satunya yang bergerak
    if (Math.floor(E.umur / 8) !== E.data.n) {
      E.data.n = Math.floor(E.umur / 8);
      spawn('steam', a.x + 4, a.y - 22);
    }
    if (Math.floor(E.umur / 11) !== E.data.l) {
      E.data.l = Math.floor(E.umur / 11);
      hadapkan(a, 168, 38);                    // melirik jam
      MOD.jamSorot = 1;
    } else {
      hadapkan(a, 452, 120);
    }
    pada(E, 5, () => a.say('masih di dalam'));
    // tool call datang: pintu terbuka, dia langsung berangkat tanpa jeda
    if (now - (toolTerakhir || 0) < 1500) { MOD.pintuKadis = true; E.selesaiCepat = true; }
  },
},

{
  id: 'layar-berkedip-serempak',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 3,
  tick(E, dt, S) {
    MOD.layarPutih = E.umur < 0.1 ? 1 : Math.max(0, 0.5 - E.umur * 0.4);
    pada(E, 0.2, () => {
      for (const o of S.orang) {
        if (o.path.length) { o.busyUntil = Math.max(o.busyUntil, now + 500); hadapkan(o, o.x, 316); }
      }
      for (const mx of MEJA_KERJA_X) { spawn('idea', mx + 21, 296); spawn('idea', mx + 21, 296); }
    });
  },
  gambarAtas(E) {
    // satu garis pindai turun di tiap layar yang menyala
    if (E.umur > 0.9) return;
    const gy = 300 + E.umur * 16;
    ctx.globalAlpha = 0.5;
    for (const mx of MEJA_KERJA_X) r(mx + 14, gy, 14, 1, '#ffffff');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'ketikan-serempak-sesaat',
  kelas: 'latar', bobot: B.jarang, cooldown: 420, durasi: 2.5,
  syarat: (S) => S.orang.filter((o) => o.station === 'think' && o.state === 'work').length >= 3,
  tick(E) {
    // riak menyeberangi baris meja, kiri ke kanan, jeda 0,12 detik per meja
    const urut = [...MEJA_KERJA_X].sort((a, b) => a - b);
    urut.forEach((mx, i) => {
      pada(E, 0.3 + i * 0.12, () => { spawn('glyph', mx + 20, 296); spawn('glyph', mx + 20, 296); });
    });
    pada(E, 1.1, () => {
      // jeda sunyi serempak: semua fase animasi dibekukan setengah detik
      for (const o of penghuni()) if (o.station === 'think') o.busyUntil = Math.max(o.busyUntil, now + 500);
    });
  },
},

{
  id: 'laptop-restart-paksa',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 13,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam),
  mulai(E, S) {
    E.data.a = pilih(S.orang.filter((o) => o.station === 'think' && o.diam));
  },
  tick(E) {
    const a = E.data.a;
    if (E.umur < 3) MOD.layarPutih = 0.9;              // layar biru penuh
    else if (E.umur < 7) MOD.mejaPadam = a ? a.slotIdx : -1;
    else MOD.layar = Math.min(1, (E.umur - 7) / 0.8);  // menyala bertahap
    if (!a) return;
    pada(E, 1, () => { a.pose = 'jongkok'; a.say('jangan sekarang, dong'); });
    // pekerjaannya benar-benar tertunda, bukan cuma gambarnya berubah
    pada(E, 1.2, () => { a.busyUntil = Math.max(a.busyUntil, now + 7000); });
    pada(E, 8, () => { a.pose = null; });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'arsip-hilang-satu-map',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 17,
  perluAktor: true,
  syarat: (S) => S.stasiunAktif.has('search') || S.orang.some(bisaDipinjam),
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'mencari map yang hilang'; a.goTo('search'); }
  },
  tick(E) {
    // tiga laci menganga sekaligus, semuanya kosong
    MOD.laciKosong = Math.min(3, Math.floor(E.umur / 1.5));
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (Math.random() < 0.08) spawn('dust', 132, 128);
    pada(E, 8, () => a.say('tidak ada di laci mana pun'));
    pada(E, 10, () => { a.doingEvent = 'menemui arsiparis'; a.goTo('read'); });
    pada(E, 15, () => { a.pose = 'duaangkat'; });    // arsiparis mengangkat bahu
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'berkas-ditarik-lagi-dari-stempel',
  kelas: 'latar', bobot: B.sedang, cooldown: 1080, durasi: 11,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menarik berkas yang sudah dicap';
    a.goTo('edit');                       // path lama dibatalkan, dialihkan ke sini
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 2, () => {
      a.say('eh, ada yang kurang');
      // 'ink' dengan vy positif: capnya ditarik mundur, bukan dibubuhkan
      for (let i = 0; i < 4; i++) {
        const p = spawn('ink', 292, 118);
        if (p) { p.vy = 22; p.g = 0; }
      }
    });
    pada(E, 8, () => { RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1); });
  },
},

{
  id: 'standby-ditanya-tidak-menjawab',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 10,
  syarat: (S) => S.sesi > 0 && S.orang.some((o) => o.standby && o.diam),
  mulai(E, S) {
    const sb = pilih(S.orang.filter((o) => o.standby && o.diam));
    if (!sb) return;
    const a = S.orang.find((o) => !o.standby && bisaDipinjam(o) && jarakKe(o, sb.x, sb.y) < 200);
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'bertanya ke pegawai standby';
    E.data.sb = sb;
    a.goToXY(sb.x + 16, sb.y, 'left');
  },
  tick(E) {
    const a = E.aktor[0], sb = E.data.sb;
    if (!a || !sb || !a.diam) return;
    hadapkan(a, sb.x, sb.y);
    pada(E, 1, () => {
      a.say('mas ini bagian mana ya?');
      spawn('talk', a.x, a.y - 26); spawn('talk', a.x, a.y - 26);
    });
    // standby memang dibungkam: tidak ada balon, tidak ada partikel dari dia
    pada(E, 5, () => { a.pose = 'duaangkat'; });
    pada(E, 8, () => { a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'peserta-ketiduran',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 25,
  syarat: () => peserta.some((p) => p.diam && now - p.arrivedAt > 100000),
  mulai(E) {
    E.data.p = peserta.find((p) => p.diam && now - p.arrivedAt > 100000);
  },
  tick(E) {
    const p = E.data.p;
    // peserta bisa bubar kapan saja; kalau sudah tidak terdaftar, hentikan
    if (!p || peserta.indexOf(p) < 0) { E.selesaiCepat = true; return; }
    const f = E.umur % 12;
    // turunnya cepat, naiknya lambat — itu yang bikin terbaca mengantuk
    p.ngantuk = f < 8 ? Math.min(3, f * 1.5) : Math.max(0, 3 - (f - 8) * 0.75);
    if (f < 8 && Math.random() < 0.02) spawn('kantuk', p.x + 6, p.y - 28);
    if (f > 8 && f < 8.4) {
      const sebelah = peserta.find((q) => q !== p && Math.abs(q.x - p.x) < 40);
      if (sebelah) hadapkan(sebelah, p.x, p.y);
    }
  },
  selesai(E) { if (E.data.p) E.data.p.ngantuk = 0; },
},

{
  id: 'audit-token',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 25,
  perluAktor: true,
  syarat: () => toolCount > 150,
  mulai(E, S) {
    const sibuk = [...agents.values()].sort((a, b) => b.calls - a.calls)[0];
    const a = pemeran(E, ['auditor', 'statistisi']);
    if (!a) return;
    a.doingEvent = 'mengaudit pemakaian';
    E.data.target = sibuk;
    a.goToXY(sibuk ? sibuk.x + 16 : 240, sibuk ? sibuk.y : 300, 'left');
  },
  tick(E) {
    const a = E.aktor[0], t = E.data.target;
    if (!a || !a.diam) return;
    a.pose = 'duaangkat';
    if (t) { MOD.mejaPadam = -1; hadapkan(t, a.x, a.y); t.busyUntil = Math.max(t.busyUntil, now + 2000); }
    pada(E, 8, () => a.say('pemakaian bulan ini naik, tolong dihemat ya'));
    pada(E, 20, () => { a.pose = null; });
  },
  gambarProp(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // gulungan kertas panjang yang menjuntai — makin dibentang makin panjang
    const p = Math.min(1, Math.max(0, (E.umur - 4) / 6));
    r(a.x + 8, a.y - 14, 3, Math.round(20 + p * 40), P.paper);
    r(a.x + 8, a.y - 14, 3, 1, '#c9c2ae');
  },
  sortY: 349,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

);

/* ==========================================================================
   PERAYAAN
   ========================================================================== */

daftarEvent(

{
  id: 'ulang-tahun-pegawai',
  kelas: 'panggung', bobot: B.jarang, cooldown: 7200, durasi: 24,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 3,
  mulai(E) {
    const org = pinjamAktor(E, 5);
    E.data.yangUlangTahun = org[0];
    org.forEach((a) => { a.doingEvent = 'ikut potong kue'; a.goTo('rapat'); });
  },
  tick(E) {
    for (const a of E.aktor) if (a.diam) a.pose = 'tepuk';
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('potong kuenya!'); });
    pada(E, 12, () => {
      E.data.tiup = true;
      for (let i = 0; i < 8; i++) spawn('steam', 246, 190);
      for (let i = 0; i < 25; i++) spawn('confetti', 246, 120);
    });
  },
  gambarProp(E) {
    const x = 239, y = 192;
    r(x, y, 14, 8, '#8a6844');                   // kue
    r(x, y, 14, 2, '#f2ece0');
    if (!E.data.tiup) {
      r(x + 7, y - 3, 1, 3, '#f2f0e6');          // lilin
      r(x + 7, y - 4, 1, 1, Math.sin(now / 90) > 0 ? '#ffd06a' : '#ffb454');
    }
  },
  sortY: 202,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'kocok-arisan-bulanan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 7200, durasi: 22,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 4,
  mulai(E) {
    const org = pinjamAktor(E, 5);
    org.forEach((a) => { a.doingEvent = 'ikut kocok arisan'; a.goTo('rapat'); });
    E.data.menang = org[org.length - 1];
  },
  tick(E) {
    pada(E, 14, () => {
      E.data.keluar = true;
      const p = spawn('paper', 246, 190);
      if (p) p.s = 2;
    });
    pada(E, 16, () => {
      const m = E.data.menang;
      if (m) { m.say('dapat! rezeki anak sholeh'); for (let i = 0; i < 6; i++) spawn('confetti', m.x, m.y - 30); }
    });
  },
  gambarProp(E) {
    const goyang = E.data.keluar ? 0 : (Math.sin(now / 60) > 0 ? 2 : -2);
    const x = 241 + goyang, y = 188;
    ctx.globalAlpha = 0.55;
    r(x, y, 10, 12, '#cfe0f2');                  // toples bening
    ctx.globalAlpha = 1;
    r(x, y, 10, 1, '#eef4fa');
    if (!E.data.keluar) for (let i = 0; i < 4; i++) r(x + 2 + (i % 3) * 2, y + 5 + (i % 2) * 3, 1, 3, P.paper);
  },
  sortY: 202,
},

{
  id: 'oleh-oleh-dinas-luar',
  kelas: 'panggung', bobot: B.jarang, cooldown: 5400, durasi: 20,
  perluAktor: true,
  mulai(E) {
    E.data.sisa = 5;
    const org = pinjamAktor(E, 4);
    org.forEach((a, i) => { a.doingEvent = 'ambil oleh-oleh'; a.goToXY(214 + i * 20, 240, 'up'); });
  },
  tick(E) {
    for (const a of E.aktor) {
      if (!a.diam || a.sudahAmbil) continue;
      a.sudahAmbil = true;
      if (E.data.sisa > 0) { E.data.sisa--; a.bawa = 'amplop'; a.bawaSampai = now + 90000; }
      spawn('paper', a.x, a.y - 24);
    }
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('dari Makassar, silakan'); });
  },
  selesai(E) { for (const a of E.aktor) a.sudahAmbil = false; },
  gambarProp(E) {
    const x = 236, y = 192;
    r(x, y, 18, 8, '#a37b4e');                   // kardus oleh-oleh
    r(x, y, 18, 1, '#b98d5e');
    r(x + 8, y - 1, 3, 9, '#c22b2b');            // pita
    r(x - 1, y - 3, 5, 3, '#a37b4e');            // flap terbuka
    r(x + 15, y - 3, 5, 3, '#a37b4e');
    for (let i = 0; i < E.data.sisa; i++) {
      r(x + 2 + i * 3, y + 2, 3, 3, ['#c9a03a', '#3e6b4f', '#b03030', '#3565b0', '#d2a8ff'][i]);
    }
  },
  sortY: 202,
},

/* Paling murah dari kelompok perayaan karena JABATAN sudah punya pal.pattern
   dan drawPerson sudah menanganinya: yang batik tidak memakai lidah bahu, jadi
   siluetnya benar-benar berubah, bukan cuma warnanya. */
{
  id: 'hari-batik-nasional',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 40,
  syarat: (S) => (S.tanggal === 2 && new Date().getMonth() === 9) || S.jam < 0,
  mulai(E, S) {
    E.data.asli = new Map();
    E.data.antre = [...S.orang];
  },
  tick(E, dt, S) {
    // satu per satu, jeda 0,6 detik, tiap pergantian disertai kilau sekejap
    const target = Math.floor(E.umur / 0.6);
    while (E.data.antre.length && E.data.asli.size < target) {
      const a = E.data.antre.shift();
      if (!a) break;
      E.data.asli.set(a, a.pal);
      a.pal = { ...a.pal, main: pilih(['#6b4a2a', '#2c4468']), pattern: '#d9ab5e' };
      spawn('idea', a.x, a.y - 24, '#ffffff');
    }
    pada(E, 26, () => { const a = S.orang[0]; if (a) a.say('batiknya seragam ya'); });
  },
  selesai(E) { for (const [a, pal] of E.data.asli) a.pal = pal; },
},

);

/* ==========================================================================
   EASTER EGG — langka, dicari, menyenangkan waktu ketemu
   ========================================================================== */

daftarEvent(

{
  id: 'cicak-di-dinding',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 25,
  syarat: (S) => S.lampu > 0.3,
  lanjutan: [{ id: 'cicak-jatuh-ke-berkas', peluang: 0.12 }],
  mulai(E) { E.data.x = 180; E.data.jeda = 0; },
  tick(E, dt, S) {
    E.data.jeda -= dt;
    if (E.data.jeda <= 0) {
      E.data.x += 30 * dt;
      if (E.data.x > (E.data.pos || 192)) { E.data.pos = E.data.x + 12; E.data.jeda = 3; }
    }
    if (E.data.x > 250 && E.data.x < 258) menoleh(S.orang.filter((o) => o.y < 200), E.data.x, 38, 900);
  },
  gambarDinding(E) {
    // digambar SEBELUM jam dan foto: dia benar-benar masuk ke balik bingkai
    const x = Math.round(E.data.x), y = 38 + Math.round(Math.sin(x / 30) * 5);
    if (x > 266) return;
    r(x, y, 5, 2, '#8a8070');
    r(x + 5, y - 1, 2, 2, '#8a8070');
    r(x - 3, y + (Math.sin(now / 300) > 0 ? 0 : 1), 3, 1, '#9a9080');
    r(x + 1, y + 2, 1, 1, '#8a8070'); r(x + 3, y - 1, 1, 1, '#8a8070');
  },
},

{
  id: 'semut-antre-ubin-retak',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 28,
  mulai(E) { E.data.maju = 0; },
  tick(E, dt, S) {
    E.data.maju += 7 * dt;
    // yang berdiri di ruang tunggu menggeser kaki; barisannya juga memutar
    const orang = S.orang.find((o) => o.station === 'idle' && o.diam);
    E.data.hindar = orang ? orang.x : 0;
  },
  gambarLantai(E) {
    for (let i = 0; i < 14; i++) {
      const d = E.data.maju - i * 5;
      if (d < 0 || d > 210) continue;
      const x = 128 + d, y = 292 + Math.sin(d / 9) * 0.5
        + (E.data.hindar && Math.abs(x - E.data.hindar) < 20 ? -8 : 0);
      r(x, y, 1, 1, '#2c2620');
    }
  },
},

{
  id: 'kilau-garuda',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 2,
  tick(E, dt, S) {
    pada(E, 0.2, () => menoleh(S.orang.filter((o) => o.y < 200), 300, 16, 1200));
  },
  gambarDinding(E) {
    const p = E.umur / 0.7;
    if (p > 1) { if (E.umur < 1.2) glow(300, 16, 10, P.gold, 0.25 * (1.2 - E.umur) / 0.5); return; }
    ctx.save();
    ctx.beginPath(); ctx.rect(292, 4, 26, 26); ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff4c8';
    const sx = 288 + p * 34;
    ctx.beginPath();
    ctx.moveTo(sx, 2); ctx.lineTo(sx + 3, 2); ctx.lineTo(sx - 9, 32); ctx.lineTo(sx - 12, 32);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  },
},

{
  id: 'cocokkan-jam-tangan',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 3,
  syarat: (S) => S.orang.some((o) => o.diam && o.x > 150 && o.x < 190 && o.y < 200),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.diam && o.x > 150 && o.x < 190 && o.y < 200);
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    MOD.jamSorot = 1;
    pada(E, 0.3, () => { a.pose = 'angkat'; hadapkan(a, 168, 38); });
    pada(E, 2.2, () => { a.pose = null; a.say('jam kantor lebih benar'); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'dua-sesi-sejabatan',
  kelas: 'latar', bobot: B.jarang, cooldown: 360, durasi: 5,
  syarat: () => cariSejabatan() != null,
  mulai(E) { E.data.p = cariSejabatan(); },
  tick(E) {
    const p = E.data.p;
    if (!p) return;
    const [a, b] = p;
    hadapkan(a, b.x, b.y); hadapkan(b, a.x, a.y);
    a.busyUntil = Math.max(a.busyUntil, now + 3000);
    b.busyUntil = Math.max(b.busyUntil, now + 3000);
    pada(E, 0.6, () => { a.pose = 'salam'; });
    pada(E, 0.9, () => { b.pose = 'salam'; spawn('idea', (a.x + b.x) / 2, a.y - 28); });
    pada(E, 2.4, () => { a.pose = null; b.pose = null; a.say('kembar seragam kita'); });
  },
  selesai(E) { for (const o of E.data.p || []) o.pose = null; },
},

{
  id: 'kursi-kosong-berputar-sendiri',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 4,
  syarat: (S) => S.sesi === 0 || S.orang.every((o) => o.standby),
  gambarProp(E) {
    // sandaran menyusut lalu melebar: ilusi kursi berputar, dua kali, meredam
    const redam = Math.max(0, 1 - E.umur / 4);
    const lw = 7 - Math.round(Math.abs(Math.sin(E.umur * 3)) * 4 * redam);
    const x = KURSI_DEKAT[0].x, y = KURSI_DEKAT[0].y;
    r(x - (lw >> 1), y - 16, lw, 7, '#6a4a32');
    r(x - (lw >> 1), y - 16, lw, 1, '#8a6844');
  },
  sortY: 254,
},

{
  id: 'seragam-salah-hari',
  kelas: 'latar', bobot: B.langka, cooldown: 43200, durasi: 14,
  syarat: (S) => S.orang.length >= 3,
  mulai(E, S) {
    const a = pilih(S.orang);
    if (!a) return;
    E.data.a = a;
    E.data.asli = a.pal;
    // dibalik: yang batik jadi polos, yang polos jadi batik
    a.pal = a.pal.pattern
      ? { ...a.pal, pattern: null, main: '#c9bd93' }
      : { ...a.pal, pattern: '#d9ab5e', main: '#6b4a2a' };
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      menoleh(S.orang.filter((o) => o !== a && jarakKe(o, a.x, a.y) < 90), a.x, a.y, 1500);
      a.say('lho, hari ini bukan batik?');
    });
  },
  selesai(E) { if (E.data.a) E.data.a.pal = E.data.asli; },
},

{
  id: 'titip-absen',
  kelas: 'latar', bobot: B.langka, cooldown: 21600, durasi: 8,
  perluAktor: true,
  syarat: (S) => S.jam >= 7 && S.jam < 9,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'absen'; a.goToXY(424, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 1.5, () => { a.pose = 'angkat'; E.data.hijau = 1; });
    pada(E, 3, () => { E.data.hijau = 0; });
    pada(E, 3.6, () => { a.pose = 'duaangkat'; E.data.hijau = 1; });   // jempol kedua
    pada(E, 5, () => {
      E.data.hijau = 0; a.pose = null;
      a.say('sekalian punya Pak Budi, macet di jalan');
    });
    // menoleh cepat kiri lalu kanan — itu seluruh leluconnya
    pada(E, 5.4, () => { a.face = 'left'; });
    pada(E, 5.8, () => { a.face = 'right'; });
    pada(E, 6.2, () => { a.face = 'up'; });
  },
  gambarDinding(E) {
    r(424, 96, 9, 13, '#dfe2e6');                  // mesin absen sidik jari
    r(424, 96, 9, 1, '#f2f4f6');
    r(426, 99, 5, 4, E.data.hijau ? '#57d06a' : '#20242c');
    r(426, 105, 5, 2, '#9aa1a6');
  },
},

);

/* Dua sesi nyata berjabatan sama yang kebetulan berdekatan. Dicek atas agents
   saja — belasan, jadi O(n^2)-nya murah. */
function cariSejabatan() {
  const list = [...agents.values()].filter((a) => a.diam && !a.eventKerja);
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      if (list[i].peran !== list[k].peran) continue;
      if (jarakKe(list[i], list[k].x, list[k].y) > 36) continue;
      return [list[i], list[k]];
    }
  }
  return null;
}

/* ==========================================================================
   SUASANA — efek yang bagus karena caranya digambar
   ========================================================================== */

daftarEvent(

{
  id: 'mendung-menggantung',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 70,
  syarat: (S) => S.jam >= 9 && S.jam < 16.5 && S.hujan < 0.05,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menengok ke luar'; a.goTo('web'); }
  },
  tick(E) {
    // masuk dan keluarnya berangsur, jadi tidak ada loncatan suasana
    const p = Math.min(1, E.umur / 6) * Math.min(1, E.sisa / 6);
    MOD.luar = 1 - 0.65 * p;
    MOD.ambPlus = 0.10 * p;
    MOD.sinar = 1 - 0.8 * p;
    MOD.lampuMin = 0.55 * p;      // neon menyala di siang bolong
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('kayaknya turun hujan'); });
  },
},

{
  id: 'bayangan-awan-lewat',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 11,
  syarat: (S) => S.luar > 0.6 && S.hujan < 0.1,
  tick(E, dt, S) {
    // berkas jendela ikut meredup saat pitanya lewat — dua efek saling menjelaskan
    const x = -140 + (E.umur / 11) * (W + 180);
    const tumpang = Math.max(0, 1 - Math.abs(x - 215) / 120);
    MOD.sinar = 1 - 0.6 * tumpang;
    E.data.x = x;
    if (tumpang > 0.7) menoleh(S.orang.filter((o) => o.station === 'web'), 212, 40, 1500);
  },
  gambarLantai(E) {
    const x = E.data.x || 0;
    ctx.globalAlpha = 0.075;
    ctx.fillStyle = '#2c3440';
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_TOP); ctx.lineTo(x + 130, FLOOR_TOP);
    ctx.lineTo(x + 130 - 42, H); ctx.lineTo(x - 42, H);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  },
},

{
  id: 'sapuan-lampu-mobil-malam',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 3,
  syarat: (S) => S.lampu > 0.6,
  gambarAtas(E) {
    const x = W + 30 - (E.umur / 3) * (W + 90);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(x, 0, 26, 70);
    ctx.fillRect(x + 6, 0, 20, 10);
    ctx.globalAlpha = 1;
  },
},

{
  id: 'sirene-lewat-jalan-depan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 7,
  bentrokDengan: ['sapuan-lampu-mobil-malam'],
  syarat: (S) => !S.petir,
  tick(E, dt, S) {
    pada(E, 0.5, () => menoleh(S.orang, 212, 40, 1200));
  },
  gambarAtas(E) {
    const x = W + 40 - (E.umur / 7) * (W + 120);
    const biru = Math.sin(now / 140) > 0;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = biru ? '#4a7fd0' : '#c22b2b';
    ctx.fillRect(x, 0, 40, 70);
    ctx.globalAlpha = 1;
    glow(x + 20, 60, 50, biru ? '#4a7fd0' : '#c22b2b', 0.12);
  },
},

{
  id: 'monas-lampu-malam-dipandangi',
  kelas: 'latar', bobot: B.sedang, cooldown: 2400, durasi: 18,
  syarat: (S) => S.lampu > 0.7 && S.hujan < 0.2,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'memandangi Monas'; a.goTo('web'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam && Math.random() < 0.04) spawn('idea', a.x, a.y - 26);
  },
  gambarDinding(E) {
    klipJendela(() => {
      const py = JENDELA.y + JENDELA.h - 27;
      const d = 0.6 + 0.4 * Math.sin(now / 700);
      r(JENDELA.x + 18, py, 2, 2, '#ffd88a');
      glow(JENDELA.x + 19, py + 1, 8, '#ffd88a', 0.35 * d);
      // lampu kota menyala satu per satu dari kiri ke kanan
      const n = Math.min(12, Math.floor(E.umur / 0.3));
      for (let i = 0; i < n; i++) {
        r(JENDELA.x + 3 + i * 4, JENDELA.y + JENDELA.h - 8, 1, 1, '#ffe0a0');
      }
    });
  },
},

{
  id: 'bulan-purnama-besar',
  kelas: 'latar', bobot: B.jarang, cooldown: 5400, durasi: 90,
  syarat: (S) => S.lampu > 0.7 && S.hujan < 0.1,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'melihat purnama'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 6, () => { const a = E.aktor[0]; if (a) a.say('purnama'); });
  },
  gambarDinding() {
    klipJendela(() => {
      const cx = JENDELA.x + 40, cy = JENDELA.y + 11;
      glow(cx, cy, 18, '#cfd8e8', 0.5);
      ctx.fillStyle = '#e8eef8';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8d2e0';
      ctx.beginPath(); ctx.arc(cx - 2, cy - 1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 3, cy + 2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#cfd8e8';
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'layangan-nyangkut-kabel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 14,
  syarat: (S) => S.jam >= 10 && S.jam < 17 && S.hujan < 0.1,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 180);
    if (a) { a.doingEvent = 'melihat layangan'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 5, () => { const a = E.aktor[0]; if (a) a.say('layangan lagi…'); });
  },
  gambarDinding(E) {
    klipJendela(() => {
      const y0 = JENDELA.y + 14;
      ctx.strokeStyle = '#3a4450'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(JENDELA.x, y0); ctx.lineTo(JENDELA.x + JENDELA.w, y0 + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(JENDELA.x, y0 + 5); ctx.lineTo(JENDELA.x + JENDELA.w, y0 + 11); ctx.stroke();
      const lx = JENDELA.x + 26, ly = y0 + 3;
      r(lx, ly, 5, 3, P.red);
      r(lx, ly + 3, 5, 3, '#f4f2ec');
      for (let i = 0; i < 8; i++) {
        r(lx + 2 + Math.round(Math.sin(now / 300 + i / 2) * 2), ly + 6 + i, 1, 1, '#c9c2ae');
      }
      if (E.umur > 7) {                          // dua anak kecil menunjuk
        r(JENDELA.x + 14, JENDELA.y + JENDELA.h - 6, 2, 4, '#2c3440');
        r(JENDELA.x + 18, JENDELA.y + JENDELA.h - 5, 2, 3, '#2c3440');
      }
    });
  },
},

{
  id: 'kucing-berantem-di-parkiran',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 8,
  syarat: (S) => S.lampu > 0.7,
  tick(E, dt, S) {
    pada(E, 1, () => menoleh(S.orang, 212, 40, 2000));
    pada(E, 1.2, () => { const a = S.orang.find((o) => o.diam); if (a) a.say('berisik amat'); });
  },
  gambarDinding(E) {
    klipJendela(() => {
      const y = JENDELA.y + JENDELA.h - 6;
      const t = now / 90;
      r(JENDELA.x + 12 + Math.round(Math.sin(t) * 6), y, 4, 3, '#1a1d21');
      r(JENDELA.x + 22 + Math.round(Math.cos(t * 1.3) * 6), y, 4, 3, '#1a1d21');
    });
  },
},

{
  id: 'detak-jam-terdengar',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 4,
  syarat: (S) => S.orang.length <= 1 && now - (toolTerakhir || 0) > 30000,
  tick(E, dt, S) {
    MOD.jamDetak = true;
    MOD.ambPlus = 0.03;
    pada(E, 0.5, () => menoleh(S.orang, 168, 38, 3000));
  },
},

{
  id: 'langkah-bergema',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 4,
  syarat: (S) => S.orang.length <= 2 && S.orang.some((o) => o.path.length),
  tick(E, dt, S) {
    // jejak dobel: satu di kaki, satu bayangan yang hidup lebih lama
    for (const o of S.orang) {
      if (!o.path.length) continue;
      if (Math.random() < 0.08) {
        const p = spawn('step', o.x, o.y);
        if (p) { p.life = 1.2; p.c = '#8b9098'; }
      }
    }
  },
},

{
  id: 'lirik-jam-dinding',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 2,
  syarat: (S) => S.orang.some((o) => o.diam),
  mulai(E, S) { E.data.a = pilih(S.orang.filter((o) => o.diam)); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    MOD.jamSorot = 1;
    pada(E, 0.2, () => hadapkan(a, 168, 38));
  },
},

{
  id: 'usap-tengkuk-lalu-lanjut',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 2,
  syarat: (S) => S.orang.some((o) => o.diam && !o.eventKerja),
  mulai(E, S) { E.data.a = pilih(S.orang.filter((o) => o.diam && !o.eventKerja)); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.2, () => { a.pose = 'usap'; });
    pada(E, 1.4, () => { a.pose = null; spawn('steam', a.x, a.y - 26); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'bersiul-pelan-sendirian',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 4,
  syarat: (S) => S.sesi === 1,
  mulai(E, S) { E.data.a = [...agents.values()][0]; E.data.jumlah = S.sesi; },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    // ada yang masuk ruangan: siulan berhenti mendadak, dia langsung menunduk
    if (S.sesi !== E.data.jumlah) { E.selesaiCepat = true; hadapkan(a, a.x, a.y + 20); return; }
    if (Math.floor(E.umur) !== E.data.n) {
      E.data.n = Math.floor(E.umur);
      const p = spawn('talk', a.x + 4, a.y - 24);
      if (p) { p.life = 1.8; p.vy = -6; }
    }
  },
},

{
  id: 'gelas-kopi-menumpuk-senior',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 8,
  syarat: () => [...agents.values()].some((a) => Date.now() - a.sejak > 1800000)
    && RUANGAN.gelasMenumpuk < 4,
  mulai(E) {
    E.data.a = [...agents.values()].sort((x, y) => x.sejak - y.sejak)[0];
    RUANGAN.gelasMenumpuk++;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.mulut = true; spawn('steam', a.x, a.y - 26); });
    pada(E, 1.6, () => { a.mulut = false; a.say('jam berapa ini...'); });
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a || a.station !== 'think') return;
    // gelas berjejer di sudut mejanya; bertambah tiap setengah jam sesi hidup
    for (let i = 0; i < RUANGAN.gelasMenumpuk; i++) {
      r(a.x - 26 + i * 5, 300, 3, 4, '#f2f0e6');
      r(a.x - 26 + i * 5, 300, 3, 1, '#c9b07a');
    }
  },
  sortY: 349,
  selesai(E) { if (E.data.a) E.data.a.mulut = false; },
},

);

/* ==========================================================================
   GELOMBANG 2 — INFRASTRUKTUR (23 event)
   ========================================================================== */

daftarEvent(

{
  id: 'absensi-ngambek',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 10,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mencoba absen sidik jari';
    a.goToXY(424, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    RUANGAN.absensiMerah = false;
    if (!a || !a.diam) return;
    // tiga percobaan, gagal terus; keempat menyerah ke buku manual
    for (let i = 0; i < 3; i++) {
      pada(E, 1 + i * 1.4, () => { a.pose = 'angkat'; E.data.merahSampai = E.umur + 0.3; spawn('ink', 428, 104, '#c22b2b'); });
      pada(E, 1.6 + i * 1.4, () => { a.pose = null; });
    }
    if (E.umur < (E.data.merahSampai || 0)) RUANGAN.absensiMerah = true;
    pada(E, 6, () => { a.doingEvent = 'menulis absen manual'; a.goToXY(452, 152, 'up'); });
    pada(E, 8, () => { a.say('manual saja lah'); });
  },
  selesai(E) { RUANGAN.absensiMerah = false; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ember-ac-penuh',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 30,
  syarat: () => RUANGAN.emberIsi >= 88,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda', 'magang']);
    if (!a) return;
    a.doingEvent = 'membuang air ember';
    a.goToXY(347, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 2, () => { a.pose = 'jongkok'; a.say('penuh lagi embernya.'); });
    pada(E, 4, () => {
      a.pose = null;
      RUANGAN.emberDiangkat = true;
      a.doingEvent = 'membuang ke kamar mandi';
      a.goToXY(452, 152, 'up');
    });
    pada(E, 8, () => { a.alpha = 0; });
    pada(E, 12, () => { a.alpha = 1; RUANGAN.emberIsi = 0; a.goToXY(347, 152, 'up'); });
    pada(E, 16, () => { RUANGAN.emberDiangkat = false; });
  },
  selesai(E) {
    RUANGAN.emberDiangkat = false;
    if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].alpha = 1; }
  },
},

/* Standalone, bukan rantai dari mati-lampu-sekejap: mekanisme lanjutan()
   memakai peluang statis, tidak bisa membaca jam saat itu juga. Efek genset
   dan pembatasan slot rak jadi kejadian sendiri yang berdiri sendiri. */
{
  id: 'genset-nyala',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 30,
  syarat: (S) => S.jam < 9 || S.jam >= 15.5,
  mulai(E) {
    E.data.slotAsli = STATIONS.server.slots;
    STATIONS.server.slots = 2;                 // beban dibatasi selama genset
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'menengok ke luar'; a.goTo('web'); }
  },
  tick(E) {
    MOD.lampu = 0.6;
    MOD.getar = E.umur < 3 ? 1 : 0;
    const a = E.aktor[0];
    if (a && a.diam) pada(E, 3, () => a.say('genset masuk, jangan nyalakan yang berat dulu'));
  },
  selesai(E) { STATIONS.server.slots = E.data.slotAsli || 4; },
},

{
  id: 'plafon-melendut-noda-air',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 20,
  syarat: () => CUACA.hujanTinggiSejak && Date.now() - CUACA.hujanTinggiSejak < 900000 && RUANGAN.nodaPlafon.length < 3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (!a) return;
    a.doingEvent = 'menengadah ke plafon';
    a.goToXY(54, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 3, () => a.say('aduh, tembus lagi'));
    if (Math.random() < 0.04) spawn('dust', 60, 6, '#cbb897');
    pada(E, 8, () => {
      RUANGAN.nodaPlafon.push({ x: 40 + RUANGAN.nodaPlafon.length * 14, w: 12 });
    });
  },
},

{
  id: 'wifi-megap-megap',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 22,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) { a.doingEvent = 'menggoyang kabel UTP'; a.goTo('server'); }
  },
  tick(E) {
    if (Math.random() < 0.2) {
      const p = spawn('ping', 390, 122);
      if (p) { p.vy = 12; p.life = 0.35; }        // paket gugur, bukan naik
    }
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'angkat';
      pada(E, 6, () => {
        E.data.pulih = true; a.pose = null;
        for (let i = 0; i < 8; i++) spawn('data', 390, 122);
      });
    }
    pada(E, 2, () => a.say('sabar, lagi lemot'));
  },
  gambarProp(E) {
    for (let i = 0; i < 3; i++) {
      const radius = 4 + i * 3;
      const hidup = E.data.pulih || Math.floor(now / 600) % 3 <= i;
      ctx.strokeStyle = hidup ? '#7ee787' : sh('#7ee787', 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(400, 28, radius, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  },
  sortY: 27,
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ac-bocor-deras',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 18,
  syarat: (S) => S.jam >= 11 && S.jam < 16,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 347, 164, 220);
    if (a) { a.doingEvent = 'mengosongkan ember darurat'; a.goToXY(347, 152, 'up'); }
  },
  tick(E) {
    MOD.drip = 0.35;                             // 4-5 tetes sekaligus di udara
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 14, () => { a.pose = 'jongkok'; a.say('filternya belum dicuci dari tahun lalu'); });
      pada(E, 17, () => { RUANGAN.emberIsi = Math.max(0, RUANGAN.emberIsi - 30); a.pose = null; });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ac-mati-ruangan-panas',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1200, durasi: 60,
  syarat: (S) => S.jam >= 10 && S.jam < 16,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a, i) => {
      a.doingEvent = 'mengibas dengan map';
      a.bawa = 'map';
      a.pose = 'kipas';
      a.goToXY(386 + i * 28, LANE_DOWN, 'up');
    });
  },
  tick(E) {
    MOD.acMati = true;
    MOD.drip = 99999;                              // tetesan berhenti total
    MOD.ambPlus = Math.min(0.1, MOD.ambPlus + 0.002);
    MOD.kipasSapu = 5;
    pada(E, 4, () => { const a = E.aktor[0]; if (a) a.say('freonnya habis, sudah dilaporkan bulan lalu'); });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'genset-uji-bulanan',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 20,
  syarat: (S) => S.jam >= 8 && S.jam < 9,
  bentrokDengan: ['mati-lampu-sekejap'],
  tick(E, dt, S) {
    MOD.getar = E.umur < 8 ? 1.4 : 0;
    if (E.umur < 8 && Math.random() < 0.3) spawn('dust', acak(20, W - 20), 12);
    pada(E, 0.3, () => menoleh(S.orang, 240, 0, 1000));
    pada(E, 6, () => { const a = pemeranDekat(E, 390, 164, 220); if (a) { a.doingEvent = 'memeriksa beban UPS'; a.goTo('server'); } });
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('uji genset, tiap tanggal muda'); });
  },
  gambarDinding(E) {
    if (E.umur > 12) return;
    // kepulan asap tipis di balik siluet kota, naik lalu memudar
    klipJendela(() => {
      const y = JENDELA.y + JENDELA.h - 6 - E.umur * 2;
      ctx.globalAlpha = Math.max(0, 0.2 - E.umur * 0.015);
      r(JENDELA.x + 10, y, 8, 4, '#8a8f92');
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'gorden-lepas-kait',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 26,
  syarat: (S) => S.luar > 0.6,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 200);
    if (a) { a.doingEvent = 'silau kena cahaya'; a.goTo('web'); }
  },
  tick(E) {
    MOD.gordenLepas = true;
    MOD.sinar = 1.4;
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 1, () => { a.pose = 'usap'; a.say('silau, Mas.'); });
      pada(E, 3, () => { a.pose = null; a.goToXY(a.x + 12, a.y, a.face); });
    }
    pada(E, 8, () => {
      const b = pemeranDekat(E, 212, 164, 220);
      if (b) { b.doingEvent = 'mengaitkan gorden'; b.pose = 'duaangkat'; b.goToXY(212, 148, 'up'); E.data.b = b; }
    });
    pada(E, 14, () => { if (E.data.b) E.data.b.pose = null; MOD_selesaiGorden(E); });
  },
  gambarDinding(E) {
    if (E.umur > (E.data.tutup || 999)) return;
    r(178, 18, 6, 20, '#5f9068');            // ujung kain melorot, kaca lebih terbuka
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'internet-putus-cari-sinyal',
  kelas: 'panggung', bobot: B.jarang, cooldown: 900, durasi: 30,
  lanjutan: [{ id: 'blink-storm-switch', peluang: 0.25 }],
  mulai(E, S) {
    pinjamAktor(E, 2).forEach((a, i) => {
      a.doingEvent = 'mencari sinyal';
      a.bawa = 'hp';
      a.pose = 'hp';
      a.goTo('web');
    });
    const c = pemeran(E, ['teknisi', 'pranata_muda']);
    if (c) { c.doingEvent = 'mencabut-colok modem'; c.pose = 'jongkok'; c.goTo('server'); }
  },
  tick(E) {
    MOD.internetMati = E.umur < 28;
    for (const a of E.aktor) {
      if (a.bawa === 'hp' && Math.floor(now / 3000) !== a._putar) {
        a._putar = Math.floor(now / 3000);
        a.face = a.face === 'left' ? 'right' : 'left';
      }
    }
    pada(E, 28, () => {
      for (let i = 0; i < 6; i++) spawn('ping', 390, 122);
      for (const a of E.aktor) { a.pose = null; a.bawa = null; }
      const a = E.aktor[0]; if (a) a.say('sudah nyala lagi! jangan disentuh dulu');
    });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'jam-dinding-mati',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 75,
  syarat: () => !RUANGAN.jamBeku,
  mulai(E) {
    const d = new Date();
    const mn = (d.getMinutes() + d.getSeconds() / 60) / 60;
    RUANGAN.jamBeku = { hr: ((d.getHours() % 12) + mn) / 12, mn, sc: d.getSeconds() / 60 };
  },
  tick(E, dt, S) {
    MOD.jamGetar = E.umur < 10;
    pada(E, 1, () => menoleh(S.orang.filter((o) => o.diam), 168, 38, 1200));
    if (E.umur > 55 && !E.data.mulaiPerbaikan) {
      const a = pemeranDekat(E, 168, 164, 220);
      if (a) {
        E.data.mulaiPerbaikan = true;
        E.data.a = a;
        a.doingEvent = 'mengganti baterai jam';
        a.pose = 'angkat';
        a.goToXY(168, 152, 'up');
      }
    }
    if (E.data.a && E.data.a.diam) {
      pada(E, 61, () => {
        const d = new Date();
        const mn2 = (d.getMinutes() + d.getSeconds() / 60) / 60;
        RUANGAN.jamBeku = null;                  // ikut jam nyata lagi
        E.data.a.pose = null;
      });
    }
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Bukaan jendela belum dimodelkan sebagai state geometri (kusennya statis di
   drawWindow) — membuatnya dari nol berarti proyek sendiri. Disederhanakan:
   dua orang mendorong serempak, hentakan debu, TANPA menyimpan status
   "jendela terbuka" yang permanen. */
{
  id: 'jendela-macet-didorong-berdua',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 16,
  syarat: (S) => S.luar > 0.8 && S.jam >= 12 && S.jam < 14,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a) => { a.doingEvent = 'mendorong jendela'; a.goToXY(200, 152, 'up'); });
  },
  tick(E) {
    for (const a of E.aktor) if (a.diam) {
      const dorong = Math.sin(now / 130) > 0;
      a.pose = dorong ? 'nunjuk' : null;
    }
    pada(E, 3, () => {
      for (let i = 0; i < 8; i++) spawn('dust', 210, 66);
      const a = E.aktor[0]; if (a) a.say('satu… dua… tiga');
    });
    pada(E, 6, () => { for (const a of E.aktor) a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'kabel-lantai-dilakban',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 28,
  syarat: () => RUANGAN.lakban < 8,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 337, LANE_DOWN, 220);
    if (!a) return;
    a.doingEvent = 'tersandung kabel';
    a.miring = 1;
    a.goToXY(337, LANE_DOWN, 'down');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 0.6, () => { a.miring = 0; a.say('sudah tiga orang kesandung di situ'); });
    pada(E, 2, () => { a.pose = 'jongkok'; });
    // delapan potong lakban, satu tiap 1,5 detik — makin lambat makin terlihat berat
    if (E.umur > 2) {
      const target = Math.min(8, Math.floor((E.umur - 2) / 1.5));
      if (target > RUANGAN.lakban) { RUANGAN.lakban = target; spawn('step', a.x, a.y); }
    }
    pada(E, 14, () => { a.pose = null; });
  },
  selesai(E) { if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].miring = 0; } },
},

{
  id: 'kedipan-listrik',
  kelas: 'panggung', bobot: B.sedang, cooldown: 360, durasi: 9,
  bentrokDengan: ['mati-lampu-sekejap', 'genset-uji-bulanan'],
  syarat: () => !CUACA.petir,
  tick(E, dt, S) {
    const t = E.umur;
    MOD.neonMati = t < 0.55 ? [1, 1] : [0, 0];
    MOD.lampu = t < 0.55 ? 0 : 1;
    pada(E, 0.05, () => { for (const o of S.orang) if (!o.path.length) o.busyUntil = Math.max(o.busyUntil, now + 1400); });
    pada(E, 0.1, () => { menoleh(S.orang, 0, 0, 1); for (const o of S.orang.slice(0, 2)) spawn('talk', o.x, o.y - 26); });
    pada(E, 5.5, () => {
      const a = pemeranDekat(E, 390, 164, 240);
      if (a) { a.doingEvent = 'memeriksa rak'; a.goTo('server'); }
    });
  },
  gambarAtas(E) {
    const t = E.umur;
    let a2 = 0;
    if (t < 0.55) a2 = t < 0.033 ? t / 0.033 * 0.72 : (t < 0.16 ? 0.72 : Math.max(0, 0.72 * (1 - (t - 0.16) / 0.1)));
    if (a2 > 0.01) { ctx.globalAlpha = a2; ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
},

{
  id: 'kipas-menoleh',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 25,
  tick(E) {
    MOD.kipasSapu = 7;
    pada(E, 4, () => {
      const target = pilih([374, 444]);
      spawn('paper', target, 300);
      RUANGAN.kertasLantai.push({ x: target - 2, y: 306, sisa: 10 });
      const a = pemeranDekat(E, target, 316, 90);
      if (a) { E.data.a = a; a.doingEvent = 'memungut lembar'; a.goToXY(target, 310, 'down'); }
    });
    if (E.data.a && E.data.a.diam) {
      pada(E, 6, () => { E.data.a.pose = 'jongkok'; E.data.a.say('wadaw'); });
      pada(E, 7.5, () => { E.data.a.pose = null; if (RUANGAN.kertasLantai.length) RUANGAN.kertasLantai.pop(); });
    }
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Blackout penuh dengan pemulihan genset — narasi genset digabung ke sini
   (bukan dirantai ke id 'genset-nyala' yang terpisah) supaya syarat jam bisa
   diperiksa langsung, bukan lewat peluang statis yang tidak baca waktu. */
{
  id: 'mati-lampu-sekejap',
  kelas: 'panggung', bobot: B.jarang, cooldown: 480, durasi: 9,
  bentrokDengan: ['kedipan-listrik', 'genset-uji-bulanan'],
  mulai(E, S) {
    E.data.genset = S.jam < 9 || S.jam >= 15.5;
    if (E.data.genset) { E.data.slotAsli = STATIONS.server.slots; STATIONS.server.slots = 2; }
  },
  tick(E, dt, S) {
    const genset = E.data.genset;
    MOD.neonMati = E.umur < 4 ? [1, 1] : [genset ? 0.15 : 0, genset ? 0.15 : 0];
    MOD.lampu = E.umur < 4 ? 0 : (genset ? 0.85 : 1);
    MOD.getar = genset && E.umur >= 4 ? 1 : 0;
    pada(E, 0.1, () => { for (const o of S.orang) o.busyUntil = Math.max(o.busyUntil, now + 1800); });
    pada(E, 0.15, () => { for (const o of S.orang.slice(0, 3)) spawn('talk', o.x, o.y - 26); });
    pada(E, 4.2, () => {
      const a = pemeran(E, ['teknisi', 'pranata_muda']);
      if (a) {
        a.doingEvent = 'memeriksa rak setelah listrik balik';
        a.goTo('server');
        a.say(genset ? 'yaaah… tenang, genset jalan' : 'sudah nyala lagi');
        for (let i = 0; i < 4; i++) spawn('data', 390, 122);
      }
    });
  },
  gambarAtas(E) {
    // Mematikan MOD.lampu saja nyaris tak kelihatan siang bolong — jendela
    // masih menerangi ruangan. Overlay gelap eksplisit inilah yang bikin
    // "mati lampu" terbaca kapan pun jam berapa pun, sama seperti kedipan-listrik.
    const t = E.umur;
    let a2 = t < 0.1 ? t / 0.1 * 0.6 : (t < 4 ? 0.6 : 0);
    if (E.data.genset && t >= 4 && t < 4.6) {
      // neon genset tersendat nyala: dua kedipan cepat sebelum stabil
      a2 = Math.floor((t - 4) / 0.15) % 2 ? 0.22 : 0.04;
    }
    if (a2 > 0.01) { ctx.globalAlpha = a2; ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
  selesai(E) { if (E.data.genset) STATIONS.server.slots = E.data.slotAsli || 4; },
},

{
  id: 'neon-sebelah-mati',
  kelas: 'panggung', bobot: B.sedang, cooldown: 720, durasi: 45,
  syarat: (S) => S.lampu > 0.3,
  mulai(E) {
    E.data.sisi = Math.random() < 0.5 ? 0 : 1;     // 0 = kiri (170), 1 = kanan (410)
  },
  tick(E) {
    const i = E.data.sisi;
    const t = E.umur;
    MOD.neonMati[i] = t < 1.2
      ? [1, 0.2, 0, 0.6, 0][Math.min(4, Math.floor(t / 0.24))]
      : (t > 43 ? Math.max(0, 1 - (t - 43) / 1.5) : 1);
    pada(E, 3, () => {
      const a = pemeranDekat(E, i === 0 ? 170 : 410, 164, 220);
      if (a) { a.doingEvent = 'melapor lampu mati'; a.goTo('server'); a.say('tolong catat, Pak, TL yang ' + (i === 0 ? 'kiri' : 'kanan')); }
    });
  },
  gambarAtas(E) {
    const i = E.data.sisi;
    const g = MOD.neonMati[i];
    if (g < 0.3) return;
    ctx.globalAlpha = 0.07 * g;
    ctx.fillStyle = '#2c3440';
    if (i === 0) r(0, 0, 240, H, '#2c3440'); else r(240, 0, W - 240, H, '#2c3440');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'printer-nge-jam',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('web') || S.orang.some(bisaDipinjam),
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'menarik kertas nyangkut'; a.goTo('web'); }
  },
  tick(E) {
    MOD.printerMacet = !E.data.beres;
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) {
      pada(E, 2 + i * 1.6, () => { a.pose = 'angkat'; });
      pada(E, 2.6 + i * 1.6, () => { a.pose = null; });
    }
    pada(E, 7, () => {
      E.data.beres = true; a.pose = null;
      for (let i = 0; i < 5; i++) spawn('paper', a.x + 4, a.y - 20);
      spawn('lempar', a.x + 4, a.y - 18);
      a.say('kena roller lagi');
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'printer-toner-dikocok',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 22,
  syarat: () => RUANGAN.toner < 0.9,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mengocok toner printer';
    a.goTo('web');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 3, () => { a.bawa = 'toner'; });
    if (E.umur > 5 && E.umur < 10) {
      a.pose = 'kipas';
      if (Math.random() < 0.3) spawn('serbuk', a.x + 4, a.y - 8);
    }
    pada(E, 10, () => { a.pose = null; a.bawa = null; RUANGAN.toner = 1; });
    pada(E, 12, () => { for (let i = 0; i < 3; i++) spawn('paper', 214, 118); });
    pada(E, 4, () => a.say('masih bisa seratus lembar lagi ini'));
  },
  selesai(E) { const a = E.aktor[0]; if (a) { a.pose = null; a.bawa = null; } },
},

{
  id: 'rak-server-divakum',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 35,
  syarat: (S) => S.jam >= 7 && S.jam < 9,
  mulai(E) {
    const a = pemeran(E, ['magang', 'teknisi']);
    if (a) { a.doingEvent = 'menyedot debu rak'; a.goTo('server'); }
  },
  tick(E, dt, S) {
    if (Math.random() < 0.35) {
      const p = spawn('dust', 390, 100);
      if (p) p.vx -= 8;
    }
    for (const o of S.orang) {
      if (o.eventKerja || jarakKe(o, 390, 130) > 40 || jarakKe(o, 390, 130) < 8) continue;
      o.pose = 'hidung';
      o.busyUntil = Math.max(o.busyUntil, now + 800);
    }
    pada(E, 20, () => { const a = E.aktor[0]; if (a) a.say('debunya setahun tidak pernah disedot'); });
  },
  gambarProp() {
    r(352, 128, 12, 10, '#3565b0');            // vacuum kecil
    r(352, 128, 12, 2, '#79c0ff');
  },
  sortY: 133,
  selesai(E, S) { for (const o of S.orang) if (o.pose === 'hidung') o.pose = null; },
},

{
  id: 'teknisi-dipanggil-ke-kolong-meja',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 16,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam),
  mulai(E, S) {
    const korban = pilih(S.orang.filter((o) => o.station === 'think' && o.diam));
    if (!korban) return;
    E.data.slot = korban.slotIdx;
    E.data.x = MEJA_KERJA_X[korban.slotIdx];
    const teknisi = pemeran(E, ['teknisi', 'pranata_muda']);
    E.data.adaTeknisi = !!teknisi;
    if (teknisi) { teknisi.doingEvent = 'membetulkan kabel di kolong meja'; teknisi.goToXY(E.data.x, 300, 'down'); }
    else { korban.eventKerja = E; korban.betahAsli = korban.betah; korban.betah = true; E.aktor.push(korban); }
  },
  tick(E) {
    if (E.data.slot == null) { E.selesaiCepat = true; return; }
    MOD.mejaPadam = E.umur < (E.data.adaTeknisi ? 9 : 6) ? E.data.slot : -1;
    if (E.data.adaTeknisi) {
      const t = E.aktor[0];
      if (t && t.diam) {
        t.pose = 'jongkok';
        if (Math.random() < 0.1) spawn('dust', t.x, t.y - 6);
        if (Math.random() < 0.1) spawn('ping', t.x, t.y - 10);
        pada(E, 9, () => { t.pose = null; for (let i = 0; i < 3; i++) spawn('data', t.x, t.y - 20); });
      }
    } else {
      const p = E.aktor[0];
      if (p && p.diam) { p.pose = 'jongkok'; pada(E, 4, () => { p.pose = null; }); }
    }
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'ubin-retak-nambah',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 8,
  syarat: () => RUANGAN.retakExtra.length < 6,
  tick(E, dt, S) {
    if (E.data.gx == null) {
      const kandidat = [[7, 2], [11, 4], [4, 5], [14, 3], [9, 6]]
        .filter(([gx, gy]) => !RUANGAN.retakExtra.some((k) => k.gx === gx && k.gy === gy));
      if (!kandidat.length) { E.selesaiCepat = true; return; }
      [E.data.gx, E.data.gy] = pilih(kandidat);
      E.data.t = Math.random();
      RUANGAN.retakExtra.push({ gx: E.data.gx, gy: E.data.gy, t: E.data.t });
      for (let i = 0; i < 5; i++) spawn('dust', E.data.gx * 24 + 12, FLOOR_TOP + E.data.gy * 24 + 12);
    }
    const px = E.data.gx * 24 + 12, py = FLOOR_TOP + E.data.gy * 24 + 12;
    // pegawai yang kebetulan lewat langsung berhenti — tidak ada penghindaran
    // permanen di route(): itu akan menumpuk aturan selamanya di pencari jalur
    // yang dipakai SEMUA agen, dan retakan tambahan sudah cukup terasa tanpa itu
    for (const o of S.orang) {
      if (o.eventKerja || o.path.length || jarakKe(o, px, py) > 24) continue;
      hadapkan(o, px, py);
      o.busyUntil = Math.max(o.busyUntil, now + 1600);
      o.say('nanti dilaporkan ke Umum.');
      break;
    }
  },
},

{
  id: 'wifi-sudut-lemah',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.slotIdx === 3 && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && o.slotIdx === 3 && o.diam && bisaDipinjam(o));
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'pindah cari sinyal';
    a.bawa = 'laptop';
    MOD.mejaPadam = 3;
    a.goToXY(360, 152, 'up');
  },
  tick(E) {
    MOD.wifiLemahSlot = 3;
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'dudukLantai';
      if (Math.random() < 0.06) spawn('data', a.x, a.y - 22);
      pada(E, 2, () => a.say('di pojok sini sinyalnya cuma satu batang'));
    }
    pada(E, 22, () => { if (a) { a.pose = null; a.bawa = null; a.goToXY(444, 300, 'down'); } });
  },
  gambarDinding() {
    const x = 300, y = 20;                       // digeser dari (300,14): hindari Garuda
    r(x, y, 10, 10, '#f2f0e6');
    r(x + 3, y + 3, 2, 2, MOD.wifiLemahSlot === 3 && Math.sin(now / 260) > 0 ? '#e8a33a' : '#57d06a');
  },
  selesai(E) { if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; } },
},

);

/* Dua kait kecil yang dipakai lebih dari satu event di atas. */
function MOD_selesaiGorden(E) {
  E.data.tutup = E.umur;
  MOD.gordenLepas = false;
  MOD.sinar = 1;
}

/* ==========================================================================
   GELOMBANG 2 — INSIDEN (17 event)
   ========================================================================== */

daftarEvent(

{
  id: 'bendera-terbelit-angin',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 40,
  perluAktor: true,
  mulai(E) {
    RUANGAN.benderaBelit = true;
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'membetulkan bendera';
    a.goToXY(146, LANE_DOWN, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 6, () => a.say('benderanya nyangkut'));
      pada(E, 8, () => { RUANGAN.benderaBelit = false; E.data.lepas = E.umur; });
    }
  },
},

{
  id: 'laci-arsip-macet',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 18,
  syarat: (S) => S.stasiunAktif.has('read') || S.stasiunAktif.has('search'),
  mulai(E, S) {
    // Salah prop di catatan aslinya: yang punya laci adalah drawFiling
    // (filing kabinet), bukan drawArsip (rak terbuka tanpa laci sama sekali).
    E.data.a = S.orang.find((o) => (o.station === 'read' || o.station === 'search') && o.state === 'work')
      || S.orang.find((o) => o.station === 'search');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.busyUntil = Math.max(a.busyUntil, now + 2500); a.say('macet lagi.'); });
    pada(E, 3, () => spawn('dust', 132, 128));
    pada(E, 5, () => {
      RUANGAN.laciBuka = 12;
      for (let i = 0; i < 10; i++) spawn('dust', 132, 128);
      spawn('paper', 132, 128); spawn('paper', 132, 128); spawn('paper', 132, 128);
    });
    pada(E, 6, () => { RUANGAN.laciCelah = 2; });
    pada(E, 6.5, () => {
      const tetangga = S.orang.find((o) => o !== a && jarakKe(o, 132, 152) < 70 && !o.eventKerja);
      if (tetangga) { hadapkan(tetangga, 132, 152); tetangga.say('hehe'); }
    });
  },
},

{
  id: 'pulpen-jatuh-menggelinding',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 3.5,
  syarat: () => kursiKosong() > 0,
  mulai(E, S) {
    const kandidat = S.orang.filter((o) => (o.station === 'think' || o.station === 'rapat') && o.diam);
    if (!kandidat.length) return;
    const a = pilih(kandidat);
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    const p = spawn('pulpen', a.x + 6, a.y - 20);
    if (p) p.dasar = a.station === 'rapat' ? 252 : 316;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 0.4, () => { a.pose = 'jongkok'; });
    pada(E, 1.5, () => { a.pose = null; a.goToXY(a.x + 8, a.y, a.face); });
    pada(E, 2.6, () => { a.goToXY(a.x - 8, a.y, a.face); });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'atap-bocor-musim-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 120,
  syarat: () => CUACA.hujan > 0.6,
  perluAktor: true,
  mulai(E) {
    E.data.jeda = 0;
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (a) { a.doingEvent = 'mengambil ember cadangan'; a.goToXY(440, 240, 'up'); }
  },
  tick(E, dt) {
    E.data.jeda -= dt;
    if (!E.data.emberSampai && E.data.jeda <= 0) {
      E.data.jeda = 2.6;
      const p = spawn('drip', 118, 12);
      if (p) { p.dasar = 252; p.onDrip = () => { if (RUANGAN.genanganAtap == null) RUANGAN.genanganAtap = 6; else RUANGAN.genanganAtap = Math.min(18, RUANGAN.genanganAtap + 1); }; }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.emberSampai) {
      pada(E, 1.5, () => { a.bawa = 'ember'; a.goToXY(118, 252, 'up'); });
      pada(E, 6, () => { E.data.emberSampai = true; a.bawa = null; a.say('ember, ember!'); RUANGAN.emberKedua = true; });
    }
  },
  gambarLantai() {
    if (!RUANGAN.genanganAtap || RUANGAN.emberKedua) return;
    ctx.globalAlpha = 0.2; ctx.fillStyle = '#8a9298';
    ctx.beginPath(); ctx.ellipse(118, 252, RUANGAN.genanganAtap, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  },
  gambarProp() { if (RUANGAN.emberKedua) { r(114, 246, 8, 6, '#4a7fd0'); r(114, 246, 8, 1, '#79b0e8'); } },
  sortY: 253,
  selesai(E) {
    RUANGAN.emberKedua = false; RUANGAN.genanganAtap = 0;
    if (E.aktor[0]) E.aktor[0].bawa = null;
  },
},

{
  id: 'berkas-tumpah',
  kelas: 'latar', bobot: B.jarang, cooldown: 1080, durasi: 12,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    a.doingEvent = 'membereskan berkas roboh';
    a.goToXY(272, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 1, () => {
      RUANGAN.tumpukanStempel = 0;
      for (let i = 0; i < 10; i++) spawn('paper', 260, 90);
      for (let i = 0; i < 8; i++) spawn('dust', 260, 90);
      a.say('maaf, Pak');
    });
    if (a.diam) {
      pada(E, 3, () => { a.pose = 'jongkok'; });
      // satu lapis tersusun tiap 0,25 detik — pembalikan yang persis terbaca membereskan
      if (E.umur > 3 && RUANGAN.tumpukanStempel < 9 && Math.floor((E.umur - 3) / 0.25) > RUANGAN.tumpukanStempel) {
        RUANGAN.tumpukanStempel++;
      }
      pada(E, 5.5, () => { a.pose = null; });
    }
  },
  selesai(E) { RUANGAN.tumpukanStempel = 9; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'bocor-baru-di-atas-arsip',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 60,
  syarat: () => CUACA.hujan > 0.6,
  perluAktor: true,
  mulai(E) { E.data.jeda = 0; },
  tick(E, dt) {
    E.data.jeda -= dt;
    if (!E.data.beres && E.data.jeda <= 0) {
      E.data.jeda = 3;
      const p = spawn('drip', 96, 30);
      if (p) { p.dasar = 136; p.onDrip = () => { E.data.tetes = (E.data.tetes || 0) + 1; }; }
    }
    if (E.data.tetes >= 3 && !E.data.beres && !E.aktor.length) {
      const a = pemeran(E, ['arsiparis']);
      if (a) { a.doingEvent = 'menaruh ember di arsip'; a.goToXY(54, 152, 'up'); }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.beres) {
      E.data.beres = true;
      a.say('atapnya bocor lagi di sini');
      RUANGAN.emberArsip = true;
    }
  },
  gambarProp() { if (RUANGAN.emberArsip) { r(93, 130, 9, 7, '#4a7fd0'); r(93, 130, 9, 1, '#79b0e8'); } },
  sortY: 137,
  selesai() { RUANGAN.emberArsip = false; },
},

{
  id: 'bocor-baru-di-atas-rapat',
  kelas: 'latar', bobot: B.langka, cooldown: 2700, durasi: 90,
  syarat: () => CUACA.petir && kursiKosong() < KURSI_TOTAL,
  tick(E, dt) {
    E.data.jeda = (E.data.jeda || 0) - dt;
    if (!RUANGAN.emberRapat && E.data.jeda <= 0) {
      E.data.jeda = 3.4;
      const p = spawn('drip', 246, 20);
      if (p) {
        p.dasar = 186;
        p.onDrip = () => {
          E.data.tetes = (E.data.tetes || 0) + 1;
          RUANGAN.nodaKopi.push({ x: 240, y: 185, lebar: 3 });
        };
      }
    }
    // hitungan sendiri (E.data.tetes), BUKAN panjang RUANGAN.nodaKopi — array
    // itu dipakai bersama tumpahan-kopi-rapat, jadi noda kopi yang sudah ada
    // sebelum event ini mulai tidak boleh ikut terhitung sebagai tetesan hujan
    if (!E.data.diambil && (E.data.tetes || 0) >= 2) {
      E.data.diambil = true;
      const a = pemeranDekat(E, 250, 288, 220);
      if (a) { E.data.a = a; a.doingEvent = 'mengambil ember cadangan'; a.bawa = 'ember'; a.goToXY(246, 178, 'up'); }
    }
    if (E.data.a && E.data.a.diam && !RUANGAN.emberRapat) {
      RUANGAN.emberRapat = true;
      E.data.a.bawa = null;
      E.data.a.say('berkasnya digeser dulu, itu yang basah asli');
    }
  },
  gambarProp() { if (RUANGAN.emberRapat) { r(240, 180, 10, 7, '#4a7fd0'); r(240, 180, 10, 1, '#79b0e8'); } },
  sortY: 187,
  selesai() {
    RUANGAN.emberRapat = false;
    // noda yang sempat tercatat selama event ini tetap ada (dua elemen
    // terakhir yang baru saja ditambahkan) — sengaja tidak dibersihkan
  },
},

{
  id: 'dus-arsip-ambruk',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 38,
  perluAktor: true,
  /* Prasyarat "tumpukan >= 4" dari catatan aslinya butuh event dus-arsip-
     ditumpuk yang belum ada di gelombang mana pun — jadi dijadikan kejadian
     berdiri sendiri dengan cooldown panjangnya sendiri, bukan digantungkan
     ke penghitung yang tidak pernah terisi. */
  mulai(E) {
    const org = pinjamAktor(E, 2);
    org.forEach((a, i) => { a.doingEvent = 'memungut berkas tumpah'; a.goToXY(430 + i * 20, 300, 'down'); });
    for (let i = 0; i < 14; i++) spawn('paper', 436, 280);
    E.data.sisa = 8;
  },
  tick(E) {
    for (const a of E.aktor) {
      if (a.diam) {
        a.pose = 'jongkok';
        if (Math.floor(E.umur * 0.8) !== a._j && E.data.sisa > 0) {
          a._j = Math.floor(E.umur * 0.8);
          E.data.sisa--;
        }
      }
    }
    pada(E, 2, () => { const a = E.aktor[0]; if (a) a.say('sudah saya bilang jangan tinggi-tinggi.'); });
  },
  gambarProp(E) {
    // dus terguling selama belum beres; sesudahnya drawDus() bawaan sudah cukup
    if (E.data.sisa <= 0) return;
    r(410, 290, 20, 14, '#a37b4e');
    r(412, 292, 16, 10, '#b98d5e');
    for (let i = 0; i < Math.min(6, E.data.sisa); i++) r(400 + i * 11, 314, 3, 2, P.paper);
  },
  sortY: 305,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

/* Berdiri sendiri, bukan dirantai — alasan yang sama dengan genset-nyala di
   berkas infrastruktur: peluang lanjutan() statis tidak bisa membaca jam. */
{
  id: 'genset-kehabisan-solar',
  kelas: 'panggung', bobot: B.langka, cooldown: 2400, durasi: 14,
  syarat: (S) => S.jam < 9 || S.jam >= 15.5,
  mulai(E, S) {
    const dua = S.orang.filter((o) => o.station === 'think' && bisaDipinjam(o)).slice(0, 2);
    for (const a of dua) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); a.goTo('idle'); }
    const pembawa = pemeran(E, ['teknisi']);
    E.data.pembawa = pembawa;
    if (pembawa) { pembawa.bawa = 'jerigen'; pembawa.doingEvent = 'mengambil solar'; pembawa.goToXY(430, 152, 'up'); }
  },
  tick(E) {
    MOD.lampu = E.umur < 1.5 ? Math.max(0.15, 1 - E.umur / 1.5) : (E.umur > 13 ? 1 : 0);
    MOD.upsSiaga = E.umur < 13 ? 1 : 0;
    const p = E.data.pembawa;
    if (p && p.diam) pada(E, 3, () => p.say('solarnya belum ditebus, Pak'));
  },
  selesai(E) { if (E.data.pembawa) E.data.pembawa.bawa = null; },
},

{
  id: 'kabel-utp-kesenggol',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 16,
  // Premis aslinya tidak didukung gambar: kabel menjuntai di y 50..74, jauh
  // di atas LANE_UP (y=164) — tidak ada agen yang lewat di situ. Dipicu dari
  // orang yang BEKERJA di rak server, bukan yang lewat di bawah kabel.
  syarat: (S) => S.stasiunAktif.has('server'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'server' && o.state === 'work');
  },
  tick(E) {
    MOD.lanPutus = !E.data.beres;
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.busyUntil = Math.max(a.busyUntil, now + 2500); a.face = a.face === 'left' ? 'right' : 'left'; a.say('maaf, kesenggol… sudah saya colok lagi'); });
    pada(E, 2, () => { a.pose = 'jongkok'; });
    pada(E, 4, () => {
      E.data.beres = true; a.pose = null;
      for (let i = 0; i < 6; i++) spawn('data', 392, 132);
    });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'kursi-rapat-patah',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 26,
  syarat: () => kursiKosong() < KURSI_TOTAL - 1,
  mulai(E) {
    const bebas = [];
    for (let k = 0; k < KURSI_N; k++) if (!RUANGAN.kursiRusak.has(k)) bebas.push(k);
    if (!bebas.length) return;
    E.data.slot = pilih(bebas);
    RUANGAN.kursiRusak.add(E.data.slot);
    const korban = [...penghuni()].find((o) => o.station === 'rapat' && o.slotIdx === E.data.slot);
    if (korban) { korban.say('!'); korban.goTo('rapat'); }             // dipindah ulang lewat slotBebas()
  },
  tick(E) {
    if (E.data.slot == null) { E.selesaiCepat = true; return; }   // semua kursi jauh sudah rusak: batal
    pada(E, 6, () => {
      const a = pemeran(E, ['magang']);
      if (a) { a.doingEvent = 'mengganti kursi rusak'; a.bawa = 'kardus'; a.goToXY(RAPAT.cx + slotKe(E.data.slot), 190, 'up'); }
    });
  },
},

{
  id: 'rak-server-kepanasan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 720, durasi: 60,
  syarat: (S) => S.orang.filter((o) => o.station === 'server').length >= 1,
  mulai(E) {
    const a = pemeranDekat(E, 400, 268, 200);
    if (a) { a.doingEvent = 'mengarahkan kipas ke rak'; a.goToXY(400, 268, 'up'); }
  },
  tick(E) {
    MOD.rakPanas = E.umur < 40;
    if (Math.random() < 0.4) spawn('steam', 390, 30);
    const a = E.aktor[0];
    if (a && a.diam && !E.data.didorong) {
      pada(E, 3, () => a.say('kipasnya pinjam dulu buat rak'));
      pada(E, 5, () => { E.data.didorong = true; a.goToXY(400, 300, 'down'); });
    }
    if (E.data.didorong) MOD.kipasCx = 372;
  },
  selesai() { },
},

{
  id: 'rebutan-stempel',
  kelas: 'panggung', bobot: B.jarang, cooldown: 600, durasi: 13,
  syarat: (S) => S.orang.filter((o) => o.station !== 'rapat' && bisaDipinjam(o)).length >= 2,
  mulai(E, S) {
    const dua = S.orang.filter((o) => o.station !== 'rapat' && bisaDipinjam(o)).slice(0, 2);
    for (const a of dua) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    const [a, b] = dua;
    if (a) a.goToXY(272, 152, 'right');
    if (b) b.goToXY(300, 152, 'left');
  },
  tick(E) {
    const [a, b] = E.aktor;
    if (!a || !b) return;
    if (a.diam && b.diam) { hadapkan(a, b.x, b.y); hadapkan(b, a.x, a.y); }
    if (Math.random() < 0.1) spawn('ink', (a.x + b.x) / 2, 140);
    pada(E, 7, () => {
      // yang berjabatan lebih rendah mengalah — urutan JABATAN sebagai proksi
      const urut = ['kadis', 'sekdis', 'kabid', 'kasi', 'analis_sistem', 'pranata_madya',
        'pranata_muda', 'pranata_pertama', 'sandiman', 'auditor', 'statistisi',
        'arsiparis', 'humas', 'analis_kebijakan', 'teknisi', 'magang'];
      const ia = urut.indexOf(a.peran), ib = urut.indexOf(b.peran);
      const kalah = ia < ib ? b : a, menang = kalah === a ? b : a;
      kalah.say('biar Pak Kadis saja yang putuskan');
      kalah.doingEvent = 'menghadap kadis'; kalah.goToXY(452, 152, 'up');
      hentakkanStempel(menang);
      menang.doingEvent = 'kembali ke meja'; menang.goTo('think');
    });
  },
},

{
  id: 'tumpahan-kopi-rapat',
  kelas: 'latar', bobot: B.jarang, cooldown: 960, durasi: 18,
  syarat: () => kursiKosong() <= KURSI_TOTAL - 2,
  mulai(E) {
    RUANGAN.gelasGuling = pilih([190, 226, 266, 302]);
    for (let i = 0; i < 4; i++) spawn('ink', RUANGAN.gelasGuling, 210, '#6b4a2a');
    const duduk = [...penghuni()].filter((o) => o.station === 'rapat');
    menoleh(duduk, RUANGAN.gelasGuling, 210, 1500);
    const a = duduk.find((o) => bisaDipinjam(o));
    E.data.a = a;
  },
  tick(E) {
    pada(E, 8, () => {
      const a = E.data.a;
      if (!a) return;
      a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
      a.doingEvent = 'mengelap tumpahan';
      a.bawa = 'lap';
      a.goToXY(RUANGAN.gelasGuling, 200, 'up');
    });
    if (E.aktor[0] && E.aktor[0].diam) {
      pada(E, 12, () => { E.aktor[0].pose = 'kipas'; });
    }
    pada(E, 17, () => {
      RUANGAN.nodaKopi.push({ x: RUANGAN.gelasGuling - 4, y: 209, lebar: 8 });
      RUANGAN.gelasGuling = null;
      if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; }
    });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'ups-ngebul',
  kelas: 'panggung', bobot: B.langka, cooldown: 1500, durasi: 16,
  mulai(E) {
    const a = pemeranDekat(E, 390, 164, 220);
    if (a) { a.doingEvent = 'mengecek APAR'; a.goToXY(335, 152, 'up'); }
  },
  tick(E, dt, S) {
    if (!E.data.aman) {
      MOD.upsSiaga = 1;
      if (Math.random() < 0.6) spawn('asap', 390, 118);
      glow(390, 100, 18, '#e8453f', 0.12);
      // yang di dekat rak mundur dan menutup hidung
      for (const o of S.orang) {
        if (o.eventKerja || jarakKe(o, 390, 130) > 70 || o.path.length) continue;
        o.pose = 'hidung';
      }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.aman) {
      pada(E, 4, () => a.say('jangan dicolok dulu ya'));
      pada(E, 6, () => {
        RUANGAN.aparDiangkat = true;
        a.bawa = 'apar';
        a.goToXY(390, 152, 'up');
      });
      pada(E, 9, () => { E.data.aman = true; for (const o of S.orang) if (o.pose === 'hidung') o.pose = null; });
      pada(E, 12, () => { a.bawa = null; a.goToXY(335, 152, 'up'); });
      pada(E, 15, () => { RUANGAN.aparDiangkat = false; });
    }
  },
  selesai(E, S) {
    RUANGAN.aparDiangkat = false;
    if (E.aktor[0]) E.aktor[0].bawa = null;
    for (const o of S.orang) if (o.pose === 'hidung') o.pose = null;
  },
},

{
  id: 'xbanner-roboh',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 20,
  mulai(E, S) {
    const dekat = S.orang.filter((o) => bisaDipinjam(o) && jarakKe(o, 30, 214) < 160).slice(0, 2);
    for (const a of dekat) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    E.data.sendiri = E.aktor.length < 2;
    E.aktor.forEach((a, i) => a.goToXY(i === 0 ? 40 : 40, i === 0 ? 216 : 240, 'left'));
  },
  tick(E, dt) {
    const jatuh = E.data.sendiri ? [0, 6, 8, 14] : [0, 5];
    const t = E.umur;
    if (!E.data.roboh) {
      RUANGAN.xbanner.sudut = Math.min(1, t / 3);
      if (t >= 3 && !E.data.debu) { E.data.debu = true; for (let i = 0; i < 6; i++) spawn('dust', 30, 236); }
      if (t >= 3) E.data.roboh = true;
    } else if (!E.data.bangun) {
      const mulaiBangun = E.data.sendiri ? 8 : 5;
      if (E.aktor.every((a) => a.diam) && t > mulaiBangun) {
        if (E.data.sendiri && !E.data.gagalDulu) {
          // sendirian: sempat gagal sekali, banner naik separuh lalu jatuh lagi
          E.data.gagalDulu = true;
          RUANGAN.xbanner.sudut = 0.5;
          pada(E, mulaiBangun + 2, () => { RUANGAN.xbanner.sudut = 1; });
        } else {
          E.data.bangun = true;
          E.data.bangunPada = t;
        }
      }
    } else {
      const p = Math.min(1, (t - E.data.bangunPada) / 2);
      RUANGAN.xbanner.sudut = 1 - p;
      if (p >= 1) RUANGAN.xbanner.lipat = true;
    }
    pada(E, E.data.sendiri ? 9 : 6, () => { const a = E.aktor[0]; if (a) a.say('angin kipas, Bu.'); });
  },
  selesai() { RUANGAN.xbanner.sudut = 0; },
},

);

daftarEvent(

/* Lanjutan dari cicak-di-dinding (gelombang 1) — bukan dari 'cicak-berburu-
   di-neon' yang disebut catatan aslinya (event itu tidak pernah dibuat).
   Dipicu lewat lanjutan(), jadi hanya jalan kalau cicak dasarnya baru saja ada. */
{
  id: 'cicak-jatuh-ke-berkas',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.3, () => {
      for (let i = 0; i < 3; i++) spawn('paper', 262, 60);
      a.busyUntil = Math.max(a.busyUntil, now + 4000);
      a.goToXY(a.x, a.y + 6, a.face);
      a.say('astaghfirullah!');
      E.data.miring = true;
    });
    pada(E, 4, () => { a.goTo('edit'); });
  },
  gambarProp(E) {
    // lari zig-zag ke kanan lalu masuk ke celah rak surat dan hilang
    if (E.umur > 3) return;
    const x = 262 + Math.round(E.umur * 7), y = 62 + Math.round(Math.sin(E.umur * 14) * 2);
    r(x, y, 5, 2, '#8a8070');
    r(x + 5, y - 1, 2, 2, '#8a8070');
  },
  gambarDinding(E) {
    if (!E.data.miring) return;
    // tumpukan berkas digambar miring 1 px sampai akhir event — tanda berantakan
    r(255, 51, 14, 1, sh('#e4ddc8', 0.7));
  },
  sortY: 90,
  selesai(E) {},
},

);

/* ==========================================================================
   GELOMBANG 2 — BIROKRASI, bagian A (19 dari 38 — lihat catatan di README
   soal sobek-kalender-dinding yang sengaja tidak dibuat: duplikat fungsional
   dari kalender-dinas-diganti gelombang 1)
   ========================================================================== */

daftarEvent(

{
  id: 'absen-fingerprint',
  kelas: 'panggung', bobot: B.sering, cooldown: 90, durasi: 12,
  syarat: (S) => (S.jam >= 7 && S.jam < 8.25) || (S.jam >= 15.75 && S.jam < 16.75),
  mulai(E) {
    const org = pinjamAktor(E, 3);
    org.forEach((a, i) => { a.doingEvent = 'absen sidik jari'; a.goToXY(462 - i * 10, 152, 'up'); });
  },
  tick(E) {
    const q = E.aktor;
    if (!q.length) return;
    if (E.data.berikut == null) E.data.berikut = 2;
    if (E.umur > E.data.berikut && q[0] && q[0].diam) {
      const a = q.shift();
      const gagal = Math.random() < 0.2;
      RUANGAN.absensiMerah = gagal;
      if (gagal) {
        a.pose = 'angkat';
        pada(E, E.umur + 1, () => { RUANGAN.absensiMerah = false; a.pose = null; });
        a.say('jarinya kering, ngulang');
      } else {
        for (let i = 0; i < 3; i++) spawn('ping', 428, 106);
        lepaskanAktor(a);
      }
      if (!gagal) { q.forEach((o, i) => o.goToXY(462 - i * 10, 152, 'up')); E.data.berikut = E.umur + 2.5; }
      else E.data.berikut = E.umur + 1.6;
    }
  },
  selesai() { RUANGAN.absensiMerah = false; },
},

{
  id: 'bagan-struktur-organisasi-diperbarui',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 24,
  syarat: () => RUANGAN.baganKotak < 2,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'memperbarui bagan struktur';
    a.goToXY(118, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    if (Math.random() < 0.2) spawn('paper', 118, 44);
    pada(E, 10, () => { RUANGAN.baganKotak = Math.min(2, RUANGAN.baganKotak + 1); a.pose = null; a.say('kotaknya nambah satu'); });
    pada(E, 14, () => {
      const b = pemeranDekat(E, 120, 152, 200);
      if (b) { b.doingEvent = 'membaca bagan'; b.goToXY(126, 152, 'up'); }
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'basahi-jari-hitung-berkas',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 3,
  syarat: (S) => S.stasiunAktif.has('read') || S.stasiunAktif.has('search'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => (o.station === 'read' || o.station === 'search') && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.pose = 'angkat';
    if (Math.random() < 0.4) spawn('paper', a.x, a.y - 20);
    pada(E, 2, () => { a.say('kurang satu, ulang'); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'berkas-lama-dibuka',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 9,
  mulai(E, S) {
    const baru = S.orang.find((o) => Date.now() - (o.sejak || 0) < 30000 && !o.standby);
    E.data.a = baru || (S.orang.find((o) => o.station === 'search' && bisaDipinjam(o)));
    if (E.data.a) { E.data.a.doingEvent = 'membuka berkas lama'; E.data.a.goToXY(132, 152, 'up'); }
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      RUANGAN.laciBuka = 10;
      for (let i = 0; i < 25; i++) spawn('dust', 132, 128);
      a.mulut = true;
      a.say('hatsyi!');
    });
    pada(E, 1.3, () => { a.mulut = false; });
    pada(E, 1.5, () => {
      let jeda = 0;
      for (const o of S.orang) {
        if (o === a || o.eventKerja || jarakKe(o, a.x, a.y) > 60 || o.path.length) continue;
        jeda += 0.4;
        o.busyUntil = Math.max(o.busyUntil, now + 1000 + jeda * 1000);
      }
    });
  },
},

{
  id: 'ketuk-kertas-rata-di-meja',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 2,
  syarat: () => !RUANGAN.stempelRapi,
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit') || S.orang.find(bisaDipinjam);
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.pose = 'jongkok';
    pada(E, 1.5, () => { RUANGAN.stempelRapi = true; a.pose = null; });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'surat-edaran-ditempel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 25,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'menempel surat edaran';
    a.goToXY(10, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    pada(E, 6, () => {
      a.pose = null;
      for (const e of RUANGAN.edaran) e.kusam = true;
      RUANGAN.edaran.push({ miring: false, kusam: false });
      if (RUANGAN.edaran.length > 4) RUANGAN.edaran.shift();
      a.say('cuti bersama turun');
    });
    pada(E, 10, () => {
      const b = pemeranDekat(E, 12, 152, 220);
      if (b) { b.doingEvent = 'membaca edaran'; b.goToXY(16, 152, 'up'); }
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'arsip-dipinjam-bidang',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 300,
  syarat: () => RUANGAN.boksHilang < 0,
  mulai(E) {
    RUANGAN.boksHilang = (Math.random() * 6) | 0;
    E.data.kembaliPada = E.umur + acak(120, 240);
  },
  tick(E, dt, S) {
    pada(E, 0.3, () => {
      const arsiparis = S.orang.find((o) => o.station === 'read' && bisaDipinjam(o));
      if (arsiparis) { hadapkan(arsiparis, 40, 152); spawn('ink', 66, 134); }
    });
    if (E.umur > E.data.kembaliPada) { E.selesaiCepat = true; }
    if (E.umur > E.data.kembaliPada - 30 && !E.data.diingatkan) {
      E.data.diingatkan = true;
      const a = pemeranDekat(E, 54, 152, 220);
      if (a) { a.doingEvent = 'menengok lemari arsip'; a.goToXY(40, 152, 'up'); a.say('boksnya belum balik dari kemarin'); }
    }
  },
  selesai() { RUANGAN.boksHilang = -1; },
},

/* Sengaja hanya menyasar STANDBY: hook di arrive('read') akan menunda efek
   stasiun 6 detik, dan itu tidak boleh terjadi pada tool call sungguhan yang
   memang sedang melapor sesuatu — jadi dijadikan event mandiri, bukan hook. */
{
  id: 'arsiparis-minta-isi-buku-pinjam',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 13,
  syarat: (S) => S.orang.some((o) => o.peran === 'arsiparis') && S.standby > 0,
  mulai(E, S) {
    const arsiparis = S.orang.find((o) => o.peran === 'arsiparis' && bisaDipinjam(o));
    const peminjam = S.orang.find((o) => o.standby && o !== arsiparis && bisaDipinjam(o));
    if (!arsiparis || !peminjam) return;
    for (const a of [arsiparis, peminjam]) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    arsiparis.goToXY(46, 152, 'up');
    peminjam.goToXY(60, 152, 'up');
  },
  tick(E) {
    const [ar, pe] = E.aktor;
    if (!ar || !pe) return;
    if (ar.diam && pe.diam) {
      pada(E, 1, () => { hadapkan(ar, pe.x, pe.y); pe.pose = 'jongkok'; for (let i = 0; i < 3; i++) spawn('ink', 60, 145, '#c22b2b'); });
      pada(E, 1.5, () => ar.say('tanda tangan di kolom peminjam ya'));
      pada(E, 7, () => { pe.pose = null; pe.say('siap, Bu'); RUANGAN.laciBuka = 6; spawn('dust', 60, 130); });
    }
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'audit-bpk',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 75,
  syarat: (S) => S.orang.length >= 3 && kursiKosong() >= 4,
  mulai(E) {
    const duaAuditor = pinjamAktor(E, 2, (o) => o.peran === 'auditor')
      .concat(pinjamAktor(E, Math.max(0, 2 - E.aktor.length)));
    duaAuditor.forEach((a) => { a.doingEvent = 'pemeriksaan BPK'; a.goTo('rapat'); });
    const arsiparis = pemeran(E, ['arsiparis']);
    E.data.arsiparis = arsiparis;
    if (arsiparis) { arsiparis.doingEvent = 'mengantar berkas ke BPK'; arsiparis.bawa = 'map'; arsiparis.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const ar = E.data.arsiparis;
    if (ar && ar.diam) {
      for (let rit = 0; rit < 3; rit++) {
        pada(E, 5 + rit * 22, () => { spawn('dust', 60, 130); ar.goTo('rapat'); });
        pada(E, 10 + rit * 22, () => { ar.say('SPJ triwulan tiga ada di dus yang bawah'); });
        pada(E, 15 + rit * 22, () => { ar.goToXY(54, 152, 'up'); });
      }
    }
    pada(E, 70, () => { if (ar) { ar.bawa = null; } });
  },
  gambarProp(E) {
    if (E.umur > 68) return;
    for (let d = 0; d < 3; d++) { r(196 + d * 12, 246, 14, 10, '#a37b4e'); r(198 + d * 12, 248, 10, 6, '#b98d5e'); }
  },
  sortY: 256,
  selesai(E) { if (E.data.arsiparis) E.data.arsiparis.bawa = null; },
},

{
  id: 'auditor-catat-temuan-rak-server',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 21,
  syarat: (S) => S.orang.some((o) => o.peran === 'auditor') && S.stasiunAktif.has('server'),
  mulai(E, S) {
    const auditor = S.orang.find((o) => o.peran === 'auditor' && bisaDipinjam(o));
    if (!auditor) return;
    auditor.eventKerja = E; auditor.betahAsli = auditor.betah; auditor.betah = true; E.aktor.push(auditor);
    auditor.doingEvent = 'mencatat temuan rak server';
    auditor.bawa = 'papan';
    RUANGAN.papanJalan = 0;
    auditor.goTo('server');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) pada(E, 5 + i * 5, () => { RUANGAN.papanJalan = Math.min(3, RUANGAN.papanJalan + 1); });
    const teknisi = S.orang.find((o) => o !== a && (o.peran === 'teknisi' || o.peran === 'pranata_muda') && bisaDipinjam(o));
    if (teknisi && !E.data.teknisi) {
      E.data.teknisi = teknisi;
      teknisi.eventKerja = E; teknisi.betahAsli = teknisi.betah; teknisi.betah = true; E.aktor.push(teknisi);
      teknisi.doingEvent = 'merapikan kabel'; teknisi.pose = 'jongkok'; teknisi.goTo('server');
      pada(E, E.umur + 8, () => { RUANGAN.kabelRapi = true; teknisi.pose = null; teknisi.say('minggu ini beres, Bu'); });
    }
    pada(E, 16, () => { a.say('kabel belum berlabel, saya catat ya'); });
    pada(E, 19, () => { spawn('paper', a.x, a.y - 20); a.bawa = null; });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'auditor-minta-bukti-dukung',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 22,
  syarat: (S) => S.orang.some((o) => o.peran === 'auditor') && S.orang.some((o) => o.station === 'think'),
  mulai(E, S) {
    const auditor = S.orang.find((o) => o.peran === 'auditor' && bisaDipinjam(o));
    const target = S.orang.find((o) => o.station === 'think' && o !== auditor);
    if (!auditor || !target) return;
    auditor.eventKerja = E; auditor.betahAsli = auditor.betah; auditor.betah = true; E.aktor.push(auditor);
    auditor.doingEvent = 'meminta bukti dukung';
    auditor.bawa = 'papan'; RUANGAN.papanJalan = 0;
    auditor.goToXY(target.x - 14, target.y, 'right');
    E.data.target = target;
    E.data.targetId = target.id;
  },
  tick(E, dt, S) {
    const a = E.aktor[0], target = E.data.target;
    if (!a) return;
    const masihAda = target && S.orang.includes(target);
    if (a.diam) {
      pada(E, 1, () => a.say('boleh lihat lampirannya?'));
      for (let i = 0; i < 3; i++) pada(E, 4 + i * 4, () => { RUANGAN.papanJalan = Math.min(3, RUANGAN.papanJalan + 1); });
    }
    if (masihAda && !E.data.pergi && a.diam) {
      pada(E, 2, () => { target.doingEvent = 'mengambil bukti dukung'; target.goToXY(54, 152, 'up'); });
      pada(E, 6, () => { spawn('dust', 60, 130); target.bawa = 'map-kuning'; target.goToXY(a.x + 14, a.y, 'left'); });
      pada(E, 12, () => {
        E.data.pergi = true; spawn('paper', a.x, a.y - 20); target.bawa = null;
        a.say('boleh lihat lampirannya?'); a.bawa = null;
      });
    }
    if (!masihAda && E.umur > 12 && !E.data.pergi) {
      E.data.pergi = true;
      a.say('belum disetujui');   // bukti tidak datang: papan dicoret, ke ruang kadis
      a.doingEvent = 'melapor ke kadis'; a.bawa = null; a.goToXY(452, 152, 'up');
    }
  },
  selesai(E) { for (const a of E.aktor) a.bawa = null; },
},

{
  id: 'berkas-menumpuk-di-pojok',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 40,
  // Reuse penghitung nyata yang sudah ada (backlog disposisi), bukan penanda
  // baru — dan TIDAK menyentuh route(): titik belok tambahan di pencari jalur
  // tunggal yang dipakai semua agen adalah risiko yang tidak sepadan di sini.
  syarat: () => RUANGAN.mapDisposisi >= 4,
  tick() {
    if (Math.random() < 0.02) spawn('dust', 30, 200, '#cbb897');
  },
  gambarProp() {
    const n = Math.min(3, Math.max(0, RUANGAN.mapDisposisi - 3));
    for (let d = 0; d < n; d++) { r(24 - d * 6, 200 - d * 2, 18, 14, '#a37b4e'); r(26 - d * 6, 202 - d * 2, 14, 10, '#b98d5e'); }
  },
  sortY: 210,
},

{
  id: 'cetak-massal-undangan',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 30,
  syarat: (S) => S.orang.filter((o) => o.station === 'rapat').length >= 3 || Math.random() < 0.3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu cetakan massal';
    a.goTo('web');
  },
  tick(E) {
    if (E.umur < 24 && Math.random() < 0.5) spawn('paper', 214, 96);
    const a = E.aktor[0];
    if (a && a.diam) {
      if (Math.floor(now / 400) !== a._g) { a._g = Math.floor(now / 400); hadapkan(a, 168, 38); }
    }
    pada(E, 6, () => { if (a) a.say('dua belas rangkap, satu untuk arsip'); });
    pada(E, 25, () => {
      if (!a) return;
      a.bawa = 'kertas';
      a.doingEvent = 'mengantar cetakan ke rapat';
      a.goTo('rapat');
    });
    pada(E, 29, () => { if (a) a.bawa = null; });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'disposisi-ditolak',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 9,
  mulai(E) {
    MOD.pintuKadis = true;
  },
  tick(E, dt, S) {
    MOD.pintuKadis = E.umur < 0.5;
    pada(E, 0.5, () => {
      for (let i = 0; i < 4; i++) spawn('ink', 448, 150);
      RUANGAN.propLantai.push({ x: 444, y: 148, jenis: 'map-merah' });
      const a = pemeranDekat(E, 448, 150, 220);
      if (a) {
        E.data.a = a; a.doingEvent = 'memungut disposisi ditolak';
        a.goToXY(448, 152, 'up');
      }
    });
    if (E.data.a && E.data.a.diam && !E.data.dipungut) {
      E.data.dipungut = true;
      RUANGAN.propLantai.pop();
      E.data.a.bawa = 'map-merah';
      E.data.a.say('belum disetujui');
      const slot = E.data.a.slotIdx;
      MOD.mejaPadam = E.data.a.station === 'think' ? slot : -1;
      E.data.a.doingEvent = 'kembali dengan lesu';
      E.data.a.goTo('think');
    }
    pada(E, 8, () => { if (E.data.a) E.data.a.bawa = null; });
  },
  selesai() {
    if (RUANGAN.propLantai.length && RUANGAN.propLantai[RUANGAN.propLantai.length - 1].jenis === 'map-merah') {
      RUANGAN.propLantai.pop();
    }
  },
},

{
  id: 'fotokopi-kilat',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 14,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'mengambil hasil fotokopi'; a.goTo('web'); }
  },
  tick(E) {
    if (E.umur < 2 && Math.random() < 0.5) spawn('ping', 213, 90);
    const a = E.aktor[0];
    if (a && a.diam && !E.data.ambil) {
      pada(E, 2.2, () => {
        E.data.ambil = true; a.bawa = 'kertas';
        a.doingEvent = 'mengecap hasil fotokopi'; a.goTo('edit');
      });
    }
    if (E.data.ambil && a && a.diam && a.station === 'edit' && !E.data.cap) {
      pada(E, E.umur + 1.5, () => { E.data.cap = true; hentakkanStempel(a); a.bawa = null; });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

/* MIN_DI_LAYAR ditekan lewat minDiLayarTimpa, bukan MIN_DI_LAYAR langsung —
   nilai bawaannya harus selalu bisa dipulihkan walau event dibatalkan paksa
   (mis. server-side reload). durasi di sini SATU SIKLUS keliling, bukan
   sepanjang hari — dipicu ulang sendiri lewat bobot yang tinggi selama syarat
   tanggalnya masih benar. */
{
  id: 'hari-kejepit-nasional',
  kelas: 'panggung', bobot: B.sedang, cooldown: 300, durasi: 150,
  syarat: (S) => HARI_KEJEPIT.has(S.tanggal + '-' + (new Date().getMonth() + 1)),
  mulai() {
    minDiLayarTimpa = 1;
    RUANGAN.propLantai.push({ x: 446, y: 146, jenis: 'map-menunggu' });
  },
  tick(E, dt, S) {
    const urut = ['read', 'search', 'web', 'edit', 'server'];
    const idx = Math.min(urut.length - 1, Math.floor(E.umur / 25));
    // real agent didahulukan supaya balonnya benar-benar terlihat — standby
    // dibungkam total lewat Standby.say(), jadi kalau cuma dia yang ada,
    // eventnya tetap jalan tapi memang tanpa balon.
    const sendirian = S.orang.find((o) => !o.standby) || S.orang.find((o) => o.standby);
    if (sendirian && sendirian.station !== urut[idx] && !sendirian.path.length) sendirian.goTo(urut[idx]);
    pada(E, 4, () => { if (sendirian) sendirian.say('sepi ya hari ini'); });
  },
  selesai() {
    minDiLayarTimpa = null;
    const i = RUANGAN.propLantai.findIndex((p) => p.jenis === 'map-menunggu');
    if (i >= 0) RUANGAN.propLantai.splice(i, 1);
  },
},

{
  id: 'humas-buru-kutipan-kadis',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 20,
  syarat: (S) => S.orang.some((o) => o.peran === 'humas'),
  mulai(E, S) {
    const humas = S.orang.find((o) => o.peran === 'humas' && bisaDipinjam(o));
    if (!humas) return;
    humas.eventKerja = E; humas.betahAsli = humas.betah; humas.betah = true; E.aktor.push(humas);
    humas.doingEvent = 'mengejar kutipan kadis';
    humas.goToXY(452, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    MOD.pintuKadis = a.diam && E.umur < 10;
    pada(E, 1, () => a.say('satu kalimat saja, Pak, buat rilis'));
    pada(E, 6, () => { a.bawa = 'kertas'; a.doingEvent = 'membaca kutipan'; a.goToXY(30, 216, 'up'); });
    pada(E, 14, () => { a.bawa = null; });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

);

/* Daftar hari kejepit sederhana: "tanggal-bulan". Cukup untuk demo/hiasan,
   tidak berusaha jadi kalender libur nasional yang akurat. */
const HARI_KEJEPIT = new Set(['2-5', '31-5', '9-6', '28-3', '3-1']);

/* ==========================================================================
   GELOMBANG 2 — BIROKRASI, bagian B (18 sisanya)
   ========================================================================== */

daftarEvent(

{
  id: 'inspektorat-mendadak',
  kelas: 'panggung', bobot: B.jarang, cooldown: 420, durasi: 16,
  syarat: () => RUANGAN.gagalBeruntun.length >= 3,
  mulai(E, S) {
    const target = S.orang.find((o) => o.gagal > 0 && !o.standby) || S.orang.find((o) => !o.standby);
    E.data.target = target;
    RUANGAN.inspeksiLog.push(Date.now());
    if (RUANGAN.inspeksiLog.length > 20) RUANGAN.inspeksiLog.shift();
    const auditor = pemeran(E, ['auditor']);
    if (auditor && target) { auditor.doingEvent = 'inspeksi mendadak'; auditor.goToXY(target.x - 12, target.y, 'right'); }
    else if (auditor) { auditor.doingEvent = 'inspeksi mendadak'; auditor.goToXY(452, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0], target = E.data.target;
    if (!a) return;
    if (target) hadapkan(a, target.x, target.y);
    if (Math.floor(E.umur / 2) !== E.data.p) { E.data.p = Math.floor(E.umur / 2); spawn('paper', a.x, a.y - 20); }
    pada(E, 1, () => a.say('boleh lihat catatannya?'));
    pada(E, 3, () => { if (target) target.say('siap, sebentar'); });
    pada(E, 16 - 4, () => { a.doingEvent = 'melapor ke kadis'; a.goToXY(452, 152, 'up'); });
  },
},

{
  id: 'kadis-sidak-keliling',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2700, durasi: 24,
  syarat: (S) => S.orang.length >= 3,
  mulai() { MOD.pintuKadis = true; },
  tick() {
    MOD.pintuKadis = true;
    MOD.sidak = true;   // drawMejaKerja membaca ini: semua laptop terang penuh
  },
  selesai() { MOD.sidak = false; MOD.pintuKadis = false; },
},

{
  id: 'lapor-diri-pegawai-baru',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 9,
  mulai(E) {
    const a = antrianLaporDiri.shift();
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'lapor diri, mulai tugas';
    a.goToXY(452, 152, 'up');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a) return;
    // tugas selalu menang atas seremonial: kalau tool call sungguhan sudah
    // masuk untuk sesi ini, dia bukan lagi eventKerja milik event ini —
    // lepasDariEvent() di handle() sudah membereskannya, cukup deteksi di sini
    if (!a.eventKerja) { E.selesaiCepat = true; return; }
    if (a.diam) {
      pada(E, 2, () => { a.say('lapor, mulai tugas hari ini'); for (let i = 0; i < 3; i++) spawn('paper', a.x, a.y - 20); });
      pada(E, 0.5, () => menoleh(S.orang.filter((o) => o !== a && o.station === 'think'), a.x, a.y, 1500));
    }
  },
},

{
  id: 'lemari-arsip-kepenuhan',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 20,
  syarat: () => !RUANGAN.arsipPenuh,
  mulai(E) {
    RUANGAN.arsipPenuh = true;
    RUANGAN.dusTambahanArsip = 2;
    const a = pemeranDekat(E, 54, 152, 220);
    if (a) { a.doingEvent = 'mendorong lemari arsip'; a.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'kipas';
      pada(E, 3, () => { a.pose = null; a.say('sudah tidak muat, Pak'); });
      pada(E, 3.5, () => { hadapkan(a, 54, 30); });
      pada(E, 7.5, () => { a.goTo('think'); });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'menunggu-paraf',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 20,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu paraf kadis';
    a.bawa = 'map';
    a.goToXY(452, 152, 'up');
  },
  tick(E) {
    MOD.jamOffset = Math.min(0.13, E.umur / 20 * 0.13);   // ~8 menit maju selama event
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) pada(E, 1 + i * 3.5, () => { a.pose = 'angkat'; });
    for (let i = 0; i < 3; i++) pada(E, 1.3 + i * 3.5, () => { a.pose = null; });
    pada(E, 16, () => {
      a.pose = null; a.bawa = null;
      RUANGAN.propLantai.push({ x: 444, y: 148, jenis: 'map-menunggu' });
      a.say('saya tinggal di meja Bapak ya');
      a.goTo('think');
    });
  },
  selesai(E) {
    if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; }
  },
},

{
  id: 'nomor-antrean-loket',
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 8,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && S.orang.some((o) => o.station === 'idle'),
  tick(E) {
    pada(E, 0.3, () => {
      RUANGAN.antre = (RUANGAN.antre % 99) + 1;
      spawn('ping', 218, 34);
    });
    pada(E, 1.5, () => {
      const tamu = [...penghuni()].find((o) => o.station === 'idle');
      if (tamu) { tamu.doingEvent = 'dipanggil ke loket'; tamu.goTo('edit'); }
    });
  },
},

{
  id: 'pemadatan-arsip',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: () => RUANGAN.arsipPenuh,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    a.doingEvent = 'memadatkan arsip';
    a.goToXY(30, 200, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.umur > 5 && E.umur < 9 && Math.random() < 0.4) spawn('paper', 30, 195);
    pada(E, 9.5, () => {
      RUANGAN.arsipPenuh = false; RUANGAN.dusTambahanArsip = 0;
      a.say('muat lagi sekarang'); a.goTo('think');
    });
  },
},

{
  id: 'pengarahan-kadis',
  kelas: 'panggung', bobot: B.sedang, cooldown: 360, durasi: 22,
  syarat: (S) => S.orang.filter((o) => o.x > 240).length >= 2,
  bentrokDengan: ['rapat-pimpinan-dadakan'],
  mulai(E, S) {
    const titik = [[430, 158], [446, 166], [462, 158]];
    const org = pinjamAktor(E, 3, (o) => o.x > 240);
    org.forEach((a, i) => a.goToXY(titik[i][0], titik[i][1], 'left'));
    MOD.pintuKadis = true;
  },
  tick(E) {
    MOD.pintuKadis = true;
    if (Math.random() < 0.35) spawn('talk', 452, 126);
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('nanti tolong dikawal sampai selesai, ya'); });
    pada(E, 20, () => {
      for (const a of E.aktor) a.goTo(a.station === 'idle' ? 'think' : a.station);
      const c = E.aktor[0]; if (c) c.goTo('edit');
    });
  },
  selesai() { MOD.pintuKadis = false; },
},

{
  id: 'pengumuman-lewat-toa',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 12,
  syarat: (S) => S.kerjaJam,
  mulai(E, S) {
    menoleh(S.orang.filter((o) => o.path.length), 196, 24, 2000);
  },
  tick(E) {
    if (Math.random() < 0.4) spawn('ping', 200, 26);
    pada(E, 6, () => {
      const a = pemeran(E, ['humas']);
      if (a) { a.doingEvent = 'dipanggil ke rapat'; a.goTo('rapat'); a.say('diberitahukan kepada seluruh pegawai...'); }
    });
  },
  gambarDinding(E) {
    if (E.umur > 1.5) return;
    const p = E.umur / 1.5;
    ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 1; ctx.globalAlpha = 1 - p;
    for (const r2 of [4, 8, 12]) { ctx.beginPath(); ctx.arc(206, 27, r2 * p, -0.6, 0.6); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  gambarProp() { r(196, 20, 10, 6, '#8b9098'); r(196, 20, 10, 1, '#aeb4ba'); },
  sortY: 26,
},

{
  id: 'plang-nama-ruangan',
  kelas: 'panggung', bobot: B.langka, cooldown: 999999, durasi: 32,
  syarat: () => !RUANGAN.plangBaru,
  mulai(E) {
    const dua = pinjamAktor(E, 2);
    dua.forEach((a, i) => a.goToXY(452 + (i ? 6 : -6), i ? 158 : 152, 'up'));
  },
  tick(E) {
    const [pemasang, pengarah] = E.aktor;
    if (pemasang && pemasang.diam) pemasang.pose = 'duaangkat';
    if (pengarah && pengarah.diam) { pengarah.pose = 'nunjuk'; pada(E, 6, () => pengarah.say('kirinya turun sedikit.')); }
    pada(E, 14, () => { RUANGAN.plangBaru = true; });
    pada(E, 26, () => { for (const a of E.aktor) a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'rapat-evaluasi-dadakan',
  kelas: 'panggung', bobot: B.langka, cooldown: 1200, durasi: 40,
  syarat: () => {
    const batas = Date.now() - 600000;
    return RUANGAN.inspeksiLog.filter((t) => t > batas).length >= 2 && kursiKosong() >= 4;
  },
  bentrokDengan: ['audit-bpk', 'rapat-pimpinan-dadakan'],
  mulai(E, S) {
    const gagalDulu = S.orang.filter((o) => o.gagal > 0);
    const isi = gagalDulu.length >= 4 ? gagalDulu.slice(0, 4) : gagalDulu.concat(S.orang.filter((o) => o.standby)).slice(0, 4);
    const org = pinjamAktor(E, 4, (o) => isi.includes(o));
    if (org.length < 4) pinjamAktor(E, 4 - org.length).forEach((a) => org.push(a));
    for (const a of E.aktor) a.goTo('rapat');
  },
  tick(E) {
    if (Math.floor(E.umur / 1.5) !== E.data.g) {
      E.data.g = Math.floor(E.umur / 1.5);
      const a = E.aktor[E.data.g % Math.max(1, E.aktor.length)];
      if (a) spawn('talk', a.x, a.y - 26);
    }
    pada(E, 4, () => { const a = E.aktor[0]; if (a) a.say('kita bahas kendalanya'); });
  },
  selesai(E) {
    for (const a of E.aktor) if (!a.standby) a.gagal = 0;
    RUANGAN.inspeksiLog.length = 0;
  },
},

{
  id: 'rapat-pimpinan-dadakan',
  kelas: 'panggung', bobot: B.sedang, cooldown: 480, durasi: 50,
  syarat: (S) => S.orang.filter((o) => o.standby || o.station === 'idle').length >= 3,
  mulai(E, S) {
    const org = pinjamAktor(E, 5, (o) => o.standby || o.station === 'idle');
    org.forEach((a) => { a.doingEvent = 'rapat pimpinan dadakan'; a.goTo('rapat'); });
    MOD.pintuKadis = true;
  },
  tick(E, dt, S) {
    MOD.pintuKadis = true;
    if (Math.floor(E.umur / 0.9) !== E.data.g) {
      E.data.g = Math.floor(E.umur / 0.9);
      const a = E.aktor[E.data.g % Math.max(1, E.aktor.length)];
      if (a) spawn('talk', a.x, a.y - 26);
    }
    pada(E, 1, () => { const a = E.aktor[0]; if (a) a.say('dipanggil rapat, tinggal dulu berkasnya'); });
    for (const o of S.orang) {
      if (E.aktor.includes(o) || o.eventKerja) continue;
      if (jarakKe(o, 246, 200) < 90 && !o.path.length) hadapkan(o, 246, 200);
    }
  },
  gambarDinding(E) {
    if (E.umur > 45) return;
    r(96, 40, Math.min(30, E.umur), 1, '#3565b0');
  },
  selesai() { MOD.pintuKadis = false; },
},

{
  id: 'sandiman-razia-sandi',
  kelas: 'panggung', bobot: B.jarang, cooldown: 900, durasi: 30,
  syarat: (S) => S.orang.some((o) => o.peran === 'sandiman') && kursiKosong() > 0,
  mulai(E, S) {
    const sandiman = S.orang.find((o) => o.peran === 'sandiman' && bisaDipinjam(o));
    if (!sandiman) return;
    sandiman.eventKerja = E; sandiman.betahAsli = sandiman.betah; sandiman.betah = true; E.aktor.push(sandiman);
    sandiman.doingEvent = 'razia kata sandi';
    E.data.i = 0;
    sandiman.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    const target = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - MEJA_KERJA_X[E.data.i]) < 8);
    if (target) MOD.slotTerkunci = E.data.i;
    if (target) { target.busyUntil = Math.max(target.busyUntil, now + 4000); hadapkan(target, a.x, a.y); }
    if (E.umur - E.data.tibaPada > 4) {
      if (target) {
        MOD.slotTerkunci = -1;
        for (let k = 0; k < 4; k++) spawn('glyph', target.x, target.y - 20);
        target.say('...tadi sudah, Pak');
      }
      a.say('sandi wajib diganti bulan ini');
      E.data.i++;
      E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) { E.selesaiCepat = true; }
      else a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
    }
    if (Math.random() < 0.15) spawn('scan', a.x, a.y - 24);
  },
  selesai() { MOD.slotTerkunci = -1; },
},

{
  id: 'sppd-turun',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 90,
  syarat: (S) => S.standby > 0,
  mulai(E, S) {
    const bendahara = pemeran(E, ['sekdis', 'kabid']);
    const sasaran = S.orang.find((o) => o.standby && bisaDipinjam(o) && o !== bendahara);
    E.data.sasaran = sasaran;
    if (bendahara && sasaran) { bendahara.doingEvent = 'menyerahkan SPPD'; bendahara.bawa = 'amplop-coklat'; bendahara.goToXY(sasaran.x + 12, sasaran.y, 'left'); }
    else E.selesaiCepat = true;
  },
  tick(E, dt, S) {
    const b = E.aktor[0], s = E.data.sasaran;
    if (!s) return;
    if (b && b.diam && !E.data.diberikan) {
      pada(E, 1, () => {
        E.data.diberikan = true;
        s.say('berangkat dulu, titip mejanya');
        b.bawa = null; b.doingEvent = 'kembali ke meja'; b.goTo('think');
        s.doingEvent = 'berangkat dinas luar';
        s.goToXY(-20, s.y, 'left');
        MOD.mejaPadam = s.station === 'think' ? s.slotIdx : -1;
      });
    }
    if (E.data.diberikan && !E.data.kembaliDijadwal) {
      E.data.kembaliDijadwal = true;
      E.data.kembaliPada = E.umur + acak(40, 70);
    }
    if (E.data.kembaliDijadwal && E.umur > E.data.kembaliPada && !E.data.kembali) {
      E.data.kembali = true;
      s.x = -20; s.y = LANE_DOWN; s.alpha = 1;
      s.bawa = 'koper';
      s.say('sudah balik, ini SPJ-nya');
      s.goTo('think');
      spawn('paper', s.x, 300);
      pada(E, E.umur + 3, () => { s.bawa = null; });
    }
  },
  selesai(E) {
    if (E.data.sasaran) E.data.sasaran.bawa = null;
    if (E.aktor[0]) E.aktor[0].bawa = null;
  },
},

{
  id: 'statistisi-keliling-tagih-data',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 24,
  syarat: (S) => S.orang.some((o) => o.peran === 'statistisi') && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const statistisi = S.orang.find((o) => o.peran === 'statistisi' && bisaDipinjam(o));
    if (!statistisi) return;
    statistisi.eventKerja = E; statistisi.betahAsli = statistisi.betah; statistisi.betah = true; E.aktor.push(statistisi);
    E.data.i = 0;
    statistisi.doingEvent = 'menagih rekap angka';
    statistisi.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    const target = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - MEJA_KERJA_X[E.data.i]) < 8);
    if (target && Math.random() < 0.2) spawn('data', target.x, target.y - 24);
    if (E.umur - E.data.tibaPada > 3) {
      if (target) { const siap = Math.random() < 0.6; target.say(siap ? undefined : 'besok pagi ya'); if (!siap) target.face = target.face === 'left' ? 'right' : 'left'; }
      E.data.i++; E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) { a.goTo('rapat'); E.data.grafik = true; E.data.grafikPada = E.umur; }
      else a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
    }
  },
  gambarAtas(E) {
    if (!E.data.grafik || !E.aktor[0]) return;
    const a = E.aktor[0], t = E.umur - E.data.grafikPada;
    if (t > 5) return;
    const tinggi = [2, 4, 3];
    ctx.globalAlpha = Math.max(0, 1 - t / 5);
    tinggi.forEach((h, i) => { if (t > i * 0.4) r(a.x - 4 + i * 4, a.y - 30 - h * 2, 2, h * 2, P.teal); });
    ctx.globalAlpha = 1;
  },
},

{
  id: 'stiker-inventaris',
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 60,
  syarat: () => RUANGAN.stikerTertempel.size < 7,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menempel stiker inventaris';
    a.bawa = 'kertas';
    E.data.urut = Object.keys(STIKER_TITIK).filter((n) => !RUANGAN.stikerTertempel.has(n));
    E.data.i = 0;
    const t0 = STIKER_TITIK[E.data.urut[0]];
    if (t0) a.goToXY(t0[0], 152, 'up'); else E.selesaiCepat = true;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    if (E.umur - E.data.tibaPada > 4) {
      RUANGAN.stikerTertempel.add(E.data.urut[E.data.i]);
      E.data.i++; E.data.tibaPada = null;
      if (E.data.i >= E.data.urut.length) { E.selesaiCepat = true; return; }
      const t = STIKER_TITIK[E.data.urut[E.data.i]];
      a.goToXY(t[0], 152, 'up');
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'stok-kertas-habis',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 24,
  syarat: () => RUANGAN.kertasPrinter <= 0,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 260);
    if (a) { a.doingEvent = 'mengambil kertas printer'; a.say('kertasnya habis.'); a.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 4, () => { spawn('dust', 60, 130); spawn('dust', 60, 130); spawn('dust', 60, 130); a.bawa = 'kertas'; a.goTo('web'); });
    pada(E, 8, () => { RUANGAN.kertasPrinter = 20; a.bawa = null; });
  },
  selesai(E) { RUANGAN.kertasPrinter = 20; if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'tamu-dinas-kabupaten',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 60,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && kursiKosong() >= 3,
  mulai(E, S) {
    const p = new Peserta('Tamu Kabupaten', 'kunjungan');
    p.setPeran('analis_kebijakan');
    p.pal = { ...p.pal, main: '#6b4a2a', pattern: '#d9ab5e' };
    peserta.push(p);
    p.masuk();
    E.data.tamu = p;
    const humas = pemeran(E, ['humas']);
    E.data.humas = humas;
    if (humas) { humas.doingEvent = 'menjamu tamu kabupaten'; humas.goTo('rapat'); }
  },
  tick(E) {
    pada(E, 1, () => { const h = E.data.humas; if (h) h.say('silakan, Pak, dari Kabupaten sebelah ya'); });
    if (Math.random() < 0.03) spawn('steam', 214, 210);
    if (Math.random() < 0.03) spawn('steam', 278, 210);
    pada(E, 55, () => {
      const h = E.data.humas;
      if (h) { h.pose = 'salam'; h.goToXY(-16, LANE_DOWN, 'left'); }
      if (E.data.tamu) E.data.tamu.bubar();
    });
  },
  selesai(E) {
    if (E.data.humas) E.data.humas.pose = null;
    if (E.data.tamu && !E.data.tamu.keluar) E.data.tamu.bubar();
  },
},

{
  id: 'tamu-nyasar',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 16,
  syarat: (S) => S.kerjaJam,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x = Math.min(246, T.x + 40 * dt);
      if (T.x >= 246) { T.fase = 'bingung'; T.putar = 0; }
    } else if (T.fase === 'bingung') {
      T.putar += dt;
      const arah = ['left', 'up', 'right', 'down'];
      T.hadap = arah[Math.floor(T.putar / 0.6) % 4];
      if (T.putar > 4.8 && !E.data.dibantu) {
        E.data.dibantu = true;
        const a = pemeranDekat(E, 246, 252, 220);
        if (a) { E.data.a = a; a.doingEvent = 'menunjukkan arah tamu'; a.goToXY(228, 252, 'right'); }
      }
    } else if (T.fase === 'keluar') {
      T.x += 40 * dt;
    }
    if (E.data.a && E.data.a.diam && T.fase === 'bingung') {
      E.data.a.pose = 'nunjuk';
      pada(E, E.umur + 1.5, () => { T.fase = 'keluar'; T.hadap = 'right'; E.data.a.pose = null; T.terimakasih = true; });
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (T.x < -12 || T.x > W + 12) return;
    gambarOrangLuar(T.x, T.y, '#8b9098', null, null, '#3a3f45');
    r(Math.round(T.x) - 1, T.y - 26, 3, 5, '#e8453f');   // tanda tanya berkedip
  },
  sortY: 258,
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
/* ==========================================================================
   HEWAN TAMU — makhluk kecil yang numpang lewat
   (cicak-berburu-di-neon SENGAJA dilewati: dobel dengan cicak-di-dinding
   yang sudah ada, dua cicak dengan aturan gerak beda cuma bikin bingung)
   ========================================================================== */

daftarEvent(

{
  id: 'lalat-nabrak-kaca',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 16,
  syarat: (S) => S.luar > 0.5,
  mulai(E) {
    E.data.x = JENDELA.x + JENDELA.w / 2;
    E.data.y = JENDELA.y + JENDELA.h / 2;
    E.data.vx = pilih([-38, 38]);
    E.data.vy = pilih([-30, 30]);
  },
  tick(E, dt) {
    const D = E.data;
    if (D.keluar) { D.x += 50 * dt; return; }
    D.x += D.vx * dt; D.y += D.vy * dt;
    if (D.x < JENDELA.x + 2 || D.x > JENDELA.x + JENDELA.w - 2) { D.vx *= -1; spawn('dust', D.x, D.y); }
    if (D.y < JENDELA.y + 2 || D.y > JENDELA.y + JENDELA.h - 2) { D.vy *= -1; spawn('dust', D.x, D.y); }
    if (!D.dibantu) {
      D.dibantu = true;
      D.a = pemeranStasiun(E, 'web');
      if (D.a) { D.a.pose = 'mengipas'; D.a.say('hus! hus!'); D.tandaiPada = E.umur; }
    }
    if (D.a && D.tandaiPada != null && E.umur - D.tandaiPada > 2.6) {
      D.keluar = true;
      D.a.pose = null;
    }
  },
  gambarAtas(E) {
    if (E.data.keluar && E.data.x > JENDELA.x + JENDELA.w + 6) return;
    klipJendela(() => r(Math.round(E.data.x), Math.round(E.data.y), 1, 1, '#1c1c1c'));
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'tikus-lari-di-atas-plafon',
  kelas: 'latar', bobot: B.sedang, cooldown: 1080, durasi: 5,
  syarat: (S) => S.malam || !S.kerjaJam,
  mulai(E, S) {
    E.data.maju = 0;
    for (const o of S.orang) {
      if (o.path.length || o.eventKerja) continue;
      hadapkan(o, o.x, o.y - 200);
      o.busyUntil = Math.max(o.busyUntil, now + 1500);
    }
    const a = S.orang.find((o) => !o.path.length && !o.eventKerja);
    if (a) a.say('itu apa ya');
  },
  tick(E, dt) {
    E.data.maju += 72 * dt;
    if (Math.random() < 0.35) spawn('dust', 90 + E.data.maju, 8);
  },
  gambarDinding(E) {
    const x = 90 + E.data.maju;
    if (x > 380) return;
    r(Math.round(x) - 6, 2, 12, 2, sh(P.cream, 0.85));
  },
},

{
  id: 'tokek-berbunyi',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 14,
  syarat: (S) => S.lampu > 0.7,
  mulai(E) { E.data.n = 0; },
  tick(E) {
    pada(E, 1, () => { E.data.n = 1; });
    pada(E, 4.5, () => { E.data.n = 2; });
    pada(E, 8, () => { E.data.n = 3; });
    pada(E, 11.5, () => {
      E.data.n = 4;
      E.data.a = pemeran(E);
      if (E.data.a) E.data.a.say('tujuh!');
    });
    pada(E, 13, () => { if (E.data.a) lepaskanAktor(E.data.a); });
    const titik = [1, 4.5, 8, 11.5];
    for (const t of titik) { if (E.umur > t && E.umur < t + 0.3) { MOD.lampu *= 0.94; break; } }
  },
  gambarDinding(E) {
    if (E.data.n <= 0) return;
    ctx.globalAlpha = 0.55;
    r(20, 6, 8, 3, '#14100d');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'capung-masuk-sebelum-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 12,
  syarat: (S) => CUACA.hujan > 0.2 && CUACA.hujan < 0.7,
  mulai(E) { E.data.x = 186; E.data.y = 138; E.data.fase = 'masuk'; E.data.t = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.fase === 'masuk') {
      D.x += 26 * dt;
      D.y = 138 + Math.sin(D.t * 3) * 8;
      if (D.x > 246) { D.fase = 'hinggap'; D.t = 0; }
    } else if (D.fase === 'hinggap') {
      D.x = 246; D.y = 210;
      if (D.t > 2.5) { D.fase = 'keluar'; D.t = 0; }
    } else {
      D.x -= 30 * dt;
      D.y = 138 + Math.sin(D.t * 3) * 8;
    }
    if (!D.dibantu && D.t > 1 && D.fase === 'hinggap') {
      D.dibantu = true;
      const a = pemeran(E);
      if (a) { a.say('mau hujan nih'); a.goTo('web'); lepaskanAktor(a); }
    }
  },
  gambarProp(E) {
    const x = Math.round(E.data.x), y = Math.round(E.data.y);
    r(x, y, 3, 1, '#3e6b4f');
    r(x - 1, y - 1, 1, 1, Math.sin(now / 60) > 0 ? '#dfe8ee' : '#3e6b4f');
    r(x + 4, y - 1, 1, 1, Math.sin(now / 60 + 2) > 0 ? '#dfe8ee' : '#3e6b4f');
  },
  sortY: 200,
},

{
  id: 'kucing-di-atas-keyboard',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  perluAktor: true,
  syarat: (S) => S.bekerja.some((o) => o.station === 'think'),
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'think');
    if (!E.data.a) return;
    E.data.a.pose = 'diam';
    E.data.a.bekuSampai = now + 25000;
    E.data.a.say('sabar ya, Pak Kucing');
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a) return;
    const x = Math.round(a.x), y = Math.round(a.y) - 22;
    r(x + 3, y, 8, 6, '#c9a06a');
    r(x + 3, y - 2, 2, 2, '#c9a06a'); r(x + 8, y - 2, 2, 2, '#c9a06a');
    r(x + 3 + (Math.sin(now / 90) > 0 ? 1 : 0), y + 5, 2, 1, '#c9a06a');
  },
  sortY: 349,
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; E.data.a.busyUntil += 3000; }
  },
},

{
  id: 'kucing-kantor',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 40,
  syarat: (S) => CUACA.hujan < 0.2 && S.jam > 14,
  mulai(E) { E.data.x = -10; E.data.y = LANE_DOWN; E.data.fase = 'masuk'; E.data.t = 0; E.data.jilat = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.fase === 'masuk') {
      D.x += SPEED * 0.35 * dt;
      D.jilat += dt;
      if (D.jilat > 3.8) D.jilat = 0;
      if (D.x > 246) { D.fase = 'duduk'; D.t = 0; }
    } else if (D.fase === 'duduk') {
      if (!D.dibelai && D.t > 1) {
        D.dibelai = true;
        const a = pemeranDekat(E, D.x, D.y, 160);
        if (a) { D.a = a; a.pose = 'jongkok'; a.goToXY(D.x - 12, D.y, 'right'); }
      }
      if (D.a && D.a.diam && !D.hati) {
        D.hati = true;
        for (let i = 0; i < 3; i++) spawn('hati', D.a.x - 6, D.a.y - 30);
      }
      if (D.t > 10) {
        D.fase = 'keluar'; D.t = 0;
        if (D.a) { D.a.pose = null; lepaskanAktor(D.a); D.a = null; }
      }
    } else {
      D.x += SPEED * 0.5 * dt;
    }
  },
  gambarProp(E) {
    const D = E.data;
    const x = Math.round(D.x), y = Math.round(D.y);
    const duduk = D.fase === 'duduk';
    ctx.globalAlpha = 0.15; ctx.fillStyle = '#20301f';
    ctx.beginPath(); ctx.ellipse(x, y + 1, duduk ? 4 : 5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (duduk) {
      r(x - 3, y - 5, 6, 5, '#c9a06a');
      r(x - 4, y - 8, 4, 4, '#c9a06a');
      const ang = Math.sin(now / 220);
      r(x + 2 + Math.round(ang * 2), y - 4 - Math.round(Math.abs(ang) * 2), 1, 3, '#c9a06a');
    } else {
      r(x - 4, y - 4, 7, 4, '#c9a06a');
      r(x - 3, y - 3, 7, 1, sh('#c9a06a', 0.75));
      r(x + 3, y - 7, 4, 4, '#c9a06a');
      r(x + 3, y - 8, 1, 1, '#c9a06a'); r(x + 6, y - 8, 1, 1, '#c9a06a');
      if (D.jilat > 0 && D.jilat < 0.8) r(x + 4, y - 5, 2, 2, '#c9a06a');
      const tail = Math.round(Math.sin(now / 220) * 3);
      r(x - 5 + tail, y - 6, 2, 2, '#c9a06a');
    }
  },
  sortY: 253,
},

{
  id: 'kucing-tidur-di-rak-server',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 70,
  syarat: (S) => S.lampu > 0.5 && !S.stasiunAktif.has('server'),
  tick(E, dt, S) {
    if (S.stasiunAktif.has('server') && !E.data.diusir) { E.data.diusir = true; E.selesaiCepat = true; }
    if (!E.data.a && E.umur > 1) {
      E.data.a = pemeran(E, ['teknisi']);
      if (E.data.a) { E.data.a.doingEvent = 'mengusir kucing'; E.data.a.goTo('server'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.ngomong) {
      E.data.ngomong = true;
      E.data.a.say('jangan di situ, panas');
      E.data.turunPada = E.umur + 3;
    }
    if (E.data.turunPada && E.umur > E.data.turunPada) E.selesaiCepat = true;
  },
  gambarProp() {
    const x = 388, y = 34;
    r(x, y, 9, 6, '#c9a06a');
    r(x - 1, y - 1, 4, 4, '#c9a06a');
    r(x + 8, y + 4, 1, 6, '#c9a06a');
  },
  sortY: 150,
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'kutu-lampu-neon',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 35,
  syarat: (S) => S.lampu > 0.7 && !MOD.hening,
  mulai(E) {
    E.data.cx = pilih(NEON_X); E.data.cy = 16;
    E.data.laron = [];
    for (let i = 0; i < 14; i++) E.data.laron.push(spawn('laron', E.data.cx, E.data.cy));
  },
  tick(E) {
    pada(E, 26, () => {
      for (const p of E.data.laron) { if (p.life > 0 && Math.random() < 0.5) p.g = 120; }
    });
    if (!E.data.sapu && E.umur > 30) {
      E.data.sapu = true;
      const a = pemeran(E);
      if (a) { E.data.a = a; a.bawa = 'sapu'; a.goToXY(E.data.cx, 150, 'up'); }
    }
  },
},

{
  id: 'nyamuk-sore',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 20,
  perluAktor: true,
  syarat: (S) => (S.jam > 16.5 && S.jam < 19) || sedangJalan('kutu-lampu-neon'),
  mulai(E) {
    E.data.a = pemeran(E);
    E.data.tepuk = 0;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (Math.random() < 0.05) spawn('dust', a.x + Math.sin(now / 300) * 12, a.y - 24);
    for (const t of [4, 9, 14, 19]) {
      pada(E, t, () => {
        E.data.tepuk++;
        a.pose = 'tepuk'; a.tandaTepukSampai = E.umur + 0.3;
        for (let i = 0; i < 4; i++) spawn('step', a.x, a.y - 20);
        if (E.data.tepuk >= 4) { a.say('kena!'); E.selesaiCepat = true; }
      });
    }
    if (a.tandaTepukSampai && E.umur > a.tandaTepukSampai) { a.pose = null; a.tandaTepukSampai = 0; }
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a || E.data.tepuk >= 4) return;
    const t = E.umur;
    const x = a.x + Math.sin(t * 2.4) * 8, y = a.y - 30 + Math.sin(t * 3.7) * 6;
    r(Math.round(x), Math.round(y), 1, 1, '#2c2620');
  },
  sortY: 340,
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
/* ==========================================================================
   META-CLAUDE — kelakar tentang sesi Claude Code itu sendiri
   ========================================================================== */

daftarEvent(

{
  id: 'bengong-menatap-layar',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 4,
  perluAktor: true,
  mulai(E) { E.data.a = pinjamAktor(E, 1, (o) => o.station === 'think')[0]; },
  tick(E) {
    pada(E, 2, () => { if (E.data.a) spawn('idea', E.data.a.x, E.data.a.y - 30); });
  },
  gambarAtas(E) {
    const a = E.data.a;
    if (a && Math.sin(now / 500) > 0) r(Math.round(a.x) + 4, Math.round(a.y) - 28, 1, 1, '#9fc3ff');
  },
},

{
  id: 'layar-server-idle-logo',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 16,
  syarat: (S) => !S.stasiunAktif.has('server'),
  tick(E, dt, S) { if (S.stasiunAktif.has('server')) E.selesaiCepat = true; },
  gambarProp(E) {
    const cx = 396, cy = 116;
    r(cx - 6, cy - 6, 12, 10, '#0c1a14');
    const ang = E.umur * 1.1;
    ctx.strokeStyle = P.amber; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a2 = ang + i * (Math.PI / 4);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a2) * 4, cy + Math.sin(a2) * 4);
    }
    ctx.stroke();
  },
  sortY: 130,
},

{
  id: 'berkas-rangkap-tiga',
  kelas: 'latar', bobot: B.sedang, cooldown: 1200, durasi: 16,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'edit');
    if (!E.data.a) return;
    E.data.a.bawa = 'map';
    E.data.a.goToXY(246, 214, 'down');
    E.data.tumpuk = [];
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.t1) {
      E.data.t1 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
      spawn('paper', a.x, a.y - 20);
      a.goToXY(54, 132, 'up');
    } else if (a.diam && E.data.t1 && !E.data.t2) {
      E.data.t2 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
      spawn('paper', a.x, a.y - 20);
      a.goToXY(286, 140, 'up');
    } else if (a.diam && E.data.t2 && !E.data.t3) {
      E.data.t3 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
    }
  },
  gambarProp(E) {
    for (const t of (E.data.tumpuk || [])) r(Math.round(t.x) - 3, Math.round(t.y), 6, 2, P.paper);
  },
  sortY: 210,
  selesai(E) { if (E.data.a) E.data.a.bawa = null; },
},

{
  id: 'cap-ulang-tiga-kali',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 10,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) { E.data.a = pemeranStasiun(E, 'edit'); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => hentakkanStempel(a));
    pada(E, 3, () => {
      for (let i = 0; i < 5; i++) spawn('lempar', a.x + 9, a.y - 14);
      E.data.sampahAda = true;
      RUANGAN.propLantai.push({ x: 344, y: 286, jenis: 'kertas-bekas' });
    });
    pada(E, 5, () => hentakkanStempel(a));
    pada(E, 7, () => { hentakkanStempel(a); for (let i = 0; i < 4; i++) spawn('lempar', a.x + 9, a.y - 14); });
    pada(E, 8, () => { a.pose = 'tepuk'; a.say('nah, lurus'); });
  },
  selesai(E) {
    if (E.data.a) E.data.a.pose = null;
    if (E.data.sampahAda) {
      const i = RUANGAN.propLantai.findIndex((p) => p.jenis === 'kertas-bekas');
      if (i >= 0) RUANGAN.propLantai.splice(i, 1);
    }
  },
},

{
  id: 'map-setebal-bantal',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 26,
  syarat: (S) => S.stasiunAktif.has('read'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'read');
    if (!E.data.a) return;
    E.data.a.bawa = 'kardus';
    E.data.a.laju = 0.5;
    E.data.a.say('ini semua dibaca?');
    E.data.a.goTo('think');
    E.data.tinggi = 5;
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.taruh) { E.data.taruh = true; a.bawa = null; }
    if (E.data.taruh && E.data.tinggi > 1) {
      E.data.sortirT = (E.data.sortirT || 0) + dt;
      if (E.data.sortirT > 2) { E.data.sortirT = 0; E.data.tinggi--; spawn('dust', 440, 210); spawn('dust', 444, 208); }
    }
  },
  gambarProp(E) {
    if (!E.data.taruh) return;
    const a = E.data.a;
    const x = Math.round(a.x), y = Math.round(a.y) - 14;
    for (let i = 0; i < E.data.tinggi; i++) r(x - 4, y - i * 3, 9, 3, i % 2 ? '#c9a03a' : '#d9b96a');
  },
  sortY: 349,
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

{
  id: 'nota-mentok-di-standby',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 20,
  syarat: (S) => S.orang.length >= 3 && S.orang.some((o) => o.standby),
  mulai(E, S) {
    const sb = S.orang.find((o) => o.standby && bisaDipinjam(o));
    if (!sb) { E.selesaiCepat = true; return; }
    const lain = pinjamAktor(E, 1, (o) => !o.standby);
    if (!lain.length) { E.selesaiCepat = true; return; }
    sb.eventKerja = E; sb.betahAsli = sb.betah; sb.betah = true; E.aktor.push(sb);
    E.data.b = sb;
    E.data.a = lain[0];
    E.data.a.goToXY(sb.x - 12, sb.y, 'right');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (a.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('paper', b.x, b.y - 24);
      E.data.diamPada = E.umur;
    }
    if (E.data.serah && !E.data.ambil && E.umur - E.data.diamPada > 5) {
      E.data.ambil = true;
      spawn('paper', b.x, b.y - 24);
      a.goTo('edit');
      a.say('paraf saya saja deh');
    }
    if (E.data.ambil && a.diam && !E.data.cap) {
      E.data.cap = true;
      spawn('ink', a.x + 9, a.y - 14);
    }
  },
},

{
  id: 'saling-tunggu-notulen',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 14,
  syarat: (S) => S.orang.filter((o) => o.station === 'rapat').length >= 2,
  tick(E, dt, S) {
    if (!E.data.pair) {
      const duduk = S.orang.filter((o) => o.station === 'rapat' && o.diam && !o.eventKerja);
      if (duduk.length < 2) return;
      const rank = (o) => JABATAN.findIndex((j) => j.id === o.peran);
      E.data.pair = duduk.slice(0, 2).sort((x, y) => rank(y) - rank(x));   // [0] = paling junior
      E.data.pair[0].say('notulennya siapa ya?');
    }
    const [junior] = E.data.pair;
    pada(E, 11, () => { junior.pose = 'angkat'; spawn('ink', junior.x, junior.y - 16); junior.say('tadi katanya Mas...'); });
  },
  selesai(E) { if (E.data.pair) for (const a of E.data.pair) a.pose = null; },
},

{
  id: 'serah-terima-map-antar-bidang',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('rapat'),
  perluAktor: true,
  mulai(E, S) {
    const penerima = S.orang.find((o) => o.station === 'rapat' && o.diam);
    if (!penerima) return;
    const lain = pinjamAktor(E, 1, (o) => o.station !== 'rapat');
    if (!lain.length) return;
    E.data.penerima = penerima;
    E.data.a = lain[0];
    E.data.a.bawa = 'map';
    E.data.a.goToXY(penerima.x - 14, penerima.y, 'right');
  },
  tick(E) {
    const { a, penerima } = E.data;
    if (!a || !penerima) return;
    if (a.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('idea', penerima.x, penerima.y - 24);
      spawn('idea', a.x, a.y - 24);
      a.bawa = null;
      a.say('tolong dilanjutkan');
    }
  },
  selesai(E) { if (E.data.a) E.data.a.bawa = null; },
},

{
  id: 'sesi-hilang-tanpa-pamit',
  kelas: 'latar', bobot: B.jarang, cooldown: 780, durasi: 22,
  syarat: (S) => S.orang.filter((o) => o.station === 'think' && o.diam).length >= 2,
  mulai(E, S) {
    const dipakai = new Set(S.orang.filter((o) => o.station === 'think' && o.diam).map((o) => o.slotIdx));
    let slot = -1;
    for (let i = 0; i < MEJA_KERJA_X.length; i++) { if (!dipakai.has(i)) { slot = i; break; } }
    if (slot < 0) { E.selesaiCepat = true; return; }
    E.data.slot = slot;
  },
  tick(E, dt, S) {
    if (E.data.slot == null) return;
    MOD.mejaHantu = E.data.slot;
    if (!E.data.a && E.umur > 3) {
      const dekat = pinjamAktor(E, 1, (o) => o.station === 'think');
      if (dekat.length) {
        E.data.a = dekat[0];
        E.data.a.doingEvent = 'menutup laptop yang ditinggal';
        E.data.a.goToXY(MEJA_KERJA_X[E.data.slot] + 21, 316, 'down');
      }
    }
    if (E.data.a && E.data.a.diam && !E.data.tutup) {
      E.data.tutup = true;
      E.data.a.say('ditinggal lagi');
      E.data.selesaiPada = E.umur + 2;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) E.selesaiCepat = true;
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'undangan-belum-bubar',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: () => peserta.some((p) => p.diam && p.station === 'rapat' && now - p.arrivedAt > 120000),
  mulai(E) {
    E.data.p = peserta.find((p) => p.diam && p.station === 'rapat' && now - p.arrivedAt > 120000);
    if (!E.data.p) { E.selesaiCepat = true; return; }
  },
  tick(E) {
    const p = E.data.p;
    if (!p || p.station !== 'rapat') { E.selesaiCepat = true; return; }
    if (Math.random() < 0.06) spawn('glyph', p.x, p.y - 26, '#8b8f86');
    if (!E.data.a && E.umur > 2) {
      const a = pinjamAktor(E, 1);
      if (a.length) { E.data.a = a[0]; E.data.a.goToXY(p.x, p.y - 20, 'down'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.tegur) {
      E.data.tegur = true;
      E.data.a.say('rapatnya sudah selesai, Mas');
      p.say('nunggu notulen dulu');
    }
  },
},

);
/* ==========================================================================
   PERAYAAN — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'hari-korpri',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 45,
  syarat: (S) => (new Date().getMonth() === 10 && S.tanggal === 29) || S.jam < 0,
  mulai(E, S) {
    E.data.asli = new Map();
    for (const a of S.orang) { E.data.asli.set(a, a.pal); a.pal = { ...a.pal, main: '#28406b', pattern: null }; }
    E.data.baris = S.orang.filter((o) => bisaDipinjam(o)).slice(0, 6);
    E.data.baris.forEach((a, i) => {
      a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
      a.goToXY(200 + i * 16, 234, 'up');
    });
  },
  tick(E) {
    pada(E, 6, () => { for (const a of E.data.baris) a.pose = 'hormat'; });
    pada(E, 16, () => {
      for (const a of E.data.baris) a.pose = null;
      if (E.data.baris[0]) E.data.baris[0].goToXY(300, 200, 'up');
    });
    pada(E, 24, () => {
      const s = E.data.baris[0];
      if (s) { spawn('talk', s.x, s.y - 24); s.say('panca prasetya'); }
    });
    pada(E, 34, () => { for (const a of E.data.baris) a.pose = 'tepuk'; });
  },
  selesai(E) {
    for (const [a, pal] of E.data.asli) a.pal = pal;
    for (const a of E.data.baris) a.pose = null;
  },
},

{
  id: 'hormat-bendera',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 9,
  syarat: (S) => S.tanggal === 17 || (new Date().getDay() === 1 && S.jam > 7.2 && S.jam < 7.9),
  mulai(E, S) {
    E.data.orang = S.orang.filter((o) => !o.adaTugas);
    for (const o of E.data.orang) {
      o.bekuSampai = now + 8000;
      hadapkan(o, 300, 16);
      o.pose = 'hormat';
    }
  },
  gambarAtas() { ctx.globalAlpha = 0.05; r(0, 0, W, H, '#ffd9a0'); ctx.globalAlpha = 1; },
  selesai(E) { for (const o of E.data.orang) o.pose = null; },
},

{
  id: 'foto-bersama-grup-wa',
  kelas: 'panggung', bobot: B.jarang, cooldown: 3600, durasi: 16,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 3,
  perluAktor: true,
  mulai(E, S) {
    E.data.orang = pinjamAktor(E, 6);
    E.data.orang.forEach((a, i) => a.goToXY(170 + i * 24, 246, 'down'));
  },
  tick(E) {
    pada(E, 6, () => { for (const a of E.data.orang) a.pose = 'silang'; });
  },
  gambarAtas(E) {
    if (E.umur > 7 && E.umur < 7.13) { ctx.globalAlpha = 0.55; r(0, 0, W, H, '#ffffff'); ctx.globalAlpha = 1; }
    else if (E.umur >= 7.13 && E.umur < 7.3) { ctx.globalAlpha = 0.2; r(0, 0, W, H, '#ffffff'); ctx.globalAlpha = 1; }
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'kembang-api-tahun-baru',
  kelas: 'latar', bobot: B.langka, cooldown: 8, durasi: 8,
  syarat: () => {
    const d = new Date();
    const bulan = d.getMonth(), tgl = d.getDate(), jamF = d.getHours() + d.getMinutes() / 60;
    return (bulan === 11 && tgl === 31 && jamF >= 23.5) || (bulan === 0 && tgl === 1 && jamF < 0.5);
  },
  mulai(E) { E.data.orang = pinjamAktor(E, 3); E.data.orang.forEach((a, i) => a.goToXY(200 + i * 20, 138, 'up')); },
  tick(E) {
    pada(E, 3, () => {
      for (let i = 0; i < 16; i++) spawn('confetti', JENDELA.x + JENDELA.w / 2, JENDELA.y + 20);
      for (const a of E.data.orang) spawn('talk', a.x, a.y - 24);
    });
    pada(E, 6.5, () => { for (let i = 0; i < 16; i++) spawn('confetti', JENDELA.x + JENDELA.w / 2, JENDELA.y + 20); });
  },
  selesai(E) { if (E.data.orang && E.data.orang[0]) E.data.orang[0].say('selamat tahun baru'); },
},

{
  id: 'penghargaan-zona-integritas',
  kelas: 'panggung', bobot: B.langka, cooldown: 5400, durasi: 35,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 4 && S.jam > 9 && S.jam < 15,
  mulai(E, S) {
    E.data.kadis = pemeran(E, ['kadis']);
    const calon = pinjamAktor(E, 4);
    E.data.penerima = calon[0];
    E.data.lain = calon.slice(1);
    if (E.data.kadis) E.data.kadis.goToXY(214, 232, 'up');
    if (E.data.penerima) E.data.penerima.goToXY(214, 250, 'down');
    E.data.lain.forEach((a, i) => a.goToXY(180 + i * 20, 220, 'down'));
  },
  tick(E) {
    pada(E, 10, () => {
      if (E.data.kadis && E.data.penerima) {
        for (let i = 0; i < 10; i++) spawn('idea', 214, 236, P.gold);
        E.data.kadis.say('selamat, ini hasil kerja satu tim');
      }
    });
    pada(E, 14, () => { for (const a of E.aktor) a.pose = 'tepuk'; });
    pada(E, 22, () => {
      RUANGAN.piagamDinding = true;
      for (const a of E.aktor) a.pose = null;
    });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'piala-voli-dipajang',
  kelas: 'latar', bobot: B.langka, cooldown: 7200, durasi: 16,
  syarat: () => !RUANGAN.piala,
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeran(E);
    if (!E.data.a) return;
    E.data.a.bawa = 'boks';
    E.data.a.goToXY(72, 138, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.taruh) {
      E.data.taruh = true;
      a.bawa = null;
      RUANGAN.piala = true;
      for (let i = 0; i < 3; i++) spawn('idea', 72, 130, '#e8d873');
      a.say('juara dua pun tetap juara');
    }
  },
},

{
  id: 'tumpeng-syukuran',
  kelas: 'panggung', bobot: B.langka, cooldown: 3000, durasi: 45,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 3 && S.jam > 9 && S.jam < 14
    && !S.orang.some((o) => o.station === 'rapat'),
  mulai(E) {
    E.data.orang = pinjamAktor(E, 5);
    E.data.orang.forEach((a) => a.goTo('rapat'));
    E.data.baris = 12;
  },
  tick(E, dt) {
    pada(E, 5, () => {
      const a = E.data.orang.find((o) => o.diam);
      if (a) { a.pose = 'angkat'; E.data.pemotong = a; }
    });
    pada(E, 7, () => {
      for (let i = 0; i < 4; i++) spawn('idea', 246, 190, P.amber);
      if (E.data.pemotong) E.data.pemotong.pose = null;
      E.data.potong = true;
    });
    if (E.data.potong && E.data.baris > 0) {
      E.data.susutT = (E.data.susutT || 0) + dt;
      if (E.data.susutT > 8) { E.data.susutT = 0; E.data.baris -= 3; }
    }
    if (Math.random() < 0.4 * dt) spawn('steam', 246, 178);
  },
  gambarProp(E) {
    const cx = 246, base = 200;
    const baris = Math.max(0, E.data.baris);
    for (let i = 0; i < baris; i++) {
      const w = 18 - i * 1.4;
      r(cx - w / 2, base - i * 3, w, 3, '#f2c14e');
      r(cx + w / 2 - 2, base - i * 3, 2, 3, sh('#f2c14e', 0.72));
    }
    if (E.data.potong && baris > 0) r(cx - 1, base - baris * 3 - 2, 2, 2, '#c22b2b');
    r(cx - 8, base + 1, 16, 2, '#3e6b4f');
  },
  sortY: 200,
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

);
/* ==========================================================================
   EASTER EGG — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'bolpoin-jatuh-ke-kolong',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 6,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
    a.pose = 'jongkok';
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 4, () => { a.say('lho, di kuping'); a.pulpenDiTelinga = true; spawn('idea', a.x, a.y - 24); });
    pada(E, 4.5, () => { a.pose = null; });
  },
  gambarLantai(E) {
    const a = E.data.a;
    if (!a || E.umur > 4) return;
    r(Math.round(a.x) - 6, Math.round(a.y) - 2, 1, 2, '#1c4e8a');
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'huruf-spanduk-lepas',
  kelas: 'latar', bobot: B.jarang, cooldown: 3000, durasi: 4,
  syarat: () => !RUANGAN.spanduk,
  mulai() {
    const teks = 'MELAYANI SEPENUH HATI';
    let idx = new Date().getHours() % teks.length;
    while (teks[idx] === ' ') idx = (idx + 1) % teks.length;
    RUANGAN.spanduk = { hilang: idx, tempel: -1 };
    spawn('paper', 24 + idx * 4.2, 22, '#f0ede2');
  },
},

{
  id: 'kursi-kepala-dicoba-magang',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 9,
  syarat: (S) => !S.orang.some((o) => o.station === 'rapat') && S.orang.some((o) => o.peran === 'magang' && bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang']);
    if (!a) return;
    E.data.a = a;
    a.goTo('rapat');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.duduk) { E.data.duduk = true; spawn('idea', a.x, a.y - 26, P.amber); a.say('sebentar saja'); }
    if (E.umur > 8 && E.umur < 8.6) MOD.pintuKadis = true;
    pada(E, 8.3, () => { a.say('eh permisi'); a.laju = 1.8; a.goTo('think'); });
  },
  selesai(E) { if (E.data.a) E.data.a.laju = 1; },
},

{
  id: 'lupa-mau-ngapain',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 4,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a; E.data.balikX = a.x; E.data.balikY = a.y;
    a.goToXY(a.x + (a.face === 'left' ? -8 : 8), a.y, a.face);
    E.data.tahap = 1;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && E.data.tahap === 1) {
      E.data.tahap = 2;
      a.say('tadi mau apa ya');
      spawn('talk', a.x, a.y - 24);
    }
    pada(E, 1.5, () => { if (E.data.tahap === 2) { a.goToXY(E.data.balikX, E.data.balikY, null); E.data.tahap = 3; } });
  },
},

{
  id: 'magang-salah-sebut-jabatan',
  kelas: 'latar', bobot: B.jarang, cooldown: 840, durasi: 9,
  syarat: (S) => S.orang.some((o) => o.peran === 'magang') && S.orang.some((o) => ['kadis', 'sekdis', 'kabid'].includes(o.peran)),
  mulai(E, S) {
    const magang = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    const pejabat = S.orang.find((o) => ['kadis', 'sekdis', 'kabid'].includes(o.peran) && bisaDipinjam(o));
    if (!magang || !pejabat) { E.selesaiCepat = true; return; }
    magang.eventKerja = E; magang.betahAsli = magang.betah; magang.betah = true; E.aktor.push(magang);
    pejabat.eventKerja = E; pejabat.betahAsli = pejabat.betah; pejabat.betah = true; E.aktor.push(pejabat);
    E.data.magang = magang; E.data.pejabat = pejabat;
    const lain = JABATAN.filter((j) => j.id !== pejabat.peran && ['kadis', 'sekdis', 'kabid', 'kasi'].includes(j.id));
    const salah = pilih(lain.length ? lain : JABATAN);
    magang.say('pagi Pak ' + salah.singkat);
    E.data.tanya = true;
  },
  tick(E) {
    const { magang, pejabat } = E.data;
    if (!magang || !pejabat) return;
    pada(E, 3.5, () => { magang.say('...eh, Pak ' + jabatanDari(pejabat.peran).singkat + ', maaf'); });
    pada(E, 4, () => { pejabat.mulut = true; });
    pada(E, 5, () => { pejabat.mulut = false; });
  },
  gambarAtas(E) {
    if (!E.data.tanya || E.umur > 3.5) return;
    const p = E.data.pejabat;
    r(Math.round(p.x) + 3, Math.round(p.y) - 34, 3, 5, '#ffb454');
  },
},

{
  id: 'monitor-crt-bergaris',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 25,
  tick(E, dt, S) {
    MOD.crtAktif = true;
    if (!E.data.ditepuk && E.umur > 4) {
      const dekat = S.orang.find((o) => o.path.length && Math.abs(o.x - 160) < 40 && o.y < 170);
      if (dekat && Math.random() < 0.02) {
        E.data.ditepuk = true;
        E.data.tenangSampai = E.umur + 20;
        spawn('dust', 168, 48); spawn('dust', 170, 46);
      }
    }
    if (E.data.tenangSampai && E.umur < E.data.tenangSampai) MOD.crtAktif = false;
  },
},

{
  id: 'stapler-kosong-njepret',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 10,
  syarat: (S) => S.stasiunAktif.has('edit') || S.stasiunAktif.has('web'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'edit') || pemeranStasiun(E, 'web');
    if (E.data.a) E.data.a.say('isinya habis');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1.5, () => { a.doingEvent = 'ambil isi stapler'; a.goTo('read'); });
    if (E.umur > 1.5 && a.diam && a.station === 'read' && !E.data.balik) {
      E.data.balik = true;
      spawn('dust', a.x, a.y - 20);
      a.goTo('web');
    }
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'ubin-retak-kesandung',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 1,
  syarat: (S) => S.orang.some((o) => o.path.length && !o.miring),
  mulai(E, S) {
    const calon = S.orang.filter((o) => o.path.length && !o.miring);
    if (!calon.length) { E.selesaiCepat = true; return; }
    const a = pilih(calon);
    E.data.a = a;
    a.miring = true;
    for (let i = 0; i < 4; i++) spawn('dust', a.x, a.y);
    if (Math.random() < 0.3) a.say('aduh');
    menoleh(S.orang.filter((o) => o !== a && jarakKe(o, a.x, a.y) < 40), a.x, a.y, 800);
  },
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'cctv-menyapu-ruangan',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 18,
  tick(E, dt, S) {
    const frac = (E.umur % 9) / 9;
    const t = frac < 0.5 ? frac * 2 : (1 - frac) * 2;
    E.data.sapuX = 466 - t * 400;
    if (!E.data.melambai) {
      const kena = S.orang.find((o) => !o.adaTugas && o.y > 100 && Math.abs(o.x - E.data.sapuX) < 26);
      if (kena) {
        E.data.melambai = kena;
        kena.pose = 'salam';
        kena.say('Halo, Pak Kadis, kalau lagi lihat');
        E.data.lambaiSampai = E.umur + 1.2;
      }
    }
    if (E.data.melambai && E.data.lambaiSampai && E.umur > E.data.lambaiSampai) { E.data.melambai.pose = null; E.data.melambai = null; }
  },
  gambarLantai(E) {
    const x = E.data.sapuX == null ? 466 : E.data.sapuX;
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.moveTo(466, 18);
    ctx.lineTo(x - 30, 356); ctx.lineTo(x + 30, 356);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  selesai(E) { if (E.data.melambai) E.data.melambai.pose = null; },
},

{
  id: 'cicak-jatuh',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 13,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E) { E.data.x = 110; E.data.y = 62; E.data.jeda = 0.8; },
  tick(E, dt) {
    const D = E.data;
    if (!D.jatuh) {
      D.jeda -= dt;
      if (D.jeda <= 0) { D.x += 20; D.jeda = 0.8; }
      if (D.x >= 270) D.jatuh = true;
    } else {
      D.vy = (D.vy || 0) + 240 * dt;
      D.y += D.vy * dt;
      if (D.y >= 112) {
        D.y = 112;
        if (!D.mendarat) {
          D.mendarat = true;
          const a = pemeranStasiun(E, 'edit');
          if (a) { E.data.a = a; a.miring = true; a.say('aduh!'); E.data.selesaiPada = E.umur + 3; }
        }
      }
      D.x -= 12 * dt;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada && E.data.a) { E.data.a.miring = false; E.data.a = null; }
  },
  gambarDinding(E) {
    if (E.data.jatuh) return;
    const x = Math.round(E.data.x);
    r(x, 62, 4, 2, '#8a8070'); r(x + 4, 61, 2, 2, '#8a8070');
  },
  gambarProp(E) {
    if (!E.data.jatuh) return;
    r(Math.round(E.data.x), Math.round(E.data.y), 4, 2, '#8a8070');
  },
  sortY: 120,
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'gerhana-sebagian',
  kelas: 'panggung', bobot: B.langka, cooldown: 10800, durasi: 80,
  syarat: (S) => S.jam > 10 && S.jam < 14 && S.luar > 0.7 && CUACA.hujan < 0.1,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    E.data.orang.forEach((a, i) => a.goToXY(200 + i * 14, 138, 'up'));
  },
  tick(E) {
    const jarak = Math.abs(E.umur - 40);
    const inten = Math.max(0, 1 - jarak / 34);
    MOD.luar = 1 - inten * 0.55;
    MOD.ambPlus = inten * 0.16;
    MOD.lampuMin = inten > 0.3 ? 0.6 : 0;
    pada(E, 8, () => { for (const a of E.data.orang) a.bawa = 'hp'; });
  },
  gambarAtas(E) {
    const A = ambien();
    if (A.luar < 0.06) return;
    const tJ = (A.jam - 5.7) / 12.6;
    if (tJ < 0 || tJ > 1) return;
    const mx = JENDELA.x + 5 + (JENDELA.w - 10) * tJ;
    const my = JENDELA.y + JENDELA.h - 13 - Math.sin(tJ * Math.PI) * (JENDELA.h - 20);
    const tutup = Math.min(0.7, Math.max(0, 1 - Math.abs(E.umur - 40) / 34) * 0.7);
    if (tutup <= 0.02) return;
    klipJendela(() => r(Math.round(mx - 1 - tutup * 3), Math.round(my - 1), Math.max(1, Math.round(tutup * 3)), 3, A.atas));
  },
  selesai(E) { for (const a of E.data.orang) a.bawa = null; },
},

{
  id: 'map-tertukar-ditukar-balik',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 4,
  perluAktor: true,
  syarat: (S) => !S.orang.some((o) => o.station === 'rapat'),
  mulai(E) {
    const dua = pinjamAktor(E, 2);
    if (dua.length < 2) return;
    E.data.a = dua[0]; E.data.b = dua[1];
    E.data.a.goToXY(240, 254, 'right');
    E.data.b.goToXY(252, 254, 'left');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (a.diam && b.diam && !E.data.tukar) {
      E.data.tukar = true;
      spawn('talk', 246, 250);
    }
  },
},

{
  id: 'salah-duduk-kursi-kadis',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 9,
  syarat: (S) => S.orang.some((o) => o.peran === 'kadis') && S.orang.some((o) => o.station === 'rapat' && o.slotIdx === 0 && o.peran !== 'kadis'),
  mulai(E, S) {
    const salah = S.orang.find((o) => o.station === 'rapat' && o.slotIdx === 0 && o.peran !== 'kadis');
    if (!salah) { E.selesaiCepat = true; return; }
    salah.eventKerja = E; salah.betahAsli = salah.betah; salah.betah = true; E.aktor.push(salah);
    E.data.salah = salah;
    const sebelah = pinjamAktor(E, 1, (o) => o.station === 'rapat' && o.slotIdx === 1);
    E.data.sebelah = sebelah[0];
  },
  tick(E) {
    const { salah, sebelah } = E.data;
    if (!salah) return;
    pada(E, 3, () => { if (sebelah) sebelah.say('itu kursi Pak Kadis'); });
    pada(E, 4, () => {
      salah.say('eh, maaf');
      const baru = slotBebas('rapat', salah);
      if (baru >= 0) { salah.slotIdx = baru; salah.goTo('rapat'); }
      else salah.goTo('think');
    });
  },
  gambarAtas(E) {
    if (E.umur < 3 || E.umur > 4 || !E.data.sebelah) return;
    const s = E.data.sebelah;
    r(Math.round(s.x) + 3, Math.round(s.y) - 34, 2, 5, '#e8d873');
  },
},

{
  id: 'salah-ketik-nama-kadis',
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 12,
  lanjutan: [{ id: 'numpang-print', peluang: 1 }],
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'web') || pemeran(E);
    if (!E.data.a) return;
    E.data.a.bawa = 'kertas';
    E.data.a.goTo('think');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.baca) {
      E.data.baca = true;
      a.say('astaga, nama Pak Kadis kurang satu huruf');
      a.laju = 1.5;
      a.goToXY(352, 288, 'down');
    }
    if (E.data.baca && a.diam && a.x > 340 && !E.data.buang) {
      E.data.buang = true;
      for (let i = 0; i < 4; i++) spawn('paper', 352, 288);
      a.bawa = null;
      a.laju = 1;
      a.goTo('web');
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

);
/* ==========================================================================
   SUASANA — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'daun-tanaman-jatuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 3,
  mulai() {
    spawn('dust', 32, 270);
    if (RUANGAN.propLantai.filter((p) => p.jenis === 'daun').length < 2) {
      RUANGAN.propLantai.push({ x: 30 + Math.random() * 10, y: 278 + Math.random() * 6, jenis: 'daun' });
    }
  },
},

{
  id: 'debu-menari-di-berkas',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 6,
  syarat: () => ambien().sinarA > 0.09,
  tick(E, dt, S) {
    if (Math.random() < dt) spawn('dust', 164 + Math.random() * 100, 120 + Math.random() * 60);
    if (!E.data.melintas) {
      const lewat = S.orang.find((o) => o.path.length && o.x > 164 && o.x < 266 && o.y > 100 && o.y < 200 && o.laju === 1);
      if (lewat) {
        E.data.melintas = lewat;
        for (let i = 0; i < 6; i++) spawn('dust', lewat.x, lewat.y);
        lewat.laju = 0.8;
        E.data.lajuSampai = E.umur + 1;
      }
    }
    if (E.data.lajuSampai && E.umur > E.data.lajuSampai && E.data.melintas) {
      E.data.melintas.laju = 1;
      E.data.melintas = null;
    }
  },
  selesai(E) { if (E.data.melintas) E.data.melintas.laju = 1; },
},

{
  id: 'kursi-digeser-berdecit',
  kelas: 'latar', bobot: B.sering, cooldown: 6, durasi: 2,
  syarat: (S) => Date.now() - RUANGAN.kursiBerderit > 20000 && S.orang.some((o) => o.station === 'rapat'),
  mulai(E, S) {
    const idx = (Math.random() * KURSI_N) | 0;
    RUANGAN.kursiBerderit = Date.now();
    RUANGAN.geserKursi[idx] = 3;
    const kx = RAPAT.cx + slotKe(idx);
    spawn('dust', kx - 6, 186); spawn('dust', kx + 6, 186);
    const dengar = S.orang.find((o) => o.station === 'rapat' && o.diam);
    if (dengar) menoleh([dengar], kx, 186, 1000);
  },
},

{
  id: 'laptop-ditutup-pelan',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 6,
  syarat: (S) => S.jam > 16 && S.orang.some((o) => o.station === 'think' && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && o.diam && bisaDipinjam(o));
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a; E.data.slot = a.slotIdx;
  },
  tick(E) {
    if (E.data.slot == null) return;
    if (E.umur > 1) MOD.mejaPadam = E.data.slot;
    pada(E, 2, () => { if (E.data.a) { lepaskanAktor(E.data.a); E.data.a = null; } });
  },
},

{
  id: 'merenung-depan-kipas',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 12,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => now - Math.max(o.lastEvent, o.arrivedAt) > 12000)[0];
    if (!a) return;
    E.data.a = a;
    a.goToXY(400, 272, 'up');
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.diam) { E.data.diam = true; a.bekuSampai = now + 10000; a.pose = 'diam'; }
    if (E.data.diam) {
      for (const o of S.orang) {
        if (o !== a && o.path.length && jarakKe(o, a.x, a.y) < 40 && !o.eventKerja) {
          hadapkan(o, a.x, a.y);
          o.busyUntil = Math.max(o.busyUntil, now + 1200);
        }
      }
    }
    pada(E, 11, () => { if (a) { a.busyUntil = now + 3000; a.state = 'work'; } });
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'tetes-terakhir-ember',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 8,
  syarat: () => CUACA.hujan < 0.05,
  tick(E) {
    if (E.umur < 3) MOD.drip = 1.2;
    else if (E.umur < 6) MOD.drip = 2.5;
    else MOD.drip = 6;
    pada(E, 6.2, () => {
      E.data.a = pemeran(E);
      if (E.data.a) E.data.a.goToXY(347, 130, 'up');
    });
    pada(E, 7.5, () => { if (E.data.a) E.data.a.say('sudah, tenang'); });
  },
},

{
  id: 'berkas-pagi-berdebu',
  kelas: 'latar', bobot: B.sering, cooldown: 3600, durasi: 55,
  syarat: (S) => S.jam > 6.5 && S.jam < 8.5 && S.luar > 0.4,
  tick(E, dt, S) {
    MOD.sinar = 1.5;
    if (Math.random() < 2 * dt) spawn('dust', 190 + Math.random() * 60, 120 + Math.random() * 60);
    if (!E.data.a && E.umur > 3) {
      const lewat = S.orang.find((o) => o.path.length && o.x > 190 && o.x < 250 && o.y > 150 && o.y < 200);
      if (lewat) { E.data.a = lewat; lewat.bekuSampai = now + 5000; lewat.pose = 'usap'; E.data.lepasPada = E.umur + 5; }
    }
    if (E.data.lepasPada && E.umur > E.data.lepasPada && E.data.a) { E.data.a.pose = null; E.data.a = null; }
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'hujan-pertama-bau-tanah',
  kelas: 'latar', bobot: B.langka, cooldown: 3600, durasi: 35,
  syarat: () => CUACA.hujan > 0.5 && Date.now() - CUACA.hujanTinggiSejak > 1200000,
  mulai(E) {
    E.data.a = pemeran(E);
    if (E.data.a) E.data.a.goTo('web');
  },
  tick(E, dt, S) {
    if (Math.random() < 6 * dt) spawn('dust', JENDELA.x + JENDELA.w - 6, JENDELA.y + 4, '#c8b48a');
    const a = E.data.a;
    if (a && a.diam && !E.data.buka) {
      E.data.buka = true;
      a.say('wangi tanah');
      a.pose = 'angkat';
      a.bekuSampai = now + 8000;
      for (const o of S.orang) { if (o !== a && o.path.length) o.laju = 0.7; }
      E.data.lajuSampai = E.umur + 5;
    }
    if (E.data.lajuSampai && E.umur > E.data.lajuSampai && !E.data.direset) {
      E.data.direset = true;
      for (const o of S.orang) { if (o.laju === 0.7) o.laju = 1; }
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'jeda-maghrib',
  kelas: 'latar', bobot: B.sering, cooldown: 82800, durasi: 8,
  syarat: (S) => S.jam >= 18 && S.jam < 18.33 && S.orang.length >= 1,
  mulai(E, S) {
    E.data.orang = S.orang.filter((o) => !o.adaTugas);
    for (const o of E.data.orang) o.bekuSampai = now + 8000;
    const a = E.data.orang.find((o) => !o.path.length);
    if (a) hadapkan(a, 212, 40);
  },
  tick() { MOD.ambPlus = 0.04; },
},

{
  id: 'lembur-sampai-malam',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 120,
  syarat: (S) => S.jam > 20 || S.jam < 4,
  mulai() { minDiLayarTimpa = 0; },
  tick() {
    MOD.neonMati[0] = 1;
    MOD.ambPlus = 0.05;
  },
  gambarProp(E, S) {
    for (const o of S.orang) {
      if (o.station === 'think' && o.diam) glow(o.x + 21, o.y - 10, 26, '#9fc3ff', 0.22);
    }
  },
  sortY: 349,
  selesai() { minDiLayarTimpa = null; },
},

{
  id: 'matahari-silau-monitor',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 45,
  syarat: (S) => S.jam > 15.5 && S.jam < 17 && S.luar > 0.6 && S.stasiunAktif.has('server'),
  perluAktor: true,
  mulai(E) { E.data.a = pemeranStasiun(E, 'server'); },
  tick(E, dt) {
    if (!E.data.a) return;
    pada(E, 2, () => { E.data.a.say('silau, ndan'); E.data.a.goTo('web'); });
    if (E.umur > 2 && E.umur < 10) RUANGAN.gordenKanan = Math.min(16, RUANGAN.gordenKanan + 5 * dt);
    pada(E, 10, () => { if (E.data.a) E.data.a.goTo('server'); });
  },
  gambarProp(E) {
    if (E.umur > 10) return;
    ctx.globalAlpha = 0.5 * Math.max(0, 1 - E.umur / 10);
    r(384, 108, 10, 14, '#ffffff');
    ctx.globalAlpha = 1;
  },
  sortY: 130,
},

{
  id: 'pelangi-selepas-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 50,
  syarat: (S) => CUACA.hujan < 0.1 && S.jam > 15 && S.jam < 17.5 && Math.random() < 0.25,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    E.data.orang.forEach((a, i) => a.goToXY(198 + i * 16, 138, 'up'));
    if (E.data.orang[0]) E.data.orang[0].say('eh, ada pelangi');
  },
  gambarAtas(E) {
    const fade = E.umur < 3 ? E.umur / 3 : (E.umur > 44 ? Math.max(0, 1 - (E.umur - 44) / 6) : 1);
    if (fade <= 0.01) return;
    klipJendela(() => {
      const warna = ['#c22b2b', '#e07a2c', '#e8c93a', '#3e6b4f', '#3565b0', '#4b2f8a', '#7a3f9c'];
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45 * fade;
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = warna[i];
        ctx.beginPath();
        ctx.arc(JENDELA.x + JENDELA.w / 2, JENDELA.y + JENDELA.h + 30, 46 - i, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'ramadan-siang-sunyi',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 140,
  syarat: (S) => {
    const h = taksirHijri(new Date());
    return h.bulan === 9 && S.jam >= 6 && S.jam < 17.75;
  },
  tick() {
    MOD.ambPlus = 0.03;
    MOD.lajuGlobal = 0.8;
    RUANGAN.gordenKanan = Math.max(RUANGAN.gordenKanan, 12);
  },
  gambarProp() {
    r(326, 266, 18, 34, '#c9c3b0');
    r(326, 266, 18, 1, '#e2ddc8');
    for (let i = 0; i < 3; i++) r(328 + i * 5, 270, 1, 26, '#b0a98e');
  },
  sortY: 300,
},

{
  id: 'silau-sore-gorden',
  kelas: 'latar', bobot: B.sedang, cooldown: 3600, durasi: 60,
  syarat: (S) => S.jam > 16.5 && S.jam < 17.8 && S.luar > 0.5 && RUANGAN.gordenKanan <= 6,
  perluAktor: true,
  mulai(E, S) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think' && o.slotIdx === 0)[0] || pinjamAktor(E, 1)[0];
    E.data.a = a;
    if (a) a.pose = 'usap';
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 2, () => { a.pose = null; a.goTo('web'); });
    if (E.umur > 2 && E.umur < 4) RUANGAN.gordenKanan = Math.min(16, RUANGAN.gordenKanan + 5 * dt);
    pada(E, 4, () => { if (a) a.say('silau, ditutup ya'); });
    pada(E, 6, () => { if (a) a.goTo('think'); });
  },
  gambarProp(E) {
    if (E.umur > 6) return;
    ctx.globalAlpha = 0.16 * Math.max(0, 1 - E.umur / 6);
    ctx.beginPath();
    ctx.moveTo(186, 196); ctx.lineTo(238, 196); ctx.lineTo(300, 200); ctx.lineTo(150, 200);
    ctx.closePath(); ctx.fillStyle = '#ffd88a'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  sortY: 113,
},

);
/* ==========================================================================
   CUACA & WAKTU — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'kilat-menyambar',
  kelas: 'latar', bobot: B.jarang, cooldown: 40, durasi: 3,
  syarat: () => CUACA.petir,
  mulai(E, S) {
    for (const o of S.orang) { if (!o.eventKerja) o.bekuSampai = now + 800; }
    for (let i = 0; i < 6; i++) spawn('dust', 60 + Math.random() * 360, 3);
    const a = pilih(S.orang);
    if (a && Math.random() < 0.5) a.say('waduh');
  },
  tick(E) {
    if (E.umur > 0.9 && E.umur < 1.9) MOD.getar = 1.4 * Math.max(0, 1 - (E.umur - 0.9));
  },
},

{
  id: 'gelombang-panas-siang',
  kelas: 'latar', bobot: B.sering, cooldown: 900, durasi: 120,
  syarat: (S) => S.jam > 11 && S.jam < 14 && S.luar > 0.9 && CUACA.hujan < 0.05,
  mulai(E) {
    E.data.kipas = pinjamAktor(E, 2, (o) => o.station === 'think');
    for (const a of E.data.kipas) a.pose = 'mengipas';
  },
  tick(E, dt) {
    MOD.ambPlus = 0.05;
    MOD.kipas = 1.7;
    if (Math.random() < 0.15 * dt) spawn('splash', 330, 274, '#bcd9ee');
    if (!E.data.idle && E.umur > 5) {
      const a = pinjamAktor(E, 1, (o) => o.station !== 'think')[0];
      if (a) { E.data.idle = a; a.goTo('idle'); }
    }
  },
  selesai(E) { for (const a of E.data.kipas) a.pose = null; },
},

{
  id: 'kabut-asap',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 130,
  syarat: (S) => S.jam >= 6 && S.jam < 10 && CUACA.hujan < 0.05,
  mulai(E) {
    E.data.masker = pinjamAktor(E, 2);
    for (const a of E.data.masker) a.masker = true;
  },
  tick() {
    MOD.luar = 0.5;
    MOD.ambPlus = 0.08;
    MOD.kipas = 0;
  },
  selesai(E) { for (const a of E.data.masker) a.masker = false; },
},

{
  id: 'kabut-embun-jendela',
  kelas: 'latar', bobot: B.sedang, cooldown: 2400, durasi: 120,
  syarat: (S) => (S.jam > 5.4 && S.jam < 7.2) || (Date.now() - CUACA.hujanTinggiSejak < 180000 && CUACA.hujan < 0.1),
  tick(E) {
    MOD.kacaBuram = Math.min(1, 0.3 + 0.5 * Math.sin(E.umur / 8));
    if (!E.data.a && E.umur > 6) {
      const a = pemeranStasiun(E, 'web') || pemeran(E);
      if (a) { E.data.a = a; a.goTo('web'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.usap) {
      E.data.usap = true;
      E.data.a.pose = 'lap';
      E.data.a.say('cerah juga hari ini');
      E.data.lapSampai = E.umur + 3;
    }
    if (E.data.lapSampai && E.umur > E.data.lapSampai) MOD.kacaBuram = 0.15;
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'panas-terik-siang',
  kelas: 'latar', bobot: B.sering, cooldown: 480, durasi: 80,
  syarat: (S) => S.jam > 11 && S.jam < 14.5 && !sedangJalan('gelombang-panas-siang') && !sedangJalan('kabut-asap'),
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2, (o) => o.station === 'think');
    for (const a of E.data.orang) a.pose = 'mengipas';
  },
  tick(E, dt) {
    MOD.ambPlus = 0.06;
    MOD.kipas = 1.5;
    if (Math.random() < 0.1 * dt) spawn('splash', 330, 270, '#bcd9ee');
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'senyap-magrib',
  kelas: 'latar', bobot: B.sedang, cooldown: 82800, durasi: 12,
  syarat: (S) => S.jam >= 17.9 && S.jam < 18.02,
  tick(E) {
    MOD.ambPlus = 0.04 * Math.min(1, E.umur / 3);
    MOD.hening = true;
    MOD.lajuGlobal = 0.7;
  },
  gambarAtas(E) {
    for (const rTime of [0, 1.2, 2.4]) {
      const t = E.umur - rTime;
      if (t < 0 || t > 3) continue;
      const rad = 8 + (t / 3) * 62;
      ctx.globalAlpha = 0.25 * (1 - t / 3);
      ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(JENDELA.x + JENDELA.w / 2, JENDELA.y + JENDELA.h / 2, rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
},

);
/* ==========================================================================
   KULTUR KANTOR — lanjutan gelombang 2
   (lap-kacamata-di-ujung-baju SENGAJA dilewati: butuh atribut kacamata baru
   di JABATAN yang belum ada di mana pun, kerumitannya tidak sepadan untuk
   satu event K2 kecil)
   ========================================================================== */

daftarEvent(

{
  id: 'hape-getar-di-meja-kosong',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 8,
  syarat: (S) => S.orang.length >= 4 && S.bekerja.some((o) => o.station !== 'think' && o.station !== 'rapat' && !o.eventKerja),
  mulai(E, S) {
    const slot = slotBebas('think', null);
    if (slot < 0) { E.selesaiCepat = true; return; }
    const a = S.bekerja.find((o) => o.station !== 'think' && o.station !== 'rapat' && !o.eventKerja);
    if (!a) { E.selesaiCepat = true; return; }
    E.data.slot = slot;
    E.data.a = a;
  },
  tick(E) {
    if (E.data.slot == null) return;
    if (E.umur > 1.5 && !E.data.dijemput) {
      E.data.dijemput = true;
      const a = E.data.a;
      a.doingEvent = 'ambil HP di meja';
      a.goToXY(MEJA_KERJA_X[E.data.slot] + 21, 316, 'down');
    }
    if (E.data.dijemput && E.data.a.diam && !E.data.selesai) {
      E.data.selesai = true;
      E.data.selesaiPada = E.umur + 1;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) E.selesaiCepat = true;
  },
  gambarProp(E) {
    if (E.data.slot == null || E.umur > 2.5) return;
    const x = MEJA_KERJA_X[E.data.slot];
    const getar = Math.round(Math.sin(now / 30) * 1);
    r(x + 6 + getar, 310, 3, 5, '#20242c');
    r(x + 7 + getar, 311, 1, 2, '#7aa5e8');
  },
  sortY: 349,
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'jumat-bersih',
  kelas: 'panggung', bobot: B.jarang, cooldown: 5400, durasi: 50,
  syarat: (S) => (new Date().getDay() === 5 && S.jam >= 14 && S.jam < 15.5) || Math.random() < 0.02,
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2);
    if (E.data.orang[0]) E.data.orang[0].goTo('edit');
    if (E.data.orang[1]) E.data.orang[1].goTo('search');
  },
  tick(E, dt) {
    for (const a of E.data.orang) {
      if (a.diam) { a.pose = 'lap'; if (Math.random() < 6 * dt) spawn('dust', a.x, a.y - 10); }
    }
    pada(E, 40, () => {
      RUANGAN.nodaMeja = [];
      if (RUANGAN.edaran.length) RUANGAN.edaran.pop();
      RUANGAN.tongPenuh = 0;
    });
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'kertas-bekas-dibalik',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 3,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station !== 'rapat')[0];
    if (!a) return;
    E.data.a = a;
    a.bawa = 'kertas';
    a.bawaSampai = now + 12000;
    spawn('paper', 232, 96);
  },
},

{
  id: 'keset-baru-dipasang',
  kelas: 'latar', bobot: B.jarang, cooldown: 999999, durasi: 8,
  syarat: () => !RUANGAN.kesetAda,
  mulai() {
    RUANGAN.kesetAda = true;
    for (let i = 0; i < 3; i++) spawn('dust', 456 + i * 3, 112, '#8a6a4a');
  },
},

{
  id: 'regang-badan-di-kursi',
  kelas: 'latar', bobot: B.sering, cooldown: 40, durasi: 2.5,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
    a.pose = 'angkat';
  },
  tick(E) {
    pada(E, 1.5, () => { if (E.data.a) { E.data.a.pose = null; hadapkan(E.data.a, E.data.a.x, 40); } });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'selip-pulpen-di-telinga',
  kelas: 'latar', bobot: B.jarang, cooldown: 300, durasi: 2.5,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) {
    const a = pemeranStasiun(E, 'edit');
    if (!a) return;
    a.pulpenDiTelinga = true;
    E.data.a = a;
  },
},

{
  id: 'analis-beda-bahasa',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 18,
  syarat: (S) => S.orang.some((o) => o.peran === 'analis_kebijakan') && S.orang.some((o) => o.peran === 'analis_sistem'),
  mulai(E, S) {
    const a = S.orang.find((o) => o.peran === 'analis_kebijakan' && bisaDipinjam(o));
    const b = S.orang.find((o) => o.peran === 'analis_sistem' && bisaDipinjam(o));
    if (!a || !b) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    b.eventKerja = E; b.betahAsli = b.betah; b.betah = true; E.aktor.push(b);
    E.data.a = a; E.data.b = b;
    a.goToXY(122, 138, 'up'); b.goToXY(142, 138, 'up');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (Math.random() < 0.06) spawn('paper', a.x, a.y - 24);
    if (Math.random() < 0.06) spawn('data', b.x, b.y - 24);
    pada(E, 15, () => {
      a.say('kebijakan: maksudnya keluaran layanan');
      const slot = slotBebas('rapat', a);
      if (slot >= 0) { a.slotIdx = slot; a.goTo('rapat'); }
      const slot2 = slotBebas('rapat', b);
      if (slot2 >= 0) { b.slotIdx = slot2; b.goTo('rapat'); }
    });
  },
},

{
  id: 'antre-stempel-berdua',
  kelas: 'latar', bobot: B.sedang, cooldown: 60, durasi: 15,
  syarat: (S) => S.orang.some((o) => o.station === 'edit' && o.slotIdx > 0 && o.diam),
  tick(E, dt, S) {
    const antre = S.orang.filter((o) => o.station === 'edit' && o.slotIdx > 0 && o.diam);
    if (!antre.length) { E.selesaiCepat = true; return; }
    if (Math.random() < 1.5 * dt) { const a = pilih(antre); spawn('step', a.x, a.y); }
  },
},

{
  id: 'arsiparis-bimbing-magang',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 18,
  syarat: (S) => S.orang.some((o) => o.peran === 'arsiparis') && S.orang.some((o) => o.peran === 'magang') && !S.stasiunAktif.has('read'),
  mulai(E, S) {
    const ar = S.orang.find((o) => o.peran === 'arsiparis' && bisaDipinjam(o));
    const mg = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    if (!ar || !mg) { E.selesaiCepat = true; return; }
    ar.eventKerja = E; ar.betahAsli = ar.betah; ar.betah = true; E.aktor.push(ar);
    mg.eventKerja = E; mg.betahAsli = mg.betah; mg.betah = true; E.aktor.push(mg);
    E.data.ar = ar; E.data.mg = mg;
    ar.goToXY(54, 138, 'up'); mg.goToXY(73, 138, 'up');
    RUANGAN.laciTerbuka = 1;
  },
  tick(E, dt) {
    if (Math.random() < 0.4 * dt) spawn('dust', 130, 76);
    pada(E, 15, () => { if (E.data.ar) E.data.ar.say('kode klasifikasi dulu, baru tahun'); });
  },
  selesai() { RUANGAN.laciTerbuka = -1; },
},

{
  id: 'bersandar-ayun-kursi',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 4,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.miring = E.umur < 3.6;
    if (E.umur > 3.6 && !E.data.sentak) { E.data.sentak = true; menoleh([a], a.x - 8, a.y, 500); }
  },
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'dus-arsip-ditumpuk',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 28,
  syarat: () => RUANGAN.dusTambahanArsip < 2,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    E.data.a = a;
    a.bawa = 'boks';
    a.laju = 0.6;
    a.goToXY(452, 300, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && a.x > 440 && !E.data.angkat) {
      E.data.angkat = true;
      a.goToXY(440, 240, 'up');
    } else if (E.data.angkat && a.diam && Math.abs(a.x - 440) < 4 && Math.abs(a.y - 240) < 4 && !E.data.taruh) {
      E.data.taruh = true;
      RUANGAN.dusTambahanArsip = Math.min(2, RUANGAN.dusTambahanArsip + 1);
      RUANGAN.arsipPenuh = true;
      a.bawa = null;
      a.pose = 'usap';
      E.data.selesaiPada = E.umur + 2;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) { a.pose = null; a.laju = 1; }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; E.data.a.pose = null; } },
},

{
  id: 'edar-amplop-patungan',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 26,
  syarat: (S) => S.orang.length >= 3,
  perluAktor: true,
  mulai(E, S) {
    const urutan = pinjamAktor(E, Math.min(4, S.orang.length));
    if (urutan.length < 2) return;
    E.data.urutan = urutan;
    E.data.i = 0;
    urutan[0].bawa = 'amplop-coklat';
    urutan[0].goToXY(urutan[1].x - 12, urutan[1].y, null);
  },
  tick(E) {
    const U = E.data.urutan;
    if (!U || U.length < 2) return;
    const bawa = U[E.data.i];
    if (bawa.diam && !E.data.tunggu) {
      E.data.tunggu = true;
      E.data.tungguSampai = E.umur + 2.5;
      spawn('paper', bawa.x, bawa.y - 20);
    }
    if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      bawa.bawa = null;
      E.data.i++;
      if (E.data.i >= U.length) {
        const stempel = U[U.length - 1];
        stempel.bawa = 'amplop-coklat';
        stempel.goTo('edit');
        E.data.selesai = true;
      } else {
        U[E.data.i].bawa = 'amplop-coklat';
        const target = U[E.data.i + 1] || null;
        if (target) U[E.data.i].goToXY(target.x - 12, target.y, null);
      }
    }
  },
  selesai(E) { if (E.data.urutan) for (const a of E.data.urutan) a.bawa = null; },
},

{
  id: 'galon-habis-diganti',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 24,
  syarat: () => RUANGAN.gelasDispenser <= 3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    E.data.a = a;
    a.goTo('idle');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.tekan) {
      E.data.tekan = true;
      a.bawa = 'gelas';
      a.say('Angkat sama-sama, jangan pinggangnya');
      a.goToXY(440, 220, 'up');
    }
    if (E.data.tekan && a.diam && a.x > 430 && !E.data.angkat) {
      E.data.angkat = true;
      a.bawa = 'jerigen';
      a.laju = 0.6;
      a.goTo('idle');
    }
    if (E.data.angkat && a.diam && a.x < 340 && !E.data.pasang) {
      E.data.pasang = true;
      a.bawa = null;
      a.laju = 1;
      RUANGAN.gelasDispenser = 6;
      for (let i = 0; i < 4; i++) spawn('splash', 330, 250, '#b8dcf4');
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

{
  id: 'gantian-jaga-loket',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 12,
  syarat: (S) => S.orang.some((o) => o.station === 'idle' && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const lama = S.orang.find((o) => o.station === 'idle' && o.diam);
    if (!lama) return;
    lama.eventKerja = E; lama.betahAsli = lama.betah; lama.betah = true; E.aktor.push(lama);
    E.data.lama = lama;
    const baru = pinjamAktor(E, 1, (o) => o.station !== 'idle');
    E.data.baru = baru[0];
    if (E.data.baru) E.data.baru.goToXY(lama.x + 14, lama.y, 'left');
  },
  tick(E) {
    const { lama, baru } = E.data;
    if (!lama) return;
    if (!baru) { pada(E, 2, () => { lama.say('itu jam berapa ya'); }); return; }
    if (baru.diam && !E.data.tukar) {
      E.data.tukar = true;
      spawn('paper', lama.x, lama.y - 20);
      lama.goTo('think');
      baru.goTo('idle');
    }
  },
},

{
  id: 'humas-latihan-sambutan',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 20,
  syarat: (S) => S.orang.some((o) => o.peran === 'humas') && S.orang.length < 6,
  mulai(E, S) {
    const a = S.orang.find((o) => o.peran === 'humas' && bisaDipinjam(o));
    if (!a) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a;
    a.goToXY(30, 220, 'down');
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && Math.random() < 0.3 * dt) spawn('talk', a.x, a.y - 26);
    pada(E, 15, () => { a.say('yang terhormat, Bapak/Ibu...'); });
    if (!E.data.penonton && E.umur > 8) {
      const p = pinjamAktor(E, 1, (o) => o !== a);
      if (p.length) { E.data.penonton = p[0]; E.data.penonton.goToXY(a.x, a.y + 20, 'up'); }
    }
    if (E.data.penonton && E.data.penonton.diam && !E.data.tepuk) {
      E.data.tepuk = true;
      E.data.penonton.pose = 'tepuk';
      E.data.penonton.say('lanjut, bagus itu');
    }
  },
  selesai(E) { if (E.data.penonton) E.data.penonton.pose = null; },
},

{
  id: 'istirahat-sholat-dzuhur',
  kelas: 'latar', bobot: B.sering, cooldown: 10800, durasi: 45,
  syarat: (S) => (S.jam > 12 && S.jam < 12.5) || (S.jam > 15.25 && S.jam < 15.75),
  mulai(E, S) {
    const a = S.orang.find((o) => bisaDipinjam(o));
    if (a) a.say('Duluan ya, titip meja');
  },
  tick(E) {
    MOD.hening = Math.sin(E.umur * 0.3) > 0.3;
    if (!E.data.kopi && E.umur > 5) {
      const a = pinjamAktor(E, 1, (o) => o.station !== 'idle');
      if (a.length) { E.data.kopi = a[0]; E.data.kopi.goTo('idle'); }
    }
  },
},

{
  id: 'kabar-cuaca-di-grup',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  syarat: () => CUACA.hujan > 0.4 || sedangJalan('kilat-menyambar'),
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    for (const a of E.data.orang) { a.bawa = 'hp'; a.bekuSampai = now + 24000; }
  },
  tick(E) {
    if (Math.random() < 0.05) { const a = pilih(E.data.orang); if (a) spawn('ping', a.x, a.y - 22); }
    pada(E, 20, () => { for (const a of E.data.orang) { a.bawa = null; a.bekuSampai = 0; } });
  },
  selesai(E) { for (const a of E.data.orang) { a.bawa = null; a.bekuSampai = 0; } },
},

{
  id: 'kabid-kasi-adu-argumen',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 15,
  syarat: (S) => S.orang.some((o) => o.peran === 'kabid') && S.orang.some((o) => o.peran === 'kasi'),
  mulai(E, S) {
    const kabid = S.orang.find((o) => o.peran === 'kabid' && bisaDipinjam(o));
    const kasi = S.orang.find((o) => o.peran === 'kasi' && bisaDipinjam(o));
    if (!kabid || !kasi) { E.selesaiCepat = true; return; }
    kabid.eventKerja = E; kabid.betahAsli = kabid.betah; kabid.betah = true; E.aktor.push(kabid);
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    E.data.kabid = kabid; E.data.kasi = kasi;
    kabid.goToXY(226, 210, 'down'); kasi.goToXY(266, 210, 'down');
  },
  tick(E) {
    const { kabid, kasi } = E.data;
    if (!kabid || !kasi) return;
    pada(E, 2, () => { kabid.say('itu bukan kewenangan kita'); });
    pada(E, 5, () => { kasi.say('di juknis boleh, Pak'); });
    pada(E, 8, () => { kabid.pose = 'nunjuk'; });
    pada(E, 10, () => { kabid.pose = null; kasi.laju = 1.3; kasi.goTo('read'); });
    pada(E, 14, () => { kasi.laju = 1; kasi.goTo('rapat'); });
  },
  selesai(E) {
    if (E.data.kabid) E.data.kabid.pose = null;
    if (E.data.kasi) E.data.kasi.laju = 1;
  },
},

{
  id: 'kasi-inspeksi-meja-staf',
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 19,
  syarat: (S) => S.orang.some((o) => o.peran === 'kasi') && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const kasi = S.orang.find((o) => o.peran === 'kasi' && bisaDipinjam(o));
    if (!kasi) { E.selesaiCepat = true; return; }
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    E.data.kasi = kasi; E.data.i = 0;
    kasi.goToXY(MEJA_KERJA_X[0] + 5, 316, 'down');
  },
  tick(E) {
    const kasi = E.data.kasi;
    if (!kasi) return;
    if (kasi.diam && !E.data.tunggu) {
      E.data.tunggu = true;
      E.data.tungguSampai = E.umur + 4;
      spawn('scan', kasi.x, kasi.y - 20);
    }
    if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      E.data.i++;
      if (E.data.i < MEJA_KERJA_X.length) kasi.goToXY(MEJA_KERJA_X[E.data.i] + 5, 316, 'down');
      else if (!E.data.selesai) { E.data.selesai = true; kasi.say('lanjut, lanjut'); }
    }
  },
},

{
  id: 'kasi-panggil-magang-fotokopi',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 14,
  syarat: (S) => S.orang.some((o) => ['kasi', 'kabid'].includes(o.peran)) && S.orang.some((o) => o.peran === 'magang'),
  mulai(E, S) {
    const kasi = S.orang.find((o) => ['kasi', 'kabid'].includes(o.peran) && bisaDipinjam(o));
    const mg = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    if (!kasi || !mg) { E.selesaiCepat = true; return; }
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    mg.eventKerja = E; mg.betahAsli = mg.betah; mg.betah = true; E.aktor.push(mg);
    E.data.kasi = kasi; E.data.mg = mg;
    kasi.say('tolong gandakan 15 rangkap');
    mg.goToXY(kasi.x - 10, kasi.y, 'right');
  },
  tick(E) {
    const { kasi, mg } = E.data;
    if (!kasi || !mg) return;
    if (mg.diam && !E.data.terima) {
      E.data.terima = true;
      mg.say('siap');
      mg.bawa = 'kertas';
      mg.goTo('web');
    }
    if (E.data.terima && mg.diam && mg.station === 'web' && !E.data.ping) {
      E.data.ping = true;
      E.data.pingSampai = E.umur + 5;
    }
    if (E.data.ping && E.umur > E.data.pingSampai && !E.data.balik) {
      E.data.balik = true;
      mg.bawa = 'kertas';
      mg.goToXY(kasi.x, kasi.y, null);
    }
    if (E.data.balik && mg.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('paper', kasi.x, kasi.y - 20);
      mg.bawa = null;
    }
  },
  selesai(E) { if (E.data.mg) E.data.mg.bawa = null; },
},

{
  id: 'kerja-bakti-berkas',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 35,
  syarat: (S) => (RUANGAN.mapDisposisi >= 2 || RUANGAN.tumpukanFiling >= 2) && S.nganggur.length >= 3,
  perluAktor: true,
  mulai(E) {
    const tiga = pinjamAktor(E, 3);
    if (tiga.length < 2) return;
    E.data.orang = tiga;
    tiga.forEach((a, i) => a.goToXY(40 + i * 30, LANE_UP, 'up'));
  },
  tick(E, dt) {
    const O = E.data.orang;
    if (!O || O.length < 2) return;
    if (!O.every((a) => a.diam)) return;
    E.data.opT = (E.data.opT || 0) + dt;
    const jeda = O.length >= 3 ? 1.5 : 2.5;
    if (E.data.opT > jeda) {
      E.data.opT = 0;
      spawn('paper', O[0].x, O[0].y - 20);
      E.data.putaran = (E.data.putaran || 0) + 1;
      if (E.data.putaran % 3 === 0) {
        if (RUANGAN.mapDisposisi > 0) RUANGAN.mapDisposisi--;
        else if (RUANGAN.tumpukanFiling > 0) RUANGAN.tumpukanFiling--;
        for (let i = 0; i < 4; i++) spawn('dust', O[0].x, O[0].y);
      }
    }
  },
},

{
  id: 'kipas-direbut-arah',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 18,
  syarat: (S) => S.jam > 11 && S.jam < 15 && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && bisaDipinjam(o));
    if (!a) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a;
    a.goToXY(400, 280, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.putar) {
      E.data.putar = true;
      RUANGAN.kipasArah = a.x < 400 ? -1 : 1;
      a.goTo('think');
    }
    if (!E.data.b && E.umur > 8) {
      const b = pinjamAktor(E, 1, (o) => o.station === 'think' && o !== a);
      if (b.length) { E.data.b = b[0]; E.data.b.goToXY(400, 280, 'up'); }
    }
    if (E.data.b && E.data.b.diam && !E.data.putar2) {
      E.data.putar2 = true;
      RUANGAN.kipasArah *= -1;
      spawn('talk', E.data.b.x, E.data.b.y - 24);
      E.data.b.say('Gantian ya, panas nih');
      E.data.b.goTo('think');
    }
  },
},

{
  id: 'kopi-pagi-dispenser',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 20,
  syarat: (S) => S.jam > 7 && S.jam < 9.5 && S.nganggur.length >= 2,
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2);
    if (E.data.orang.length < 2) return;
    E.data.orang[0].goToXY(320, 280, 'right');
    E.data.orang[1].goToXY(340, 280, 'left');
  },
  tick(E, dt) {
    const O = E.data.orang;
    if (!O || O.length < 2) return;
    if (O.every((a) => a.diam)) {
      if (Math.random() < 0.3 * dt) { const a = pilih(O); spawn('talk', a.x, a.y - 24); }
      if (Math.random() < 0.15 * dt) { const a = pilih(O); spawn('steam', a.x + 4, a.y - 20); }
    }
  },
},

{
  id: 'kunci-lemari-hilang',
  kelas: 'latar', bobot: B.jarang, cooldown: 1080, durasi: 30,
  syarat: (S) => !S.stasiunAktif.has('read'),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    E.data.a = a;
    a.say('Kuncinya di siapa?');
    a.goToXY(54, 138, 'up');
    E.data.titik = [[176, 306], [286, 140], [54, 138]];
    E.data.i = -1;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && E.umur > 3) {
      if (!E.data.tunggu) { E.data.tunggu = true; E.data.tungguSampai = E.umur + 3; }
      else if (E.umur > E.data.tungguSampai) {
        E.data.tunggu = false;
        E.data.i++;
        if (E.data.i < E.data.titik.length) {
          const [tx, ty] = E.data.titik[E.data.i];
          a.goToXY(tx, ty, null);
          if (E.data.i === E.data.titik.length - 1) a.say('Ketemu!');
        }
      }
    }
    if (a.adaTugas) a.busyUntil = Math.max(a.busyUntil, now + 2000);
  },
},

{
  id: 'kupu-kupu-tanda-tamu',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 30,
  syarat: (S) => S.jam > 8 && S.jam < 15,
  mulai(E) { E.data.x = JENDELA.x; E.data.y = JENDELA.y + 20; E.data.tahap = 0; E.data.t = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.tahap === 0) { D.x += 14 * dt; D.y += Math.sin(D.t * 4) * 3; if (D.x > 300) { D.tahap = 1; D.t = 0; } }
    else if (D.tahap === 1) { D.x = 300; D.y = 16; if (D.t > 5) { D.tahap = 2; D.t = 0; } }
    else if (D.tahap === 2) { D.x = 44; D.y = 258; if (D.t > 5) { D.tahap = 3; D.t = 0; } }
    else { D.x -= 20 * dt; }
    if (!D.dibilang && D.t > 0.3 && D.tahap >= 1) {
      D.dibilang = true;
      const a = pemeran(E);
      if (a) a.say('wah, ada kupu-kupu — bakal ada tamu');
    }
  },
  gambarAtas(E) {
    const x = Math.round(E.data.x), y = Math.round(E.data.y);
    r(x, y, 4, 3, '#c9a03a');
    r(x + 1, y - 1, 2, 1, Math.sin(now / 90) > 0 ? '#e8c05a' : '#c9a03a');
  },
},

{
  id: 'luruskan-kursi-rapat',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 4,
  syarat: (S) => S.orang.length <= 2 && RUANGAN.geserKursi.some((v) => v),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang', 'arsiparis', 'teknisi', 'statistisi']);
    if (!a) return;
    E.data.a = a;
    a.goToXY(RAPAT.cx, 178, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.rapikan) {
      E.data.rapikan = true;
      for (let i = 0; i < RUANGAN.geserKursi.length; i++) {
        if (RUANGAN.geserKursi[i]) spawn('dust', RAPAT.cx + slotKe(i), 186);
      }
      RUANGAN.geserKursi = [];
    }
  },
},

{
  id: 'papasan-di-lorong-minggir',
  kelas: 'latar', bobot: B.sering, cooldown: 3, durasi: 2,
  mulai(E, S) {
    const jalan = S.orang.filter((o) => o.path.length && !o.eventKerja);
    let pasang = null;
    for (let i = 0; i < jalan.length && !pasang; i++) {
      for (let j = i + 1; j < jalan.length; j++) {
        const a = jalan[i], b = jalan[j];
        if (Math.abs(a.y - b.y) < 6 && jarakKe(a, b.x, b.y) < 14 && a.x !== b.x) { pasang = [a, b]; break; }
      }
    }
    if (!pasang) { E.selesaiCepat = true; return; }
    const [a, b] = pasang;
    const rankA = JABATAN.findIndex((j) => j.id === a.peran), rankB = JABATAN.findIndex((j) => j.id === b.peran);
    const minggir = rankA > rankB ? a : b;
    minggir.bekuSampai = now + 400;
    E.data.minggir = minggir;
  },
  selesai(E) { if (E.data.minggir) E.data.minggir.bekuSampai = 0; },
},

{
  id: 'pinjam-charger-keliling',
  kelas: 'latar', bobot: B.sering, cooldown: 420, durasi: 18,
  syarat: (S) => S.orang.length >= 3 && S.orang.filter((o) => o.station === 'think').length >= 1,
  perluAktor: true,
  mulai(E, S) {
    const a = pinjamAktor(E, 1, (o) => o.station !== 'think')[0];
    if (!a) return;
    E.data.a = a;
    E.data.meja = S.orang.filter((o) => o.station === 'think');
    E.data.tahap = 0;
    const target = E.data.meja[0];
    if (target) a.goToXY(target.x + 10, target.y, 'left'); else E.selesaiCepat = true;
  },
  tick(E) {
    const a = E.data.a;
    const meja = E.data.meja;
    if (!a || !meja || !meja.length) return;
    if (a.diam && !E.data.tunggu) { E.data.tunggu = true; E.data.tungguSampai = E.umur + 2; }
    else if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      E.data.tahap++;
      if (E.data.tahap < meja.length) {
        a.goToXY(meja[E.data.tahap].x + 10, meja[E.data.tahap].y, 'left');
        if (E.data.tahap === meja.length - 1) a.say('colokannya nganggur nggak?');
      } else if (!E.data.selesai) {
        E.data.selesai = true;
        a.doingEvent = 'numpang colokan';
      }
    }
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'pranata-madya-bimbing-pranata-pertama',
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 17,
  syarat: (S) => S.orang.some((o) => ['pranata_madya', 'analis_sistem'].includes(o.peran) && o.station === 'think')
    && S.orang.some((o) => ['pranata_pertama', 'pranata_muda', 'magang'].includes(o.peran) && o.station === 'think'),
  mulai(E, S) {
    const senior = S.orang.find((o) => ['pranata_madya', 'analis_sistem'].includes(o.peran) && o.station === 'think' && bisaDipinjam(o));
    const junior = S.orang.find((o) => ['pranata_pertama', 'pranata_muda', 'magang'].includes(o.peran) && o.station === 'think' && o !== senior && bisaDipinjam(o));
    if (!senior || !junior) { E.selesaiCepat = true; return; }
    senior.eventKerja = E; senior.betahAsli = senior.betah; senior.betah = true; E.aktor.push(senior);
    E.data.senior = senior; E.data.junior = junior;
    E.data.magang = junior.peran === 'magang';
    senior.goToXY(junior.x - 10, junior.y + 6, 'up');
  },
  tick(E) {
    const { senior, junior } = E.data;
    if (!senior || !junior) return;
    if (senior.diam) senior.pose = 'nunjuk';
    const t = E.data.magang ? 14 : 10;
    pada(E, t, () => { spawn('idea', junior.x, junior.y - 26, P.amber); });
    pada(E, t + 1, () => { senior.pose = null; senior.say('coba dari sini dulu'); });
  },
  selesai(E) { if (E.data.senior) E.data.senior.pose = null; },
},

{
  id: 'tamu-merokok-ditegur-rambu',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 14,
  syarat: (S) => S.orang.some((o) => o.station === 'idle' && o.diam),
  mulai(E, S) {
    const t = S.orang.find((o) => o.station === 'idle' && o.diam);
    if (!t) { E.selesaiCepat = true; return; }
    E.data.tamuX = t.x; E.data.tamuY = t.y;
  },
  tick(E) {
    if (Math.random() < 0.3) spawn('asap', E.data.tamuX, E.data.tamuY - 30);
    if (!E.data.a && E.umur > 3) {
      const a = pemeran(E);
      if (a) { E.data.a = a; a.goToXY(E.data.tamuX + 12, E.data.tamuY, 'left'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.tegur) {
      E.data.tegur = true;
      E.data.a.pose = 'nunjuk';
      E.data.a.say('maaf, di luar ya pak');
      E.data.rambuSampai = E.umur + 2;
    }
  },
  gambarAtas(E) {
    if (E.data.rambuSampai && E.umur < E.data.rambuSampai && Math.sin(now / 90) > 0) r(428, 42, 4, 4, '#ffffff');
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
