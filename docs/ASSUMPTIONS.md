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
4. **Accounts are invite-only.** New `auth.users` get an **inactive** `read_only` profile.
   An operations admin activates them and assigns roles. Magic links use
   `shouldCreateUser: false`.
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
15. **Team names and units are public.** They appear on the bracket. Captain names do not.
16. **Leaderboard tiebreak:** total points, then number of 1sts, then 2nds, then 3rds.
    Exact ties share a rank.
17. **Pool standings ranking suggestion:** W=2 and T=1 standing points, then point
    differential, then points for. Managers can override the rank and decide advancement.
18. **Teams can be created by sport managers** as well as admins ("authorized
    team-registration users").
19. **The audit log** also covers teams, registrations, assignments, profiles, settings
    and events, beyond the five tables the spec required.
20. **Magic-link flow:** PKCE, because it is compatible with HashRouter. Because phone
    email apps often open a different browser, the sign-in page also accepts the emailed
    one-time code. This requires `{{ .Token }}` in the email template.
21. **Realtime** for public clients goes through a non-sensitive `public_updates` table.
    Realtime cannot stream changes from views, and the raw tables are not readable by anon.
