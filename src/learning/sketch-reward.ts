export interface SketchReward {
  stars: 1 | 2 | 3;
  score: 10 | 15 | 20;
  feedback: string;
}

/**
 * Aturan skor & bintang ramah anak TK/PAUD (usia 4–6 tahun).
 *
 * Parameter berbasis usaha (effort) — stroke_count & duration_seconds:
 * - 3 Bintang (+20 skor): stroke >= 4 DAN durasi >= 5 detik. Usaha penuh.
 * - 2 Bintang (+15 skor): stroke 2–3 atau durasi 3–4 detik. Ada usaha.
 * - 1 Bintang (+10 skor): lainnya (tap sebentar/acak). Tetap dapat reward.
 */
export function calculateSketchReward(
  strokeCount: number,
  totalPoints: number,
  durationSeconds: number = 0,
): SketchReward {
  const strokes = Math.max(0, Number(strokeCount) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);

  if (strokes >= 4 && duration >= 5) {
    return {
      stars: 3,
      score: 20,
      feedback: 'Wah, hebat sekali! Kamu berhasil!',
    };
  }

  if (strokes >= 2 || duration >= 3) {
    return {
      stars: 2,
      score: 15,
      feedback: 'Bagus sekali! Gambarmu makin rapi!',
    };
  }

  return {
    stars: 1,
    score: 10,
    feedback: 'Keren! Ayo terus berlatih menggambar!',
  };
}
