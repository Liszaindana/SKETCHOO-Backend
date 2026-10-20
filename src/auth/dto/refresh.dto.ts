import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Supabase refresh token returned by login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
