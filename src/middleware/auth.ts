import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { membersRepository, type MembershipRow } from '../repositories/members.repository.js';
import type { RequestContext } from '../types/context.js';
import { AppError, badRequest, forbidden, unauthorized } from '../utils/errors.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const storeIdHeader = z.guid();

/**
 * Resolves who is calling and which store the request is scoped to.
 *
 * AUTH_MODE=demo     every request acts as the owner of DEFAULT_STORE_ID
 *                    (local development / demo until login is wired up).
 * AUTH_MODE=supabase requires `Authorization: Bearer <Supabase access token>`,
 *                    maps the auth user to `users` and `store_members`, and
 *                    only allows stores the user is a member of. When the user
 *                    belongs to several stores, `X-Store-Id` selects one.
 *
 * Every repository call receives `req.context.storeId`, so all data access
 * is store-scoped regardless of mode.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.context = env.AUTH_MODE === 'supabase' ? await resolveSupabaseContext(req) : demoContext();

  if (!READ_METHODS.has(req.method) && req.context.role === 'viewer') {
    throw forbidden('INSUFFICIENT_ROLE', 'Viewers have read-only access');
  }

  next();
}

function demoContext(): RequestContext {
  return { storeId: env.DEFAULT_STORE_ID!, userId: null, role: 'owner', authMode: 'demo' };
}

async function resolveSupabaseContext(req: Request): Promise<RequestContext> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw unauthorized();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw unauthorized('Invalid or expired access token');

  const user = await membersRepository.findUser(data.user.id, data.user.email);
  if (!user) throw forbidden('USER_NOT_REGISTERED', 'No CommerceOS user exists for this account');

  const memberships = await membersRepository.listMemberships(user.id);
  if (memberships.length === 0) throw forbidden('STORE_ACCESS_DENIED', 'You are not a member of any store');

  const requested = req.header('x-store-id');
  let membership: MembershipRow | undefined = memberships[0];

  if (requested) {
    if (!storeIdHeader.safeParse(requested).success) throw badRequest('INVALID_STORE_ID', 'X-Store-Id must be a UUID');
    membership = memberships.find((m) => m.store_id === requested);
    if (!membership) throw forbidden('STORE_ACCESS_DENIED', 'You do not have access to this store');
  } else if (memberships.length > 1) {
    throw badRequest('STORE_SELECTION_REQUIRED', 'You belong to several stores; send the X-Store-Id header');
  }

  if (!membership) throw new AppError(500, 'INTERNAL_ERROR', 'Store membership could not be resolved');
  return { storeId: membership.store_id, userId: user.id, role: membership.role, authMode: 'supabase' };
}

/** The store-scoped context of an authenticated request. */
export function getContext(req: Request): RequestContext {
  if (!req.context) throw new AppError(500, 'MISSING_CONTEXT', 'Request context was not initialised');
  return req.context;
}

export function storeIdOf(req: Request): string {
  return getContext(req).storeId;
}
