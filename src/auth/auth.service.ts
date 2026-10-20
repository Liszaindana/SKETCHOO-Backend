import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUser, SupabaseSession } from './auth.types.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';

interface SupabaseErrorBody {
  message?: string;
  msg?: string;
  error_description?: string;
  code?: string;
}

@Injectable()
export class AuthService {
  private get config(): { url: string; key: string; resetRedirectUrl?: string } {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new ServiceUnavailableException(
        'Authentication service is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.',
      );
    }
    if (!this.isPublishableKey(key)) {
      throw new ServiceUnavailableException(
        'SUPABASE_PUBLISHABLE_KEY must contain a Supabase publishable key or legacy anon key. Do not use a secret or service_role key.',
      );
    }
    return { url, key, resetRedirectUrl: process.env.SUPABASE_RESET_REDIRECT_URL };
  }

  private isPublishableKey(key: string): boolean {
    if (key.startsWith('sb_secret_')) return false;
    if (key.startsWith('sb_publishable_')) return true;
    try {
      const payload = key.split('.')[1];
      if (!payload) return false;
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        role?: string;
      };
      return claims.role === 'anon';
    } catch {
      return false;
    }
  }

  async register(input: RegisterDto) {
    const result = await this.request<{ user: AuthUser; session: SupabaseSession | null }>(
      '/auth/v1/signup',
      {
        method: 'POST',
        body: JSON.stringify({
          email: input.email.trim().toLowerCase(),
          password: input.password,
          data: { full_name: input.fullName.trim() },
        }),
      },
    );

    return {
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: result.user.id,
          fullName: this.fullName(result.user),
          email: result.user.email,
        },
      },
    };
  }

  async login(input: LoginDto) {
    const session = await this.request<SupabaseSession>(
      '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: JSON.stringify({
          email: input.email.trim().toLowerCase(),
          password: input.password,
        }),
      },
    );
    return {
      success: true,
      message: 'Login successful',
      data: this.sessionResponse(session),
    };
  }

  async refresh(refreshToken: string) {
    const session = await this.request<SupabaseSession>(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
    );
    return {
      success: true,
      message: 'Session refreshed successfully',
      data: this.sessionResponse(session),
    };
  }

  async forgotPassword(email: string) {
    const { resetRedirectUrl } = this.config;
    const redirect = resetRedirectUrl
      ? `?redirect_to=${encodeURIComponent(resetRedirectUrl)}`
      : '';
    await this.request<unknown>(`/auth/v1/recover${redirect}`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    return {
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.',
      data: null,
    };
  }

  async getUser(accessToken: string): Promise<AuthUser> {
    return this.request<AuthUser>('/auth/v1/user', {
      method: 'GET',
      accessToken,
    });
  }

  async logout(accessToken: string) {
    await this.request<unknown>('/auth/v1/logout', {
      method: 'POST',
      accessToken,
    });
    return { success: true, message: 'Logout successful', data: null };
  }

  currentUser(user: AuthUser) {
    return {
      success: true,
      message: 'Current user retrieved successfully',
      data: {
        id: user.id,
        fullName: this.fullName(user),
        email: user.email,
        // Membership storage is not defined in the current repository/spec database setup.
        memberships: [],
      },
    };
  }

  private fullName(user: AuthUser): string | null {
    const value = user.user_metadata?.full_name;
    return typeof value === 'string' ? value : null;
  }

  private sessionResponse(session: SupabaseSession) {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      tokenType: session.token_type,
      user: {
        id: session.user.id,
        fullName: this.fullName(session.user),
        email: session.user.email,
      },
    };
  }

  private async request<T>(
    path: string,
    options: { method: string; body?: string; accessToken?: string },
  ): Promise<T> {
    const { url, key } = this.config;
    let response: Response;
    try {
      response = await fetch(`${url}${path}`, {
        method: options.method,
        headers: {
          apikey: key,
          'Content-Type': 'application/json',
          ...(options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : {}),
        },
        ...(options.body ? { body: options.body } : {}),
      });
    } catch {
      throw new ServiceUnavailableException('Authentication service is temporarily unavailable.');
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new BadGatewayException('Authentication service returned an invalid response.');
      }
    }

    if (!response.ok) {
      const error = (payload ?? {}) as SupabaseErrorBody;
      const detail = error.message ?? error.msg ?? error.error_description ?? '';
      if (response.status === 401 && !options.accessToken) {
        throw new ServiceUnavailableException(
          'Supabase rejected the configured API key. Check that SUPABASE_PUBLISHABLE_KEY belongs to the configured project.',
        );
      }
      if (
        response.status === 401 ||
        response.status === 403 ||
        /invalid login credentials|invalid grant/i.test(detail)
      ) {
        throw new UnauthorizedException(detail || 'Invalid credentials or access token.');
      }
      if (response.status === 429) {
        throw new HttpException(
          detail || 'Too many authentication attempts. Try again later.',
          429,
        );
      }
      if (response.status === 400 || response.status === 409) {
        throw new HttpException(detail || 'Authentication request could not be completed.', response.status);
      }
      if (response.status >= 500) {
        throw new ServiceUnavailableException('Authentication service is temporarily unavailable.');
      }
      throw new HttpException(detail || 'Authentication request failed.', response.status);
    }
    return payload as T;
  }
}
