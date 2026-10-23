import { IsUUID } from 'class-validator';

export class AddSessionParticipantDto {
  @IsUUID()
  student_id!: string;
}
