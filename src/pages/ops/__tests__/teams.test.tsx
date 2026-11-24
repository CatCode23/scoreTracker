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

const { saveTeam } = await import('../Teams');
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
