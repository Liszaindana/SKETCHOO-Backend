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
import { CreateClassroomDto } from './dto/create-classroom.dto.js';
import { UpdateClassroomDto } from './dto/update-classroom.dto.js';
import { AdminClassroomsService } from './admin-classrooms.service.js';
import { ListQueryDto } from './dto/list-query.dto.js';

@Controller('admin/classrooms')
@UseGuards(SupabaseAuthGuard)
export class AdminClassroomsController {
  constructor(private readonly classrooms: AdminClassroomsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.classrooms.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClassroomDto) {
    return this.classrooms.create(user, body);
  }

  @Patch(':classroom_id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('classroom_id', new ParseUUIDPipe()) classroomId: string,
    @Body() body: UpdateClassroomDto,
  ) {
    return this.classrooms.update(user, classroomId, body);
  }
}
