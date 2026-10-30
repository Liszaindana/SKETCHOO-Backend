import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CompleteSketchChallengeDto,
  CursorPageQueryDto,
  ExploreQuestionQueryDto,
  HistoryQueryDto,
  MissionListQueryDto,
  SketchTemplateQueryDto,
  SubmitExploreAttemptDto,
} from './dto/learner-query.dto.js';
import { LearningService } from './learning.service.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.learning.dashboard(user);
  }

  @Get('missions')
  missions(@CurrentUser() user: AuthUser, @Query() query: MissionListQueryDto) {
    return this.learning.listMissions(user, query);
  }

  @Get('sketch/templates')
  sketchTemplates(
    @CurrentUser() user: AuthUser,
    @Query() query: SketchTemplateQueryDto,
  ) {
    return this.learning.listSketchTemplates(user, query);
  }

  @Get('sketch/submissions')
  sketchSubmissions(
    @CurrentUser() user: AuthUser,
    @Query() query: CursorPageQueryDto,
  ) {
    return this.learning.listSketchSubmissions(user, query);
  }

  @Get('sketch-challenge/levels')
  sketchChallengeLevels(@CurrentUser() user: AuthUser) {
    return this.learning.listSketchChallengeLevels(user);
  }

  @Post('sketch-challenge/complete')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  completeSketchChallenge(
    @CurrentUser() user: AuthUser,
    @Body() body: CompleteSketchChallengeDto,
  ) {
    return this.learning.completeSketchChallenge(user, body);
  }

  @Get('explore/activities')
  exploreActivities(@CurrentUser() user: AuthUser) {
    return this.learning.exploreActivities(user);
  }

  @Get('explore/questions')
  exploreQuestions(
    @CurrentUser() user: AuthUser,
    @Query() query: ExploreQuestionQueryDto,
  ) {
    return this.learning.listExploreQuestions(user, query);
  }

  @Post('explore/attempts')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitExploreAttempt(
    @CurrentUser() user: AuthUser,
    @Body() body: SubmitExploreAttemptDto,
  ) {
    return this.learning.submitExploreAttempt(user, body);
  }

  @Get('stories')
  stories(@CurrentUser() user: AuthUser, @Query() query: CursorPageQueryDto) {
    return this.learning.listStories(user, query);
  }

  @Get('stories/:story_id')
  story(
    @CurrentUser() user: AuthUser,
    @Param('story_id', new ParseUUIDPipe()) storyId: string,
  ) {
    return this.learning.getStory(user, storyId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() query: HistoryQueryDto) {
    return this.learning.history(user, query);
  }

  @Get('progress/summary')
  progressSummary(@CurrentUser() user: AuthUser) {
    return this.learning.progressSummary(user);
  }
}
