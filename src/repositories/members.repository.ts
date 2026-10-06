import { supabase } from '../config/supabase.js';
import type { StoreRole } from '../types/context.js';
import { unwrap } from '../utils/db.js';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
}

export interface MembershipRow {
  store_id: string;
  user_id: string;
  role: StoreRole;
  created_at: string;
}

export const membersRepository = {
  /** Match an authenticated Supabase user to a `users` row: by id first, then by email. */
  async findUser(authUserId: string, email: string | undefined): Promise<UserRow | null> {
    const byId = unwrap<UserRow | null>(
      await supabase.from('users').select('id, email, name').eq('id', authUserId).maybeSingle(),
    );
    if (byId || !email) return byId;

    return unwrap<UserRow | null>(
      await supabase.from('users').select('id, email, name').eq('email', email.toLowerCase()).maybeSingle(),
    );
  },

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return unwrap<MembershipRow[]>(
      await supabase
        .from('store_members')
        .select('store_id, user_id, role, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    );
  },
};
