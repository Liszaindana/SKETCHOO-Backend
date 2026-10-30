import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { SupabaseAdminService } from '../common/supabase/supabase-admin.service.js';
import type {
  CompleteSketchChallengeDto,
  CursorPageQueryDto,
  ExploreQuestionQueryDto,
  HistoryQueryDto,
  MissionListQueryDto,
  SketchTemplateQueryDto,
  SubmitExploreAttemptDto,
} from './dto/learner-query.dto.js';
import { calculateSketchReward } from './sketch-reward.js';
import {
  DAILY_MISSION_COUNT,
  missionDate,
  missionDayStartIso,
  selectDailyMissions,
} from './mission-schedule.js';

const EXPLORE_POINTS = 5;
const EXPLORE_ACTIVITIES = [
  {
    key: 'object_recognition',
    title: 'Pengenalan Objek',
    description: 'Kenali benda di sekitarmu',
  },
  {
    key: 'body_parts',
    title: 'Bagian Tubuh',
    description: 'Kenali mata, hidung, dan telinga',
  },
  {
    key: 'counting',
    title: 'Berhitung',
    description: 'Hitung benda bersama SKETCHOO',
  },
] as const;

type HistoryCursor = { created_at: string; id: string };
type HistoryItem = {
  id: string;
  type: 'sketch' | 'explore' | 'story';
  title: string;
  summary: string;
  score: number | null;
  created_at: string;
};

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly supabase: SupabaseAdminService) {}

  async dashboard(user: AuthUser) {
    this.requireLearner(user);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const missionDayStart = missionDayStartIso(missionDate());
    const db = this.supabase.getClient();
    const [sketches, attempts, stories, completedMissions, missionPage, points] =
      await Promise.all([
        db.from('sketch_submissions').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('created_at', todayIso),
        db.from('explore_attempts').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('created_at', todayIso),
        db.from('stories').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'completed').gte('created_at', todayIso),
        db.from('user_mission_progress').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'completed').gte('updated_at', missionDayStart),
        this.listMissions(user, { limit: 3 }),
        db.from('explore_attempts').select('points_awarded').eq('user_id', user.id),
      ]);
    this.throwOnError(sketches.error, 'dashboard-sketch-count');
    this.throwOnError(attempts.error, 'dashboard-explore-count');
    this.throwOnError(stories.error, 'dashboard-story-count');
    this.throwOnError(completedMissions.error, 'dashboard-mission-count');
    this.throwOnError(points.error, 'dashboard-points');

    const completedToday = (sketches.count ?? 0) + (attempts.count ?? 0) + (stories.count ?? 0);
    return {
      greeting_name: this.displayName(user),
      daily_adventure: {
        completed_activities: completedToday,
        description: `Kamu sudah menyelesaikan ${completedToday} permainan hari ini`,
      },
      feature_cards: [
        { key: 'sketch_challenge', title: 'Sketch Challenge', description: 'Latih motorik halusmu', route: '/sketch-challenge' },
        { key: 'explore', title: 'Jelajah Cilik', description: 'Kenali benda di sekitarmu', route: '/explore' },
        { key: 'sketch_to_story', title: 'Sketch-to-Story', description: 'Ubah gambarmu jadi cerita', route: '/sketch-to-story' },
      ],
      missions: missionPage.items,
      stats: {
        completed_missions: completedMissions.count ?? 0,
        total_points: (points.data ?? []).reduce((sum, row) => sum + (row.points_awarded ?? 0), 0),
        stories_created: await this.countStories(user.id),
        sketches_completed: await this.countSketches(user.id),
      },
    };
  }

  async listMissions(user: AuthUser, query: MissionListQueryDto) {
    this.requireLearner(user);
    const db = this.supabase.getClient();
    const limit = query.limit ?? DAILY_MISSION_COUNT;
    const date = missionDate();
    const dayStart = missionDayStartIso(date);

    // Daftar misi adalah konten kurasi berukuran kecil, jadi diambil sekaligus
    // lalu dipecah menjadi set harian sesuai `sort_order`.
    const { data, error } = await db
      .from('missions')
      .select('id, title, description, activity_type, target_count, reward_points, icon_key, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(200);
    this.throwOnError(error, 'mission-list');

    const daily = selectDailyMissions(data ?? [], date).slice(0, limit);
    const progress = new Map<string, { progress_count?: number; status?: string; completed_at?: string | null }>();
    if (daily.length) {
      // Hanya progres hari ini yang dihitung; misi otomatis "reset" tiap hari.
      const { data: progressRows, error: progressError } = await db.from('user_mission_progress')
        .select('mission_id, progress_count, status, completed_at')
        .eq('user_id', user.id)
        .in('mission_id', daily.map((mission) => mission.id))
        .gte('updated_at', dayStart);
      this.throwOnError(progressError, 'mission-progress-list');
      for (const row of progressRows ?? []) {
        progress.set(row.mission_id as string, row);
      }
    }

    const items = daily
      .map((mission) => {
        const saved = progress.get(mission.id);
        return {
          id: mission.id,
          title: mission.title,
          description: mission.description,
          activity_type: mission.activity_type,
          progress: saved?.progress_count ?? 0,
          target: mission.target_count,
          reward_points: mission.reward_points,
          status: saved?.status ?? 'not_started',
          icon_key: mission.icon_key,
          completed_at: saved?.completed_at ?? null,
        };
      })
      .filter((item) => !query.status || item.status === query.status);

    return { items, mission_date: date, next_cursor: null };
  }

  async listSketchTemplates(user: AuthUser, query: SketchTemplateQueryDto) {
    this.requireLearner(user);
    let request = this.supabase.getClient().from('sketch_templates')
      .select('id, title, category, image_url, difficulty')
      .eq('is_active', true).order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    if (query.category) request = request.eq('category', query.category.trim());
    if (query.difficulty) request = request.eq('difficulty', query.difficulty);
    const { data, error } = await request;
    this.throwOnError(error, 'sketch-template-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async listSketchSubmissions(user: AuthUser, query: CursorPageQueryDto) {
    this.requireLearner(user);
    let request = this.supabase.getClient().from('sketch_submissions')
      .select('id, template_id, image_url, similarity_score, feedback, created_at')
      .eq('user_id', user.id).order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'sketch-submission-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  exploreActivities(user: AuthUser) {
    this.requireLearner(user);
    return { items: EXPLORE_ACTIVITIES };
  }

  async listExploreQuestions(user: AuthUser, query: ExploreQuestionQueryDto) {
    this.requireLearner(user);
    let request = this.supabase.getClient().from('explore_questions')
      .select('id, activity_type, prompt, options, image_url, difficulty')
      .eq('is_active', true).eq('activity_type', query.activity_type)
      .order('id', { ascending: true }).limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    if (query.difficulty) request = request.eq('difficulty', query.difficulty);
    const { data, error } = await request;
    this.throwOnError(error, 'explore-question-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async submitExploreAttempt(user: AuthUser, input: SubmitExploreAttemptDto) {
    this.requireLearner(user);
    const db = this.supabase.getClient();
    const { data: question, error: questionError } = await db.from('explore_questions')
      .select('id, prompt, options, correct_answer')
      .eq('id', input.question_id).eq('is_active', true).maybeSingle();
    this.throwOnError(questionError, 'explore-attempt-question');
    if (!question) throw new NotFoundException('Soal tidak ditemukan atau tidak aktif.');

    const answer = input.answer.trim();
    const isCorrect = answer === question.correct_answer;
    const pointsAwarded = isCorrect ? EXPLORE_POINTS : 0;
    const options = Array.isArray(question.options) ? question.options as Array<{ key?: string; label?: string }> : [];
    const correctAnswerLabel = options.find((option) => option.key === question.correct_answer)?.label ?? null;
    const { data, error } = await db.from('explore_attempts').insert({
      user_id: user.id,
      question_id: question.id,
      answer,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
    }).select('id, created_at').single();
    this.throwOnError(error, 'explore-attempt-create');
    if (!data) throw new ServiceUnavailableException('Jawaban tidak berhasil disimpan.');
    return {
      attempt_id: data.id,
      is_correct: isCorrect,
      feedback: isCorrect ? 'Hebat! Jawabanmu benar.' : 'Belum tepat. Coba lagi di permainan berikutnya.',
      points_awarded: pointsAwarded,
      correct_answer_label: correctAnswerLabel,
      created_at: data.created_at,
    };
  }

  async listStories(user: AuthUser, query: CursorPageQueryDto) {
    this.requireLearner(user);
    let request = this.supabase.getClient().from('stories')
      .select('id, status, title, detected_object, image_url, created_at')
      .eq('user_id', user.id).order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'story-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async getStory(user: AuthUser, storyId: string) {
    this.requireLearner(user);
    const { data, error } = await this.supabase.getClient().from('stories')
      .select('id, status, title, story_text, detected_object, image_url, created_at')
      .eq('id', storyId).eq('user_id', user.id).maybeSingle();
    this.throwOnError(error, 'story-get');
    if (!data) throw new NotFoundException('Cerita tidak ditemukan atau tidak dapat diakses.');
    return data;
  }

  async history(user: AuthUser, query: HistoryQueryDto) {
    this.requireLearner(user);
    const cursor = this.decodeHistoryCursor(query.cursor);
    const types = query.type ? [query.type] : ['sketch', 'explore', 'story'] as const;
    const pages = await Promise.all(types.map((type) => this.historyPage(user.id, type, query.limit ?? 25, cursor)));
    const all = pages.flat().sort((left, right) =>
      right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    );
    const hasMore = all.length > (query.limit ?? 25);
    const items = hasMore ? all.slice(0, query.limit ?? 25) : all;
    const last = items.at(-1);
    return {
      items,
      next_cursor: hasMore && last
        ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id }), 'utf8').toString('base64url')
        : null,
    };
  }

  async progressSummary(user: AuthUser) {
    this.requireLearner(user);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const missionDayStart = missionDayStartIso(missionDate());
    const [sketchCount, storyCount, completedMissions, points] = await Promise.all([
      this.countSketches(user.id),
      this.countStories(user.id),
      this.supabase.getClient().from('user_mission_progress').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('status', 'completed').gte('updated_at', missionDayStart),
      this.supabase.getClient().from('explore_attempts').select('points_awarded').eq('user_id', user.id),
    ]);
    this.throwOnError(completedMissions.error, 'progress-mission-count');
    this.throwOnError(points.error, 'progress-points');
    const [todaySketch, todayExplore, todayStory] = await Promise.all([
      this.countSince('sketch_submissions', user.id, today.toISOString()),
      this.countSince('explore_attempts', user.id, today.toISOString()),
      this.countSince('stories', user.id, today.toISOString(), 'completed'),
    ]);
    return {
      completed_activities_today: todaySketch + todayExplore + todayStory,
      completed_missions: completedMissions.count ?? 0,
      total_points: (points.data ?? []).reduce((sum, row) => sum + (row.points_awarded ?? 0), 0),
      sketches_completed: sketchCount,
      stories_created: storyCount,
    };
  }

  private async historyPage(
    userId: string,
    type: 'sketch' | 'explore' | 'story',
    limit: number,
    cursor?: HistoryCursor,
  ): Promise<HistoryItem[]> {
    const db = this.supabase.getClient();
    const selects = {
      sketch: 'id, template_id, similarity_score, feedback, created_at, template:sketch_templates(title)',
      explore: 'id, is_correct, points_awarded, created_at, question:explore_questions(prompt)',
      story: 'id, status, title, detected_object, created_at',
    } as const;
    let request = (db as any).from(type === 'sketch' ? 'sketch_submissions' : type === 'explore' ? 'explore_attempts' : 'stories')
      .select(selects[type]).eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      request = request.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    }
    const { data, error } = await request;
    this.throwOnError(error, `history-${type}`);
    return (data ?? []).map((row: any): HistoryItem => {
      if (type === 'sketch') {
        const template = row.template as { title?: string } | null;
        return {
          id: row.id,
          type,
          title: template?.title ?? 'Tantangan menggambar',
          summary: row.feedback ?? (row.similarity_score === null ? 'Tantangan diselesaikan' : `Kemiripan ${row.similarity_score}%`),
          score: row.similarity_score,
          created_at: row.created_at,
        };
      }
      if (type === 'explore') {
        const question = row.question as { prompt?: string } | null;
        return {
          id: row.id,
          type,
          title: question?.prompt ?? 'Permainan Jelajah Cilik',
          summary: row.is_correct ? 'Jawaban benar' : 'Jawaban belum tepat',
          score: row.points_awarded,
          created_at: row.created_at,
        };
      }
      return {
        id: row.id,
        type,
        title: row.title ?? row.detected_object ?? 'Cerita SKETCHOO',
        summary: row.status === 'completed' ? 'Cerita berhasil dibuat' : `Status: ${row.status}`,
        score: null,
        created_at: row.created_at,
      };
    });
  }

  private decodeHistoryCursor(cursor?: string): HistoryCursor | undefined {
    if (!cursor) return undefined;
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as HistoryCursor;
      if (!decoded.created_at || !Number.isFinite(Date.parse(decoded.created_at)) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.id)) {
        throw new Error('invalid cursor');
      }
      return decoded;
    } catch {
      throw new BadRequestException('Cursor riwayat tidak valid.');
    }
  }

  private async countSketches(userId: string) {
    return this.countTable('sketch_submissions', userId);
  }

  private async countStories(userId: string) {
    return this.countTable('stories', userId, 'completed');
  }

  private async countTable(table: 'sketch_submissions' | 'explore_attempts' | 'stories', userId: string, status?: string) {
    let request = this.supabase.getClient().from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (status) request = request.eq('status', status);
    const { count, error } = await request;
    this.throwOnError(error, `count-${table}`);
    return count ?? 0;
  }

  private async countSince(table: 'sketch_submissions' | 'explore_attempts' | 'stories', userId: string, since: string, status?: string) {
    let request = this.supabase.getClient().from(table).select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', since);
    if (status) request = request.eq('status', status);
    const { count, error } = await request;
    this.throwOnError(error, `count-today-${table}`);
    return count ?? 0;
  }

  private displayName(user: AuthUser) {
    const name = user.user_metadata?.name ?? user.user_metadata?.full_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return user.email?.split('@')[0] ?? 'Teman';
  }

  // ---------------------------------------------------------------------------
  // Sketch Challenge
  // ---------------------------------------------------------------------------

  /** Urutan level canonical; juga dipakai untuk fallback in-memory. */
  private static readonly SKETCH_LEVELS = [
    { id: 'bebek',     level_number: 1, title: 'Bebek',     subtitle: '+20 Bintang' },
    { id: 'kucing',    level_number: 2, title: 'Kucing',    subtitle: '+20 Bintang' },
    { id: 'ikan',      level_number: 3, title: 'Ikan',      subtitle: '+20 Bintang' },
    { id: 'kupu_kupu', level_number: 4, title: 'Kupu-Kupu', subtitle: '+20 Bintang' },
    { id: 'kura_kura', level_number: 5, title: 'Kura-Kura', subtitle: '+20 Bintang' },
  ] as const;

  async listSketchChallengeLevels(user: AuthUser) {
    this.requireLearner(user);
    const db = this.supabase.getClient();

    // Ambil data level dan progres user sekaligus
    const [levelsRes, progressRes] = await Promise.all([
      db.from('sketch_challenge_levels')
        .select('id, level_number, title, subtitle')
        .eq('is_active', true)
        .order('level_number', { ascending: true }),
      db.from('user_sketch_challenge_progress')
        .select('level_id, status, high_stars')
        .eq('user_id', user.id),
    ]);

    // Tabel belum dibuat → gunakan fallback in-memory (sebelum migrasi dijalankan)
    // ponytail: fallback ini mati otomatis begitu migrasi Supabase dijalankan
    const levels =
      levelsRes.error
        ? ([...LearningService.SKETCH_LEVELS] as Array<{ id: string; level_number: number; title: string; subtitle: string }>)
        : (levelsRes.data ?? []);

    const progressMap = new Map<string, { status: string; high_stars: number }>();
    if (!progressRes.error) {
      for (const row of progressRes.data ?? []) {
        progressMap.set(row.level_id, { status: row.status, high_stars: row.high_stars });
      }
    }

    // Level pertama default active kalau user belum punya record progres sama sekali
    const hasAnyProgress = progressMap.size > 0;

    return {
      levels: levels.map((lv, idx) => {
        const prog = progressMap.get(lv.id);
        let status: string;
        if (prog) {
          status = prog.status;
        } else if (!hasAnyProgress && idx === 0) {
          status = 'active';
        } else {
          status = 'locked';
        }
        return {
          id: lv.id,
          level_number: lv.level_number,
          title: lv.title,
          subtitle: lv.subtitle,
          status,
          high_stars: prog?.high_stars ?? 0,
        };
      }),
    };
  }

  async completeSketchChallenge(user: AuthUser, input: CompleteSketchChallengeDto) {
    this.requireLearner(user);
    const db = this.supabase.getClient();

    // Validasi level ada
    const levels = [...LearningService.SKETCH_LEVELS];
    const currentIdx = levels.findIndex((l) => l.id === input.level_id);
    if (currentIdx === -1) throw new BadRequestException(`level_id '${input.level_id}' tidak valid.`);

    const reward = calculateSketchReward(input.stroke_count, input.total_points, input.duration_seconds);

    // Total bintang user saat ini dari semua aktivitas explore
    const { data: pointsRows } = await db
      .from('explore_attempts').select('points_awarded').eq('user_id', user.id);
    const existingPoints = (pointsRows ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0);
    const totalStars = existingPoints + reward.score;

    // Unlock level berikutnya (minimal 1 bintang = selalu unlock)
    const nextLevel = levels[currentIdx + 1] ?? null;

    // Upsert progres level saat ini
    const existingProg = await db
      .from('user_sketch_challenge_progress')
      .select('high_stars, high_score, attempts_count')
      .eq('user_id', user.id)
      .eq('level_id', input.level_id)
      .maybeSingle();

    const prevHighStars = existingProg.data?.high_stars ?? 0;
    const prevHighScore = existingProg.data?.high_score ?? 0;
    const prevAttempts = existingProg.data?.attempts_count ?? 0;

    const newHighStars = Math.max(prevHighStars, reward.stars) as 1 | 2 | 3;
    const newHighScore = Math.max(prevHighScore, reward.score);

    // Operasi DB — jika tabel belum ada (migrasi belum dijalankan), log saja tidak throw
    const upsertCurrentProg = db.from('user_sketch_challenge_progress').upsert({
      user_id: user.id,
      level_id: input.level_id,
      status: 'completed',
      high_stars: newHighStars,
      high_score: newHighScore,
      attempts_count: prevAttempts + 1,
      last_artwork_url: input.artwork_image_url ?? null,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,level_id' });

    const insertSubmission = db.from('sketch_challenge_submissions').insert({
      user_id: user.id,
      level_id: input.level_id,
      stroke_count: input.stroke_count,
      total_points: input.total_points,
      duration_seconds: input.duration_seconds,
      stars_earned: reward.stars,
      score_awarded: reward.score,
      artwork_image_url: input.artwork_image_url ?? null,
      feedback_message: reward.feedback,
    });

    // Unlock level berikutnya kalau belum ada record
    // Operasi DB — jika tabel belum ada (migrasi belum dijalankan), log saja tidak throw
    const [r1, r2] = await Promise.all([
      upsertCurrentProg.then((r) => r),
      insertSubmission.then((r) => r),
    ]);
    for (const r of [r1, r2] as Array<{ error?: { message?: string } }>) {
      if (r?.error) this.logger.warn(`sketch-challenge-complete: ${r.error.message}`);
    }

    if (nextLevel) {
      const r3 = await db.from('user_sketch_challenge_progress').upsert({
        user_id: user.id,
        level_id: nextLevel.id,
        status: 'active',
        high_stars: 0,
        high_score: 0,
        attempts_count: 0,
        last_artwork_url: null,
        completed_at: null,
      }, { onConflict: 'user_id,level_id', ignoreDuplicates: true });
      if ((r3 as { error?: { message?: string } }).error) {
        this.logger.warn(`sketch-challenge-unlock: ${(r3 as { error?: { message?: string } }).error?.message}`);
      }
    }

    return {
      success: true,
      stars_earned: reward.stars,
      score_added: reward.score,
      total_stars: totalStars,
      unlocked_level_id: nextLevel?.id ?? null,
      feedback_message: reward.feedback,
    };
  }

  private requireLearner(user: AuthUser) {
    const role = user.app_metadata?.role;
    if (role === 'admin' || role === 'superadmin') {
      throw new ForbiddenException('Endpoint ini khusus untuk akun pembelajar.');
    }
  }

  private throwOnError(error: { code?: string; status?: number } | null, operation: string) {
    if (!error) return;
    this.logger.warn(`Supabase learning operation failed (${operation}; status=${error.status ?? 'unknown'}; code=${error.code ?? 'unknown'})`);
    throw new ServiceUnavailableException('Data belajar sedang tidak tersedia.');
  }
}
