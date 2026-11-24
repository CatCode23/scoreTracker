import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventParticipant } from '../../../lib/types';

const { insert, update, remove, teamInsert } = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  teamInsert: vi.fn(),
}));
vi.mock('../../../lib/api/ops', async (orig) => ({
  ...(await orig<typeof import('../../../lib/api/ops')>()),
  db: { insert, update, remove, rpc: vi.fn() },
}));
vi.mock('../../../lib/supabase', () => ({
  isConfigured: true,
  friendlyError: (e: { message?: string }) => e?.message ?? 'error',
  supabase: {
    from: () => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => teamInsert(row) }) }),
    }),
  },
}));

const { saveTeam, EventRoster } = await import('../Teams');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { ConfirmDialog } = await import('../../../components/ConfirmDialog');

const reg = (id: string, event_id: string) => ({ id, event_id, team_id: 't1' }) as EventParticipant;

beforeEach(() => vi.clearAllMocks());

describe('saveTeam', () => {
  const values = { team_name: ' Soccer A ', unit: '1-2 SBCT', player_count: null, active: true };

  it('creates the team, then registers it in the chosen events', async () => {
    teamInsert.mockResolvedValue({ data: { id: 'new-team' }, error: null });
    await saveTeam({ ...values, event_ids: ['soc', 'bsk'] }, undefined, []);
    expect(teamInsert).toHaveBeenCalledWith({
      team_name: 'Soccer A',
      unit: '1-2 SBCT',
      player_count: null,
      active: true,
    });
    expect(insert).toHaveBeenCalledWith('event_participants', [
      { event_id: 'soc', team_id: 'new-team' },
      { event_id: 'bsk', team_id: 'new-team' },
    ]);
  });

  it('on edit, adds newly ticked events and removes unticked ones', async () => {
    const team = {
      id: 't1',
      team_name: 'Soccer A',
      unit: '1-2 SBCT',
      player_count: null,
      captain_name: null,
      active: true,
    };
    await saveTeam({ ...values, event_ids: ['soc', 'ffb'] }, team, [
      reg('r-soc', 'soc'),
      reg('r-bsk', 'bsk'),
    ]);
    expect(update).toHaveBeenCalledWith(
      'teams',
      't1',
      expect.objectContaining({ unit: '1-2 SBCT' }),
    );
    expect(insert).toHaveBeenCalledWith('event_participants', [{ event_id: 'ffb', team_id: 't1' }]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('event_participants', 'r-bsk');
  });
});

describe('ConfirmDialog requireText', () => {
  it('enables the confirm button only after the exact code is typed', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        options={{
          title: 'Delete Soccer?',
          requireText: 'SOC',
          confirmLabel: 'Delete event',
          danger: true,
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const button = screen.getByRole('button', { name: 'Delete event' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), 'SO');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), 'C');
    await user.click(button);
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('EventRoster (seeds and check-in on the Teams page)', () => {
  const event = {
    id: 'soc',
    event_code: 'SOC',
    event_name: 'Soccer',
    format_type: 'single_elimination',
    venue: null,
    responsible_unit: null,
    start_date: null,
    end_date: null,
    target_team_count: 20,
    counts_toward_overall: true,
    status: 'planning',
    public_visible: true,
    display_order: 1,
    notes: null,
  } as const;
  const team = {
    id: 't1',
    team_name: 'Unit A Soccer',
    unit: 'Unit A',
    player_count: 12,
    captain_name: null,
    active: true,
  };
  const regs = [
    {
      id: 'r1',
      event_id: 'soc',
      team_id: 't1',
      seed: 3,
      check_in_status: 'registered',
      eligible_for_points: true,
      final_place: null,
      event_points: 0,
      active: true,
      notes: null,
    },
  ] as EventParticipant[];
  const renderRoster = (canEdit = true) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventRoster
          event={event}
          regs={regs}
          teamsById={new Map([['t1', team]])}
          canEdit={canEdit}
          onEditTeam={vi.fn()}
        />
      </QueryClientProvider>,
    );

  it('shows the count against the target and saves seed and check-in changes', async () => {
    const user = userEvent.setup();
    renderRoster();
    expect(screen.getByText(/Soccer: 1 team \(target 20\)/)).toBeInTheDocument();
    expect(screen.getByText(/the target is 20/)).toBeInTheDocument();
    const seed = screen.getByLabelText('Seed for Unit A Soccer');
    await user.clear(seed);
    await user.type(seed, '1');
    await user.tab();
    expect(update).toHaveBeenCalledWith('event_participants', 'r1', { seed: 1 });
    await user.selectOptions(
      screen.getByLabelText('Check-in status for Unit A Soccer'),
      'checked_in',
    );
    expect(update).toHaveBeenCalledWith('event_participants', 'r1', {
      check_in_status: 'checked_in',
    });
  });

  it('removes a team from the event only after confirmation', async () => {
    const user = userEvent.setup();
    renderRoster();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove from event' }));
    expect(remove).toHaveBeenCalledWith('event_participants', 'r1');
  });

  it('is read-only for users who cannot manage the event', () => {
    renderRoster(false);
    expect(screen.queryByLabelText('Seed for Unit A Soccer')).not.toBeInTheDocument();
    expect(screen.getByText(/Seed 3/)).toBeInTheDocument();
  });
});
