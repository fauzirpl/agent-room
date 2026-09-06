#!/usr/bin/env node
/* selaras-dokumen.mjs :: penjaga hanyut antara PERMUKAAN PROTOKOL di kode dan
 * dokumentasinya.
 *
 * Dokumentasi repo ini bukan cuma bacaan manusia. Agen yang mau memasang hook
 * membaca tabel "Event yang dipasang"; agen yang mau memasang MCP membaca tabel
 * tool; orang yang mau memantau membaca tabel metrik; yang mau menyetel membaca
 * tabel env. Kalau daftar itu basi, yang dirugikan bukan pembaca yang jeli —
 * tapi mesin yang mempercayainya.
 *
 * Polanya meniru `selaras-katalog.mjs` (EVENT-ACAK.md vs registri event) dan
 * `selaras-suara.mjs` (99-suara.js vs katalog), dengan satu beda penting:
 * berkas ini TIDAK PERNAH MENULIS APA PUN. Katalog boleh dibangkitkan mesin;
 * prosa tidak. Yang bisa dilakukannya cuma melapor, dan `--periksa` menggagalkan.
 *
 * Empat pasangan, dipilih karena tiap sisinya berupa daftar literal di satu
 * tempat — bukan hasil sapuan regex atas 11.000 baris:
 *
 *   1. HOOK    install.mjs  vs  server.mjs  vs  docs/01
 *   2. UJI     berkas uji- & selaras-  vs  package.json  vs  uji.yml  vs  docs/06
 *   3. ENV     process.env.AGENT_ROOM_*  vs  seluruh docs/
 *   4. METRIK  metrik('agent_room_…')  vs  docs/01 + docs/05
 *
 * SENGAJA TIDAK DIPERIKSA: pasangan `kind` vs `case` di handle() room.js
 * (mengiris blok fungsi dari 11.300 baris dengan regex adalah persis kelas bug
 * yang diperingatkan kepala selaras-katalog.mjs), dan tabel tool MCP di docs/05
 * (lima tool, satu tempat, nol hanyut — tunggu sampai bisa ditanya lewat
 * tools/list seperti di uji-mcp.mjs).
 *
 * Pakai:
 *   node selaras-dokumen.mjs             laporan saja, selalu exit 0
 *   node selaras-dokumen.mjs --periksa   exit 1 kalau ada yang hanyut
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PERIKSA = process.argv.includes('--periksa');

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const kuning = c(33); const abu = c(90); const tebal = c(1);

const baca = (p) => { try { return fs.readFileSync(path.join(DIR, p), 'utf8'); } catch { return ''; } };
const unik = (a) => [...new Set(a)];
const kurang = (a, b) => a.filter((x) => !b.includes(x));

/* Pengecualian yang HARUS dieja beserta alasannya. Daftar kosong itu tujuan;
   tiap baris di sini adalah utang yang punya nama. */
const PENGECUALIAN = [
  {
    pasangan: 'uji',
    nama: 'selaras-suara.mjs',
    alasan: 'milik pekerjaan suara/narasi yang belum di-commit; barisnya di CI dan docs/06 ikut commit itu',
  },
  {
    pasangan: 'env',
    nama: 'AGENT_ROOM_TUGAS',
    alasan: 'disuntikkan server ke proses anak, bukan setelan pengguna — orang tidak boleh menyetelnya sendiri',
  },
  {
    pasangan: 'env',
    nama: 'AGENT_ROOM_KUNCI_IZIN',
    alasan: 'kunci per-tugas yang lahir di server dan cuma hidup di env proses anak; konsepnya dijelaskan docs/05 sebagai "dua gerbang yang berbeda"',
  },
];
const dikecualikan = (pasangan, nama) => PENGECUALIAN.some((p) => p.pasangan === pasangan && p.nama === nama);

let temuan = 0;
const seksi = (judul) => console.log('\n' + tebal(judul));
const oke = (t) => console.log('  ' + hijau('✓') + ' ' + t);
const hanyut = (t, rinci) => {
  temuan++;
  console.log('  ' + merah('✗') + ' ' + t + (rinci ? '\n      ' + merah(rinci) : ''));
};
const catatan = (t) => console.log('  ' + kuning('!') + ' ' + t);

/* Pagar terhadap regex yang tiba-tiba cocok nol. Kelas bug yang sama dengan
   "152 baris tak dikenali" yang dicatat di kepala selaras-katalog.mjs: sebuah
   ekstraktor yang diam-diam berhenti bekerja akan melaporkan "tidak ada
   hanyut" dengan gembira. */
function minimal(nama, daftar, batas) {
  if (daftar.length >= batas) return true;
  hanyut(`ekstraktor ${nama} cuma menemukan ${daftar.length} (minimal ${batas})`,
    'polanya yang basi, bukan reponya yang bersih — perbaiki regex di selaras-dokumen.mjs');
  return false;
}

/* Ambil daftar string berkutip dari sebuah literal larik: `const NAMA = [ … ];` */
function larikSumber(src, nama) {
  const m = src.match(new RegExp('const\\s+' + nama + '\\s*=\\s*\\[([\\s\\S]*?)\\]', 'm'));
  if (!m) return [];
  return unik([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

/* Baris tabel markdown: ambil sel pertama yang ber-backtick, dalam satu bagian
   dokumen yang dibatasi judul. */
function tabelBagian(md, judul) {
  const i = md.indexOf(judul);
  if (i < 0) return [];
  const sisa = md.slice(i + judul.length);
  const batas = sisa.search(/\n#{2,3} /);
  const blok = batas < 0 ? sisa : sisa.slice(0, batas);
  return unik([...blok.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((x) => x[1]));
}

/* ============================================================ 1. HOOK ===== */
function pasanganHook() {
  seksi('1. HOOK — install.mjs vs server.mjs vs docs/01-jalanin.md');
  const install = baca('install.mjs');
  const server = baca('server.mjs');
  const doc = baca('docs/01-jalanin.md');

  const dipasang = [...larikSumber(install, 'TOOL_EVENTS'), ...larikSumber(install, 'PLAIN_EVENTS')];
  const aliasBlok = server.match(/const EVENT_ALIAS\s*=\s*\{([\s\S]*?)\n\};/);
  const alias = aliasBlok ? unik([...aliasBlok[1].matchAll(/^\s*([A-Za-z]+)\s*:/gm)].map((x) => x[1])) : [];
  const tabel = tabelBagian(doc, '### Event yang dipasang');

  if (!minimal('hook install.mjs', dipasang, 12)) return;
  if (!minimal('EVENT_ALIAS server.mjs', alias, 12)) return;
  if (!minimal('tabel hook docs/01', tabel, 12)) return;

  const a = kurang(dipasang, alias);
  const b = kurang(alias, dipasang);
  if (a.length || b.length) {
    hanyut('daftar hook install.mjs dan EVENT_ALIAS server.mjs tidak sama',
      (a.length ? 'dipasang tapi tidak dipetakan: ' + a.join(', ') + '. ' : '')
      + (b.length ? 'dipetakan tapi tidak dipasang: ' + b.join(', ') : ''));
  } else oke(`${dipasang.length} hook dipasang dan semuanya dipetakan EVENT_ALIAS`);

  const d = kurang(dipasang, tabel);
  const e = kurang(tabel, dipasang);
  if (d.length || e.length) {
    hanyut('tabel "Event yang dipasang" di docs/01 tidak sama dengan install.mjs',
      (d.length ? 'dipasang tapi tidak ditabelkan: ' + d.join(', ') + '. ' : '')
      + (e.length ? 'ditabelkan tapi tidak dipasang: ' + e.join(', ') : ''));
  } else oke(`tabel docs/01 memuat ${tabel.length} hook yang sama persis`);

  /* Angka di prosa diturunkan dari panjang daftar, bukan dari konstanta tulisan
     tangan — memindahkan angka manual ke kode tidak menjaga apa pun. */
  const m = doc.match(/Yang dipasang (\d+)/);
  if (!m) catatan('kalimat "Yang dipasang N" tidak ditemukan di docs/01 — tidak diperiksa');
  else if (Number(m[1]) !== dipasang.length) {
    hanyut(`docs/01 menulis "Yang dipasang ${m[1]}", install.mjs memasang ${dipasang.length}`,
      'perbaiki angkanya di docs/01-jalanin.md');
  } else oke(`kalimat "Yang dipasang ${dipasang.length}" cocok dengan install.mjs`);
}

/* ============================================================= 2. UJI ===== */
function pasanganUji() {
  seksi('2. UJI — berkas di akar vs npm test vs CI vs docs/06-isi-repo.md');
  const berkas = fs.readdirSync(DIR)
    .filter((f) => /^(uji|selaras)-[a-z0-9-]*\.mjs$/.test(f))
    .sort();
  const pkg = JSON.parse(baca('package.json') || '{}');
  const skrip = String((pkg.scripts || {}).test || '');
  const ci = baca('.github/workflows/uji.yml');
  const doc06 = baca('docs/06-isi-repo.md');

  const diTest = unik([...skrip.matchAll(/node\s+([a-z0-9-]+\.mjs)/g)].map((x) => x[1]));
  const diCi = unik([...ci.matchAll(/node\s+([a-z0-9-]+\.mjs)/g)].map((x) => x[1]));
  const diDoc = unik([...doc06.matchAll(/`([a-z0-9-]+\.mjs)`/g)].map((x) => x[1]));

  if (!minimal('berkas uji di akar', berkas, 8)) return;
  if (!minimal('perintah di npm test', diTest, 8)) return;

  const lupaTest = berkas.filter((f) => !diTest.includes(f) && !dikecualikan('uji', f));
  if (lupaTest.length) {
    hanyut('ada harness yang tidak pernah dijalankan npm test',
      lupaTest.join(', ') + ' — tambahkan ke scripts.test di package.json');
  } else oke(`${berkas.length} harness semuanya masuk npm test`);

  const lupaCi = diTest.filter((f) => berkas.includes(f) && !diCi.includes(f) && !dikecualikan('uji', f));
  if (lupaCi.length) {
    hanyut('ada gerbang yang jalan di lokal tapi tidak pernah di CI',
      lupaCi.join(', ') + ' — tambahkan langkahnya di .github/workflows/uji.yml');
  } else oke('semua gerbang npm test juga jalan di CI');

  const lupaDoc = berkas.filter((f) => !diDoc.includes(f) && !dikecualikan('uji', f));
  if (lupaDoc.length) {
    hanyut('ada harness yang tidak disebut tabel isi repo',
      lupaDoc.join(', ') + ' — tambahkan barisnya di docs/06-isi-repo.md');
  } else oke('semua harness disebut docs/06-isi-repo.md');
}

/* ============================================================= 3. ENV ===== */
function pasanganEnv() {
  seksi('3. ENV — process.env.AGENT_ROOM_* vs seluruh docs/');
  const SUMBER = ['server.mjs', 'hook.mjs', 'dinas.mjs', 'install.mjs', 'mcp-room.mjs', 'mcp-izin.mjs'];
  const dibaca = unik(SUMBER.flatMap((f) =>
    [...baca(f).matchAll(/process\.env\.(AGENT_ROOM_[A-Z0-9_]+)/g)].map((x) => x[1]))).sort();

  const docs = fs.readdirSync(path.join(DIR, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => baca(path.join('docs', f))).join('\n');
  /* Sengaja TIDAK menuntut backtick penutup persis: dokumen menyebut env dalam
     banyak bentuk sah — `AGENT_ROOM_LAPOR_SELESAI=1`, di dalam blok kode
     berpagar, atau di tengah kalimat. Yang dicari "disebut di dokumen mana
     pun", bukan "diformat dengan cara tertentu". */
  const disebut = unik([...docs.matchAll(/(AGENT_ROOM_[A-Z0-9_]+)/g)].map((x) => x[1])).sort();

  if (!minimal('env dibaca kode', dibaca, 20)) return;
  if (!minimal('env disebut docs', disebut, 15)) return;

  const tanpaDoc = kurang(dibaca, disebut).filter((n) => !dikecualikan('env', n));
  if (tanpaDoc.length) {
    hanyut(`${tanpaDoc.length} env dibaca kode tapi tidak disebut satu dokumen pun`,
      tanpaDoc.join(', ') + ' — dokumentasikan di docs/ (tidak harus docs/01)');
  } else oke(`${dibaca.length} env yang dibaca kode semuanya terdokumentasi`);

  const hantu = kurang(disebut, dibaca);
  if (hantu.length) {
    hanyut(`${hantu.length} env disebut dokumen tapi tidak dibaca kode mana pun`,
      hantu.join(', ') + ' — env yang sudah dicabut, atau salah ketik di dokumen');
  } else oke('tidak ada env hantu di dokumen');
}

/* ========================================================== 4. METRIK ===== */
function pasanganMetrik() {
  seksi('4. METRIK — metrik(\'agent_room_…\') vs docs/01 + docs/05');
  const server = baca('server.mjs');
  const dikeluarkan = unik([...server.matchAll(/metrik\('(agent_room_[a-z0-9_]+)'/g)].map((x) => x[1])).sort();
  const doc = baca('docs/05-kendali-web.md') + '\n' + baca('docs/01-jalanin.md');
  const disebut = unik([...doc.matchAll(/(agent_room_[a-z0-9_]+)/g)].map((x) => x[1])).sort();

  if (!minimal('metrik di server.mjs', dikeluarkan, 10)) return;
  if (!minimal('metrik di docs', disebut, 8)) return;

  const tanpaDoc = kurang(dikeluarkan, disebut);
  if (tanpaDoc.length) {
    hanyut(`${tanpaDoc.length} metrik terbit tapi tidak ada di tabel dokumen`,
      tanpaDoc.join(', ') + ' — tambahkan barisnya di docs/05-kendali-web.md');
  } else oke(`${dikeluarkan.length} metrik semuanya ada di tabel dokumen`);

  const hantu = kurang(disebut, dikeluarkan);
  if (hantu.length) {
    hanyut(`${hantu.length} metrik ada di dokumen tapi tidak pernah terbit`,
      hantu.join(', ') + ' — metrik yang sudah dicabut, atau salah ketik');
  } else oke('tidak ada metrik hantu di dokumen');
}

/* ------------------------------------------------------------- jalankan --- */

console.log(tebal('selaras-dokumen') + abu(' — permukaan protokol di kode vs dokumentasinya'));
pasanganHook();
pasanganUji();
pasanganEnv();
pasanganMetrik();

if (PENGECUALIAN.length) {
  seksi('Pengecualian yang sedang berlaku');
  for (const p of PENGECUALIAN) console.log('  ' + kuning('~') + ' ' + p.nama + abu(' [' + p.pasangan + '] — ' + p.alasan));
}

console.log('\n' + (temuan
  ? merah(tebal(temuan + ' hanyut')) + (PERIKSA ? '' : abu('  (jalankan dengan --periksa untuk menggagalkan)'))
  : hijau(tebal('SELARAS')) + abu(' — empat pasangan cocok')));
process.exit(PERIKSA && temuan ? 1 : 0);
