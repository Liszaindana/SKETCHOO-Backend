import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
