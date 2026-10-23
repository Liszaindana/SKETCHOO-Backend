import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { SchoolAccessService } from './school-access.service.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';
import type { CreateAdminMembershipDto } from './dto/create-admin-membership.dto.js';
import type { UpdateAdminMembershipDto } from './dto/update-admin-membership.dto.js';

@Injectable()
export class SuperadminFoundationService {
  private readonly logger = new Logger(SuperadminFoundationService.name);

  constructor(private readonly access: SchoolAccessService) {}

  async dashboard(user: AuthUser) {
    this.access.requireSuperadmin(user);
    const db = this.access.getClient();
    const [schools, admins, sessions] = await Promise.all([
      db.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('school_memberships').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('learning_sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    this.throwOnError(schools.error, 'superadmin-dashboard-schools');
    this.throwOnError(admins.error, 'superadmin-dashboard-admins');
    this.throwOnError(sessions.error, 'superadmin-dashboard-sessions');
    return {
      active_schools: schools.count ?? 0,
      active_school_memberships: admins.count ?? 0,
      active_sessions: sessions.count ?? 0,
    };
  }

  async listSchools(user: AuthUser, query: ListQueryDto) {
    this.access.requireSuperadmin(user);
    let request = this.access.getClient().from('schools')
      .select('id, name, code, is_active, created_at, updated_at')
      .order('id', { ascending: true }).limit((query.limit ?? 25) + 1);
    if (query.q?.trim()) request = request.ilike('name', `%${query.q.trim()}%`);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'school-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async createSchool(user: AuthUser, input: CreateSchoolDto) {
    this.access.requireSuperadmin(user);
    const { data, error } = await this.access.getClient().from('schools').insert({
      name: input.name.trim(), code: input.code.trim().toLowerCase(),
    }).select('id, name, code, is_active, created_at, updated_at').single();
    if (error?.code === '23505') throw new ConflictException('Kode sekolah sudah digunakan.');
    this.throwOnError(error, 'school-create');
    if (!data) throw new ServiceUnavailableException('Sekolah tidak berhasil dibuat.');
    await this.access.audit(user.id, 'school.created', 'school', data.id, { code: data.code });
    return data;
  }

  async getSchool(user: AuthUser, schoolId: string) {
    this.access.requireSuperadmin(user);
    const { data, error } = await this.access.getClient().from('schools')
      .select('id, name, code, is_active, created_at, updated_at')
      .eq('id', schoolId).maybeSingle();
    this.throwOnError(error, 'school-get');
    if (!data) throw new NotFoundException('Sekolah tidak ditemukan.');
    return data;
  }

  async updateSchool(user: AuthUser, schoolId: string, input: UpdateSchoolDto) {
    this.access.requireSuperadmin(user);
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.is_active !== undefined) changes.is_active = input.is_active;
    const { data, error } = await this.access.getClient().from('schools').update(changes)
      .eq('id', schoolId).select('id, name, code, is_active, created_at, updated_at').maybeSingle();
    this.throwOnError(error, 'school-update');
    if (!data) throw new NotFoundException('Sekolah tidak ditemukan.');
    await this.access.audit(user.id, 'school.updated', 'school', schoolId, { changed_fields: Object.keys(input) });
    return data;
  }

  async listAdmins(user: AuthUser, query: ListQueryDto) {
    this.access.requireSuperadmin(user);
    let request = this.access.getClient().from('school_memberships')
      .select('id, user_id, school_id, membership_role, is_active, created_at')
      .order('id', { ascending: true }).limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'admin-membership-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    if (!items.length) return { items: [], next_cursor: null };
    const userMap = await this.getAuthUsers(new Set(items.map((item) => item.user_id)));
    const enriched = items.map((item) => ({
      ...item,
      email: userMap.get(item.user_id)?.email ?? null,
      name: userMap.get(item.user_id)?.user_metadata?.name ?? null,
    }));
    return { items: enriched, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async createAdmin(user: AuthUser, input: CreateAdminMembershipDto) {
    this.access.requireSuperadmin(user);
    const email = input.email.trim().toLowerCase();
    const target = (await this.getAuthUsersByEmail(email));
    if (!target) throw new NotFoundException('Akun Auth dengan email tersebut belum ada. Tidak ada undangan email yang dikirim.');
    if (target.app_metadata?.role === 'superadmin') {
      throw new ConflictException('Akun superadmin tidak dapat diturunkan menjadi admin sekolah.');
    }
    const { data: school, error: schoolError } = await this.access.getClient().from('schools')
      .select('id, is_active').eq('id', input.school_id).maybeSingle();
    this.throwOnError(schoolError, 'admin-school-check');
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan.');
    if (!school.is_active) throw new ConflictException('Sekolah sedang dinonaktifkan.');

    const { error: roleError } = await this.access.getClient().auth.admin.updateUserById(target.id, {
      app_metadata: { ...target.app_metadata, role: 'admin' },
    });
    this.throwOnError(roleError, 'admin-role-update');
    const { data, error } = await this.access.getClient().from('school_memberships').insert({
      school_id: input.school_id,
      user_id: target.id,
      membership_role: input.membership_role,
    }).select('id, user_id, school_id, membership_role, is_active, created_at').single();
    if (error?.code === '23505') throw new ConflictException('Akun admin sudah memiliki membership aktif atau terdaftar di sekolah ini.');
    this.throwOnError(error, 'admin-membership-create');
    if (!data) throw new ServiceUnavailableException('Membership admin tidak berhasil dibuat.');
    await this.access.audit(user.id, 'school_admin.assigned', 'school_membership', data.id, {
      user_id: target.id, school_id: input.school_id, membership_role: input.membership_role,
    });
    return { ...data, email, message: 'Membership admin dibuat. Undangan email tidak dikirim.' };
  }

  async updateAdmin(user: AuthUser, adminId: string, input: UpdateAdminMembershipDto) {
    this.access.requireSuperadmin(user);
    const { data: current, error: currentError } = await this.access.getClient().from('school_memberships')
      .select('id, user_id, school_id, membership_role, is_active')
      .eq('user_id', adminId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    this.throwOnError(currentError, 'admin-membership-get');
    if (!current) throw new NotFoundException('Membership admin aktif tidak ditemukan.');
    const changes: Record<string, unknown> = {};
    if (input.membership_role !== undefined) changes.membership_role = input.membership_role;
    if (input.is_active !== undefined) changes.is_active = input.is_active;
    if (!Object.keys(changes).length) throw new ConflictException('Tidak ada perubahan untuk diterapkan.');
    if (input.is_active === true && !current.is_active) {
      const { count, error: activeError } = await this.access.getClient().from('school_memberships')
        .select('id', { count: 'exact', head: true }).eq('user_id', current.user_id).eq('is_active', true);
      this.throwOnError(activeError, 'admin-active-membership-check');
      if ((count ?? 0) > 0) throw new ConflictException('Akun admin sudah memiliki membership aktif.');
    }
    const { data, error } = await this.access.getClient().from('school_memberships').update(changes)
      .eq('id', current.id).select('id, user_id, school_id, membership_role, is_active').single();
    this.throwOnError(error, 'admin-membership-update');
    if (input.is_active !== undefined) {
      const { data: authResult, error: authError } = await this.access.getClient().auth.admin.getUserById(current.user_id);
      this.throwOnError(authError, 'admin-auth-user-get');
      if (!authResult.user) throw new NotFoundException('Akun admin tidak ditemukan.');
      const { count: activeCount, error: countError } = await this.access.getClient().from('school_memberships')
        .select('id', { count: 'exact', head: true }).eq('user_id', current.user_id).eq('is_active', true);
      this.throwOnError(countError, 'admin-active-membership-count');
      if ((activeCount ?? 0) > 0 && authResult.user.app_metadata?.role === 'superadmin') {
        throw new ConflictException('Akun superadmin tidak dapat dijadikan admin sekolah.');
      }
      const { error: roleError } = await this.access.getClient().auth.admin.updateUserById(current.user_id, {
        app_metadata: {
          ...authResult.user.app_metadata,
          role: (activeCount ?? 0) > 0 ? 'admin' : 'user',
        },
      });
      this.throwOnError(roleError, 'admin-role-demote');
    }
    await this.access.audit(user.id, input.is_active === false ? 'school_admin.deactivated' : 'school_admin.updated', 'school_membership', current.id, {
      user_id: current.user_id, school_id: current.school_id, changed_fields: Object.keys(input),
    });
    return data;
  }

  async listAuditLogs(user: AuthUser, query: ListQueryDto) {
    this.access.requireSuperadmin(user);
    let request = this.access.getClient().from('audit_logs')
      .select('id, actor_user_id, action, target_type, target_id, metadata, created_at')
      .order('id', { ascending: true }).limit((query.limit ?? 25) + 1);
    if (query.cursor) request = request.gt('id', query.cursor);
    const { data, error } = await request;
    this.throwOnError(error, 'audit-log-list');
    const rows = data ?? [];
    const hasMore = rows.length > (query.limit ?? 25);
    const items = hasMore ? rows.slice(0, query.limit ?? 25) : rows;
    return { items, next_cursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  private async getAuthUsers(ids: Set<string>) {
    const matches = new Map<string, { email?: string; user_metadata?: Record<string, unknown> }>();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await this.access.getClient().auth.admin.listUsers({ page, perPage: 1000 });
      this.throwOnError(error, 'auth-admin-list');
      for (const account of data.users) {
        if (ids.has(account.id)) matches.set(account.id, account);
      }
      if (matches.size === ids.size || data.users.length < 1000) break;
    }
    return matches;
  }

  private async getAuthUsersByEmail(email: string) {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await this.access.getClient().auth.admin.listUsers({ page, perPage: 1000 });
      this.throwOnError(error, 'auth-admin-list');
      const account = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
      if (account) return account;
      if (data.users.length < 1000) return null;
    }
    throw new ServiceUnavailableException('Pencarian akun admin melewati batas paginasi.');
  }

  private throwOnError(error: { code?: string; status?: number } | null, operation: string) {
    if (!error) return;
    if (error.code === '23505') throw new ConflictException('Data sudah terdaftar.');
    this.logger.warn(`Supabase operation failed (${operation}; status=${error.status ?? 'unknown'}; code=${error.code ?? 'unknown'})`);
    throw new ServiceUnavailableException('Data administrasi sedang tidak tersedia.');
  }
}
