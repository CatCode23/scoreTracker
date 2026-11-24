# Design Assumptions

These assumptions were made where the specification left room for interpretation.

1. **Event codes:**
   - `SOC` Soccer
   - `CMB` Combatives
   - `ESP` E-Sports
   - `DB` Softball / Dodgeball
   - `BSK` Basketball
   - `FFB` Flag Football
   - `BPT` Brostrom PT
   - `BIG7` Big 7 Competition

   The spec gave `SOC`, `BSK` and `DB`. The others were chosen here.
2. **Tournament year.** It is not in the seed. `load_preliminary_schedule(year)` (also on
   Ops → Settings) creates the Dec 7–9 sessions for the chosen year and stores
   `tournament_year` in `scoring_settings`.
3. **Target team count** is seeded as 20 per event and is editable. Nothing is hard-coded
   around it.
4. **Accounts are created by admins only.** New `auth.users` get an **inactive**
   `read_only` profile. An operations admin activates them and assigns roles. The backup
   email link uses `shouldCreateUser: false`, so it can't create accounts.
5. **Two layers of roles.** `profiles.role` is the primary label and grants global powers
   for `operations_admin` and `read_only`. Scoped powers (scorer, venue lead, sport
   manager) come from `user_assignments`, which allows several events or venues per
   person. An `operations_admin` assignment also counts as admin.
6. **Match venue** is the linked session's venue, or else the event's venue. Venue-scoped
   assignments are compared case-insensitively.
7. **Who can submit.** Venue leads and sport managers may also submit results, not only
   scorers.
8. **`match_results.participant_values` (jsonb)** was added. It holds the scorer's
   per-team values, so scorers never need write access to `match_participants`. The
   values are copied to `match_participants` when the result becomes Official.
9. **`match_results.status_reason`** was added to store the required reason for return,
   dispute or void.
10. **`event_placements.points_override`** was added so that an admin override is explicit
    and is not recalculated. Only operations admins can set it.
11. **`point_adjustments` table** was added for no-show penalties and administrative
    adjustments. Penalties are not stored in placements, so they stay auditable and
    reversible.
12. **Approving a correction:**
    - If the result was Official, it is voided, the public values are cleared, and the
      match reopens for a corrected submission.
    - If it was pending, it is returned.

    Sport managers decide corrections, matching "approve correction requests for assigned
    event(s)".
13. **Who approves placements.** Approval and publication of placements is limited to
    operations admins ("approve final results and publish"). Sport managers record them.
14. **Public match status** maps internal statuses to plain public ones. `submitted`
    shows publicly as "In Progress", so unvalidated results are not hinted at.
15. **Team names and units are public.** They appear on the bracket.
16. **The overall leaderboard is per unit.** Each unit fields teams in the individual
    sports, and a unit's total is the sum of its teams' published placement points plus
    any penalties. If a unit enters **more than one team in the same sport**, all of those
    teams' points count. Tiebreak: total points, then number of 1sts, then 2nds, then
    3rds. Exact ties share a rank.
17. **Pool standings ranking suggestion:** W=2 and T=1 standing points, then point
    differential, then points for. Managers can override the rank and decide advancement.
18. **Teams can be created by sport managers** as well as admins ("authorized
    team-registration users").
19. **The audit log** also covers teams, registrations, assignments, profiles, settings
    and events, beyond the five tables the spec required.
20. **Email + password sign-in (changed from the original magic-link design).** The
    original spec called for magic-link or OAuth sign-in. Supabase's built-in email sender
    allows only a few emails per hour, which locked staff out during setup, so the primary
    sign-in is now email + password through Supabase Auth.
    - Passwords are stored and checked by Supabase (hashed). The app never stores them,
      so the spec's "no password storage in the application" still holds.
    - Admins create accounts with a temporary password (*Create new user*, Auto Confirm),
      and staff change it on the **Change Password** page (minimum 10 characters).
      Resets are done by an admin in Supabase.
    - Email link sign-in remains as a backup option. It uses PKCE, which is compatible
      with HashRouter, and also accepts the emailed one-time code; that requires
      `{{ .Token }}` in the email template.
21. **Realtime** for public clients goes through a non-sensitive `public_updates` table.
    Realtime cannot stream changes from views, and the raw tables are not readable by anon.
22. **Units are a managed list** (Settings → Units, operations admins only). Teams choose
    their unit from it, so spelling variations can't split a unit's points. Units are not
    seeded; admins enter the real list.
23. **Team captain names are not collected.** The `captain_name` column remains in the
    database (unused, never public) to avoid a destructive migration.
24. **Deletes:**
    - A team can be deleted with its registrations, unless it's already in matches (then
      it can be marked inactive). Only operations admins delete teams.
    - Deleting an event removes everything in it but keeps the teams, and requires typing
      the event code.
25. **No separate validation step (changed from the original spec).** Event
    administrators enter scores themselves, so results they enter (operations admin, sport
    manager, venue lead) are Official immediately. Scorer accounts, if used, still need
    approval, and the Approvals menu item only appears when something is waiting.
26. **Referee confirmation removed.** The checkbox is gone; the `referee_confirmed` column
    stays in the database, unused.
27. **Edit result replaces correction requests.** Operations admins and sport managers fix
    an Official result directly; the old version and the reason are kept in the audit log.
28. **Automatic advancement (changed from the original "manual only" design).** When a
    result becomes Official, the database places the winner/loser into the match's
    configured next slots. It never overwrites a slot holding another team, never adds a
    team to a match that already has a result, and can be turned off per match. Manual
    Advance winner / Route loser remain for anything it skips.
29. **One Teams page.** The separate Roster Review and Event Registration pages were
    removed. Teams handles creating/editing/deleting teams and their events; choosing an
    event in its filter shows that event's seeds, check-in, points eligibility and
    target-count warning.
30. **One Matches page.** Score Entry and Match Management were combined: pick an event,
    tap a match, then enter, approve or edit its result there. Rarely used bracket tools
    (status, manual advance/route, move, eliminate) are under **More** on the match.
    The old /ops/score link redirects to /ops/matches.
31. **Username sign-in.** Supabase identifies accounts by email, so a username account is
    created as `jsmith@wotb.local` (domain configurable with `VITE_USERNAME_DOMAIN`). The
    sign-in box accepts `jsmith` and adds the domain; real email addresses still work. No
    email is ever sent to these addresses. "Confirm email" should be turned off in Supabase.
32. **Placements fill in from placement matches.** A match can be marked "Decides places"
    (winner N, loser N+1; heats/stations: the result's places offset from N). Its Official
    result writes unapproved placements; publishing still needs an operations admin. If a
    filled place or team already had a placement (e.g. entered by hand), it is replaced.
