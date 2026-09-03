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

