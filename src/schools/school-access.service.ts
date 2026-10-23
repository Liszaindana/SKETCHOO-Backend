import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { SupabaseAdminService } from '../common/supabase/supabase-admin.service.js';

export type SchoolScope = {
  id: string;
  school_id: string;
  membership_role: 'admin' | 'teacher';
};

@Injectable()
export class SchoolAccessService {
  constructor(private readonly supabase: SupabaseAdminService) {}

  async requireAdmin(user: AuthUser): Promise<SchoolScope> {
    if (user.app_metadata?.role !== 'admin') {
      throw new ForbiddenException('Akses khusus admin sekolah.');
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('school_memberships')
      .select('id, school_id, membership_role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle<SchoolScope>();
    if (error) {
      throw new ServiceUnavailableException('Data membership sekolah sedang tidak tersedia.');
    }
    if (!data) throw new ForbiddenException('Akun belum ditautkan ke sekolah aktif.');
    const { data: school, error: schoolError } = await this.supabase
      .getClient()
      .from('schools')
      .select('is_active')
      .eq('id', data.school_id)
      .maybeSingle();
    if (schoolError) {
      throw new ServiceUnavailableException('Data sekolah sedang tidak tersedia.');
    }
    if (!school?.is_active) throw new ForbiddenException('Sekolah admin sedang dinonaktifkan.');
    return data;
  }

  requireSuperadmin(user: AuthUser) {
    if (user.app_metadata?.role !== 'superadmin') {
      throw new ForbiddenException('Akses khusus superadmin.');
    }
  }

  getClient() {
    return this.supabase.getClient();
  }

  async audit(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    const { error } = await this.supabase.getClient().from('audit_logs').insert({
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
    if (error) {
      throw new ServiceUnavailableException(
        'Tindakan tersimpan, tetapi pencatatan audit gagal. Hubungi pengelola sistem.',
      );
    }
  }
}
