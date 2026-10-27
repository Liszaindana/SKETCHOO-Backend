/**
 * Penjadwalan misi harian.
 *
 * Misi aktif dibagi menjadi beberapa set harian berukuran tetap berdasarkan
 * `sort_order`. Set yang tampil dipilih dari tanggal, sehingga daftar misi
 * berganti setiap hari dan kembali ke set pertama setelah semua set terpakai
 * (contoh: 12 misi => 3 set => berulang setiap 3 hari).
 *
 * Progres misi dianggap milik satu hari: baris `user_mission_progress` hanya
 * dipakai bila `updated_at` jatuh pada hari berjalan. Tidak perlu cron atau
 * penghapusan data untuk "reset" harian.
 *
 * Saat alur penyelesaian misi dibuat, penulis progres harus mengecek
 * `updated_at`: bila baris berasal dari hari sebelumnya, mulai ulang
 * `progress_count`/`status` dari nol lalu perbarui `updated_at = now()`.
 */

export const DAILY_MISSION_COUNT = 4;

/** WIB (UTC+7, tanpa DST) dipakai sebagai batas hari untuk pengguna. */
export const MISSION_TIMEZONE = 'Asia/Jakarta';
const MISSION_TIMEZONE_OFFSET = '+07:00';

/** Tanggal berjalan dalam format YYYY-MM-DD menurut zona waktu misi. */
export function missionDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MISSION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Nomor hari sejak epoch, dipakai untuk memutar set misi. */
export function missionDayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** Awal hari misi dalam ISO UTC, untuk memfilter progres hari ini. */
export function missionDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00${MISSION_TIMEZONE_OFFSET}`).toISOString();
}

/** Jumlah set harian yang tersedia untuk daftar misi aktif. */
export function missionSetCount(totalMissions: number): number {
  return Math.max(1, Math.ceil(totalMissions / DAILY_MISSION_COUNT));
}

/** Set misi yang tampil pada tanggal tertentu. */
export function selectDailyMissions<T>(missions: T[], date: string): T[] {
  if (!missions.length) return [];
  const setIndex = missionDayIndex(date) % missionSetCount(missions.length);
  const start = setIndex * DAILY_MISSION_COUNT;
  return missions.slice(start, start + DAILY_MISSION_COUNT);
}
