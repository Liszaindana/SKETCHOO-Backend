import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LearnerListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

}

export class CursorPageQueryDto extends LearnerListQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class HistoryQueryDto extends LearnerListQueryDto {
  @IsOptional()
  @IsIn(['sketch', 'explore', 'story'])
  type?: 'sketch' | 'explore' | 'story';

  // History uses an opaque timestamp + UUID cursor across multiple tables.
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class MissionListQueryDto extends CursorPageQueryDto {
  @IsOptional()
  @IsIn(['not_started', 'in_progress', 'completed'])
  status?: 'not_started' | 'in_progress' | 'completed';
}

export class SketchTemplateQueryDto extends CursorPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';
}

export class ExploreQuestionQueryDto extends CursorPageQueryDto {
  @IsIn(['object_recognition', 'body_parts', 'counting'])
  activity_type!: 'object_recognition' | 'body_parts' | 'counting';

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';
}

export class SubmitExploreAttemptDto {
  @IsUUID()
  question_id!: string;

  @IsString()
  @MaxLength(128)
  answer!: string;
}

export class CompleteSketchChallengeDto {
  @IsString()
  @MaxLength(80)
  level_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stroke_count!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  total_points!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration_seconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  artwork_image_url?: string;
}

