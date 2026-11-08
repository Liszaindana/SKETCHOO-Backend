import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token returned by the native Google Sign-In SDK.',
  })
  @IsJWT()
  @MaxLength(8192)
  id_token!: string;

  @ApiPropertyOptional({
    description: 'Google access token. Required only if the ID token contains at_hash.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  access_token?: string;

  @ApiPropertyOptional({
    description: 'Nonce used when obtaining the Google ID token, when applicable.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  nonce?: string;
}
