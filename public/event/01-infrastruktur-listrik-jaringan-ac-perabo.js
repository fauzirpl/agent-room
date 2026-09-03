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
    if (a) { a.doingEvent = 'menyiram tanaman'; a.goToXY(466, 256, 'up'); }
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

