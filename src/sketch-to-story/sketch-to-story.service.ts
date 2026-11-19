import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { AuthUser } from '../auth/auth.types.js';
import { SupabaseAdminService } from '../common/supabase/supabase-admin.service.js';
import type {
  StoryStatusResponseDto,
  SubmitImageResponseDto,
  UpdateStoryFromMlDto,
} from './dto/sketch-to-story.dto.js';

/** URL FastAPI ML service */
const ML_SERVICE_URL = process.env['ML_SERVICE_URL'] ?? 'http://localhost:8000';

@Injectable()
export class SketchToStoryService {
  private readonly logger = new Logger(SketchToStoryService.name);

  constructor(private readonly supabase: SupabaseAdminService) {}

  // ── Submit gambar dari Flutter ─────────────────────────────────────────────

  /**
   * Terima file gambar dari Flutter:
   * 1. Buat record story 'pending' di DB
   * 2. Forward gambar ke ML service (fire-and-forget)
   * 3. Return story_id ke Flutter untuk polling
   *
   * TODO: upload buffer ke Supabase Storage dan simpan image_url
   *       setelah bucket 'story-images' dikonfigurasi.
   */
  async submitImage(
    user: AuthUser,
    file: Express.Multer.File,
  ): Promise<SubmitImageResponseDto> {
    const storyId = uuidv4();

    this.logger.log(
      `[sketch-to-story] submit user=${user.id} ` +
        `file=${file.originalname} size=${file.size}B`,
    );

    // 1. Simpan record story awal dengan status pending
    const { error } = await this.supabase.getClient().from('stories').insert({
      id: storyId,
      user_id: user.id,
      status: 'pending',
      title: null,
      story_text: null,
      detected_object: null,
      image_url: null,
    });

    if (error) {
      this.logger.error(`[sketch-to-story] insert failed: ${error.message}`);
      throw new ServiceUnavailableException(
        'Gagal menyimpan data gambar. Coba lagi.',
      );
    }

    // 2. Forward ke ML service — fire and forget (tidak await)
    //    ML service akan callback ke /ml-callback setelah selesai
    void this._forwardToMlService(storyId, file);

    return {
      story_id: storyId,
      status: 'pending',
      message:
        'Gambar diterima! Ceritamu sedang diproses. ' +
        'Cek statusnya sebentar lagi.',
    };
  }

  // ── Polling status story ───────────────────────────────────────────────────

  async getStoryStatus(
    user: AuthUser,
    storyId: string,
  ): Promise<StoryStatusResponseDto> {
    const { data, error } = await this.supabase
      .getClient()
      .from('stories')
      .select('id, status, title, story_text, detected_object, image_url')
      .eq('id', storyId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      this.logger.warn(
        `[sketch-to-story] status query error: ${error.message}`,
      );
      throw new ServiceUnavailableException('Gagal mengambil status cerita.');
    }

    if (!data) {
      throw new NotFoundException('Cerita tidak ditemukan.');
    }

    return {
      story_id: data.id,
      status: data.status as StoryStatusResponseDto['status'],
      title: data.title ?? undefined,
      story_text: data.story_text ?? undefined,
      detected_object: data.detected_object ?? undefined,
      image_url: data.image_url ?? undefined,
    };
  }

  // ── Callback dari ML service ───────────────────────────────────────────────

  async updateFromMl(
    storyId: string,
    dto: UpdateStoryFromMlDto,
  ): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .getClient()
      .from('stories')
      .update({
        status: 'completed',
        title: dto.title,
        story_text: dto.story_text,
        detected_object: dto.detected_object,
        image_url: dto.image_url ?? null,
      })
      .eq('id', storyId);

    if (error) {
      this.logger.error(
        `[sketch-to-story] ml-update failed story=${storyId}: ${error.message}`,
      );
      throw new ServiceUnavailableException('Gagal menyimpan hasil ML.');
    }

    this.logger.log(
      `[sketch-to-story] ML completed story=${storyId} ` +
        `object="${dto.detected_object}"`,
    );

    return { success: true };
  }

  // ── Mark failed ───────────────────────────────────────────────────────────

  async markAsFailed(storyId: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('stories')
      .update({ status: 'failed' })
      .eq('id', storyId);

    this.logger.warn(
      `[sketch-to-story] marked as failed story=${storyId}`,
    );
  }

  // ── Private: forward ke ML service ───────────────────────────────────────

  private async _forwardToMlService(
    storyId: string,
    file: Express.Multer.File,
  ): Promise<void> {
    const secret = process.env['ML_CALLBACK_SECRET'] ?? '';
    const url = `${ML_SERVICE_URL}/predict?story_id=${storyId}`;

    try {
      // Buat FormData manual dengan boundary
      const boundary = `----FormBoundary${Date.now()}`;
      const filename = file.originalname || 'image.jpg';
      const mimeType = file.mimetype || 'image/jpeg';

      // Build multipart body
      const header = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
          `Content-Type: ${mimeType}\r\n\r\n`,
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, file.buffer, footer]);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'x-internal-secret': secret,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`ML service responded ${response.status}`);
      }

      this.logger.log(
        `[sketch-to-story] forwarded to ML service story=${storyId}`,
      );
    } catch (err) {
      // Jika ML service tidak bisa dihubungi, langsung mark failed
      this.logger.error(
        `[sketch-to-story] failed to reach ML service story=${storyId}: ${err}`,
      );
      await this.markAsFailed(storyId);
    }
  }
}
