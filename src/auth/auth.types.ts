import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

export type AuthUser = User;

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  accessToken?: string;
};
