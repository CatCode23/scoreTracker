import { useState } from 'react';
import { db, useOpsMutation } from '../lib/api/ops';
import { checkDestinationSlot, suggestSlot } from '../lib/domain/advancement';
import { humanize } from '../lib/domain/format';
import type { Match, MatchParticipant } from '../lib/types';
import { friendlyError } from '../lib/supabase';
import { Button, Checkbox, Field, Input, Notice, Select } from './ui';

export interface AdvanceTarget {
  from: Match;
  participantId: string;
  kind: 'winner_of_match' | 'loser_of_match' | 'manual';
}

/** Manually place a team into a slot of another match (with overwrite protection). */
export function AdvanceDialog({
  target,
  matches,
  slots,
  team,
  onClose,
}: {
  target: AdvanceTarget;
  matches: Match[];
  slots: MatchParticipant[];
  team: (id: string | null) => string;
  onClose: () => void;
}) {
  const defaultDest =
    target.kind === 'winner_of_match'
      ? target.from.next_winner_match_id
      : target.kind === 'loser_of_match'
        ? target.from.next_loser_match_id
        : null;
  const defaultSlot =
    target.kind === 'winner_of_match'
      ? target.from.next_winner_slot
      : target.kind === 'loser_of_match'
        ? target.from.next_loser_slot
        : null;
  const [dest, setDest] = useState(defaultDest ?? '');
  const destSlots = slots.filter((s) => s.match_id === dest);
  const [slot, setSlot] = useState(defaultSlot ?? suggestSlot(destSlots));
  const [overwrite, setOverwrite] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = dest ? checkDestinationSlot(destSlots, slot, target.participantId) : null;
  const go = useOpsMutation(() =>
    db.rpc('advance_participant', {
      p_from_match_id: target.from.id,
      p_participant_id: target.participantId,
      p_to_match_id: dest,
      p_slot: slot,
      p_source_type: target.kind,
      p_overwrite: overwrite,
      p_reason: `${humanize(target.kind)} from ${target.from.match_code}`,
    }),
  );
  const blocked =
    !dest ||
    !slot.trim() ||
    !confirmed ||
    check?.kind === 'already_in_match' ||
    (check?.kind === 'occupied' && !overwrite);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adv-title"
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="adv-title" className="text-xl font-bold">
          {target.kind === 'winner_of_match'
            ? 'Advance winner'
            : target.kind === 'loser_of_match'
              ? 'Route loser'
              : 'Move team'}
        </h2>
        <p className="mt-1 text-slate-800">
          <strong>{team(target.participantId)}</strong> from {target.from.match_code}
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Destination match" htmlFor="adv-dest">
            <Select
              id="adv-dest"
              value={dest}
              onChange={(e) => {
                setDest(e.target.value);
                setSlot(suggestSlot(slots.filter((s) => s.match_id === e.target.value)));
                setOverwrite(false);
              }}
            >
              <option value="">Select…</option>
              {matches
                .filter((m) => m.id !== target.from.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.match_code} · {m.round_name ?? ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Destination slot" htmlFor="adv-slot">
            <Input
              id="adv-slot"
              value={slot}
              onChange={(e) => {
                setSlot(e.target.value);
                setOverwrite(false);
              }}
            />
          </Field>
          {dest && (
            <div className="text-sm">
              Current slots:{' '}
              {destSlots.length === 0
                ? 'none'
                : destSlots.map((s) => `${s.slot}: ${team(s.participant_id)}`).join(' · ')}
            </div>
          )}
          {check?.kind === 'occupied' && (
            <Notice tone="warn" title="Slot already occupied">
              Slot {slot} currently holds <strong>{team(check.occupantParticipantId)}</strong>.
              Advancing will overwrite it.
              <div className="mt-2">
                <Checkbox
                  id="adv-overwrite"
                  label="Yes, overwrite this slot"
                  checked={overwrite}
                  onChange={setOverwrite}
                />
              </div>
            </Notice>
          )}
          {check?.kind === 'already_in_match' && (
            <Notice tone="error">
              This team is already in slot {check.existingSlot} of that match.
            </Notice>
          )}
          {check?.kind === 'same' && (
            <Notice tone="info">This team is already in that slot. Nothing will change.</Notice>
          )}
          <Checkbox
            id="adv-confirm"
            label="I confirm this advancement"
            description="Recorded in the audit log."
            checked={confirmed}
            onChange={setConfirmed}
          />
          {err && <Notice tone="error">{err}</Notice>}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={blocked || go.isPending}
            onClick={async () => {
              setErr(null);
              try {
                await go.mutateAsync(undefined);
                onClose();
              } catch (x) {
                setErr(friendlyError(x));
              }
            }}
          >
            {go.isPending ? 'Working…' : 'Confirm advancement'}
          </Button>
        </div>
      </div>
    </div>
  );
}
