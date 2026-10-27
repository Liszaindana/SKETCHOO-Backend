import { describe, expect, it } from 'vitest';
import {
  DAILY_MISSION_COUNT,
  missionDate,
  missionDayIndex,
  missionDayStartIso,
  missionSetCount,
  selectDailyMissions,
} from './mission-schedule.js';

const missions = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));

describe('mission-schedule', () => {
  it('memakai tanggal WIB, bukan UTC', () => {
    // 26 Okt 2026 18:30 UTC = 27 Okt 2026 01:30 WIB.
    expect(missionDate(new Date('2026-10-26T18:30:00Z'))).toBe('2026-10-27');
    expect(missionDate(new Date('2026-10-26T16:59:00Z'))).toBe('2026-10-26');
  });

  it('menghitung awal hari misi dalam UTC', () => {
    expect(missionDayStartIso('2026-10-26')).toBe('2026-10-25T17:00:00.000Z');
  });

  it('memutar 3 set misi harian dan mengulang setelah 3 hari', () => {
    const day1 = selectDailyMissions(missions, '2026-10-26').map((m) => m.id);
    const day2 = selectDailyMissions(missions, '2026-10-27').map((m) => m.id);
    const day3 = selectDailyMissions(missions, '2026-10-28').map((m) => m.id);
    const day4 = selectDailyMissions(missions, '2026-10-29').map((m) => m.id);

    // Tiap hari mendapat set berukuran 4 dan tidak ada set yang sama.
    for (const day of [day1, day2, day3]) {
      expect(day).toHaveLength(DAILY_MISSION_COUNT);
    }
    expect(new Set([day1.join(), day2.join(), day3.join()]).size).toBe(3);
    // Set pertama kembali muncul di hari keempat.
    expect(day4).toEqual(day1);
  });

  it('memilih set yang berbeda pada hari berurutan', () => {
    const first = selectDailyMissions(missions, '2026-10-26');
    const second = selectDailyMissions(missions, '2026-10-27');
    expect(first[0].id).not.toBe(second[0].id);
  });

  it('tidak error saat daftar misi kosong atau kurang dari satu set', () => {
    expect(selectDailyMissions([], '2026-10-26')).toEqual([]);
    expect(missionSetCount(0)).toBe(1);

    const two = selectDailyMissions([{ id: 1 }, { id: 2 }], '2026-10-26');
    expect(two).toHaveLength(2);
    expect(two).toHaveLength(Math.min(DAILY_MISSION_COUNT, 2));
  });

  it('nomor hari naik satu untuk tanggal berurutan', () => {
    expect(missionDayIndex('2026-10-27') - missionDayIndex('2026-10-26')).toBe(1);
  });
});
