import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { SchoolAccessService } from './school-access.service.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';
import type { CreateSessionDto } from './dto/create-session.dto.js';
import type { AddSessionParticipantDto } from './dto/add-session-participant.dto.js';

@Injectable()
export class AdminFoundationService {
  private readonly logger = new Logger(AdminFoundationService.name);

  constructor(private readonly access: SchoolAccessService) {}

  async dashboard(user: AuthUser) {
    const scope = await this.access.requireAdmin(user);
    const db = this.access.getClient();
    const [students, classrooms, sessions] = await Promise.all([
      db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', scope.school_id).eq('is_active', true),
      db.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', scope.school_id).eq('is_active', true),
      db.from('learning_sessions').select('id, classroom_id, status, started_at, ended_at, device_label')
        .eq('school_id', scope.school_id).order('started_at', { ascending: false }).limit(5),
    ]);
    this.throwOnError(students.error, 'admin-dashboard-students');
    this.throwOnError(classrooms.error, 'admin-dashboard-classrooms');
    this.throwOnError(sessions.error, 'admin-dashboard-sessions');
    return {
      school_id: scope.school_id,
      active_students: students.count ?? 0,
      active_classrooms: classrooms.count ?? 0,
      recent_sessions: sessions.data ?? [],
    };
  }

  async listStudents(user: AuthUser, query: ListQueryDto & { classroom_id?: string }) {
    const scope = await this.access.requireAdmin(user);
    const db = this.access.getClient();
    let request = db.from('students')
      .select('id, school_id, classroom_id, name, is_active, created_at, updated_at')
      .eq('school_id', scope.school_id)
      .order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.classroom_id) request = request.eq('classroom_id', query.classroom_id);
    if (query.q?.trim()) request = request.ilike('name', `%${query.q.trim()}%`);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'student-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async createStudent(user: AuthUser, input: CreateStudentDto) {
    const scope = await this.access.requireAdmin(user);
    await this.requireClassroom(scope.school_id, input.classroom_id);
    const { data, error } = await this.access.getClient().from('students').insert({
      school_id: scope.school_id,
      classroom_id: input.classroom_id,
      name: input.name.trim(),
      created_by_user_id: user.id,
    }).select('id, school_id, classroom_id, name, is_active, created_at, updated_at').single();
    this.throwOnError(error, 'student-create');
    if (!data) throw new ServiceUnavailableException('Profil siswa tidak berhasil dibuat.');
    await this.access.audit(user.id, 'student.created', 'student', data.id, { school_id: scope.school_id, classroom_id: input.classroom_id });
    return data;
  }

  async getStudent(user: AuthUser, studentId: string) {
    const scope = await this.access.requireAdmin(user);
    return this.requireStudent(scope.school_id, studentId);
  }

  async updateStudent(user: AuthUser, studentId: string, input: UpdateStudentDto) {
    const scope = await this.access.requireAdmin(user);
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.is_active !== undefined) changes.is_active = input.is_active;
    if (input.classroom_id !== undefined) {
      await this.requireClassroom(scope.school_id, input.classroom_id);
      changes.classroom_id = input.classroom_id;
    }
    const { data, error } = await this.access.getClient().from('students').update(changes)
      .eq('id', studentId).eq('school_id', scope.school_id)
      .select('id, school_id, classroom_id, name, is_active, created_at, updated_at').maybeSingle();
    this.throwOnError(error, 'student-update');
    if (!data) throw new NotFoundException('Siswa tidak ditemukan atau tidak dapat diakses.');
    await this.access.audit(user.id, 'student.updated', 'student', studentId, {
      school_id: scope.school_id,
      changed_fields: Object.keys(input),
    });
    return data;
  }

  async studentProgress(user: AuthUser, studentId: string) {
    const scope = await this.access.requireAdmin(user);
    await this.requireStudent(scope.school_id, studentId);
    const { data, error } = await this.access.getClient().from('activities')
      .select('activity_type, points_awarded, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    this.throwOnError(error, 'student-progress');
    const records = data ?? [];
    return {
      student_id: studentId,
      completed_activities: records.length,
      submitted_sketches: records.filter((item) => item.activity_type === 'sketch_challenge').length,
      generated_stories: records.filter((item) => item.activity_type === 'story').length,
      total_points: records.reduce((sum, item) => sum + (item.points_awarded ?? 0), 0),
      last_activity_at: records[0]?.created_at ?? null,
    };
  }

  async studentHistory(user: AuthUser, studentId: string, query: ListQueryDto) {
    const scope = await this.access.requireAdmin(user);
    await this.requireStudent(scope.school_id, studentId);
    let request = this.access.getClient().from('activities')
      .select('id, activity_type, title, score, points_awarded, result_summary, created_at')
      .eq('student_id', studentId).order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'student-history');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async createSession(user: AuthUser, input: CreateSessionDto) {
    const scope = await this.access.requireAdmin(user);
    if (input.classroom_id) await this.requireClassroom(scope.school_id, input.classroom_id);
    const { data, error } = await this.access.getClient().from('learning_sessions').insert({
      school_id: scope.school_id,
      classroom_id: input.classroom_id ?? null,
      device_label: input.device_label?.trim() || null,
      created_by_user_id: user.id,
    }).select('id, classroom_id, status, started_at, ended_at, device_label').single();
    if (error?.code === '23505') throw new ConflictException('Sudah ada sesi aktif untuk kelas ini.');
    this.throwOnError(error, 'session-create');
    if (!data) throw new ServiceUnavailableException('Sesi belajar tidak berhasil dibuat.');
    await this.access.audit(user.id, 'session.started', 'learning_session', data.id, { school_id: scope.school_id, classroom_id: input.classroom_id ?? null });
    return data;
  }

  async listSessions(user: AuthUser, query: ListQueryDto) {
    const scope = await this.access.requireAdmin(user);
    let request = this.access.getClient().from('learning_sessions')
      .select('id, classroom_id, status, started_at, ended_at, device_label')
      .eq('school_id', scope.school_id).order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'session-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async getSession(user: AuthUser, sessionId: string) {
    const scope = await this.access.requireAdmin(user);
    const session = await this.requireSession(scope.school_id, sessionId);
    const { data, error } = await this.access.getClient().from('learning_session_participants')
      .select('id, student_id, joined_at, left_at').eq('session_id', sessionId);
    this.throwOnError(error, 'session-participants');
    const participants = data ?? [];
    if (!participants.length) return { ...session, participants: [] };
    const ids = participants.map((participant) => participant.student_id);
    const { data: students, error: studentError } = await this.access.getClient().from('students')
      .select('id, name, classroom_id, is_active').in('id', ids).eq('school_id', scope.school_id);
    this.throwOnError(studentError, 'session-students');
    const byId = new Map((students ?? []).map((student) => [student.id, student]));
    return { ...session, participants: participants.map((participant) => ({ ...participant, student: byId.get(participant.student_id) ?? null })) };
  }

  async addSessionParticipant(user: AuthUser, sessionId: string, input: AddSessionParticipantDto) {
    const scope = await this.access.requireAdmin(user);
    const session = await this.requireSession(scope.school_id, sessionId);
    if (session.status !== 'active') throw new ConflictException('Sesi ini sudah selesai.');
    const student = await this.requireStudent(scope.school_id, input.student_id);
    if (session.classroom_id && session.classroom_id !== student.classroom_id) {
      throw new ForbiddenException('Siswa tidak berasal dari kelas pada sesi ini.');
    }
    const { data, error } = await this.access.getClient().from('learning_session_participants')
      .insert({ session_id: sessionId, student_id: input.student_id })
      .select('id, session_id, student_id, joined_at').single();
    if (error?.code === '23505') throw new ConflictException('Siswa sudah tercatat di sesi ini.');
    this.throwOnError(error, 'session-participant-add');
    await this.access.audit(user.id, 'session.participant_added', 'learning_session', sessionId, { student_id: input.student_id, school_id: scope.school_id });
    return data;
  }

  async completeSession(user: AuthUser, sessionId: string) {
    const scope = await this.access.requireAdmin(user);
    const { data, error } = await this.access.getClient().from('learning_sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId).eq('school_id', scope.school_id).eq('status', 'active')
      .select('id, classroom_id, status, started_at, ended_at, device_label').maybeSingle();
    this.throwOnError(error, 'session-complete');
    if (!data) throw new NotFoundException('Sesi aktif tidak ditemukan.');
    await this.access.audit(user.id, 'session.completed', 'learning_session', sessionId, { school_id: scope.school_id });
    return data;
  }

  private async requireClassroom(schoolId: string, classroomId: string) {
    const { data, error } = await this.access.getClient().from('classrooms')
      .select('id, is_active').eq('id', classroomId).eq('school_id', schoolId).maybeSingle();
    this.throwOnError(error, 'classroom-scope-check');
    if (!data) throw new NotFoundException('Kelas tidak ditemukan atau tidak dapat diakses.');
    if (!data.is_active) throw new ConflictException('Kelas sedang dinonaktifkan.');
    return data;
  }

  private async requireStudent(schoolId: string, studentId: string) {
    const { data, error } = await this.access.getClient().from('students')
      .select('id, school_id, classroom_id, name, is_active, created_at, updated_at')
      .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
    this.throwOnError(error, 'student-scope-check');
    if (!data) throw new NotFoundException('Siswa tidak ditemukan atau tidak dapat diakses.');
    return data;
  }

  private async requireSession(schoolId: string, sessionId: string) {
    const { data, error } = await this.access.getClient().from('learning_sessions')
      .select('id, school_id, classroom_id, status, started_at, ended_at, device_label')
      .eq('id', sessionId).eq('school_id', schoolId).maybeSingle();
    this.throwOnError(error, 'session-scope-check');
    if (!data) throw new NotFoundException('Sesi tidak ditemukan atau tidak dapat diakses.');
    return data;
  }

  private throwOnError(error: { code?: string; status?: number } | null, operation: string) {
    if (!error) return;
    this.logger.warn(`Supabase operation failed (${operation}; status=${error.status ?? 'unknown'}; code=${error.code ?? 'unknown'})`);
    throw new ServiceUnavailableException('Data sekolah sedang tidak tersedia.');
  }
}
