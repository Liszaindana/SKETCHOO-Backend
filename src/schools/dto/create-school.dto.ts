import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 120)
  name!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @Matches(/^[a-z0-9-]{3,32}$/)
  code!: string;
}
