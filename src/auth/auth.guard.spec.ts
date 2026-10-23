import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SupabaseAuthGuard } from './auth.guard.js';
import type { AuthUser, AuthenticatedRequest } from './auth.types.js';

describe('SupabaseAuthGuard', () => {
  const getUser = vi.fn();
  const authService = { getUser } as unknown as AuthService;
  const guard = new SupabaseAuthGuard(authService);

  function createContext(authorization?: string) {
    const request = { headers: { authorization } } as Partial<AuthenticatedRequest>;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  beforeEach(() => {
    getUser.mockReset();
  });

  it('rejects a request without a bearer token', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it('verifies a bearer token and attaches the authenticated user', async () => {
    const accessToken = 'valid-access-token';
    const user: AuthUser = {
      id: 'user-123',
      email: 'parent@example.com',
      user_metadata: { full_name: 'Orang Tua Contoh' },
    };
    const { context, request } = createContext(`Bearer ${accessToken}`);
    getUser.mockResolvedValue(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getUser).toHaveBeenCalledWith(accessToken);
    expect(request.user).toEqual(user);
    expect(request.accessToken).toBe(accessToken);
  });

  it('rejects a token Supabase does not accept', async () => {
    const { context } = createContext('Bearer invalid-access-token');
    getUser.mockRejectedValue(new UnauthorizedException('Invalid access token.'));

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid access token.',
    );
  });
});
