import {
  IsEmail,
  IsString,
  IsStrongPassword,
  Length,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsStrongPassword(
    { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 },
    { message: 'Password minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, dan angka.' },
  )
  @MaxLength(128)
  password!: string;
}
