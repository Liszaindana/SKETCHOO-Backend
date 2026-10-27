// Seed misi harian SKETCHOO (idempoten, dicocokkan lewat judul).
// Jalankan dari folder SKETCHOO-Backend: node scripts/seed-missions.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');
const env = {};

for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env');
  process.exit(1);
}

const missions = [
  // Set 1
  { title: 'Menggambar apel merah', description: 'Selesaikan satu Sketch Challenge bertema buah.', activity_type: 'sketch_challenge', target_count: 1, reward_points: 20, icon_key: 'apple', sort_order: 1 },
  { title: 'Selesaikan 3 permainan', description: 'Mainkan tiga aktivitas belajar hari ini.', activity_type: 'mixed', target_count: 3, reward_points: 20, icon_key: 'games', sort_order: 2 },
  { title: 'Ubah gambar jadi cerita', description: 'Buat satu cerita dari gambarmu.', activity_type: 'story', target_count: 1, reward_points: 30, icon_key: 'story', sort_order: 3 },
  { title: 'Pakai 5 warna berbeda', description: 'Gunakan minimal lima warna saat menggambar.', activity_type: 'sketch_challenge', target_count: 5, reward_points: 25, icon_key: 'palette', sort_order: 4 },
  // Set 2
  { title: 'Kenali benda di sekitarmu', description: 'Jawab tiga soal pengenalan objek.', activity_type: 'explore', target_count: 3, reward_points: 20, icon_key: 'games', sort_order: 5 },
  { title: 'Menggambar kucing lucu', description: 'Selesaikan satu Sketch Challenge bertema hewan.', activity_type: 'sketch_challenge', target_count: 1, reward_points: 20, icon_key: 'apple', sort_order: 6 },
  { title: 'Buat cerita tentang hewan', description: 'Ubah gambarmu menjadi cerita pendek.', activity_type: 'story', target_count: 1, reward_points: 30, icon_key: 'story', sort_order: 7 },
  { title: 'Main tebak angka', description: 'Jawab tiga soal berhitung bersama SKETCHOO.', activity_type: 'explore', target_count: 3, reward_points: 20, icon_key: 'games', sort_order: 8 },
  // Set 3
  { title: 'Menggambar bunga warna-warni', description: 'Gunakan warna kesukaanmu pada satu gambar.', activity_type: 'sketch_challenge', target_count: 1, reward_points: 20, icon_key: 'palette', sort_order: 9 },
  { title: 'Pelajari bagian tubuh', description: 'Jawab tiga soal tentang mata, hidung, dan telinga.', activity_type: 'explore', target_count: 3, reward_points: 20, icon_key: 'games', sort_order: 10 },
  { title: 'Tulis cerita pendek', description: 'Buat satu cerita baru dari gambarmu.', activity_type: 'story', target_count: 1, reward_points: 30, icon_key: 'story', sort_order: 11 },
  { title: 'Selesaikan 5 permainan', description: 'Mainkan lima aktivitas belajar hari ini.', activity_type: 'mixed', target_count: 5, reward_points: 25, icon_key: 'games', sort_order: 12 },
];

const client = createClient(url, key, { auth: { persistSession: false } });

const { data: existing, error: readError } = await client
  .from('missions')
  .select('title');
if (readError) {
  console.error('Gagal membaca misi:', readError.message);
  process.exit(1);
}

const existingTitles = new Set((existing ?? []).map((row) => row.title));
const missing = missions.filter((mission) => !existingTitles.has(mission.title));

if (!missing.length) {
  console.log(`Semua ${missions.length} misi sudah ada. Tidak ada yang ditambahkan.`);
  process.exit(0);
}

const { error: insertError } = await client.from('missions').insert(missing);
if (insertError) {
  console.error('Gagal menambah misi:', insertError.message);
  process.exit(1);
}

console.log(`Ditambahkan ${missing.length} misi. Total misi: ${existingTitles.size + missing.length}.`);
