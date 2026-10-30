import { describe, expect, it } from 'vitest';
import { calculateSketchReward } from './sketch-reward.js';

describe('calculateSketchReward', () => {
  it('3 bintang: stroke >= 4 DAN durasi >= 5 detik', () => {
    const res = calculateSketchReward(4, 0, 5);
    expect(res.stars).toBe(3);
    expect(res.score).toBe(20);
    expect(res.feedback).toBe('Wah, hebat sekali! Kamu berhasil!');
  });

  it('tidak 3 bintang jika stroke cukup tapi durasi kurang', () => {
    const res = calculateSketchReward(5, 0, 2);
    expect(res.stars).toBeLessThan(3);
  });

  it('tidak 3 bintang jika durasi cukup tapi stroke kurang', () => {
    const res = calculateSketchReward(2, 0, 10);
    expect(res.stars).toBeLessThan(3);
  });

  it('2 bintang: stroke >= 2 (durasi kurang)', () => {
    const res = calculateSketchReward(2, 0, 1);
    expect(res.stars).toBe(2);
    expect(res.score).toBe(15);
    expect(res.feedback).toBe('Bagus sekali! Gambarmu makin rapi!');
  });

  it('2 bintang: durasi >= 3 (stroke kurang)', () => {
    const res = calculateSketchReward(1, 0, 3);
    expect(res.stars).toBe(2);
    expect(res.score).toBe(15);
  });

  it('1 bintang: tap sebentar / coretan acak', () => {
    const res = calculateSketchReward(1, 9999, 1);
    expect(res.stars).toBe(1);
    expect(res.score).toBe(10);
    expect(res.feedback).toContain('Keren!');
  });

  it('1 bintang: input nol semua', () => {
    const res = calculateSketchReward(0, 0, 0);
    expect(res.stars).toBe(1);
    expect(res.score).toBe(10);
  });

  it('total_points tidak mempengaruhi hasil (diabaikan)', () => {
    // ribuan poin tapi stroke & durasi rendah → tetap 1 bintang
    const res = calculateSketchReward(1, 100000, 0);
    expect(res.stars).toBe(1);
  });
});
