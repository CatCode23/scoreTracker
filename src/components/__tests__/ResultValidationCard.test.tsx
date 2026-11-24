import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultValidationCard } from '../ResultValidationCard';
import type { MatchResult } from '../../lib/types';

const result: MatchResult = {
  id: 'r1',
  match_id: 'm1',
  result_method: 'score',
  status: 'submitted',
  winner_participant_id: 'a',
  loser_participant_id: 'b',
  participant_values: [
    { participant_id: 'a', score: 2 },
    { participant_id: 'b', score: 1 },
  ],
  referee_confirmed: false,
  submitted_by: 'u1',
  submitted_at: '2026-12-08T15:00:00Z',
  validated_by: null,
  validated_at: null,
  status_reason: null,
  notes: 'Clean game',
  created_at: '2026-12-08T15:00:00Z',
};
const team = (id: string | null) => ({ a: 'Raptors', b: 'Lancers' })[id ?? ''] ?? 'TBD';

function setup(overrides: Partial<Parameters<typeof ResultValidationCard>[0]> = {}) {
  const onAction = vi.fn().mockResolvedValue(undefined);
  render(
    <ResultValidationCard
      result={result}
      title="SOC · SOC-R1-M1"
      teamLabel={team}
      submitterName="Scorer One"
      canValidate
      canVoidOfficial={false}
      onAction={onAction}
      {...overrides}
    />,
  );
  return { onAction, user: userEvent.setup() };
}

describe('ResultValidationCard', () => {
  it('shows the submitted values, submitter, timestamp and notes', () => {
    setup();
    expect(screen.getByText(/Scorer One/)).toBeInTheDocument();
    expect(screen.getByText(/Raptors — Winner/)).toBeInTheDocument();
    expect(screen.getByText('Score 2')).toBeInTheDocument();
    expect(screen.getByText('Notes: Clean game')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
    expect(screen.getByText('Unofficial')).toBeInTheDocument();
  });

  it('approves after confirmation (no reason needed)', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: /Approve/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/publishes the result/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(onAction).toHaveBeenCalledWith('official', null);
  });

  it('requires a reason to return for correction', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: /Return for Correction/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Return for Correction' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(within(dialog).getByText('A reason is required.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason (required)'), 'Wrong score entered');
    await user.click(within(dialog).getByRole('button', { name: 'Return for Correction' }));
    expect(onAction).toHaveBeenCalledWith('returned', 'Wrong score entered');
  });

  it('requires a reason to dispute and to void', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: /Mark Disputed/ }));
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('Reason (required)'),
      'Coach protest',
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark Disputed' }),
    );
    expect(onAction).toHaveBeenCalledWith('disputed', 'Coach protest');

    await user.click(screen.getByRole('button', { name: /^Void$/ }));
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('Reason (required)'),
      'Duplicate entry',
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Void' }));
    expect(onAction).toHaveBeenLastCalledWith('void', 'Duplicate entry');
  });

  it('hides actions from users without validation authority', () => {
    setup({ canValidate: false });
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });

  it('shows the server error inside the dialog', async () => {
    const onAction = vi
      .fn()
      .mockRejectedValue(new Error('Cannot change a result from official to official'));
    const { user } = setup({ onAction });
    await user.click(screen.getByRole('button', { name: /Approve/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    expect(
      await within(screen.getByRole('dialog')).findByText(/Cannot change a result/),
    ).toBeInTheDocument();
  });
});
