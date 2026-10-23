import { IsEmail, IsIn, IsUUID } from 'class-validator';

export class CreateAdminMembershipDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  school_id!: string;

  @IsIn(['admin', 'teacher'])
  membership_role!: 'admin' | 'teacher';
}
