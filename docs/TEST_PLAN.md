# Test Plan

## Automated

| Suite | Command | Covers |
|---|---|---|
| Unit | `npm test` | Points matrix and unit leaderboard totals/tiebreaks; team save (registrations added/removed); typed confirmation for event delete; result validation (negatives, winner not in match, winner = loser, referee confirmation, duplicate placements, lower-score winner); warnings (target count, fewer than 2 teams, overlapping matches); advancement slot checks (empty / occupied / same / already in match); bracket grouping; duration parsing; CSV; UI permission mirror |
| Component | `npm test` | **Score Entry**: 2–1 submit payload, referee confirmation required, negative rejected, server error shown, timed-heat fields. **Result Validation**: Official confirm, required reasons for return/dispute/void, Official blocked without referee confirmation, actions hidden without authority, error shown in the dialog |
| Database | `npm run test:db` | Migrations and seed (seed run twice to check it is idempotent). Then 82 assertions covering the manual E2E script below plus RLS negatives: anon cannot read raw tables, scorer at the wrong venue, inactive user, self-elevation, audit-log writes, sport manager publishing, points override, writes through public views, unit list enforcement, unit leaderboard, team and event deletes, and so on |

All three suites run in CI before every deploy.

## Manual end-to-end script (run against the real Supabase project)

Prerequisites: test accounts (see below) and the schedule loaded.

| # | Actor | Steps | Expected |
|---|---|---|---|
| 1 | Admin | Ops → Settings → Units: add `TEST Unit A` and `TEST Unit B`. Ops → Teams: create `TEST Raptors` (TEST Unit A) and `TEST Lancers` (TEST Unit B), both ticked for Soccer | Both appear under their unit with a Soccer badge; a duplicate name+unit is rejected; a team with no event ticked is rejected |
| 2 | Admin | Ops → Event Registration → Soccer: set seeds 1 and 2 | Both listed; the target-count warning is shown |
| 3 | Admin | Match Setup → Soccer: create stage `Championship`, matches `SOC-T1` (Round 1) and `SOC-T2` (Final). Set SOC-T1 to winner → SOC-T2 slot A. Assign Raptors=A and Lancers=B to SOC-T1 | Matches visible on the public Soccer Bracket Board with no scores |
| 4 | Scorer (assigned Soccer + North Fort Athletic Complex) | Score Entry → Soccer → SOC-T1: Raptors 2, Lancers 1, winner Raptors, tick referee, Submit | "Awaiting Validation". The public page **still shows no score**. The dashboard shows 1 awaiting |
| 5 | Venue lead (same event + venue) | Validation → Mark Official → confirm | The result is Official |
| 6 | Public (signed out / other phone) | Open `#/sport/SOC` | Within seconds (Realtime) or ≤60 s (polling): Raptors 2 (winner crown), Lancers 1. The Results tab lists it |
| 7 | Sport manager | Match Management → SOC-T1 → Advance winner → SOC-T2 / A → tick confirm | Raptors appear in SOC-T2 slot A on the public bracket. Trying slot A again with another team shows the **occupied** warning and requires overwrite |
| 8 | Admin | Ops Dashboard | Awaiting count 0; Soccer completion 1/2; audit log shows submit → approve → advancement entries |

Negative checks to repeat manually:

- The scorer cannot see other venues' matches.
- The scorer has no Validation menu item, and a direct URL shows "Not authorized".
- Signed-out users cannot open `#/ops`.
- A Returned result requires a reason.

## Acceptance criteria

- The public pages never show draft, submitted, returned or disputed results, emails, notes or audit data.
- Every score submission is linked to a named, active account.
- Results become public only through Official validation by an authorized role.
- Placements become public only after admin approval.
- No-show penalties are applied only by explicit, confirmed action.
- Every submit, validation, correction, void, advancement and placement change has an
  audit entry.
- The layout works at 320 px with no horizontal scroll, and touch targets are at least
  44 px.
- Loading, empty, error, unauthorized and offline states are shown.

## Test account setup guide (do not create production accounts with real people's data for tests)

1. In Supabase, go to *Authentication → Users → Add user → Create new user* and create
   test accounts with addresses you control, e.g. `you+scorer@…`, `you+lead@…`,
   `you+manager@…`. Give each a password and tick **Auto Confirm User**. The profile rows
   are created automatically.
3. As admin, go to **Ops → Users**: activate each account, and assign:
   - scorer: Scorer · Soccer · North Fort Athletic Complex
   - lead: Venue Lead · Soccer · North Fort Athletic Complex
   - manager: Sport Manager · Soccer · (all venues)
4. Sign in as each one in the app (a private browser window per account works well), and
   check that **Change Password** works.
5. After testing, **deactivate** the test accounts, or delete them in Supabase Auth.
6. Delete the `TEST` teams (remove them from matches first, or delete the test matches), then the `TEST` units.
