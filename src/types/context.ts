export type StoreRole = 'owner' | 'admin' | 'manager' | 'viewer';

/** Per-request identity and store scope, set by the auth middleware. */
export interface RequestContext {
  storeId: string;
  userId: string | null;
  role: StoreRole;
  authMode: 'demo' | 'supabase';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}
