import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Response setelah gambar berhasil diterima dan diqueue untuk diproses ML.
 */
export class SubmitImageResponseDto {
  @ApiProperty({ description: 'ID story yang dibuat (UUID)' })
  story_id!: string;

  @ApiProperty({
    description: 'Status awal story',
    enum: ['pending'],
    example: 'pending',
  })
  status!: 'pending';

  @ApiProperty({ description: 'Pesan konfirmasi untuk user' })
  message!: string;

  @ApiPropertyOptional({ description: 'URL gambar yang tersimpan (opsional)' })
  image_url?: string;
}

/**
 * Response saat polling status story.
 */
export class StoryStatusResponseDto {
  @ApiProperty()
  story_id!: string;

  @ApiProperty({
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status!: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'Judul cerita (tersedia jika completed)' })
  title?: string;

  @ApiPropertyOptional({ description: 'Teks cerita (tersedia jika completed)' })
  story_text?: string;

  @ApiPropertyOptional({ description: 'Objek yang terdeteksi ML' })
  detected_object?: string;

  @ApiPropertyOptional({ description: 'URL gambar yang diunggah' })
  image_url?: string;
}

/**
 * Body untuk update story dari ML worker (internal use).
 * Endpoint ini akan dipanggil ML service setelah selesai memproses.
 */
export class UpdateStoryFromMlDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  story_text!: string;

  @IsString()
  @MaxLength(200)
  detected_object!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image_url?: string;
}
