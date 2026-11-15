'use client';
import { useSession } from '@/features/auth/session';

/** Admins and offices allowed in Admin › Offices & permissions can edit; every approved account can view. */
export function useBudgetAccess() {
  const { committee, isAdmin } = useSession();
  return { canEdit: isAdmin || !!committee?.can_budget };
}
