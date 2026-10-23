import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsUUID()
  classroom_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value)
  @MaxLength(120)
  device_label?: string;
}
