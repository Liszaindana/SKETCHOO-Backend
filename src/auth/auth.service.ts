import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const RESET_TOKEN_TTL_SECONDS = 300;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly config: ConfigService) {}

  async register(input: { name: string; email: string; password: string }) {
    const { data, error } = await this.publicClient().auth.signUp({
      email: this.normalizeEmail(input.email),
      password: input.password,
      options: { data: { name: input.name.trim() } },
    });

    if (error) {
      if (/already (registered|exists)|user already/i.test(error.message)) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Email sudah terdaftar.',
        });
      }
      this.throwProviderError(error, 'register');
    }
    if (data.user?.identities?.length === 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email sudah terdaftar.',
      });
    }

    return {
      user: this.toPublicUser(data.user),
      requires_email_confirmation: !data.session,
      access_token: data.session?.access_token ?? null,
      message: data.session
        ? 'Akun berhasil dibuat.'
        : 'Akun berhasil dibuat. Cek email untuk verifikasi, lalu masuk.',
    };
  }

  async resendVerification(email: string) {
    const redirectTo =
      this.config.get<string>('SUPABASE_CONFIRM_REDIRECT_URL') ??
      this.config.get<string>('SUPABASE_RESET_REDIRECT_URL');
    const { error } = await this.publicClient().auth.resend({
      type: 'signup',
      email: this.normalizeEmail(email),
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });

    if (error?.status === 429) {
      throw new HttpException(
        'Terlalu banyak percobaan. Coba lagi nanti.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error?.status && error.status >= 500) {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }

    // Jangan bocorkan status akun: respons tetap sama untuk email terdaftar maupun tidak.
    return {
      message: 'Jika email terdaftar dan belum diverifikasi, tautan verifikasi sudah dikirim ulang.',
    };
  }

  async login(email: string, password: string) {
    const { data, error } = await this.publicClient().auth.signInWithPassword({
      email: this.normalizeEmail(email),
      password,
    });
    if (error?.status === 429) {
      throw new HttpException('Terlalu banyak percobaan. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error?.status && error.status >= 500) {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
    if (error?.code === 'email_not_confirmed' ||
        /email not confirmed/i.test(error?.message ?? '')) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_CONFIRMED',
        message: 'Email belum diverifikasi. Cek inbox dan klik tautan verifikasi, lalu masuk kembali.',
      });
    }
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    return {
      user: this.toPublicUser(data.user),
      access_token: data.session.access_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in,
      refresh_token: data.session.refresh_token,
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.publicClient().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error?.status === 429) {
      throw new HttpException('Terlalu banyak percobaan. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error?.status && error.status >= 500) {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Refresh token tidak valid atau kedaluwarsa.');
    }

    return {
      user: this.toPublicUser(data.user),
      access_token: data.session.access_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in,
      refresh_token: data.session.refresh_token,
    };
  }

  async logout(accessToken: string) {
    const response = await this.authRequest('/logout?scope=global', accessToken, {
      method: 'POST',
    });
    if (!response.ok && response.status !== 204) {
      if (response.status === 401) {
        throw new UnauthorizedException('Access token tidak valid.');
      }
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
  }

  async getUser(accessToken: string): Promise<User> {
    let result;
    try {
      result = await this.publicClient().auth.getUser(accessToken);
    } catch {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
    const { data, error } = result;
    if (error?.status === 429) {
      throw new HttpException('Terlalu banyak percobaan. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error?.status && error.status >= 500) {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
    if (error || !data.user) {
      throw new UnauthorizedException('Access token tidak valid.');
    }
    return data.user;
  }

  async updateName(accessToken: string, name: string) {
    const response = await this.authRequest('/user', accessToken, {
      method: 'PUT',
      body: JSON.stringify({ data: { name: name.trim() } }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedException('Access token tidak valid.');
      }
      throw new ServiceUnavailableException('Profil tidak dapat diperbarui saat ini.');
    }

    const user = (await response.json()) as User;
    return this.toPublicUser(user);
  }

  async forgotPassword(email: string) {
    const redirectTo = this.config.get<string>('SUPABASE_RESET_REDIRECT_URL');
    const { error } = await this.publicClient().auth.resetPasswordForEmail(
      this.normalizeEmail(email),
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) {
      if (error.status === 429) {
        throw new HttpException('Terlalu banyak percobaan. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (error.status && error.status >= 500) {
        throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
      }
    }

    return {
      message: 'Jika email terdaftar, kode verifikasi akan dikirim.',
    };
  }

  async verifyResetCode(email: string, code: string) {
    const { data, error } = await this.publicClient().auth.verifyOtp({
      email: this.normalizeEmail(email),
      token: code,
      type: 'recovery',
    });
    if (error || !data.user) {
      throw new BadRequestException('Kode verifikasi tidak valid atau kedaluwarsa.');
    }

    const resetToken = randomBytes(32).toString('base64url');
    const adminClient = this.adminClient();
    const { error: storeError } = await adminClient
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', data.user.id)
      .is('consumed_at', null);
    if (storeError) this.throwProviderError(storeError, 'recovery-store');

    const { error: insertError } = await adminClient
      .from('password_reset_tokens')
      .insert({
        user_id: data.user.id,
        token_hash: this.hashToken(resetToken),
        expires_at: new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString(),
      });
    if (insertError) this.throwProviderError(insertError, 'recovery-store');

    return { reset_token: resetToken, expires_in: RESET_TOKEN_TTL_SECONDS };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const adminClient = this.adminClient();
    const now = new Date().toISOString();
    const { data: tokenRecord, error: consumeError } = await adminClient
      .from('password_reset_tokens')
      .update({ consumed_at: now })
      .eq('token_hash', this.hashToken(resetToken))
      .is('consumed_at', null)
      .gt('expires_at', now)
      .select('user_id')
      .maybeSingle();

    if (consumeError) this.throwProviderError(consumeError, 'recovery-store');
    if (!tokenRecord) {
      throw new BadRequestException('Token reset tidak valid, kedaluwarsa, atau sudah dipakai.');
    }

    const { error } = await adminClient.auth.admin.updateUserById(tokenRecord.user_id, {
      password: newPassword,
    });
    if (error) this.throwProviderError(error, 'password-update');

    return { message: 'Password berhasil diubah. Silakan login kembali.' };
  }

  private publicClient(): SupabaseClient {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_ANON_KEY');
    if (!url || !key) {
      throw new ServiceUnavailableException('Konfigurasi Supabase belum lengkap.');
    }
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  private adminClient(): SupabaseClient {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey =
      this.config.get<string>('SUPABASE_SECRET_KEY') ??
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      throw new ServiceUnavailableException(
        'Password reset memerlukan SUPABASE_SECRET_KEY di backend.',
      );
    }
    return createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  private async authRequest(path: string, accessToken: string, init: RequestInit) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_ANON_KEY');
    if (!url || !key) {
      throw new ServiceUnavailableException('Konfigurasi Supabase belum lengkap.');
    }
    try {
      return await fetch(`${url.replace(/\/$/, '')}/auth/v1${path}`, {
        ...init,
        headers: {
          apikey: key,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
  }

  toPublicUser(user: User | null) {
    if (!user) throw new ServiceUnavailableException('Supabase tidak mengembalikan data user.');
    const name = user.user_metadata?.name ?? user.user_metadata?.full_name ?? null;
    return {
      id: user.id,
      name,
      email: user.email ?? null,
      role: user.app_metadata?.role ?? 'user',
      created_at: user.created_at,
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private throwProviderError(
    error: { status?: number; code?: string; message?: string },
    operation: string,
  ): never {
    const code = error.code?.toLowerCase();
    this.logger.warn(`Supabase auth operation failed (${operation}; status=${error.status ?? 'unknown'}; code=${code ?? 'unknown'})`);

    if (code === 'email_exists' || code === 'user_already_exists') {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email sudah terdaftar.',
      });
    }
    if (code === 'email_address_invalid') {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Gunakan alamat email sungguhan. Domain contoh seperti example.com tidak didukung Supabase.',
      });
    }
    if (error.status === 429) {
      throw new HttpException('Terlalu banyak percobaan. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (code === 'weak_password' || code === 'password_too_short') {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Password belum memenuhi kebijakan keamanan Supabase. Gunakan password yang lebih kuat.',
      });
    }
    if (error.status && error.status >= 500) {
      throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
    }
    if (operation === 'register') {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Supabase menolak pendaftaran. Periksa kebijakan password dan konfigurasi Auth.',
      });
    }
    throw new ServiceUnavailableException('Layanan autentikasi sedang tidak tersedia.');
  }
}
