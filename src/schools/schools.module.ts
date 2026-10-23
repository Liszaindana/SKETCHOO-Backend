import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupabaseAdminService } from '../common/supabase/supabase-admin.service.js';
import { AdminClassroomsController } from './admin-classrooms.controller.js';
import { AdminClassroomsService } from './admin-classrooms.service.js';
import { SchoolAccessService } from './school-access.service.js';
import { AdminFoundationController } from './admin-foundation.controller.js';
import { AdminFoundationService } from './admin-foundation.service.js';
import { SuperadminFoundationController } from './superadmin-foundation.controller.js';
import { SuperadminFoundationService } from './superadmin-foundation.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminClassroomsController,
    AdminFoundationController,
    SuperadminFoundationController,
  ],
  providers: [
    AdminClassroomsService,
    AdminFoundationService,
    SuperadminFoundationService,
    SchoolAccessService,
    SupabaseAdminService,
  ],
})
export class SchoolsModule {}
