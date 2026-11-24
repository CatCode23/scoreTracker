import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil } from 'lucide-react';
import { db, useOpsMutation, useTeams } from '../../lib/api/ops';
import { teamSchema, type TeamInput } from '../../lib/domain/validation';
import type { Team } from '../../lib/types';
import { friendlyError } from '../../lib/supabase';
import { Button, Card, Checkbox, Field, Input, Notice, PageHeader } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';

function TeamForm({ team, onDone }: { team?: Team; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState, setValue, watch } = useForm<TeamInput>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      team_name: team?.team_name ?? '',
      unit: team?.unit ?? '',
      player_count: team?.player_count ?? null,
      captain_name: team?.captain_name ?? null,
      active: team?.active ?? true,
    },
  });
  const save = useOpsMutation((v: TeamInput) => (team ? db.update('teams', team.id, v) : db.insert('teams', v)));
  const e = formState.errors;
  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={handleSubmit(async (v) => {
        setErr(null);
        try {
          await save.mutateAsync({ ...v, captain_name: v.captain_name?.trim() || null });
          onDone();
        } catch (x) {
          setErr(friendlyError(x));
        }
      })}
    >
      <Field label="Team name" htmlFor="team_name" error={e.team_name?.message}>
        <Input id="team_name" {...register('team_name')} />
      </Field>
      <Field label="Unit" htmlFor="unit" error={e.unit?.message}>
        <Input id="unit" {...register('unit')} />
      </Field>
      <Field label="Player count" htmlFor="player_count" error={e.player_count?.message}>
        <Input
          id="player_count"
          inputMode="numeric"
          {...register('player_count', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })}
        />
      </Field>
      <Field label="Captain name (restricted — staff only)" htmlFor="captain_name" error={e.captain_name?.message}>
        <Input id="captain_name" {...register('captain_name')} />
      </Field>
      <div className="sm:col-span-2">
        <Checkbox id="team-active" label="Active" checked={watch('active')} onChange={(v) => setValue('active', v)} />
      </div>
      {err && <Notice tone="error" className="sm:col-span-2">{err}</Notice>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {team ? 'Save team' : 'Create team'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Teams() {
  const teams = useTeams();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [q, setQ] = useState('');
  if (teams.isLoading) return <Loading />;
  if (teams.error) return <ErrorState error={teams.error} />;
  const list = (teams.data ?? []).filter((t) => `${t.team_name} ${t.unit}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Team Registration"
        subtitle="One master record per team. Register teams into sports on Event Registration."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-5 w-5" aria-hidden /> New team
          </Button>
        }
      />
      <Notice tone="warn">Captain names are restricted operational data. Do not enter CUI or unnecessary personal data.</Notice>
      {editing && (
        <Card title={editing === 'new' ? 'New team' : `Edit ${editing.team_name}`}>
          <TeamForm key={editing === 'new' ? 'new' : editing.id} team={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </Card>
      )}
      <Input aria-label="Search teams" placeholder="Search teams or units" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? (
        <Empty title="No teams yet" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-300 bg-white p-3">
              <span>
                <span className="block font-bold">
                  {t.team_name} {!t.active && <span className="text-sm text-red-700">(inactive)</span>}
                </span>
                <span className="block text-sm text-slate-700">
                  {t.unit} · {t.player_count ?? '?'} players
                </span>
                <span className="block text-sm text-slate-700">Captain: {t.captain_name || '—'}</span>
              </span>
              <Button variant="ghost" aria-label={`Edit ${t.team_name}`} onClick={() => setEditing(t)}>
                <Pencil className="h-5 w-5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
