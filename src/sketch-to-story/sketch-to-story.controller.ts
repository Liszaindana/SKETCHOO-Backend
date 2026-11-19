import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UpdateStoryFromMlDto } from './dto/sketch-to-story.dto.js';
import { SketchToStoryService } from './sketch-to-story.service.js';

/** Max ukuran file gambar yang diterima: 10 MB */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** MIME type yang diizinkan */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('Sketch to Story')
@ApiBearerAuth()
@Controller('sketch-to-story')
export class SketchToStoryController {
  constructor(private readonly service: SketchToStoryService) {}

  // ── POST /api/v1/sketch-to-story/submit ───────────────────────────────────

  @Post('submit')
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),           // simpan di memory, bukan disk
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new ForbiddenException(
              `Format file tidak didukung. Gunakan: ${ALLOWED_MIME.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload gambar untuk diproses menjadi cerita',
    description:
      'Flutter mengirim file gambar via multipart/form-data. ' +
      'BE menyimpan record story dengan status pending dan mengqueue ' +
      'ke ML service untuk analisis.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
      },
      required: ['image'],
    },
  })
  submitImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.submitImage(user, file);
  }

  // ── GET /api/v1/sketch-to-story/:story_id/status ──────────────────────────

  @Get(':story_id/status')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({
    summary: 'Polling status cerita',
    description:
      'Flutter polling endpoint ini setelah submit gambar. ' +
      'Jika status = completed, story_text dan detected_object sudah terisi.',
  })
  @ApiParam({ name: 'story_id', type: String, format: 'uuid' })
  getStatus(
    @CurrentUser() user: AuthUser,
    @Param('story_id', new ParseUUIDPipe()) storyId: string,
  ) {
    return this.service.getStoryStatus(user, storyId);
  }

  // ── POST /api/v1/sketch-to-story/:story_id/ml-callback ───────────────────

  @Post(':story_id/ml-callback')
  @ApiOperation({
    summary: 'Callback dari ML service setelah analisis selesai',
    description:
      'Endpoint internal. ML service memanggil ini dengan hasil analisis ' +
      'gambar dan teks cerita yang dihasilkan. ' +
      'Dilindungi dengan ML_CALLBACK_SECRET header.',
  })
  @ApiParam({ name: 'story_id', type: String, format: 'uuid' })
  mlCallback(
    @Param('story_id', new ParseUUIDPipe()) storyId: string,
    @Headers('x-ml-callback-secret') secret: string,
    @Body() dto: UpdateStoryFromMlDto,
  ) {
    this.verifyMlSecret(secret);
    return this.service.updateFromMl(storyId, dto);
  }

  // ── POST /api/v1/sketch-to-story/:story_id/mark-failed ───────────────────

  @Post(':story_id/mark-failed')
  @ApiOperation({
    summary: 'Mark story sebagai failed (dipanggil jika ML timeout)',
    description: 'Endpoint internal, dilindungi ML_CALLBACK_SECRET.',
  })
  @ApiParam({ name: 'story_id', type: String, format: 'uuid' })
  markFailed(
    @Param('story_id', new ParseUUIDPipe()) storyId: string,
    @Headers('x-ml-callback-secret') secret: string,
  ) {
    this.verifyMlSecret(secret);
    return this.service.markAsFailed(storyId);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private verifyMlSecret(secret: string): void {
    const expected = process.env['ML_CALLBACK_SECRET'];
    if (!expected || secret !== expected) {
      throw new ForbiddenException('ML callback secret tidak valid.');
    }
  }
}
