import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateAdminMembershipDto {
  @IsOptional()
  @IsIn(['admin', 'teacher'])
  membership_role?: 'admin' | 'teacher';

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
