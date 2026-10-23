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
import { AdminFoundationService } from './admin-foundation.service.js';
import { AddSessionParticipantDto } from './dto/add-session-participant.dto.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';

@Controller('admin')
@UseGuards(SupabaseAuthGuard)
export class AdminFoundationController {
  constructor(private readonly foundation: AdminFoundationService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.foundation.dashboard(user);
  }

  @Get('students')
  listStudents(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.foundation.listStudents(user, query);
  }

  @Post('students')
  createStudent(@CurrentUser() user: AuthUser, @Body() body: CreateStudentDto) {
    return this.foundation.createStudent(user, body);
  }

  @Get('students/:student_id')
  getStudent(
    @CurrentUser() user: AuthUser,
    @Param('student_id', new ParseUUIDPipe()) studentId: string,
  ) {
    return this.foundation.getStudent(user, studentId);
  }

  @Patch('students/:student_id')
  updateStudent(
    @CurrentUser() user: AuthUser,
    @Param('student_id', new ParseUUIDPipe()) studentId: string,
    @Body() body: UpdateStudentDto,
  ) {
    return this.foundation.updateStudent(user, studentId, body);
  }

  @Get('students/:student_id/progress')
  studentProgress(
    @CurrentUser() user: AuthUser,
    @Param('student_id', new ParseUUIDPipe()) studentId: string,
  ) {
    return this.foundation.studentProgress(user, studentId);
  }

  @Get('students/:student_id/history')
  studentHistory(
    @CurrentUser() user: AuthUser,
    @Param('student_id', new ParseUUIDPipe()) studentId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.foundation.studentHistory(user, studentId, query);
  }

  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser, @Body() body: CreateSessionDto) {
    return this.foundation.createSession(user, body);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
    return this.foundation.listSessions(user, query);
  }

  @Get('sessions/:session_id')
  getSession(
    @CurrentUser() user: AuthUser,
    @Param('session_id', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.foundation.getSession(user, sessionId);
  }

  @Post('sessions/:session_id/participants')
  addSessionParticipant(
    @CurrentUser() user: AuthUser,
    @Param('session_id', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AddSessionParticipantDto,
  ) {
    return this.foundation.addSessionParticipant(user, sessionId, body);
  }

  @Post('sessions/:session_id/complete')
  completeSession(
    @CurrentUser() user: AuthUser,
    @Param('session_id', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.foundation.completeSession(user, sessionId);
  }
}
