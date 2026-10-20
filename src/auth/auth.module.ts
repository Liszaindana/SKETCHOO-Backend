import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SupabaseAuthGuard } from './auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard],
})
export class AuthModule {}
