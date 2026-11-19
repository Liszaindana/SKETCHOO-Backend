import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupabaseAdminService } from '../common/supabase/supabase-admin.service.js';
import { SketchToStoryController } from './sketch-to-story.controller.js';
import { SketchToStoryService } from './sketch-to-story.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SketchToStoryController],
  providers: [SketchToStoryService, SupabaseAdminService],
})
export class SketchToStoryModule {}
