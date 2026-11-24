import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScoreEntryForm, type EntryParticipant } from '../ScoreEntryForm';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const teams: EntryParticipant[] = [
  { participant_id: A, slot: 'A', label: 'Raptors (1-2 SBCT)' },
  { participant_id: B, slot: 'B', label: 'Lancers (2-2 SBCT)' },
];

describe('ScoreEntryForm', () => {
  it('submits a 2-1 result with the inferred winner (no referee step)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ScoreEntryForm matchType="head_to_head" participants={teams} onSubmit={onSubmit} />);

    // Participants are read-only labels, not editable fields
    expect(screen.getAllByText('Raptors (1-2 SBCT)').length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('Raptors (1-2 SBCT)')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Score for Raptors (1-2 SBCT)'), '2');
    await user.type(screen.getByLabelText('Score for Lancers (2-2 SBCT)'), '1');
    await user.click(screen.getByRole('button', { name: /Submit Result/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      result_method: 'score',
      winner_participant_id: A,
      loser_participant_id: B,
      participant_values: [
        { participant_id: A, score: 2 },
        { participant_id: B, score: 1 },
      ],
      notes: null,
    });
    expect(await screen.findByText(/Awaiting Approval/)).toBeInTheDocument();
  });

  it('rejects negative scores', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScoreEntryForm matchType="head_to_head" participants={teams} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Score for Raptors (1-2 SBCT)'), '-2');
    await user.type(screen.getByLabelText('Score for Lancers (2-2 SBCT)'), '1');
    await user.click(
      screen.getByLabelText('Raptors (1-2 SBCT)', { selector: 'input[type=radio]' }),
    );
    await user.click(screen.getByRole('button', { name: /Submit Result/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Scores, times and penalties cannot be negative.')).toBeInTheDocument();
  });

  it('shows server errors and stays on the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
    render(<ScoreEntryForm matchType="head_to_head" participants={teams} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Score for Raptors (1-2 SBCT)'), '3');
    await user.type(screen.getByLabelText('Score for Lancers (2-2 SBCT)'), '0');
    await user.click(screen.getByRole('button', { name: /Submit Result/ }));
    expect(await screen.findByText(/not authorized/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Result/ })).toBeInTheDocument();
  });

  it('collects times, penalties and places for a timed heat', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const heat: EntryParticipant[] = [
      ...teams,
      { participant_id: C, slot: 'Lane 3', label: 'Hawks (16th CAB)' },
    ];
    render(<ScoreEntryForm matchType="heat" participants={heat} onSubmit={onSubmit} />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Time (mm:ss or seconds) for Raptors (1-2 SBCT)'),
      '12:30',
    );
    await user.type(screen.getByLabelText('Penalty (seconds) for Raptors (1-2 SBCT)'), '10');
    await user.type(screen.getByLabelText('Place (1 = first) for Raptors (1-2 SBCT)'), '1');
    await user.type(
      screen.getByLabelText('Time (mm:ss or seconds) for Lancers (2-2 SBCT)'),
      '13:00',
    );
    await user.type(screen.getByLabelText('Place (1 = first) for Lancers (2-2 SBCT)'), '2');
    await user.click(screen.getByRole('button', { name: /Submit Result/ }));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.result_method).toBe('time');
    expect(payload.winner_participant_id).toBe(A);
    expect(payload.participant_values[0]).toEqual({
      participant_id: A,
      time_seconds: 750,
      penalty_seconds: 10,
      placement: 1,
    });
  });

  it('warns when no teams are assigned', () => {
    render(<ScoreEntryForm matchType="head_to_head" participants={[]} onSubmit={vi.fn()} />);
    expect(screen.getByText(/No teams are assigned/)).toBeInTheDocument();
  });

  it('admins save results as Official and see that it is live', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ScoreEntryForm
        matchType="head_to_head"
        participants={teams}
        onSubmit={onSubmit}
        submitsOfficial
      />,
    );
    expect(screen.queryByLabelText(/Referee/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Score for Raptors (1-2 SBCT)'), '2');
    await user.type(screen.getByLabelText('Score for Lancers (2-2 SBCT)'), '0');
    await user.click(screen.getByRole('button', { name: /Save Official Result/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Result saved: Official/)).toBeInTheDocument();
  });

  it('edit mode is prefilled and requires a reason', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ScoreEntryForm
        matchType="head_to_head"
        participants={teams}
        onSubmit={onSubmit}
        initial={{
          result_method: 'score',
          winner_participant_id: A,
          loser_participant_id: B,
          participant_values: [
            { participant_id: A, score: 3 },
            { participant_id: B, score: 1 },
          ],
          notes: null,
        }}
      />,
    );
    expect(screen.getByLabelText('Score for Raptors (1-2 SBCT)')).toHaveValue('3');
    // The scores were entered the wrong way round: B won 3-1.
    await user.clear(screen.getByLabelText('Score for Raptors (1-2 SBCT)'));
    await user.type(screen.getByLabelText('Score for Raptors (1-2 SBCT)'), '1');
    await user.clear(screen.getByLabelText('Score for Lancers (2-2 SBCT)'));
    await user.type(screen.getByLabelText('Score for Lancers (2-2 SBCT)'), '3');
    await user.click(
      screen.getByLabelText('Lancers (2-2 SBCT)', { selector: 'input[type=radio]' }),
    );
    await user.click(screen.getByRole('button', { name: /Save corrected result/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Give a short reason/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason for the change/), 'entered the wrong way round');
    await user.click(screen.getByRole('button', { name: /Save corrected result/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        winner_participant_id: B,
        loser_participant_id: A,
        reason: 'entered the wrong way round',
      }),
    );
  });
});
