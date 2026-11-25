import { groupBracket } from '../bracket';
import { formatSeconds, formatTime, parseDuration } from '../format';
import { parseCsv } from '../csv';
import { hasMatchRole, isFieldOnly, isOpsAdmin } from '../permissions';
import type { Assignment, Profile } from '../../types';

describe('groupBracket', () => {
  const m = (id: string, stage: number, round: number, n: number | null, roundName?: string) => ({
    id,
    stage_id: `s${stage}`,
    stage_name: `Stage ${stage}`,
    stage_order: stage,
    stage_type: 'elimination',
    round_name: roundName ?? null,
    round_order: round,
    match_number: n,
    match_code: id,
  });
  it('groups by stage, round and match number', () => {
    const g = groupBracket([
      m('c', 2, 1, 1, '3rd Place'),
      m('b', 1, 2, 1, 'Final'),
      m('a2', 1, 1, 2),
      m('a1', 1, 1, 1),
    ]);
    expect(g.map((s) => s.stage_id)).toEqual(['s1', 's2']);
    expect(g[0].rounds.map((r) => r.round_name)).toEqual(['Round 1', 'Final']);
    expect(g[0].rounds[0].matches.map((x) => x.id)).toEqual(['a1', 'a2']);
  });
});

describe('format', () => {
  it('formats military time and durations', () => {
    expect(formatTime('13:00:00')).toBe('1300');
    expect(formatTime('07:30')).toBe('0730');
    expect(formatSeconds(125.4)).toBe('2:05.4');
    expect(formatSeconds(42)).toBe('42s');
  });
  it('parses durations', () => {
    expect(parseDuration('12:34.5')).toBe(754.5);
    expect(parseDuration('1:00:00')).toBe(3600);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('')).toBeNull();
    expect(Number.isNaN(parseDuration('1:75'))).toBe(true);
    expect(Number.isNaN(parseDuration('abc'))).toBe(true);
  });
});

describe('parseCsv', () => {
  it('parses headers and quoted fields', () => {
    expect(parseCsv('a,b\n1,"x, y"\n# comment\n2,"say ""hi"""')).toEqual([
      { a: '1', b: 'x, y' },
      { a: '2', b: 'say "hi"' },
    ]);
  });
});

describe('permissions (UI mirror of RLS)', () => {
  const profile = (role: Profile['role'], active = true): Profile => ({
    id: 'u',
    display_name: 'U',
    email: 'u@x',
    role,
    active,
    created_at: '',
  });
  const asg = (a: Partial<Assignment>): Assignment => ({
    id: 'a',
    profile_id: 'u',
    event_id: 'e1',
    venue: null,
    assignment_role: 'scorer',
    active: true,
    ...a,
  });

  it('inactive users have no access', () => {
    expect(isOpsAdmin({ profile: profile('operations_admin', false), assignments: [] })).toBe(
      false,
    );
  });
  it('venue-scoped scorer only matches that venue (case-insensitive)', () => {
    const a = { profile: profile('scorer'), assignments: [asg({ venue: 'Wilson Gym' })] };
    expect(hasMatchRole(a, 'e1', 'wilson gym', ['scorer'])).toBe(true);
    expect(hasMatchRole(a, 'e1', 'Other Gym', ['scorer'])).toBe(false);
    expect(hasMatchRole(a, 'e2', 'wilson gym', ['scorer'])).toBe(false);
    expect(hasMatchRole(a, 'e1', 'wilson gym', ['venue_lead'])).toBe(false);
  });

  it('field-only staff are scorers / venue leads without setup or global roles', () => {
    expect(
      isFieldOnly({
        profile: profile('venue_lead'),
        assignments: [asg({ assignment_role: 'venue_lead' })],
      }),
    ).toBe(true);
    expect(isFieldOnly({ profile: profile('scorer'), assignments: [asg({})] })).toBe(true);
    expect(
      isFieldOnly({
        profile: profile('sport_manager'),
        assignments: [asg({ assignment_role: 'sport_manager' })],
      }),
    ).toBe(false);
    expect(isFieldOnly({ profile: profile('operations_admin'), assignments: [] })).toBe(false);
    expect(isFieldOnly({ profile: profile('read_only'), assignments: [] })).toBe(false);
    expect(isFieldOnly({ profile: profile('scorer', false), assignments: [asg({})] })).toBe(false);
  });
});
