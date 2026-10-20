import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
