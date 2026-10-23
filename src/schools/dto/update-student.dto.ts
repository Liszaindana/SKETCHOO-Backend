import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsUUID()
  classroom_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
