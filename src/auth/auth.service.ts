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
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const RESET_TOKEN_TTL_SECONDS = 300;
const RESET_CODE_TTL_SECONDS = 600;
const RESET_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private brevoTransporter?: Transporter;

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
    const startedAt = performance.now();
    const normalizedEmail = this.normalizeEmail(email);
    this.logger.log(`[AUTH] login start email=${this.maskEmail(normalizedEmail)}`);

    // Supabase Auth melakukan user lookup, bcrypt, dan JWT signing di provider.
    // Backend tidak menerima password hash dan tidak mengakses tabel auth.users langsung.
    const providerStartedAt = performance.now();
    const { data, error } = await this.publicClient().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    const providerDuration = Math.round(performance.now() - providerStartedAt);
    this.logger.log(`[AUTH] provider lookup+bcrypt+jwt duration=${providerDuration}ms`);
    if (error?.status === 429) {
      this.logger.warn(`[AUTH] login failed status=429 total=${Math.round(performance.now() - startedAt)}ms`);
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
      this.logger.warn(`[AUTH] login failed status=401 total=${Math.round(performance.now() - startedAt)}ms`);
      throw new UnauthorizedException('Email atau password salah.');
    }

    const totalDuration = Math.round(performance.now() - startedAt);
    this.logger.log(`[AUTH] login total duration=${totalDuration}ms response status=200`);
    return {
      user: this.toPublicUser(data.user),
      access_token: data.session.access_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in,
      refresh_token: data.session.refresh_token,
    };
  }

  async loginWithGoogle(input: {
    id_token: string;
    access_token?: string;
    nonce?: string;
  }) {
    let result;
    try {
      result = await this.publicClient().auth.signInWithIdToken({
        provider: 'google',
        token: input.id_token,
        ...(input.access_token ? { access_token: input.access_token } : {}),
        ...(input.nonce ? { nonce: input.nonce } : {}),
      });
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
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Autentikasi Google gagal. Silakan coba masuk kembali.');
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
    const normalizedEmail = this.normalizeEmail(email);
    const adminClient = this.adminClient();
    const { data: userId, error } = await adminClient.rpc('find_auth_user_id_by_email', {
      p_email: normalizedEmail,
    });

    // Keep the response indistinguishable when the account does not exist.
    if (error) this.throwProviderError(error, 'recovery-user-lookup');
    if (!userId) {
      return { message: 'Jika email terdaftar, kode verifikasi akan dikirim.' };
    }

    const code = randomInt(0, 10_000).toString().padStart(4, '0');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESET_CODE_TTL_SECONDS * 1000).toISOString();
    const { error: removeError } = await adminClient
      .from('password_reset_codes')
      .delete()
      .eq('user_id', userId)
      .is('consumed_at', null);
    if (removeError) this.throwProviderError(removeError, 'recovery-code-store');

    const { data: codeRecord, error: insertError } = await adminClient
      .from('password_reset_codes')
      .insert({
        user_id: userId,
        code_hash: this.hashResetCode(userId, code),
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (insertError || !codeRecord) {
      if (insertError) this.throwProviderError(insertError, 'recovery-code-store');
      throw new ServiceUnavailableException('Kode reset tidak dapat dibuat saat ini.');
    }

    try {
      await this.sendResetCode(normalizedEmail, code);
    } catch {
      await adminClient.from('password_reset_codes').delete().eq('id', codeRecord.id);
      throw new ServiceUnavailableException('Email kode reset tidak dapat dikirim saat ini.');
    }

    return {
      message: 'Jika email terdaftar, kode verifikasi akan dikirim.',
    };
  }

  async verifyResetCode(email: string, code: string) {
    const adminClient = this.adminClient();
    const { data: userId, error: userError } = await adminClient.rpc('find_auth_user_id_by_email', {
      p_email: this.normalizeEmail(email),
    });
    if (userError) this.throwProviderError(userError, 'recovery-user-lookup');
    if (!userId) {
      throw new BadRequestException('Kode verifikasi tidak valid atau kedaluwarsa.');
    }

    const now = new Date().toISOString();
    const { data: codeRecord, error: lookupError } = await adminClient
      .from('password_reset_codes')
      .select('id, user_id, code_hash, attempts_count')
      .eq('user_id', userId)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .lt('attempts_count', RESET_CODE_MAX_ATTEMPTS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) this.throwProviderError(lookupError, 'recovery-code-lookup');
    if (!codeRecord) {
      throw new BadRequestException('Kode verifikasi tidak valid atau kedaluwarsa.');
    }

    const expectedHash = Buffer.from(this.hashResetCode(userId, code), 'hex');
    const actualHash = Buffer.from(codeRecord.code_hash, 'hex');
    const isValid = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
    if (!isValid) {
      const { error: attemptError } = await adminClient.rpc(
        'increment_password_reset_code_attempt',
        { p_code_id: codeRecord.id },
      );
      if (attemptError) this.throwProviderError(attemptError, 'recovery-code-attempt');
      throw new BadRequestException('Kode verifikasi tidak valid atau kedaluwarsa.');
    }

    const { data: consumedCode, error: consumeCodeError } = await adminClient
      .from('password_reset_codes')
      .update({ consumed_at: now })
      .eq('id', codeRecord.id)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .lt('attempts_count', RESET_CODE_MAX_ATTEMPTS)
      .select('user_id')
      .maybeSingle();
    if (consumeCodeError) this.throwProviderError(consumeCodeError, 'recovery-code-consume');
    if (!consumedCode) {
      throw new BadRequestException('Kode verifikasi tidak valid atau kedaluwarsa.');
    }

    const resetToken = randomBytes(32).toString('base64url');
    const { error: storeError } = await adminClient
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', userId)
      .is('consumed_at', null);
    if (storeError) this.throwProviderError(storeError, 'recovery-store');

    const { error: insertError } = await adminClient
      .from('password_reset_tokens')
      .insert({
        user_id: userId,
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

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (!domain) return '<invalid>';
    return `${local.slice(0, 2)}***@${domain}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashResetCode(userId: string, code: string) {
    const secret =
      this.config.get<string>('RESET_CODE_PEPPER') ??
      this.config.get<string>('SUPABASE_SECRET_KEY') ??
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret) {
      throw new ServiceUnavailableException('Konfigurasi secret OTP belum lengkap.');
    }
    return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
  }

  private async sendResetCode(email: string, code: string) {
    const senderEmail = this.config.get<string>('BREVO_SENDER_EMAIL');
    const senderName = this.config.get<string>('BREVO_SENDER_NAME') ?? 'SKETCHOO';
    const smtpLogin = this.config.get<string>('BREVO_SMTP_LOGIN');
    const smtpKey = this.config.get<string>('BREVO_SMTP_KEY');
    if (!senderEmail || !smtpLogin || !smtpKey) {
      throw new ServiceUnavailableException('Konfigurasi email Brevo belum lengkap.');
    }

    const port = Number(this.config.get<string>('BREVO_SMTP_PORT') ?? '587');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Konfigurasi port SMTP Brevo tidak valid.');
    }
    this.brevoTransporter ??= nodemailer.createTransport({
      host: this.config.get<string>('BREVO_SMTP_HOST') ?? 'smtp-relay.brevo.com',
      port,
      secure: port === 465,
      auth: { user: smtpLogin, pass: smtpKey },
    });

    await this.brevoTransporter.sendMail({
      from: { name: senderName, address: senderEmail },
      to: email,
      subject: 'Kode reset password SKETCHOO',
      text: `Kode reset password SKETCHOO kamu: ${code}. Kode berlaku selama 10 menit dan hanya dapat digunakan sekali. Jika kamu tidak meminta reset password, abaikan email ini.`,
      html: `<p>Kode reset password SKETCHOO kamu:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>Kode berlaku selama 10 menit dan hanya dapat digunakan sekali.</p><p>Jika kamu tidak meminta reset password, abaikan email ini.</p>`,
    });
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
