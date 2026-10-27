import { IsEmail, Matches, MaxLength } from 'class-validator';

export class VerifyResetCodeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Matches(/^\d{4,6}$/)
  code!: string;
}
