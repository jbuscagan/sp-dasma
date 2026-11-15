'use client';
import { useSession } from '@/features/auth/session';

/** Admins and accounts with "Budget encoder" ticked can edit; every approved account can view. */
export function useBudgetAccess() {
  const { profile, isAdmin } = useSession();
  return { canEdit: isAdmin || !!profile.can_budget };
}
