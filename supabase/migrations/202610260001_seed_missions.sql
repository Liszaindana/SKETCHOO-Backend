-- Misi harian SKETCHOO: 12 misi = 3 set x 4 misi.
-- Backend menampilkan satu set per hari berdasarkan `sort_order`, sehingga
-- set berganti setiap hari dan berulang setiap 3 hari. Progres dianggap
-- "reset" tiap hari karena hanya progres hari berjalan yang dihitung.
--
-- Idempoten: hanya menambah misi yang judulnya belum ada, jadi aman
-- dijalankan berulang kali.
insert into public.missions (
  title,
  description,
  activity_type,
  target_count,
  reward_points,
  icon_key,
  sort_order
)
select
  seed.title,
  seed.description,
  seed.activity_type,
  seed.target_count,
  seed.reward_points,
  seed.icon_key,
  seed.sort_order
from (
  values
    -- Set 1
    (
      'Menggambar apel merah',
      'Selesaikan satu Sketch Challenge bertema buah.',
      'sketch_challenge',
      1,
      20,
      'apple',
      1
    ),
    (
      'Selesaikan 3 permainan',
      'Mainkan tiga aktivitas belajar hari ini.',
      'mixed',
      3,
      20,
      'games',
      2
    ),
    (
      'Ubah gambar jadi cerita',
      'Buat satu cerita dari gambarmu.',
      'story',
      1,
      30,
      'story',
      3
    ),
    (
      'Pakai 5 warna berbeda',
      'Gunakan minimal lima warna saat menggambar.',
      'sketch_challenge',
      5,
      25,
      'palette',
      4
    ),
    -- Set 2
    (
      'Kenali benda di sekitarmu',
      'Jawab tiga soal pengenalan objek.',
      'explore',
      3,
      20,
      'games',
      5
    ),
    (
      'Menggambar kucing lucu',
      'Selesaikan satu Sketch Challenge bertema hewan.',
      'sketch_challenge',
      1,
      20,
      'apple',
      6
    ),
    (
      'Buat cerita tentang hewan',
      'Ubah gambarmu menjadi cerita pendek.',
      'story',
      1,
      30,
      'story',
      7
    ),
    (
      'Main tebak angka',
      'Jawab tiga soal berhitung bersama SKETCHOO.',
      'explore',
      3,
      20,
      'games',
      8
    ),
    -- Set 3
    (
      'Menggambar bunga warna-warni',
      'Gunakan warna kesukaanmu pada satu gambar.',
      'sketch_challenge',
      1,
      20,
      'palette',
      9
    ),
    (
      'Pelajari bagian tubuh',
      'Jawab tiga soal tentang mata, hidung, dan telinga.',
      'explore',
      3,
      20,
      'games',
      10
    ),
    (
      'Tulis cerita pendek',
      'Buat satu cerita baru dari gambarmu.',
      'story',
      1,
      30,
      'story',
      11
    ),
    (
      'Selesaikan 5 permainan',
      'Mainkan lima aktivitas belajar hari ini.',
      'mixed',
      5,
      25,
      'games',
      12
    )
) as seed(title, description, activity_type, target_count, reward_points, icon_key, sort_order)
where not exists (
  select 1
  from public.missions as mission
  where mission.title = seed.title
);
