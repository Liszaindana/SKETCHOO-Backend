import { IsString, IsStrongPassword, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  reset_token!: string;

  @IsString()
  @IsStrongPassword(
    { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 },
    { message: 'Password minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, dan angka.' },
  )
  @MaxLength(128)
  new_password!: string;
}
