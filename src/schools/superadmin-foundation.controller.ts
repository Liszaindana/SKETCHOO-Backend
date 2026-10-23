import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SuperadminFoundationService } from './superadmin-foundation.service.js';
import { CreateAdminMembershipDto } from './dto/create-admin-membership.dto.js';
import { CreateSchoolDto } from './dto/create-school.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { UpdateAdminMembershipDto } from './dto/update-admin-membership.dto.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';

@Controller('superadmin')
@UseGuards(SupabaseAuthGuard)
export class SuperadminFoundationController {
  constructor(private readonly foundation: SuperadminFoundationService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.foundation.dashboard(user);
  }

  @Get('schools')
  listSchools(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.foundation.listSchools(user, query);
  }

  @Post('schools')
  createSchool(@CurrentUser() user: AuthUser, @Body() body: CreateSchoolDto) {
    return this.foundation.createSchool(user, body);
  }

  @Get('schools/:school_id')
  getSchool(
    @CurrentUser() user: AuthUser,
    @Param('school_id', new ParseUUIDPipe()) schoolId: string,
  ) {
    return this.foundation.getSchool(user, schoolId);
  }

  @Patch('schools/:school_id')
  updateSchool(
    @CurrentUser() user: AuthUser,
    @Param('school_id', new ParseUUIDPipe()) schoolId: string,
    @Body() body: UpdateSchoolDto,
  ) {
    return this.foundation.updateSchool(user, schoolId, body);
  }

  @Get('admins')
  listAdmins(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.foundation.listAdmins(user, query);
  }

  @Post('admins')
  createAdmin(@CurrentUser() user: AuthUser, @Body() body: CreateAdminMembershipDto) {
    return this.foundation.createAdmin(user, body);
  }

  @Patch('admins/:admin_id')
  updateAdmin(
    @CurrentUser() user: AuthUser,
    @Param('admin_id', new ParseUUIDPipe()) adminId: string,
    @Body() body: UpdateAdminMembershipDto,
  ) {
    return this.foundation.updateAdmin(user, adminId, body);
  }

  @Get('audit-logs')
  listAuditLogs(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.foundation.listAuditLogs(user, query);
  }
}
