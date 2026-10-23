import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from './current-user.decorator.js';
import { SupabaseAuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller('users/me')
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser) {
    return { user: this.authService.toPublicUser(user) };
  }

  @Patch()
  async updateMe(
    @Body() body: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      user: await this.authService.updateName(request.accessToken!, body.name),
    };
  }
}
