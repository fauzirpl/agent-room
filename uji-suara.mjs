#!/usr/bin/env node
// uji-suara.mjs :: penjaga suara ucap & daftar nama pegawai.
//
// Fitur ini punya satu janji yang gampang rusak diam-diam: "kalau apa pun
// gagal, ruangan tetap bunyi seperti biasa". Gagalnya ada banyak rupa —
// kunci belum dipasang, kunci salah, OpenRouter tumbang, kuota habis, model
// dicabut — dan SEMUANYA harus berujung sama: 204, halaman jatuh ke lonceng
// earcon, tidak ada pesan merah. Satu saja di antaranya bocor jadi 500 atau
// jadi exception, notifikasi yang tadinya cuma "tanpa suara ucap" berubah jadi
// notifikasi yang rusak. Itu yang dijaga berkas ini.
//
// Yang dijaga berikutnya: BIAYA. Klip yang sama tidak boleh pernah dibayar dua
// kali. Ada dua jalur yang bisa membocorkannya — cache yang meleset (hash-nya
// salah) dan permintaan serentak yang lolos dedupe — dan dua-duanya diuji
// dengan MENGHITUNG panggilan ke penyedia, bukan dengan melihat hasilnya benar.
//
// Cara kerjanya: menyalakan server.mjs sungguhan sebagai proses anak, dengan
// SELURUH env datanya diarahkan ke folder sementara, DAN dengan
// AGENT_ROOM_SUARA_URL diarahkan ke OpenRouter palsu di localhost. Uji ini
// tidak pernah benar-benar keluar jaringan dan tidak pernah butuh kunci
// sungguhan — kalau suatu hari dia mulai butuh, itu bug, bukan fitur.
//
// Pakai:
//   node uji-suara.mjs            jalankan semua kasus
//   node uji-suara.mjs --simpan   jangan hapus folder sementara (buat mengintip)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const ROOM = path.join(__dirname, 'public', 'room.js');
const SIMPAN = process.argv.includes('--simpan');

const berwarna = !process.env.NO_COLOR;
const warnai = (kode) => (s) => (berwarna ? '[' + kode + 'm' + s + '[0m' : String(s));
const merah = warnai(31);
const hijau = warnai(32);
const abu = warnai(90);
const tebal = warnai(1);

let gagal = 0;
let periksa = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------- OpenRouter palsu --- */
/* Sengaja HTTP sungguhan, bukan fetch yang di-monkeypatch: yang mau diuji
   justru bentuk permintaan yang benar-benar keluar dari server (header, badan,
   response_format), dan itu cuma kelihatan kalau ada yang menerimanya. */
function openrouterPalsu() {
  const st = {
    panggil: 0,            // berapa kali /audio/speech benar-benar dipanggil
    badan: [],             // badan JSON tiap panggilan
    auth: [],              // header Authorization tiap panggilan
    tunda: 0,              // ms, buat menguji dedupe permintaan serentak
    balas: 'ok',           // 'ok' | '401' | '500' | 'kosong'
    modelMati: false,
    klip: Buffer.from('ID3klip-palsu-yang-berpura-pura-mp3'),
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/models') {
      if (st.modelMati) { res.writeHead(503).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'palsu/tts-satu', name: 'TTS Palsu Satu', pricing: { audio: '0.000015' },
            supported_voices: ['Zephyr', 'Puck', 'Kore'] },
          // supported_voices null = penyedia menerima voice bebas (mis. Fish Audio)
          { id: 'palsu/tts-dua', name: 'TTS Palsu Dua', pricing: { audio: '0.00003' },
            supported_voices: null },
        ],
      }));
      return;
    }
    if (u.pathname === '/audio/speech') {
      let b = '';
      for await (const c of req) b += c;
      st.panggil++;
      st.auth.push(req.headers.authorization || '');
      try { st.badan.push(JSON.parse(b)); } catch { st.badan.push(null); }
      if (st.tunda) await tidur(st.tunda);
      if (st.balas === '401') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'User not found.' } }));
        return;
      }
      if (st.balas === '500') { res.writeHead(500).end('boom'); return; }
      if (st.balas === 'kosong') { res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(); return; }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': st.klip.length });
      res.end(st.klip);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({
        st,
        suaraUrl: 'http://127.0.0.1:' + port + '/audio/speech',
        modelUrl: 'http://127.0.0.1:' + port + '/models',
        tutup: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

/* ------------------------------------------------- kantor sementara --- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-suara-'));
let nSandbox = 0;
function sandboxBaru(tag) {
  const d = path.join(TMP, tag + '-' + (++nSandbox));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const PORT_MULAI = Number(process.env.AGENT_ROOM_UJI_PORT_SUARA) || 4662;
let portBerikut = PORT_MULAI;
const kodeAnak = 'process.on(\'message\',(m)=>{if(m===\'tutup\')process.exit(0);});'
  + 'await import(' + JSON.stringify(pathToFileURL(SERVER).href) + ');';

async function coba(dir, port, palsu, tambahan) {
  const anak = spawn(process.execPath, ['--input-type=module', '-e', kodeAnak], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      AGENT_ROOM_PORT: String(port),
      AGENT_ROOM_HOST: '127.0.0.1',
      AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
      AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
      AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
      AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
      AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
      AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping.jsonl'),
      AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
      AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
      AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
      AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
      AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
      // inilah yang menjamin uji ini tidak pernah menyentuh openrouter.ai
      AGENT_ROOM_SUARA_URL: palsu.suaraUrl,
      AGENT_ROOM_SUARA_MODEL_URL: palsu.modelUrl,
      AGENT_ROOM_KUNCI: '',
      AGENT_ROOM_LAPOR: '',
      AGENT_ROOM_CUACA: 'off',
      AGENT_ROOM_PEGAWAI_TETAP: '',
      ...tambahan,
    },
  });
  const k = { anak, port, dir, palsu, log: [], alamat: 'http://127.0.0.1:' + port, mati: false };
  anak.stdout.on('data', (d) => k.log.push(String(d)));
  anak.stderr.on('data', (d) => k.log.push(String(d)));
  anak.on('exit', () => { k.mati = true; });
  /* Kesiapan dibaca dari konsol ANAK KITA SENDIRI, bukan dari /health: port
     yang kebetulan dipakai server lain akan menjawab /health dengan riang dan
     ujinya lalu bicara dengan kantor yang salah. Sama alasannya dengan
     uji-pegawai.mjs. */
  const batas = Date.now() + 15000;
  while (Date.now() < batas) {
    if (k.mati) return null;
    if (k.log.join('').includes('ruangan siap')) return k;
    await tidur(50);
  }
  return null;
}

async function buka(dir, palsu, tambahan = {}) {
  for (let i = 0; i < 12; i++) {
    const k = await coba(dir, portBerikut++, palsu, tambahan);
    if (k) return k;
  }
  throw new Error('server uji tidak mau menyala di port mana pun');
}

async function tutup(k) {
  if (!k || k.mati) return;
  k.anak.send('tutup');
  const batas = Date.now() + 5000;
  while (!k.mati && Date.now() < batas) await tidur(30);
  if (!k.mati) k.anak.kill();
}

/* ----------------------------------------------------------- klien --- */
const asal = (k) => ({ origin: 'http://127.0.0.1:' + k.port });
const ambil = (k, p, o = {}) => fetch(k.alamat + p, { ...o, headers: { ...asal(k), ...(o.headers || {}) } });
async function json(k, p, o) {
  const r = await ambil(k, p, o);
  const t = await r.text();
  try { return { s: r.status, d: JSON.parse(t) }; } catch { return { s: r.status, d: t }; }
}
const kirim = (k, p, body) => json(k, p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const ucap = (k, teks, headers) => ambil(k, '/ucap?teks=' + encodeURIComponent(teks), { headers });

const KUNCI = 'sk-or-v1-rahasia-uji-jangan-sampai-bocor-a3f9';
const SELESAI = (n) => 'Izin, ' + n + ' selesai';

/* ================================================================ kasus === */

async function kasus1(palsu) {
  console.log(tebal('\nKasus 1: apa pun yang gagal berujung 204, bukan galat'));
  const k = await buka(sandboxBaru('a'), palsu);
  palsu.st.panggil = 0;

  let r = await ucap(k, SELESAI('Oji'));
  sama('tanpa kunci: /ucap 204', r.status, 204);
  sama('  badannya kosong', (await r.text()).length, 0);
  sama('  penyedia tidak pernah dipanggil', palsu.st.panggil, 0);

  await kirim(k, '/suara/setelan', { kunci: KUNCI });
  r = await ucap(k, SELESAI('Oji'));
  sama('punya kunci tapi belum dinyalakan: /ucap 204', r.status, 204);
  sama('  penyedia masih tidak dipanggil', palsu.st.panggil, 0);

  await kirim(k, '/suara/setelan', { aktif: true });
  r = await ucap(k, SELESAI('Oji'));
  sama('nyala + berkunci: /ucap 200', r.status, 200);
  sama('  content-type audio/mpeg', r.headers.get('content-type'), 'audio/mpeg');
  benar('  badannya klip sungguhan', (await r.arrayBuffer()).byteLength === palsu.st.klip.length,
    'panjang klip tidak cocok');
  sama('  penyedia dipanggil sekali', palsu.st.panggil, 1);

  /* Tiga rupa kegagalan penyedia. Semuanya WAJIB 204: halaman tidak punya
     cara membedakannya, dan memang tidak perlu — loncengnya sudah bunyi. */
  for (const [nama, balas] of [['kunci ditolak (401)', '401'], ['penyedia meledak (500)', '500'], ['klip kosong', 'kosong']]) {
    palsu.st.balas = balas;
    const rr = await ucap(k, SELESAI('Nama Baru ' + balas));
    sama(nama + ': /ucap 204', rr.status, 204);
  }
  palsu.st.balas = 'ok';

  // penyedia mati total (soket ditolak) juga tidak boleh jadi 500
  const k2 = await buka(sandboxBaru('a-mati'), {
    suaraUrl: 'http://127.0.0.1:1/audio/speech', modelUrl: 'http://127.0.0.1:1/models',
  });
  await kirim(k2, '/suara/setelan', { kunci: KUNCI, aktif: true });
  sama('penyedia tidak bisa dihubungi: /ucap 204', (await ucap(k2, SELESAI('Oji'))).status, 204);
  benar('  servernya sendiri tetap hidup', !k2.mati, 'server anak mati gara-gara penyedia mati');
  await tutup(k2);

  await tutup(k);
}

async function kasus2(palsu) {
  console.log(tebal('\nKasus 2: bentuk permintaan yang benar-benar keluar'));
  const k = await buka(sandboxBaru('b'), palsu);
  palsu.st.panggil = 0; palsu.st.badan = []; palsu.st.auth = [];

  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'nova' });
  await ucap(k, SELESAI('Sri Rahayu'));

  const b = palsu.st.badan[0] || {};
  sama('model diteruskan apa adanya', b.model, 'palsu/tts-satu');
  sama('input = kalimat yang diminta', b.input, 'Izin, Sri Rahayu selesai');
  sama('voice diteruskan', b.voice, 'nova');
  /* Yang paling gampang salah dan paling sunyi kalau salah: bawaan OpenRouter
     itu pcm, dan pcm tidak bisa dimainkan <audio> apa adanya. */
  sama('response_format mp3, BUKAN pcm bawaan', b.response_format, 'mp3');
  benar('speed tidak dikirim waktu kecepatan 1', !('speed' in b),
    'speed ikut terkirim padahal kecepatannya bawaan');
  sama('Authorization Bearer + kunci', palsu.st.auth[0], 'Bearer ' + KUNCI);

  await kirim(k, '/suara/setelan', { kecepatan: 1.25 });
  await ucap(k, SELESAI('Sri Rahayu'));
  sama('kecepatan bukan 1 ikut terkirim', (palsu.st.badan[1] || {}).speed, 1.25);

  await tutup(k);
}

async function kasus3(palsu) {
  console.log(tebal('\nKasus 3: klip yang sama tidak pernah dibayar dua kali'));
  const dir = sandboxBaru('c');
  const k = await buka(dir, palsu);
  palsu.st.panggil = 0;
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'alloy' });

  await ucap(k, SELESAI('Oji'));
  sama('permintaan pertama memanggil penyedia', palsu.st.panggil, 1);
  await ucap(k, SELESAI('Oji'));
  await ucap(k, SELESAI('Oji'));
  sama('dua permintaan berikutnya dilayani cache', palsu.st.panggil, 1);

  await ucap(k, SELESAI('Sumala'));
  sama('nama lain = klip lain', palsu.st.panggil, 2);

  /* Inti kenapa model/voice ikut di-hash: ganti voice harus bikin klip baru,
     bukan memutar suara lama dengan voice yang sudah diganti. */
  await kirim(k, '/suara/setelan', { voice: 'nova' });
  await ucap(k, SELESAI('Oji'));
  sama('ganti voice = klip baru', palsu.st.panggil, 3);

  await kirim(k, '/suara/setelan', { model: 'palsu/tts-dua' });
  await ucap(k, SELESAI('Oji'));
  sama('ganti model = klip baru', palsu.st.panggil, 4);

  /* ...dan balik ke setelan lama harus GRATIS. Kalau ini merah, bolak-balik
     mencoba voice jadi berbayar tiap kali. */
  await kirim(k, '/suara/setelan', { model: 'palsu/tts-satu', voice: 'alloy' });
  await ucap(k, SELESAI('Oji'));
  sama('balik ke setelan lama dilayani klip lama', palsu.st.panggil, 4);

  const isi = fs.readdirSync(path.join(dir, 'suara'));
  sama('klipnya benar-benar mendarat di disk', isi.filter((n) => n.endsWith('.mp3')).length, 4);
  benar('tidak ada sisa .tmp yang setengah tulis', !isi.some((n) => n.endsWith('.tmp')),
    'ada berkas .tmp tertinggal: ' + isi.filter((n) => n.endsWith('.tmp')).join(', '));

  const c = (await json(k, '/suara/setelan')).d.cache;
  sama('panel melaporkan jumlah klip yang sama', c.jumlah, 4);
  benar('panel melaporkan ukuran > 0', c.byte > 0, 'ukuran cache dilaporkan ' + c.byte);

  const hapus = (await json(k, '/suara/cache', { method: 'DELETE' })).d;
  sama('kosongkan cache membuang semuanya', hapus.dibuang, 4);
  sama('  sesudahnya cache kosong', hapus.cache.jumlah, 0);
  await ucap(k, SELESAI('Oji'));
  sama('  dan klip berikutnya digenerate lagi', palsu.st.panggil, 5);

  await tutup(k);
}

async function kasus4(palsu) {
  console.log(tebal('\nKasus 4: permintaan serentak tidak boleh dobel bayar'));
  const k = await buka(sandboxBaru('d'), palsu);
  palsu.st.panggil = 0;
  palsu.st.tunda = 300;          // cukup lama supaya keenamnya benar-benar tumpang tindih
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  const enam = await Promise.all(Array.from({ length: 6 }, () => ucap(k, SELESAI('Oji'))));
  sama('enam permintaan serentak = SATU panggilan penyedia', palsu.st.panggil, 1);
  benar('  semuanya dijawab 200', enam.every((r) => r.status === 200),
    'status: ' + enam.map((r) => r.status).join(','));
  const panjang = await Promise.all(enam.map(async (r) => (await r.arrayBuffer()).byteLength));
  benar('  semuanya menerima klip yang sama', new Set(panjang).size === 1,
    'panjang badan berbeda-beda: ' + panjang.join(','));

  // sesudah selesai, peta in-flight harus bersih lagi — bukan menahan hash selamanya
  palsu.st.tunda = 0;
  await ucap(k, SELESAI('Sumala'));
  sama('hash lain sesudahnya tetap bisa jalan', palsu.st.panggil, 2);

  await tutup(k);
}

async function kasus5(palsu) {
  console.log(tebal('\nKasus 5: ETag — kenapa immutable akan salah'));
  const k = await buka(sandboxBaru('e'), palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'alloy' });

  const r1 = await ucap(k, SELESAI('Oji'));
  const etag1 = r1.headers.get('etag');
  await r1.arrayBuffer();
  benar('balasan membawa ETag', Boolean(etag1), 'tidak ada header ETag');

  const r2 = await ucap(k, SELESAI('Oji'), { 'if-none-match': etag1 });
  sama('If-None-Match yang cocok dijawab 304', r2.status, 304);
  sama('  304 tanpa badan', (await r2.text()).length, 0);

  /* Inilah alasan header-nya no-cache, bukan immutable: URL-nya tidak berubah
     waktu voice diganti, jadi kalau peramban tidak pernah revalidasi, dia akan
     memutar suara lama selamanya. */
  await kirim(k, '/suara/setelan', { voice: 'nova' });
  const r3 = await ucap(k, SELESAI('Oji'), { 'if-none-match': etag1 });
  sama('sesudah voice diganti, ETag lama TIDAK cocok lagi', r3.status, 200);
  benar('  ETag-nya memang berubah', r3.headers.get('etag') !== etag1, 'ETag tidak berubah');
  await r3.arrayBuffer();

  const cc = r3.headers.get('cache-control') || '';
  benar('cache-control menyuruh revalidasi, bukan immutable',
    cc.includes('no-cache') && !cc.includes('immutable'), 'cache-control = ' + JSON.stringify(cc));

  await tutup(k);
}

async function kasus6(palsu) {
  console.log(tebal('\nKasus 6: kunci tidak pernah keluar dari server'));
  const k = await buka(sandboxBaru('f'), palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  const setelan = await json(k, '/suara/setelan');
  const teks = JSON.stringify(setelan.d);
  benar('GET /suara/setelan tidak memuat kunci', !teks.includes(KUNCI),
    'kunci utuh ikut terkirim ke halaman');
  sama('  cuma ada/tidaknya', setelan.d.punyaKunci, true);
  sama('  plus empat huruf terakhir', setelan.d.kunciEkor, KUNCI.slice(-4));

  benar('kunci tidak pernah tercetak ke konsol', !k.log.join('').includes(KUNCI),
    'kunci muncul di stdout/stderr server');

  const berkas = path.join(k.dir, '.agent-room-suara-kunci');
  benar('kunci diingat di berkasnya sendiri, bukan di suara.json',
    fs.existsSync(berkas) && !fs.readFileSync(path.join(k.dir, 'suara.json'), 'utf8').includes(KUNCI),
    'kunci bocor ke suara.json');

  /* Mengganti voice tidak boleh ikut menghapus kunci — `kunci` yang tidak
     dikirim artinya "jangan disentuh", bukan "kosongkan". */
  await kirim(k, '/suara/setelan', { voice: 'echo' });
  sama('menyimpan setelan lain tidak menghapus kunci',
    (await json(k, '/suara/setelan')).d.punyaKunci, true);

  const ngawur = await kirim(k, '/suara/setelan', { kunci: 'ada spasi di sini' });
  sama('kunci berspasi ditolak', ngawur.s, 400);
  sama('  kunci lama tetap terpasang', (await json(k, '/suara/setelan')).d.punyaKunci, true);

  const hapus = await kirim(k, '/suara/setelan', { kunci: '' });
  sama('kunci kosong = hapus', hapus.d.punyaKunci, false);
  sama('  fiturnya ikut mati sendiri', hapus.d.aktif, false);
  benar('  berkas kuncinya benar-benar dihapus', !fs.existsSync(berkas), 'berkas kunci masih ada');

  const nyala = await kirim(k, '/suara/setelan', { aktif: true });
  sama('menyalakan tanpa kunci ditolak halus', nyala.d.aktif, false);

  await tutup(k);
}

async function kasus7(palsu) {
  console.log(tebal('\nKasus 7: panaskan cache'));
  const k = await buka(sandboxBaru('g'), palsu);
  palsu.st.panggil = 0;

  const tanpaKunci = await kirim(k, '/suara/panasi', {});
  sama('tanpa kunci: 409, bukan diam-diam sukses', tanpaKunci.s, 409);

  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });
  await kirim(k, '/nama/daftar', { penuh: ['Oji', 'Sumala', 'Pak Kadis'] });

  const p1 = (await kirim(k, '/suara/panasi', {})).d;
  // 3 nama + 1 kalimat "mohon arahan"
  sama('sekali panasi = satu klip per nama, plus kalimat arahan', p1.dibuat, 4);
  sama('  tidak ada yang gagal', p1.gagal, 0);
  sama('  penyedia dipanggil persis sebanyak itu', palsu.st.panggil, 4);

  const p2 = (await kirim(k, '/suara/panasi', {})).d;
  sama('panasi kedua tidak membuat apa-apa lagi', p2.dibuat, 0);
  sama('  semuanya dihitung sudah ada', p2.sudah, 4);
  sama('  dan penyedia tidak dipanggil lagi', palsu.st.panggil, 4);

  /* Notifikasi sungguhan sesudah dipanaskan harus GRATIS — kalau ini merah,
     kalimat di room.js dan di server.mjs sudah hanyut (lihat kasus 10). */
  await ucap(k, SELESAI('Sumala'));
  sama('notifikasi sesudah dipanaskan tidak memanggil penyedia', palsu.st.panggil, 4);

  palsu.st.balas = '500';
  await kirim(k, '/nama/daftar', { penuh: ['Nama Yang Belum Ada'] });
  const p3 = (await kirim(k, '/suara/panasi', {})).d;
  sama('penyedia gagal: panasi tetap 200, bukan 500', p3.ok, true);
  benar('  kegagalannya dilaporkan apa adanya', p3.gagal > 0 && Boolean(p3.pesan),
    'gagal=' + p3.gagal + ' pesan=' + JSON.stringify(p3.pesan));
  palsu.st.balas = 'ok';

  await tutup(k);
}

async function kasus8(palsu) {
  console.log(tebal('\nKasus 8: daftar nama — bersih-bersih dan jaring pengaman'));
  const dir = sandboxBaru('h');
  const k = await buka(dir, palsu);

  const awal = (await json(k, '/nama/daftar')).d;
  sama('belum diatur = pakai daftar bawaan', awal.pakaiBawaan, true);
  benar('  daftar bawaannya ikut dikirim buat placeholder', (awal.bawaan || []).length >= 8,
    'bawaan cuma ' + (awal.bawaan || []).length + ' nama');
  sama('  dan daftar pilihan masih kosong', awal.penuh.length, 0);

  const simpan = await kirim(k, '/nama/daftar', {
    penuh: ['  Oji  ', 'Sumala', 'Oji', '', '   ', 'Nama Yang Kepanjangan Sekali Sampai Lewat Batas', 42, null],
  });
  sama('simpan: yang sah saja yang masuk', simpan.d.jumlah, 3);
  const isi = (await json(k, '/nama/daftar')).d.penuh;
  sama('  spasi berlebih dipangkas', isi[0].nama, 'Oji');
  sama('  urutan dipertahankan', isi[1].nama, 'Sumala');
  sama('  kembar dibuang', isi.filter((e) => e.nama === 'Oji').length, 1);
  sama('  dipotong 24 huruf', isi[2].nama.length, 24);
  benar('  yang bukan teks diabaikan tanpa melempar',
    isi.every((e) => e && typeof e.nama === 'string' && typeof e.peran === 'string'),
    'ada entri yang bentuknya bukan {nama, peran}');

  const kosong = await kirim(k, '/nama/daftar', { penuh: [] });
  sama('daftar kosong = kembali ke bawaan, bukan galat', kosong.d.pakaiBawaan, true);

  await tutup(k);

  /* Berkas rusak / versi masa depan tidak boleh mematikan kantor. Diuji dengan
     server BARU, sebab nama.json cuma dibaca saat start. */
  for (const [nama, teksBerkas] of [
    ['nama.json rusak (bukan JSON)', '{ ini bukan json '],
    ['nama.json versi masa depan', JSON.stringify({ v: 99, penuh: ['Entah Siapa'] })],
    ['nama.json tanpa medan penuh', JSON.stringify({ v: 1 })],
  ]) {
    const d2 = sandboxBaru('h-rusak');
    fs.writeFileSync(path.join(d2, 'nama.json'), teksBerkas);
    const k2 = await buka(d2, palsu);
    benar(nama + ': server tetap menyala', Boolean(k2) && !k2.mati, 'server anak gagal start');
    sama('  jatuh ke daftar bawaan', (await json(k2, '/nama/daftar')).d.pakaiBawaan, true);
    await tutup(k2);
  }
}

async function kasus9(palsu) {
  console.log(tebal('\nKasus 9: undi ulang menghormati nama pilihanmu'));
  const dir = sandboxBaru('i');
  const k = await buka(dir, palsu);
  await kirim(k, '/nama/daftar', { penuh: ['Oji', 'Sumala', 'Pak Kadis'] });

  /* Id sesi WAJIB 12 karakter di sini: server memotong id ke 12 char untuk
     kunci kursinya, jadi id yang lebih panjang bikin POST /nama menunjuk kursi
     yang tidak ada dan ujinya diam-diam menguji hal lain. */
  const hook = (sesi) => kirim(k, '/event', {
    hook_event_name: 'PreToolUse', session_id: sesi,
    cwd: path.join(dir, 'kantor-undi'), tool_name: 'Read', tool_input: { file_path: 'a.txt' },
  });
  await hook('sesiuji-aaa1');
  await hook('sesiuji-bbb2');
  await tidur(300);

  const nama = async () => Object.fromEntries(
    (await json(k, '/ruangan')).d.sesi.map((s) => [s.sesi, s.nama]));

  const n0 = await nama();
  benar('dua pegawai lahir dengan nama dari daftarmu',
    Object.values(n0).every((n) => ['Oji', 'Sumala', 'Pak Kadis'].includes(n)),
    'nama yang keluar: ' + JSON.stringify(n0));
  benar('  dan tidak kembar', new Set(Object.values(n0)).size === 2, 'dua kursi bernama sama');

  await kirim(k, '/nama', { sesi: 'sesiuji-aaa1', nama: 'Bu Ratna' });
  const undi = (await kirim(k, '/nama/undi-ulang', {})).d;
  sama('undi ulang melewati kursi bernama pilihanmu', undi.dilewati, 1);
  sama('  nama pilihanmu tidak berubah', (await nama())['sesiuji-aaa1'], 'Bu Ratna');

  /* Daftar dipersempit jadi SATU nama sementara ada dua kursi: yang kedua
     tidak boleh jadi kembar persis, dan tidak boleh jadi kosong. */
  await kirim(k, '/nama/daftar', { penuh: ['Oji'] });
  await kirim(k, '/nama/undi-ulang', {});
  const n1 = await nama();
  sama('daftar satu nama: kursi otomatis dapat nama itu', n1['sesiuji-bbb2'], 'Oji');
  benar('  tidak ada nama kosong', Object.values(n1).every(Boolean), JSON.stringify(n1));

  await tutup(k);
}

async function kasus10() {
  console.log(tebal('\nKasus 10: kalimat di room.js dan server.mjs tidak boleh hanyut'));
  /* Kalimatnya memang hidup di dua tempat — room.js yang MEMINTA, server.mjs
     yang MEMANASKAN. Kalau keduanya berbeda satu huruf saja, "panaskan cache"
     memanaskan kalimat yang tidak pernah dipakai dan tiap notifikasi jadi
     berbayar lagi; dan itu tidak akan kelihatan sebagai galat apa pun. */
  const bersih = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const petik = (src, kunci) => {
    const m = new RegExp('const ' + kunci + ' = \\{([\\s\\S]*?)\\n\\};').exec(src);
    return m ? bersih(m[1]) : null;
  };
  const dariServer = petik(fs.readFileSync(SERVER, 'utf8'), 'suaraKalimat');
  const dariRoom = petik(fs.readFileSync(ROOM, 'utf8'), 'UCAP');

  benar('suaraKalimat ketemu di server.mjs', Boolean(dariServer), 'blok tidak ketemu — regexnya basi?');
  benar('UCAP ketemu di room.js', Boolean(dariRoom), 'blok tidak ketemu — regexnya basi?');
  benar('isinya sama persis', dariServer === dariRoom,
    'server: ' + dariServer + '\n      room  : ' + dariRoom);
  benar('kalimatnya memang memuat nama pegawai', /nama/.test(dariServer || ''),
    'templat selesai tidak lagi memakai nama — cache-nya jadi tidak ada gunanya');
}

async function kasus11(palsu) {
  console.log(tebal('\nKasus 11: daftar model buat panel'));
  const k = await buka(sandboxBaru('j'), palsu);

  const d = (await json(k, '/suara/model')).d;
  sama('daftar model diteruskan', d.ok, true);
  sama('  jumlahnya apa adanya', d.model.length, 2);
  sama('  id-nya utuh', d.model[0].id, 'palsu/tts-satu');
  benar('  harganya ikut kalau ada', Boolean(d.model[0].harga), 'harga tidak ikut');
  /* Tanpa ini kolom voice kembali jadi tebak-tebakan, dan voice yang salah
     ditolak penyedia — jenis kegagalan yang paling membingungkan waktu
     pertama kali menyambungkan kunci. */
  sama('  daftar voice ikut diteruskan', JSON.stringify(d.model[0].suara),
    JSON.stringify(['Zephyr', 'Puck', 'Kore']));
  sama('  voice bebas diteruskan sebagai null, bukan []', d.model[1].suara, null);

  palsu.st.modelMati = true;
  const mati = await json(k, '/suara/model');
  sama('penyedia daftar mati: tetap 200, bukan 500', mati.s, 200);
  sama('  ok:false supaya panel tahu', mati.d.ok, false);
  sama('  daftarnya kosong, bukan undefined', mati.d.model.length, 0);
  palsu.st.modelMati = false;

  await tutup(k);
}

async function kasus12() {
  console.log(tebal('\nKasus 12: rute yang dipanggil halaman harus ada di server'));
  /* Inilah kelas bug yang bikin panel menjawab "gagal" padahal kuncinya
     baik-baik saja: halaman memanggil rute yang server-nya tidak punya.
     Waktu itu sebabnya proses server masih versi lama, tapi sebab yang sama
     bisa datang dari salah ketik atau rute yang diganti nama sebelah sini
     saja — dan gejalanya persis sama, tanpa galat apa pun di sisi server. */
  const room = fs.readFileSync(ROOM, 'utf8');
  const src = fs.readFileSync(SERVER, 'utf8');

  const dipanggil = [...new Set(
    [...room.matchAll(/(?:panelJson|fetch)\(\s*'(\/(?:suara|nama|ucap)[^'?]*)/g)].map((m) => m[1]),
  )];
  benar('rute suara/nama di room.js ketemu', dipanggil.length >= 6,
    'cuma ' + dipanggil.length + ' yang ketemu — regexnya mungkin sudah basi');

  const dilayani = new Set(
    [...src.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]),
  );
  const hilang = dipanggil.filter((r) => !dilayani.has(r));
  benar('setiap rute yang dipanggil halaman dilayani server.mjs ' + abu('(' + dipanggil.length + ' rute)'),
    hilang.length === 0,
    'tidak dilayani: ' + hilang.join(', ') + ' — panel akan menjawab "server masih versi lama"');
}

async function kasus13(palsu) {
  console.log(tebal('\nKasus 13: piket acak — orangnya berganti, jabatannya ikut'));
  const dir = sandboxBaru('m');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'acak' });

  await kirim(k, '/nama/daftar', {
    penuh: [
      { nama: 'Bu Alis', peran: 'kabid' },
      { nama: 'Oji', peran: 'pranata_pertama' },
      { nama: 'Bu Mega', peran: 'kasi' },
      { nama: 'Odir', peran: 'statistisi' },
      { nama: 'Ijal', peran: 'teknisi' },
      { nama: 'Tendi', peran: 'analis_sistem' },
    ],
  });
  const daftar = (await json(k, '/nama/daftar')).d;
  sama('jabatan ikut tersimpan', daftar.berjabatan ?? daftar.penuh.filter((e) => e.peran).length, 6);
  sama('  mode yang berlaku', daftar.penugasan, 'acak');

  /* Satu kursi, dipakai berkali-kali oleh sesi yang datang-pergi. Di mode
     'tetap' namanya akan sama terus; di 'acak' harus berganti-ganti. Inilah
     inti keluhan "orangnya itu-itu aja". */
  const dilihat = new Map();
  let benar_nama = true;
  for (let n = 0; n < 24; n++) {
    const sesi = ('piket' + n + '-aaaaaa').slice(0, 12);
    await kirim(k, '/event', {
      hook_event_name: 'PreToolUse', session_id: sesi,
      cwd: path.join(dir, 'kantor-piket'), tool_name: 'Read', tool_input: { file_path: 'a.txt' },
    });
    await tidur(60);
    const o = (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
    benar_nama = benar_nama && Boolean(o && o.nama);
    if (o && o.nama) dilihat.set(o.nama, o.peran);
    /* Pamitnya WAJIB SessionEnd, bukan Stop: cuma session-end yang memanggil
       pegawaiLepas() dan mengosongkan kursinya. Dengan Stop, kursinya menumpuk
       sampai FORMASI_MAKS lalu sesi berikutnya jalan tanpa nama sama sekali —
       dan ujinya diam-diam menguji hal lain. */
    await kirim(k, '/event', {
      hook_event_name: 'SessionEnd', session_id: sesi,
      cwd: path.join(dir, 'kantor-piket'), tool_name: null,
    });
    await tidur(60);
  }

  benar('tiap sesi kebagian nama', benar_nama, 'ada sesi yang lahir tanpa nama');
  benar('24 sesi berturut-turut memunculkan banyak orang berbeda '
    + abu('(' + dilihat.size + ' nama)'), dilihat.size >= 4,
  'cuma ' + dilihat.size + ' nama yang pernah muncul: ' + [...dilihat.keys()].join(', '));
  benar('  semuanya dari daftar', [...dilihat.keys()].every((n) => daftar.penuh.some((e) => e.nama === n)),
    'ada nama di luar daftar: ' + [...dilihat.keys()].join(', '));

  /* "menyesuaikan tingkat pekerjaan": jabatan menempel di ORANGNYA, jadi
     siapa pun yang muncul harus membawa jabatan yang benar — bukan jabatan
     bawaan urutan kursi. */
  const petaBenar = new Map(daftar.penuh.map((e) => [e.nama, e.peran]));
  const salah = [...dilihat.entries()].filter(([n, p]) => p !== petaBenar.get(n));
  benar('  tiap orang membawa jabatannya sendiri', salah.length === 0,
    salah.map(([n, p]) => n + ' dapat ' + JSON.stringify(p) + ', harusnya ' + petaBenar.get(n)).join(' | '));

  await tutup(k);
}

async function kasus14(palsu) {
  console.log(tebal('\nKasus 14: piket acak tetap menghormati yang kamu tetapkan'));
  const dir = sandboxBaru('n');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'acak' });
  await kirim(k, '/nama/daftar', {
    penuh: [{ nama: 'Oji', peran: 'pranata_pertama' }, { nama: 'Odir', peran: 'statistisi' },
            { nama: 'Ijal', peran: 'teknisi' }, { nama: 'Tendi', peran: 'analis_sistem' }],
  });
  const proyek = path.join(dir, 'kantor-manual');
  const hook = (sesi) => kirim(k, '/event', {
    hook_event_name: 'PreToolUse', session_id: sesi,
    cwd: proyek, tool_name: 'Read', tool_input: { file_path: 'a.txt' },
  });
  await hook('manual-aaaa1');
  await tidur(150);
  await kirim(k, '/nama', { sesi: 'manual-aaaa1', nama: 'Pak Kadis' });
  await kirim(k, '/peran', { sesi: 'manual-aaaa1', peran: 'kadis' });

  const lihat = async (sesi) => (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
  sama('nama pilihanmu terpasang', (await lihat('manual-aaaa1'))?.nama, 'Pak Kadis');

  /* Undi ulang berkali-kali: kursi manual tidak boleh tergeser sekali pun,
     dan jabatan yang kamu setel sendiri juga tidak. */
  for (let n = 0; n < 5; n++) await kirim(k, '/nama/undi-ulang', {});
  const o = await lihat('manual-aaaa1');
  sama('  lima kali undi ulang tidak menggesernya', o?.nama, 'Pak Kadis');
  sama('  jabatan yang kamu setel juga tidak', o?.peran, 'kadis');

  await tutup(k);
}

async function kasus15(palsu) {
  console.log(tebal('\nKasus 15: mode tetap masih benar-benar tetap'));
  const dir = sandboxBaru('o');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'tetap' });
  await kirim(k, '/nama/daftar', {
    penuh: [{ nama: 'Oji' }, { nama: 'Odir' }, { nama: 'Ijal' }, { nama: 'Tendi' }, { nama: 'Bale' }],
  });
  sama('mode yang berlaku', (await json(k, '/nama/daftar')).d.penugasan, 'tetap');
  sama('  env mengunci saklar panel', (await json(k, '/nama/daftar')).d.penugasanTerkunci, true);

  const proyek = path.join(dir, 'kantor-tetap');
  const nama = new Set();
  for (let n = 0; n < 8; n++) {
    const sesi = ('tetap' + n + '-aaaaaa').slice(0, 12);
    await kirim(k, '/event', {
      hook_event_name: 'PreToolUse', session_id: sesi,
      cwd: proyek, tool_name: 'Read', tool_input: { file_path: 'a.txt' },
    });
    await tidur(60);
    const o = (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
    if (o) nama.add(o.nama);
    await kirim(k, '/event', { hook_event_name: 'SessionEnd', session_id: sesi, cwd: proyek, tool_name: null });
    await tidur(60);
  }
  // Kursi yang sama dipakai bergantian: di mode tetap namanya WAJIB satu-satunya
  sama('delapan sesi bergantian di kursi yang sama = satu nama saja', nama.size, 1);

  await tutup(k);
}

/* ================================================================= main === */
const palsu = await openrouterPalsu();
try {
  await kasus1(palsu);
  await kasus2(palsu);
  await kasus3(palsu);
  await kasus4(palsu);
  await kasus5(palsu);
  await kasus6(palsu);
  await kasus7(palsu);
  await kasus8(palsu);
  await kasus9(palsu);
  await kasus10();
  await kasus11(palsu);
  await kasus12();
  await kasus13(palsu);
  await kasus14(palsu);
  await kasus15(palsu);
} finally {
  await palsu.tutup();
  if (!SIMPAN) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* biarkan */ } }
  else console.log(abu('\nfolder sementara disimpan: ' + TMP));
}

console.log();
if (gagal) {
  console.log(merah(tebal('GAGAL: ' + gagal + ' dari ' + periksa + ' pemeriksaan')));
  process.exit(1);
}
console.log(hijau(tebal('LULUS: ' + periksa + ' pemeriksaan')));
