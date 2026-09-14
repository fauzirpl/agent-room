#!/usr/bin/env node
// uji-petugas.mjs :: satpam dan OB (pramubakti) adalah pegawai TETAP di ruangan.
//
// Dulu keduanya cuma peran yang ditempelkan sementara ke standby penambal yang
// kebetulan menganggur saat gilirannya tiba — dan standby menyusut begitu sesi
// nyata bertambah (jagaPopulasi), jadi di ruangan yang ramai sesi satpam dan OB
// praktis tidak pernah terlihat. Yang dijaga di sini:
//   1. jagaPopulasi() selalu menghadirkan tepat satu satpam tetap dan satu OB
//      tetap, berapa pun sesi nyatanya, dan tidak pernah membuangnya;
//   2. jatah standby penambal (MIN_DI_LAYAR) dihitung TANPA mereka;
//   3. patroli & rapikan pantri jatuh ke petugas tetapnya, bukan standby lain,
//      dan notulen rapat tidak pernah jatuh ke mereka;
//   4. di mana pun mereka berada (baru lahir, sesudah dipinjam event, sesudah
//      patroli), mereka pulang ke posnya — dan jam menganggur Agent.update
//      tidak pernah memulangkan mereka ke meja kerja.

import vm from 'node:vm';
import { muatKonteks } from './uji-event.mjs';

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (k) => (s) => (warna ? '\x1b[' + k + 'm' + s + '\x1b[0m' : s);
const merah = c(31), hijau = c(32), abu = c(90), tebal = c(1);
let lulus = 0, gagal = 0;
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log(hijau('  ✓ ') + nama.padEnd(64) + abu(ket || '')); }
  else { gagal++; console.log(merah('  ✗ ') + nama.padEnd(64) + merah(ket || '')); }
}

const U = muatKonteks();
const H = U.__jembatan__;
const nilai = (ekspresi) => new vm.Script(ekspresi).runInContext(U);
for (const nama of ['jagaPopulasi', 'pastikanPetugasTetap', 'posTetap', 'calonPetugasSatpam', 'calonPetugasPramubakti', 'calonPetugasNotulen']) {
  if (typeof U[nama] !== 'function') { console.log(merah(`fungsi ${nama}() tidak ditemukan di room.js`)); process.exit(1); }
}
let t = 1_000_000;
H.setNow(t);
const MIN = nilai('MIN_DI_LAYAR');
const tetap = (jenis) => H.standby.filter((b) => b.tetap === jenis);
const penambal = () => H.standby.filter((b) => !b.tetap);
const sesiPalsu = (n) => { H.agents.clear(); for (let i = 0; i < n; i++) H.agents.set('sesi-uji-' + i, {}); };

/* ------------------------------------------------------------ populasi --- */
console.log(tebal('\nSelalu ada, berapa pun sesinya'));
sesiPalsu(0);
U.jagaPopulasi();
const satpam = tetap('satpam')[0], ob = tetap('pramubakti')[0];
ok('ruangan kosong sesi: tepat satu satpam tetap dan satu OB tetap',
  tetap('satpam').length === 1 && tetap('pramubakti').length === 1, `${H.standby.length} standby`);
ok(`jatah penambal tetap ${MIN}, petugas tetap di luar hitungan`, penambal().length === MIN, `${penambal().length} penambal`);
ok('perannya melekat sejak lahir', satpam && satpam.peran === 'satpam' && ob && ob.peran === 'pramubakti',
  `${satpam && satpam.peran} / ${ob && ob.peran}`);
ok('betah sejak lahir (jam menganggur tidak memulangkannya ke meja)', satpam && satpam.betah === true && ob.betah === true);

sesiPalsu(12);
U.jagaPopulasi();
ok('dua belas sesi nyata: penambal habis, petugas tetap tetap ada', penambal().length === 0
  && tetap('satpam')[0] === satpam && tetap('pramubakti')[0] === ob, `${penambal().length} penambal, ${H.standby.length} standby`);
U.jagaPopulasi(); U.jagaPopulasi();
ok('jagaPopulasi berulang tidak menggandakan petugas tetap', tetap('satpam').length === 1 && tetap('pramubakti').length === 1);
sesiPalsu(0);
U.jagaPopulasi();
ok('sesi bubar: penambal kembali, petugas tetap tidak berganti orang', penambal().length === MIN && tetap('satpam')[0] === satpam);

/* ------------------------------------------------------------- tugas --- */
console.log(tebal('\nTugasnya jatuh ke petugas tetap'));
ok('patroli jatuh ke satpam tetap', U.calonPetugasSatpam() === satpam);
ok('rapikan pantri jatuh ke OB tetap', U.calonPetugasPramubakti() === ob);
const notulen = U.calonPetugasNotulen();
ok('notulen rapat tidak pernah jatuh ke petugas tetap', notulen && !notulen.tetap, notulen ? notulen.peran : 'null');
satpam.eventKerja = { id: 'uji' };
ok('satpam tetap sedang dipinjam event: patroli menunggu, tidak digantikan standby lain', U.calonPetugasSatpam() === null);
satpam.eventKerja = null;
satpam.mulaiSatpam();
satpam.selesaiSatpam(true);
ob.mulaiPramubakti();
ob.selesaiPramubakti(true);
ok('sesudah patroli & rapikan pantri keduanya tetap betah', satpam.betah === true && ob.betah === true
  && !satpam.tugasSatpam && !ob.tugasPramubakti);

/* --------------------------------------------------------------- pos --- */
console.log(tebal('\nPulang ke pos, dan berjaga di sana'));
for (const [a, jenis] of [[satpam, 'satpam'], [ob, 'pramubakti']]) {
  const p = U.posTetap(jenis);
  a.x = 120; a.y = 252; a.path = []; a.eventKerja = null;
  a.tickTetap();
  const akhir = a.path[a.path.length - 1];
  ok(`${jenis}: jauh dari posnya → berjalan pulang ke pos (${p.x},${p.y})`,
    akhir && Math.hypot(akhir.x - p.x, akhir.y - p.y) < 2, akhir ? `ujung jalur ${Math.round(akhir.x)},${Math.round(akhir.y)}` : 'tanpa jalur');
  // sampai di pos, lalu dibiarkan lama sekali: jam menganggur tidak boleh menariknya ke meja
  a.x = p.x; a.y = p.y; a.path = []; a.lastEvent = t - 600000; a.arrivedAt = t - 600000;
  let pergi = 0;
  for (let i = 0; i < 400; i++) {
    t += 50; H.setNow(t);
    a.update(0.05);
    if (a.path.length && !a.tugasSatpam && !a.tugasPramubakti) pergi++;
  }
  ok(`${jenis}: 20 detik menganggur di pos → tidak dipulangkan ke meja kerja`,
    pergi === 0 && Math.hypot(a.x - p.x, a.y - p.y) < 3, `${pergi} frame berjalan, di ${Math.round(a.x)},${Math.round(a.y)}`);
}

console.log('\n' + (gagal ? merah(`GAGAL ${gagal}`) + ` · lulus ${lulus}` : hijau(`LULUS ${lulus} pemeriksaan`)));
process.exit(gagal ? 1 : 0);
