import type { Assignment, EventRow, Match, Profile, Role } from '../types';

// UI-side mirror of the RLS helper functions. This ONLY controls what the interface
// shows; the database enforces the real rules.

export const SUBMIT_ROLES: Role[] = ['scorer', 'venue_lead', 'sport_manager'];
export const VALIDATE_ROLES: Role[] = ['venue_lead', 'sport_manager'];
export const MANAGE_ROLES: Role[] = ['sport_manager'];

export interface Access {
  profile: Profile | null;
  assignments: Assignment[];
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

export function isActive(a: Access): boolean {
  return Boolean(a.profile?.active);
}

export function isOpsAdmin(a: Access): boolean {
  if (!isActive(a)) return false;
  return (
    a.profile!.role === 'operations_admin' ||
    a.assignments.some((x) => x.active && x.assignment_role === 'operations_admin')
  );
}

export function hasGlobalRead(a: Access): boolean {
  if (!isActive(a)) return false;
  return (
    isOpsAdmin(a) ||
    a.profile!.role === 'read_only' ||
    a.assignments.some((x) => x.active && x.assignment_role === 'read_only' && x.event_id === null)
  );
}

export function hasEventRole(a: Access, eventId: string, roles: Role[]): boolean {
  if (!isActive(a)) return false;
  if (isOpsAdmin(a)) return true;
  return a.assignments.some(
    (x) =>
      x.active &&
      roles.includes(x.assignment_role) &&
      (x.event_id === null || x.event_id === eventId),
  );
}

/** Venue of a match: session venue, else event venue. */
export function matchVenue(
  match: Pick<Match, 'session_id'>,
  event: Pick<EventRow, 'venue'> | undefined,
  sessionVenue?: string | null,
): string {
  return norm(match.session_id ? (sessionVenue ?? event?.venue) : event?.venue);
}

export function hasMatchRole(a: Access, eventId: string, venue: string, roles: Role[]): boolean {
  if (!isActive(a)) return false;
  if (isOpsAdmin(a)) return true;
  return a.assignments.some(
    (x) =>
      x.active &&
      roles.includes(x.assignment_role) &&
      (x.event_id === null || x.event_id === eventId) &&
      (x.venue === null || norm(x.venue) === norm(venue)),
  );
}

export function canManageEvent(a: Access, eventId: string): boolean {
  return hasEventRole(a, eventId, MANAGE_ROLES);
}

export function canRegisterTeams(a: Access): boolean {
  return (
    isOpsAdmin(a) ||
    (isActive(a) && a.assignments.some((x) => x.active && x.assignment_role === 'sport_manager'))
  );
}

export function canValidateAnything(a: Access): boolean {
  return (
    isOpsAdmin(a) ||
    (isActive(a) &&
      a.assignments.some((x) => x.active && VALIDATE_ROLES.includes(x.assignment_role)))
  );
}

export function canSubmitAnything(a: Access): boolean {
  return (
    isOpsAdmin(a) ||
    (isActive(a) && a.assignments.some((x) => x.active && SUBMIT_ROLES.includes(x.assignment_role)))
  );
}

export function canManageAnything(a: Access): boolean {
  return (
    isOpsAdmin(a) ||
    (isActive(a) && a.assignments.some((x) => x.active && MANAGE_ROLES.includes(x.assignment_role)))
  );
}

/**
 * Field staff only (scorers / venue leads): no setup, management or global view.
 * They land on Matches and see a short menu.
 */
export function isFieldOnly(a: Access): boolean {
  return isActive(a) && !isOpsAdmin(a) && !hasGlobalRead(a) && !canManageAnything(a);
}
