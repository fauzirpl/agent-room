#!/usr/bin/env node
// mcp-room.mjs :: Agent Room sebagai MCP server (stdio)
//
// Arah BALIK dari semua yang lain di repo ini. Biasanya Claude Code yang
// bicara ke kantor (hook -> /event). Di sini kantornya yang bisa DITANYA oleh
// sesi Claude mana pun — "siapa yang lagi tertahan?", "sesi mana yang hidup?",
// "token hari ini berapa?" — tanpa membuka halaman. Server ini tidak menyimpan
// apa pun: tiap tool cuma satu GET ke server ruangan yang sudah jalan, lalu
// hasilnya diringkas satu kalimat Indonesia di atas JSON-nya.
//
// Yang SENGAJA tidak diekspos: pikir, ucap, prompt, isi halaman, token per-
// jalan kendali web, dan route apa pun yang bisa melahirkan/menghentikan sesi.
// Yang ada di sini murni baca metadata — sama kelasnya dengan /health.
//
// Protokol: JSON-RPC 2.0, satu pesan per baris di stdin/stdout. Log HANYA ke
// stderr — stdout adalah kanal protokol, satu baris nyasar merusak sesi.
//
// Pasang:  dinas --mcp   (mencetak perintah `claude mcp add` + JSON mcpServers)
// Alamat:  env AGENT_ROOM_URL, bawaan http://127.0.0.1:4517

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALAMAT = (process.env.AGENT_ROOM_URL || 'http://127.0.0.1:4517').trim().replace(/\/+$/, '');
const TIMEOUT_MS = 5000;

function versiPaket() {
  try { return String(JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8')).version || '0.0.0'); }
  catch { return '0.0.0'; }
}
const VERSI = versiPaket();
const log = (...a) => console.error('[mcp-room]', ...a);

/* ————— jembatan ke kantor ————— */
async function ambil(jalur) {
  const r = await fetch(ALAMAT + jalur, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    let ket = '';
    try { ket = (await r.json()).galat || ''; } catch { /* bukan JSON */ }
    const e = new Error('HTTP ' + r.status + (ket ? ' — ' + ket : ''));
    e.http = r.status;
    throw e;
  }
  return r.json();
}

const tanggalLokal = (ts = Date.now()) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};
const lama = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'baru saja' : m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' jam ' + (m % 60) + ' mnt';
};
const rb = (n) => (Number(n) || 0).toLocaleString('id-ID');

/* Server mengembalikan subperintah git urut abjad — bentuk yang stabil, dan
   itu benar untuk DATA. Untuk KALIMAT ia salah: `add`, `cat-file`, `config`
   naik duluan dan `push` tenggelam di bawah potongan lima, padahal "tadi ada
   yang commit atau push?" persis pertanyaan yang dibawa orang ke serah
   terima. Yang mengubah pohon disebut dulu; sisanya menyusul, tetap abjad. */
const GIT_PENTING = ['commit', 'push', 'merge', 'rebase', 'revert', 'reset',
  'cherry-pick', 'pull', 'stash', 'checkout', 'tag'];
const gitUrut = (a) => [
  ...GIT_PENTING.filter((g) => a.includes(g)),
  ...a.filter((g) => !GIT_PENTING.includes(g)),
];

/* ————— tools ————— */
const TOOLS = [
  {
    name: 'ruangan_siapa_tertahan',
    description: 'Sesi Claude Code yang butuh manusia (minta izin/tanya), macet karena galat, atau tugas '
      + 'yang masih antre di loket. / Sessions waiting on a human, stopped on error, or queued.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/ruangan');
      const kini = r.ts || Date.now();
      const tertahan = (r.sesi || []).filter((s) => s.butuh || s.macet).map((s) => ({
        sesi: s.sesi, nama: s.nama, proyek: s.proyek, cabang: s.cabang, mesin: s.mesin,
        keadaan: s.butuh ? 'butuh-manusia' : 'macet',
        sebab: s.butuh ? s.butuh.sebab : s.macet.jenis,
        tool: s.tool, sejakTerakhir: lama(kini - s.terakhir),
        /* Berapa lama benar-benar tertahan — bukan lagi ditebak dari kapan
           sesi terakhir bersuara. Sesi bisa terus mengirim event sambil tetap
           menunggu dijawab, jadi dua angka itu memang berbeda. */
        tertahanSelama: lama(kini - (((s.butuh || s.macet) || {}).sejak || s.terakhir)),
      }));
      const antre = r.antrean || { jumlah: 0, nama: [] };
      const ringkas = tertahan.length === 0 && antre.jumlah === 0
        ? 'Tidak ada yang tertahan: semua sesi jalan sendiri, loket disposisi kosong.'
        : `${tertahan.length} sesi tertahan (${tertahan.filter((t) => t.keadaan === 'butuh-manusia').length} butuh jawabanmu, `
          + `${tertahan.filter((t) => t.keadaan === 'macet').length} macet), ${antre.jumlah} tugas antre.`;
      return { ringkas, data: { tertahan, antrean: antre, mesin: r.mesin } };
    },
  },
  {
    name: 'ruangan_sesi_aktif',
    description: 'Daftar sesi agen yang hidup di kantor: id, proyek, cabang git, mesin, asal (vendor), '
      + 'tool terakhir, sejak kapan. / Live agent sessions with project, branch, machine, vendor, last tool, uptime.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/ruangan');
      const kini = r.ts || Date.now();
      const sesi = (r.sesi || []).map((s) => ({
        sesi: s.sesi, nama: s.nama, peran: s.peran, model: s.model,
        /* Sejauh mana sesi ini boleh bertindak tanpa bertanya. Yang penting
           bagi agen lain: sesi berkuasa penuh TIDAK akan pernah minta paraf,
           jadi diamnya bukan tanda ia sedang menunggu dijawab. */
        mode: s.mode || '', kuasa: s.kuasa || '',
        /* Sesi yang terdeteksi mandek di tempat: mengulang operasi yang sama,
           atau menyunting dua berkas bolak-balik. Nota, bukan rem. */
        putar: s.putar || '',
        /* Seberapa penuh jendela konteksnya. Orkestrator bisa tahu sesi mana
           yang sebentar lagi kehilangan ingatan — sebelum kompaksi terjadi. */
        konteks: s.konteks ? { pakai: s.konteks.pakai, jendela: s.konteks.jendela, persen: Math.round(s.konteks.rasio * 100) } : null,
        proyek: s.proyek, cabang: s.cabang, mesin: s.mesin,
        /* Vendor agennya. 'claude' untuk yang bawaan; agen lain perlu tahu ini
           karena pegawai honorer TIDAK punya balon pikiran maupun kalimat —
           transkripnya sengaja tidak dibaca. Diamnya bukan tanda ia berhenti. */
        asal: s.asal || 'claude',
        toolTerakhir: s.tool, kind: s.kind,
        sejak: new Date(s.sejak).toISOString(), lamaHidup: lama(kini - s.sejak),
        terakhir: lama(kini - s.terakhir) + ' lalu',
        keadaan: s.butuh ? 'butuh-manusia' : s.macet ? 'macet' : (s.kind === 'stop' ? 'menganggur' : 'bekerja'),
      }));
      const proyek = [...new Set(sesi.map((s) => s.proyek).filter(Boolean))];
      // vendor disebut hanya kalau memang ada yang bukan bawaan
      const honorer = sesi.filter((s) => s.asal !== 'claude').length;
      const ringkas = sesi.length === 0 ? 'Kantor sepi: tidak ada sesi yang hidup.'
        : `${sesi.length} sesi hidup di ${proyek.length} proyek (${proyek.slice(0, 5).join(', ')}${proyek.length > 5 ? ', …' : ''})`
          + (honorer ? `, ${honorer} di antaranya bukan Claude` : '')
          + `; ${r.viewers || 0} halaman menonton.`;
      return { ringkas, data: { sesi, jalan: r.jalan, viewers: r.viewers, mesin: r.mesin } };
    },
  },
  {
    name: 'ruangan_token_hari_ini',
    description: 'Pemakaian token hari ini: total dan rincian per proyek, plus total sepanjang masa. '
      + '/ Today\'s token usage, total and per project, plus all-time total.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/token-riwayat');
      const hariIni = tanggalLokal();
      const h = (r.harian || []).find((x) => x.tanggal === hariIni)
        || { tanggal: hariIni, input: 0, output: 0, cacheTulis: 0, cacheBaca: 0, proyek: {} };
      const perProyek = Object.entries(h.proyek || {})
        .map(([nama, v]) => ({ nama, input: v.input || 0, output: v.output || 0 }))
        .sort((a, b) => (b.input + b.output) - (a.input + a.output));
      const ringkas = `Hari ini ${rb(h.input)} token masuk + ${rb(h.output)} keluar`
        + (perProyek.length ? ` di ${perProyek.length} proyek (terbesar: ${perProyek[0].nama})` : ', belum ada yang tercatat')
        + `; sepanjang masa ${rb((r.total || {}).input)} masuk + ${rb((r.total || {}).output)} keluar.`;
      return {
        ringkas,
        data: {
          tanggal: hariIni,
          hariIni: { input: h.input, output: h.output, cacheTulis: h.cacheTulis, cacheBaca: h.cacheBaca },
          perProyek, total: r.total, tercatatSejak: r.sejak ? new Date(r.sejak).toISOString() : null,
        },
      };
    },
  },
  {
    name: 'ruangan_agenda_cari',
    description: 'Cari buku agenda (log event metadata, simpan 30 hari): kata kunci, proyek, sesi, rentang '
      + 'tanggal YYYY-MM-DD. Terbaru dulu. / Search the daily activity log by keyword, project, session, date range.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'kata kunci: dicocokkan ke label, tool, kind, proyek' },
        proyek: { type: 'string', description: 'nama folder proyek (basename cwd)' },
        sesi: { type: 'string', description: 'id sesi 12 karakter' },
        kind: { type: 'string', description: 'jenis event: pre, post, prompt, stop, izin-minta, …' },
        dari: { type: 'string', description: 'YYYY-MM-DD, bawaan hari ini' },
        sampai: { type: 'string', description: 'YYYY-MM-DD, bawaan = dari' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'bawaan 50' },
      },
      additionalProperties: false,
    },
    async jalankan(p = {}) {
      const q = new URLSearchParams();
      for (const k of ['q', 'proyek', 'sesi', 'kind', 'dari', 'sampai']) if (p[k]) q.set(k, String(p[k]));
      q.set('limit', String(Math.min(500, Math.max(1, Number(p.limit) || 50))));
      const r = await ambil('/agenda?' + q.toString());
      const baris = (r.baris || []).map((b) => ({
        waktu: new Date(b.ts).toISOString(), sesi: b.session, proyek: b.cwd, cabang: b.cabang,
        kind: b.kind, tool: b.tool, label: b.label, ok: b.ok, nama: b.nama,
      }));
      const ringkas = baris.length === 0
        ? `Tidak ada baris agenda yang cocok untuk ${r.dari}${r.sampai !== r.dari ? '–' + r.sampai : ''}.`
        : `${baris.length} baris agenda (${r.dari}${r.sampai !== r.dari ? '–' + r.sampai : ''}), terbaru ${baris[0].waktu}.`;
      return { ringkas, data: { dari: r.dari, sampai: r.sampai, jumlah: r.jumlah, baris } };
    },
  },
  {
    name: 'ruangan_pohon_delegasi',
    description: 'Siapa mendelegasikan ke siapa saat ini: sesi induk beserta subagent yang masih '
      + 'hidup di bawahnya, berapa lama, berapa tool, dan mana yang sudah lama diam. '
      + '/ Live delegation tree: parent sessions and the subagents still running under them.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/ruangan');
      const kini = r.ts || Date.now();
      const pohon = (r.sesi || []).filter((s) => (s.peserta || []).length).map((s) => ({
        sesi: s.sesi, nama: s.nama, proyek: s.proyek, cabang: s.cabang,
        /* Induk yang sudah `stop` tapi masih punya peserta BUKAN menganggur —
           subagent memang dijalankan di latar. Menjawab 'menganggur' di sini
           akan membohongi agen yang bertanya. */
        indukKeadaan: s.kind === 'stop' ? 'menunggu peserta' : 'bekerja',
        peserta: (s.peserta || []).map((p) => ({
          agen: p.agen || '(tanpa nama)',
          lamaHidup: lama(kini - p.sejak),
          terakhir: lama(kini - p.terakhir) + ' lalu',
          toolTerakhir: p.tool || '',
          toolN: p.toolN, gagal: p.gagal, diam: p.diam,
        })),
      }));
      const d = r.delegasi || { hidup: 0, diam: 0, induk: 0 };
      const ringkas = d.hidup === 0
        ? 'Tidak ada delegasi berjalan: semua sesi bekerja sendiri.'
        : `${d.induk} sesi mendelegasikan ${d.hidup} agen`
          + (d.diam ? `, ${d.diam} di antaranya diam >10 mnt` : '') + '. '
          + pohon.slice(0, 3).map((s) => `${s.nama || s.sesi}${s.proyek ? ' (' + s.proyek + ')' : ''} → `
            + s.peserta.map((p) => `${p.agen} ${p.lamaHidup}`).join(', ')).join('; ');
      return { ringkas, data: { pohon, delegasi: d, mesin: r.mesin } };
    },
  },
  {
    name: 'ruangan_skp',
    description: 'Papan SKP: nilai mutu 0–100 per proyek dan per sesi dalam satu rentang tanggal, '
      + 'beserta indikator yang membentuknya (rasio gagal, bolak-balik, tertahan, gagal beruntun, '
      + 'rapat yatim) dan bobot yang dipakai. Angka saja — tidak ada isi kerja. '
      + '/ Quality scoreboard: 0-100 per project and session, with the behaviour indicators behind it.',
    inputSchema: {
      type: 'object',
      properties: {
        dari: { type: 'string', description: 'YYYY-MM-DD, bawaan 6 hari sebelum `sampai`' },
        sampai: { type: 'string', description: 'YYYY-MM-DD, bawaan hari ini' },
        proyek: { type: 'string', description: 'saring ke satu nama folder proyek' },
      },
      additionalProperties: false,
    },
    async jalankan(p = {}) {
      const q = new URLSearchParams();
      for (const k of ['dari', 'sampai']) if (p[k]) q.set(k, String(p[k]));
      const r = await ambil('/skp' + (q.toString() ? '?' + q.toString() : ''));
      /* Penyaringan proyek dilakukan DI SINI, bukan lewat parameter rute baru:
         /skp memang tidak punya `proyek`, dan menambahnya cuma untuk MCP berarti
         permukaan server baru yang harus dijaga uji sendiri. Rentangnya sudah
         dibatasi rute, jadi yang dibuang di sini cuma baris. */
      const saring = String(p.proyek || '').trim();
      const proyek = saring ? (r.proyek || []).filter((x) => x.nama === saring) : (r.proyek || []);
      const namaProyek = new Set(proyek.map((x) => x.nama));
      const sesi = saring ? (r.sesi || []).filter((x) => namaProyek.has(x.proyek)) : (r.sesi || []);
      const bernilai = proyek.filter((x) => x.nama && x.nilai != null);
      const terburuk = bernilai.slice().sort((a, b) => a.nilai - b.nilai)[0];
      const ringkas = proyek.length === 0
        ? `Tidak ada yang tercatat ${r.rentang.dari}–${r.rentang.sampai}`
          + (saring ? ` untuk proyek ${saring}.` : '.')
        : `${proyek.length} proyek, ${sesi.length} sesi (${r.rentang.dari}–${r.rentang.sampai}). `
          + (terburuk
            ? `Nilai terendah: ${terburuk.nama} ${terburuk.nilai}/100`
              + ` (gagal ${terburuk.rasioGagalBersih}%, bolak-balik `
              + (terburuk.bolakBalikRasio == null ? 'tidak terukur' : terburuk.bolakBalikRasio + '%')
              + `, beruntun ${terburuk.gagalBeruntunMaks}).`
            : 'Belum ada sumbu yang bisa dinilai di rentang ini.');
      return {
        ringkas,
        data: {
          rentang: r.rentang,
          bobot: r.bobot, jenuh: r.jenuh, bolakBalikDasar: r.bolakBalikDasar,
          jendelaUlang: r.jendelaUlang, ulangMin: r.ulangMin,
          proyek: proyek.map((x) => ({
            nama: x.nama, nilai: x.nilai, bobotDipakai: x.bobotDipakai,
            sesi: x.sesi, toolCall: x.toolCall,
            rasioGagalBersih: x.rasioGagalBersih, bolakBalikRasio: x.bolakBalikRasio,
            tertahanPer100: x.tertahanPer100, gagalBeruntunMaks: x.gagalBeruntunMaks,
            rapatYatimRasio: x.rapatYatimRasio,
            // keterangan tanpa bobot; server yang memutuskan, bukan tool ini
            interupsi: x.interupsi, lamaTertahan: x.lamaTertahan, toolPerPrompt: x.toolPerPrompt,
          })),
          sesi: sesi.slice(0, 40).map((x) => ({
            sesi: x.sesi, proyek: x.proyek, cabang: x.cabang, model: x.model,
            nilai: x.nilai, bobotDipakai: x.bobotDipakai, toolCall: x.toolCall,
            rasioGagalBersih: x.rasioGagalBersih, bolakBalikRasio: x.bolakBalikRasio,
            tertahanPer100: x.tertahanPer100, gagalBeruntunMaks: x.gagalBeruntunMaks,
            rapatYatimRasio: x.rapatYatimRasio,
          })),
        },
      };
    },
  },
  {
    name: 'ruangan_serah_terima',
    description: 'Catatan serah terima satu proyek: sesi mana saja yang menyentuh folder itu beberapa jam '
      + 'terakhir, berkas apa yang disunting, berapa tool yang gagal, subperintah git apa yang dipakai, '
      + 'dan siapa yang masih tertahan. Dibaca dari buku agenda — sepenuhnya deterministik, nol jaringan '
      + 'keluar. Bacalah SEBELUM mulai bekerja di folder yang dipakai bersama. '
      + '/ Shift handover for one project: who touched it, which files, what failed, who is still stuck.',
    inputSchema: {
      type: 'object',
      properties: {
        proyek: { type: 'string', description: 'nama folder proyek; jalur lengkap juga diterima (diambil nama akhirnya)' },
        jam: { type: 'number', description: 'jendela mundur dalam jam, 1–24, bawaan 8' },
      },
      required: ['proyek'],
      additionalProperties: false,
    },
    async jalankan(p = {}) {
      const q = new URLSearchParams({ proyek: String(p.proyek || '') });
      if (p.jam != null) q.set('jam', String(p.jam));
      const r = await ambil('/serah-terima?' + q.toString());
      const k = r.ringkas;
      /* Kalimatnya dirangkai di sini, bukan di server: server memberi ANGKA,
         klien memutuskan bagaimana membacakannya. Tidak ada LLM — yang
         dibutuhkan sesi yang baru masuk bukan prosa, melainkan tahu apakah
         ada orang lain di folder ini dan apakah ada yang menggantung. */
      let ringkas;
      if (!k.sesi) {
        ringkas = `Tidak ada sesi yang menyentuh ${r.proyek} dalam ${r.jam} jam terakhir.`;
      } else {
        const bagian = [];
        if (k.berkas) bagian.push(`${k.berkas} berkas disunting`);
        if (k.toolCall) bagian.push(`${rb(k.toolCall)} tool call`);
        if (k.gagal) bagian.push(`${k.gagal} gagal`);
        if (k.git.length) bagian.push('git ' + gitUrut(k.git).slice(0, 5).join('/'));
        ringkas = `${k.sesi} sesi menyentuh ${r.proyek} dalam ${r.jam} jam terakhir`
          + (bagian.length ? ': ' + bagian.join(', ') : '')
          + '. ' + (k.hidup ? `${k.hidup} masih hidup` : 'Semuanya sudah selesai')
          + (k.tertahan ? `, ${k.tertahan} tertahan` : '') + '.';
        const nunggu = (r.sesi || []).filter((x) => x.tertahan);
        if (nunggu.length) {
          ringkas += ' Tertahan: ' + nunggu.slice(0, 3).map((x) =>
            `${x.nama || x.sesi} (${x.tertahan.sebab}${x.tertahan.sejak ? ', ' + lama(Date.now() - x.tertahan.sejak) : ''})`
          ).join(', ') + '.';
        }
      }
      return { ringkas, data: r };
    },
  },
  {
    name: 'ruangan_kesehatan',
    description: 'Server ruangan hidup atau tidak: jumlah event, penonton, port. / Health of the room server.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/health');
      const ringkas = r.ok
        ? `Kantor buka di ${ALAMAT}: ${rb(r.events)} event tercatat, ${r.viewers} penonton, port ${r.port}.`
        : `Kantor menjawab, tapi ok=false.`;
      return { ringkas, data: r };
    },
  },
];
const PETA_TOOL = new Map(TOOLS.map((t) => [t.name, t]));

/* ————— JSON-RPC ————— */
const kirim = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const jawab = (id, result) => kirim({ jsonrpc: '2.0', id, result });
const galat = (id, code, message) => kirim({ jsonrpc: '2.0', id, error: { code, message } });

async function panggilTool(nama, args) {
  const t = PETA_TOOL.get(nama);
  if (!t) return { content: [{ type: 'text', text: 'tool tidak dikenal: ' + nama }], isError: true };
  try {
    const { ringkas, data } = await t.jalankan(args || {});
    return { content: [{ type: 'text', text: ringkas + '\n' + JSON.stringify(data) }] };
  } catch (err) {
    if (err && err.http) {
      // kantornya hidup, permintaannya yang ditolak — jangan menuduh servernya mati
      return { content: [{ type: 'text', text: 'Kantor menolak permintaan: ' + err.message }], isError: true };
    }
    const sebab = err && (err.name === 'TimeoutError' ? 'lewat ' + TIMEOUT_MS / 1000 + ' dtk'
      : err.cause && err.cause.code ? err.cause.code : err.message);
    return {
      content: [{ type: 'text', text: `Kantor tidak bisa dihubungi di ${ALAMAT} (${sebab}). `
        + 'Pastikan `dinas` sedang jalan; alamat lain lewat env AGENT_ROOM_URL.' }],
      isError: true,
    };
  }
}

async function tangani(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
  const { id, method, params } = msg;
  const adaId = id !== undefined && id !== null;
  if (typeof method !== 'string') { if (adaId) galat(id, -32600, 'permintaan tidak sah'); return; }
  if (method.startsWith('notifications/')) return;         // termasuk notifications/initialized
  /* Tanpa `id` sebuah pesan adalah NOTIFIKASI menurut JSON-RPC 2.0, dan
     notifikasi tidak boleh dijawab. Dulu keempat cabang di bawah memanggil
     jawab(id, …) tanpa memeriksa ini, jadi `{"jsonrpc":"2.0","method":"ping"}`
     menghasilkan `{"jsonrpc":"2.0","result":{}}` — respons tanpa `id`, tidak
     sah, dan klien yang ketat berhak memutus sesi karenanya. Dijaga
     `uji-mcp.mjs`. */
  if (!adaId) return;
  switch (method) {
    case 'initialize':
      jawab(id, {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-room', version: VERSI },
        instructions: 'Tanya kantor dinas Agent Room: sesi Claude Code yang hidup, yang tertahan, token hari ini, '
          + 'dan buku agenda. Semua hanya-baca, metadata saja.',
      });
      return;
    case 'ping':
      jawab(id, {});
      return;
    case 'tools/list':
      jawab(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      return;
    case 'tools/call':
      jawab(id, await panggilTool(params && params.name, params && params.arguments));
      return;
    default:
      if (adaId) galat(id, -32601, 'method tidak dikenal: ' + method);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let antre = Promise.resolve();
rl.on('line', (baris) => {
  const t = baris.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); }
  catch { galat(null, -32700, 'JSON tidak bisa diurai'); return; }
  // berurutan supaya jawaban tidak saling mendahului untuk klien yang mengharapkannya
  antre = antre.then(() => tangani(msg)).catch((e) => log('galat menangani pesan:', e && e.message));
});
rl.on('close', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
log('agent-room MCP siap, kantor di ' + ALAMAT);
