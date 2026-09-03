#!/usr/bin/env node
// uji-katalog.mjs :: papan skor katalog event acak — event-acak.json (rancangan
// hasil rapat desain, 373 id) vs yang benar-benar terdaftar lewat
// daftarEvent() di public/event-acak.js.
//
// Angka "sudah jadi kode" selama ini ditulis tangan di README/DESIGN/
// EVENT-ACAK.md dan saling bertentangan (102, 250+, 268, ...). Skrip ini yang
// jadi sumber angkanya: dijalankan CI tiap push, hasilnya dicetak, TIDAK
// menggagalkan apa pun (papan skor, bukan gerbang) — kecuali dengan --gerbang,
// yang gagal kalau ada id terdaftar yang tidak ada di katalog (event yang
// ditambah tanpa masuk rancangan, atau salah ketik id).
//
// Id terdaftar dibaca dari EVENT_ACAK di sandbox uji-event.mjs (event-acak.js
// benar-benar dijalankan, jadi id kembar yang dilewati daftarEvent() ikut
// terbuang persis seperti di peramban), lalu disilangkan dengan regex
// `  id: '...'` sebagai pemeriksaan bahwa keduanya sepakat.
//
// Pakai:
//   node uji-katalog.mjs             papan skor, exit 0
//   node uji-katalog.mjs --gerbang   exit 1 kalau ada id terdaftar di luar katalog
//   node uji-katalog.mjs --json      keluaran JSON (untuk skrip lain)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muatKonteks, bacaEventAcak, merah, hijau, kuning, abu, tebal } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KATALOG = path.join(__dirname, 'event-acak.json');

export function audit() {
  const katalog = JSON.parse(fs.readFileSync(KATALOG, 'utf8'));
  const events = katalog.events || [];
  const diKatalog = new Map(events.map((e) => [e.id, e]));

  const ctx = muatKonteks();
  const terdaftar = ctx.__jembatan__.EVENT_ACAK.map((d) => d.id);
  const setTerdaftar = new Set(terdaftar);

  // silang: regex di sumber vs registri sungguhan
  const src = bacaEventAcak();
  const regexId = [...src.matchAll(/^\s{2}id: '([^']+)'/gm)].map((m) => m[1]);
  const kembar = regexId.filter((id, i) => regexId.indexOf(id) !== i);
  const regexTanpaRegistri = regexId.filter((id) => !setTerdaftar.has(id));
  const registriTanpaRegex = terdaftar.filter((id) => !regexId.includes(id));

  const jadi = events.filter((e) => setTerdaftar.has(e.id));
  const belum = events.filter((e) => !setTerdaftar.has(e.id));
  const luarKatalog = terdaftar.filter((id) => !diKatalog.has(id));

  const perKategori = {};
  for (const e of events) {
    const k = e.kategori || '(tanpa kategori)';
    const p = perKategori[k] || (perKategori[k] = { katalog: 0, jadi: 0, belum: [] });
    p.katalog++;
    if (setTerdaftar.has(e.id)) p.jadi++;
    else p.belum.push({ id: e.id, vonis: e.vonis || '-', kerumitan: e.kerumitan_nyata ?? e.kerumitan ?? '-' });
  }
  const belumPerVonis = {};
  for (const e of belum) { const v = e.vonis || '-'; belumPerVonis[v] = (belumPerVonis[v] || 0) + 1; }

  return {
    katalog: events.length,
    terdaftar: terdaftar.length,
    terimplementasi: jadi.length,
    belum: belum.length,
    belumPerVonis,
    luarKatalog,
    perKategori,
    silang: { regex: regexId.length, kembar, regexTanpaRegistri, registriTanpaRegex },
  };
}

function cetak(h) {
  const persen = h.katalog ? Math.round((h.terimplementasi / h.katalog) * 100) : 0;
  console.log(tebal('Papan skor katalog event acak') + abu('  (event-acak.json vs daftarEvent di public/event/*.js)'));
  console.log();
  console.log(`  katalog rancangan   : ${tebal(h.katalog)}`);
  console.log(`  terdaftar di kode   : ${tebal(h.terdaftar)}` + abu(`  (regex id: ${h.silang.regex})`));
  console.log(`  terimplementasi     : ${hijau(h.terimplementasi)} dari ${h.katalog} (${persen}%)`);
  console.log(`  belum               : ${kuning(h.belum)}` + abu('  ' + Object.entries(h.belumPerVonis)
    .sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', ')));
  console.log(`  terdaftar di luar katalog: ${h.luarKatalog.length ? merah(h.luarKatalog.length) : hijau(0)}`);
  for (const id of h.luarKatalog) console.log(merah(`    ! ${id}`));
  console.log();
  console.log(tebal('  Per kategori') + abu('   katalog  jadi  belum'));
  const nama = Object.keys(h.perKategori).sort();
  for (const k of nama) {
    const p = h.perKategori[k];
    console.log(`  ${k.padEnd(18)}${String(p.katalog).padStart(7)}${String(p.jadi).padStart(6)}${String(p.belum.length).padStart(7)}`);
  }
  console.log();
  console.log(tebal('  Belum jadi kode, per kategori') + abu('   (id · vonis · kerumitan)'));
  for (const k of nama) {
    const p = h.perKategori[k];
    if (!p.belum.length) continue;
    console.log(`  ${k} (${p.belum.length})`);
    for (const b of p.belum) console.log(abu(`    ${b.id.padEnd(40)} ${String(b.vonis).padEnd(8)} ${b.kerumitan}`));
  }
  if (h.silang.kembar.length) {
    console.log();
    console.log(kuning(`  id kembar di sumber (yang kedua dilewati daftarEvent): ${h.silang.kembar.join(', ')}`));
  }
  if (h.silang.regexTanpaRegistri.length || h.silang.registriTanpaRegex.length) {
    console.log();
    console.log(kuning('  regex `  id: \'...\'` dan registri tidak sepakat:'));
    for (const id of h.silang.regexTanpaRegistri) console.log(kuning(`    di sumber, tidak di registri: ${id}`));
    for (const id of h.silang.registriTanpaRegex) console.log(kuning(`    di registri, tidak kena regex: ${id}`));
  }
}

function main() {
  const argv = process.argv.slice(2);
  const h = audit();
  if (argv.includes('--json')) {
    console.log(JSON.stringify(h, null, 2));
  } else {
    cetak(h);
  }
  if (argv.includes('--gerbang') && h.luarKatalog.length) {
    console.log();
    console.log(merah(`GERBANG: ${h.luarKatalog.length} id terdaftar tidak ada di event-acak.json.`));
    process.exit(1);
  }
}

main();
