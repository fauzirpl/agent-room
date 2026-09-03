#!/usr/bin/env node
// selaras-katalog.mjs :: menyelaraskan tanda "+" dan angka di EVENT-ACAK.md
// dengan registri event yang SUNGGUHAN.
//
// Kenapa ada: tanda "+" di kolom pertama katalog dan kalimat "N sudah jadi
// kode" di kepala berkas selama ini ditulis tangan. Tiap gelombang event baru,
// keduanya meleset — pernah tercatat 102, 250+, 267, 268, 272, 297 di berkas
// berbeda pada saat yang sama. uji-katalog.mjs sudah jadi wasit ANGKANYA, tapi
// ia cuma melapor; yang membetulkan berkasnya tetap tangan manusia.
//
// Skrip ini yang membetulkan. Sumber kebenarannya sama persis dengan
// uji-katalog.mjs: EVENT_ACAK di sandbox uji-event.mjs, yaitu hasil
// daftarEvent() yang benar-benar dijalankan.
//
// Pakai:
//   node selaras-katalog.mjs           tulis ulang EVENT-ACAK.md
//   node selaras-katalog.mjs --periksa exit 1 kalau ada yang belum selaras
//                                      (untuk CI — tidak menulis apa pun)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muatKonteks } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD = path.join(__dirname, 'EVENT-ACAK.md');
const JSONK = path.join(__dirname, 'event-acak.json');

const ctx = muatKonteks();
const terdaftar = new Set((ctx.__jembatan__.EVENT_ACAK || []).map((e) => e.id));
const katalog = JSON.parse(fs.readFileSync(JSONK, 'utf8')).events;

// Baris katalog dikenali dari nama tebalnya di kolom kedua, bukan dari id —
// tabel markdown-nya memang tidak memuat kolom id.
//
// Namanya dicocokkan setelah dinormalkan, BUKAN mentah: event-acak.json
// menulis Title Case ("Meja Rapat Dilap Bersih") sementara tabelnya menulis
// sentence case ("Kabel UTP dirapikan"). Mencocokkan mentah-mentah membuat
// 152 dari 373 baris tidak pernah dikenali — dan yang berbahaya, diam-diam:
// baris yang tak dikenali tidak pernah salah, ia cuma tidak pernah dibetulkan.
const normal = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?]+$/, '').trim();
const idDariNama = new Map();
const bentrok = [];
for (const e of katalog) {
  const k = normal(e.nama);
  if (idDariNama.has(k)) bentrok.push(e.nama);
  idDariNama.set(k, e.id);
}
if (bentrok.length) {
  console.log(`  ! ${bentrok.length} nama bentrok sesudah dinormalkan: ${bentrok.join(', ')}`);
}

const asli = fs.readFileSync(MD, 'utf8');
const baris = asli.split('\n');
let ditandai = 0, dicabut = 0, takDikenal = 0;

for (let i = 0; i < baris.length; i++) {
  const l = baris[i];
  // | <tanda> | **Nama** | ... — hanya baris tabel katalog yang punya nama tebal
  const m = l.match(/^\|( *(?:\*\*\+\*\*)? *)\| \*\*(.+?)\*\* \|/);
  if (!m) continue;
  const id = idDariNama.get(normal(m[2]));
  if (!id) { takDikenal++; continue; }
  const adaSekarang = m[1].includes('+');
  const harusAda = terdaftar.has(id);
  if (adaSekarang === harusAda) continue;
  if (harusAda) ditandai++; else dicabut++;
  baris[i] = `|${harusAda ? ' **+** ' : '  '}| **${m[2]}** |` + l.slice(m[0].length);
}

// Kalimat angka di kepala berkas.
let teks = baris.join('\n');
const sudah = katalog.filter((e) => terdaftar.has(e.id)).length;
const sebelum = teks;
teks = teks.replace(/\*\*\d+ sudah jadi kode\*\*/, `**${sudah} sudah jadi kode**`);
const angkaBerubah = teks !== sebelum;

if (takDikenal) {
  console.log(`  ! ${takDikenal} baris tabel namanya tidak ada di event-acak.json (diabaikan)`);
}

if (process.argv.includes('--periksa')) {
  if (ditandai || dicabut || angkaBerubah) {
    console.log(`EVENT-ACAK.md tidak selaras: +${ditandai} tanda kurang, -${dicabut} tanda kelebihan`
      + `${angkaBerubah ? ', angka di kepala berkas salah' : ''}.`);
    console.log('Jalankan: node selaras-katalog.mjs');
    process.exit(1);
  }
  console.log(`EVENT-ACAK.md selaras (${sudah} dari ${katalog.length}).`);
} else {
  if (teks !== asli) fs.writeFileSync(MD, teks);
  console.log(`EVENT-ACAK.md: ${sudah} dari ${katalog.length} bertanda +`
    + ` (${ditandai} ditambah, ${dicabut} dicabut${angkaBerubah ? ', angka kepala dibetulkan' : ''})`);
}
