import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateClassroomDto } from './dto/create-classroom.dto.js';
import type { UpdateClassroomDto } from './dto/update-classroom.dto.js';
import { SchoolAccessService } from './school-access.service.js';
import type { ListQueryDto } from './dto/list-query.dto.js';

@Injectable()
export class AdminClassroomsService {
  private readonly logger = new Logger(AdminClassroomsService.name);

  constructor(
    private readonly access: SchoolAccessService,
  ) {}

  async list(user: AuthUser, query: ListQueryDto) {
    const { school_id: schoolId } = await this.access.requireAdmin(user);
    let request = this.access
      .getClient()
      .from('classrooms')
      .select('id, school_id, name, grade_label, is_active, created_at, updated_at')
      .eq('school_id', schoolId)
      .order('id', { ascending: true })
      .limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    if (query.q?.trim()) request = request.ilike('name', `%${query.q.trim()}%`);
    const { data, error } = await request;

    if (error) this.providerUnavailable(error, 'classroom-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async create(user: AuthUser, input: CreateClassroomDto) {
    const { school_id: schoolId } = await this.access.requireAdmin(user);
    const { data, error } = await this.access
      .getClient()
      .from('classrooms')
      .insert({
        school_id: schoolId,
        name: input.name.trim(),
        grade_label: input.grade_label?.trim() || null,
      })
      .select('id, school_id, name, grade_label, is_active, created_at, updated_at')
      .single();

    if (error?.code === '23505') {
      throw new ConflictException({
        code: 'CLASSROOM_CONFLICT',
        message: 'Nama kelas tersebut sudah digunakan di sekolah ini.',
      });
    }
    if (error) this.providerUnavailable(error, 'classroom-create');
    if (!data) throw new ServiceUnavailableException('Kelas tidak berhasil dibuat.');
    await this.access.audit(user.id, 'classroom.created', 'classroom', data.id, { school_id: schoolId });
    return data;
  }

  async update(user: AuthUser, classroomId: string, input: UpdateClassroomDto) {
    const { school_id: schoolId } = await this.access.requireAdmin(user);
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.grade_label !== undefined) {
      changes.grade_label = input.grade_label?.trim() || null;
    }
    if (input.is_active !== undefined) changes.is_active = input.is_active;

    const { data, error } = await this.access
      .getClient()
      .from('classrooms')
      .update(changes)
      .eq('id', classroomId)
      .eq('school_id', schoolId)
      .select('id, school_id, name, grade_label, is_active, created_at, updated_at')
      .maybeSingle();

    if (error?.code === '23505') {
      throw new ConflictException({
        code: 'CLASSROOM_CONFLICT',
        message: 'Nama kelas tersebut sudah digunakan di sekolah ini.',
      });
    }
    if (error) this.providerUnavailable(error, 'classroom-update');
    if (!data) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan atau tidak dapat diakses.',
      });
    }
    await this.access.audit(user.id, 'classroom.updated', 'classroom', classroomId, {
      school_id: schoolId,
      changed_fields: Object.keys(input),
    });
    return data;
  }

  async getCode(user: AuthUser, classroomId: string) {
    const { school_id: schoolId } = await this.access.requireAdmin(user);
    const db = this.access.getClient();

    const { data: classroom, error } = await db
      .from('classrooms')
      .select('id, name')
      .eq('id', classroomId)
      .eq('school_id', schoolId)
      .single();

    if (error || !classroom) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan atau tidak dapat diakses.',
      });
    }

    const { data: session } = await db
      .from('learning_sessions')
      .select('id, device_label')
      .eq('classroom_id', classroomId)
      .eq('status', 'active')
      .ilike('device_label', 'JOIN_CODE:%')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.device_label) {
      const short = session.device_label.replace(/^JOIN_CODE:/i, '').trim();
      return { code: `SKC-${short}`, short_code: short };
    }

    return this.regenerateCode(user, classroomId);
  }

  async regenerateCode(user: AuthUser, classroomId: string) {
    const { school_id: schoolId } = await this.access.requireAdmin(user);
    const db = this.access.getClient();

    const { data: classroom, error: clError } = await db
      .from('classrooms')
      .select('id, name')
      .eq('id', classroomId)
      .eq('school_id', schoolId)
      .single();

    if (clError || !classroom) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan atau tidak dapat diakses.',
      });
    }

    // Karakter alphanumeric tanpa huruf ambigu (0/O, 1/I)
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let short = '';
    for (let i = 0; i < 6; i++) {
      short += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Perbarui sesi aktif yang ada atau buat sesi baru jika belum ada
    const { data: existingSession } = await db
      .from('learning_sessions')
      .select('id')
      .eq('classroom_id', classroomId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSession) {
      const { error: updateErr } = await db
        .from('learning_sessions')
        .update({
          device_label: `JOIN_CODE:${short}`,
        })
        .eq('id', existingSession.id);
      if (updateErr) this.providerUnavailable(updateErr, 'classroom-code-update');
    } else {
      const { error } = await db.from('learning_sessions').insert({
        school_id: schoolId,
        classroom_id: classroomId,
        created_by_user_id: user.id,
        device_label: `JOIN_CODE:${short}`,
        status: 'active',
      });
      if (error) this.providerUnavailable(error, 'classroom-code-generate');
    }

    return { code: `SKC-${short}`, short_code: short };
  }

  private providerUnavailable(
    error: { code?: string; status?: number },
    operation: string,
  ): never {
    // Keep provider diagnostics free of request data, credentials, and SQL text.
    this.logger.warn(
      `Supabase data operation failed (${operation}; status=${error.status ?? 'unknown'}; code=${error.code ?? 'unknown'})`,
    );
    throw new ServiceUnavailableException('Data sekolah sedang tidak tersedia.');
  }
}
