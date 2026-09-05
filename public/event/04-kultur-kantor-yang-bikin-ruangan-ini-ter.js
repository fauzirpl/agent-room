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
    a.goToXY(470, 256, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    if (Math.random() < 0.3) spawn('steam', a.x + 6, a.y - 18);
    pada(E, 4, () => { a.bawa = 'gelas'; a.bawaSampai = now + 60000; });
    pada(E, 6, () => { spawn('paper', 439, 268, '#8a6844'); });   // sachet ke tong
    pada(E, 8, () => { a.pose = null; RUANGAN.gelasDispenser = Math.max(0, RUANGAN.gelasDispenser - 1); });
  },
},

{
  id: 'kopi-jam-sepuluh',
  babak: { kerja: 1.5, istirahat: .5, apel: 0 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'panggung', bobot: B.sering, cooldown: 180, durasi: 25,
  perluAktor: true,
  syarat: (S) => (S.jam >= 9.6 && S.jam < 10.4) || (S.jam >= 14.5 && S.jam < 15),
  mulai(E) {
    // Tiga orang tidak muat di pojok dispenser (cuma 18px, x462..480) --
    // berkerumun di lantai pantry yang lebih lega, pola sama seperti
    // ngerumpi-di-pantry (x428+i*14).
    pinjamAktor(E, 3).forEach((a, i) => {
      a.doingEvent = 'ngopi bareng';
      a.goToXY(424 + i * 14, 278, 'up');
    });
  },
  tick(E) {
    const siap = E.aktor.filter((a) => a.diam);
    if (siap.length >= 2) {
      if (Math.random() < 0.09) spawn('steam', 438, 268);
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
  id: 'ngerumpi-di-pantry',
  babak: { istirahat: 2.5, apel: 0, lembur: .5, malam: .3 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'latar', bobot: B.sedang, cooldown: 260, durasi: 20,
  perluAktor: true,
  syarat: (S) => S.orang.filter(bisaDipinjam).length >= 2,
  mulai(E) {
    const dipinjam = pinjamAktor(E, 3);
    if (dipinjam.length < 2) { E.selesaiCepat = true; return; }
    // Ruangan pantry sekarang di x414..478 (drawPantry, room.js), meja
    // makan kecilnya di tx=442. Orangnya berkumpul di depan meja itu,
    // menghadap 'up' -- sama seperti gorengan-di-meja-rapat menghadap
    // meja rapat, bukan menghadap kamera.
    dipinjam.forEach((a, i) => {
      a.doingEvent = 'ngerumpi di pantry';
      a.goToXY(428 + i * 14, 272, 'up');
    });
  },
  tick(E) {
    const siap = E.aktor.filter((a) => a.diam);
    if (siap.length >= 2) {
      const giliran = Math.floor(E.umur / 1.1) % siap.length;
      if (Math.floor(E.umur / 1.1) !== E.data.g) {
        E.data.g = Math.floor(E.umur / 1.1);
        spawn('talk', siap[giliran].x, siap[giliran].y - 26);
      }
    }
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('psst, katanya ada rotasi bulan depan'); });
    pada(E, 13, () => { const a = E.aktor[1] || E.aktor[0]; if (a) a.say('jangan bilang siapa-siapa, ya'); });
  },
},

{
  id: 'gelas-kertas-dispenser-habis',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 3,
  syarat: (S) => RUANGAN.gelasDispenser <= 1 && S.orang.length >= 5,
  mulai(E) {
    const a = pemeranDekat(E, 466, 256, 220);
    if (a) { a.doingEvent = 'mengintip baki gelas'; a.goToXY(466, 256, 'up'); }
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
    pada(E, 2.2, () => { a.pose = null; a.bawa = null; a.bawaSampai = 0; hadapkan(a, 466, 256); });
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
    pada(E, 5, () => a.goToXY(439, 270, 'up'));       // buang gelas ke tong
    pada(E, 8, () => { a.bawa = null; a.bawaSampai = 0; });
  },
},

{
  id: 'gorengan-di-meja-rapat',
  babak: { istirahat: 2, apel: 0, lembur: .5, malam: .2 },   // pengali bobot per babak hari kerja (S.babak)
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
  babak: { istirahat: 2.5, apel: 0 },   // pengali bobot per babak hari kerja (S.babak)
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
  babak: { istirahat: 2.5, pulang: 1.5 },   // pengali bobot per babak hari kerja (S.babak)
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
    if (a) { a.doingEvent = 'mengganti kantong sampah'; a.goToXY(439, 280, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    if (a.diam && !E.data.ikat) pada(E, 6, () => { E.data.ikat = true; a.pose = 'jongkok'; a.say('sudah bau ini'); });
    pada(E, 10, () => { a.pose = null; a.bawa = 'kardus'; a.goToXY(452, 300, 'right'); });
    pada(E, 18, () => { RUANGAN.tongPenuh = 0; a.alpha = 0; });
    pada(E, 22, () => { a.alpha = 1; a.goToXY(439, 280, 'up'); });
    pada(E, 28, () => { a.bawa = null; });
  },
  gambarAtas(E) {
    if (RUANGAN.tongPenuh < 0.5) return;
    // dua lalat berputar pelan di atas tong; ini yang bikin orang memutar
    for (let i = 0; i < 2; i++) {
      const t = now / 420 + i * 3.1;
      r(437 + Math.cos(t) * 5, 270 + Math.sin(t * 1.3) * 3, 1, 1, '#2c3440');
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
      // -Ke: yang mengedarkan undangan berdiri di sebelah mejanya
      menolehKe([t], a.x, a.y, 1600);
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
  babak: { pulang: 2, lembur: 2, kerja: .7 },   // pengali bobot per babak hari kerja (S.babak)
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

