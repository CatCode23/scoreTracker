# Admin Runbook

Audience: operations admins and sport managers. All of the actions below are recorded in
the **Audit Log**.

## 1. Pre-event setup (T-7 to T-2 days)

1. Confirm the deployment works: open the public URL on an iPhone and on an Android
   phone.
2. **Ops → Settings**:
   - Check the **tournament year** and load the **preliminary schedule**.
   - Check the **no-show penalty**. The default is −6. Change it or disable it if needed.
   - Check the **points matrix**: 1st=8 … 8th=1.
   - Edit each **event**: name, format, venue, responsible unit, dates, target team count,
     counts toward overall, and public visibility.
3. Create staff accounts (see section 5). Optional: configure custom SMTP in Supabase if
   you want the backup email-link sign-in to work reliably.

## 2. Register teams

**Ops → Teams → New team.** Enter the team name, unit, player count and captain name.

- Captain names are restricted and visible only to staff.
- Create **one record per team**, even if the team plays several sports.

## 3. Register event participants

**Ops → Event Registration**:

1. Pick the event.
2. Add teams and set their seeds.
3. Watch for the **target count warning**.
4. Check-in status can be Registered, Checked in, No show, or Withdrawn. Setting
   "No show" does **not** apply a penalty (see section 9).

## 4. Load schedules and brackets

**Ops → Match Setup** (pick an event):

1. **Stages & Pools.** Create stages in order, for example:
   - Soccer: `1 Championship (elimination)`, then `2 Placement (placement)` for the
     3rd-place game.
   - Basketball: `1 Championship`, `2 Consolation` (5th–8th), `3 Placement`.
   - Dodgeball: `1 Pool Play (pool)`, then `2 Playoffs (elimination)`.
   - Brostrom PT / Big 7: `1 Heats (heat)` or `1 Stations`.
   - Combatives: `1 Bouts`. Use the round name for the weight class, e.g. "185 lb".

   For pool stages, add the pools and assign teams to them.
2. **Sessions.** Edit the preliminary sessions or add new ones. A match linked to a
   session takes that session's **venue**. Venue controls which venue-scoped scorers can
   see the match.
3. **Matches.** Add each game, bout or heat. Fill in:
   - code (unique, e.g. `BSK-QF1`), stage, round name and order, match number, type,
     date, time, area;
   - **winner goes to** / **loser goes to**, with slots. These are routing hints for
     manual advancement.
4. **Assign** teams to slots (A/B, or Lane 1…n for heats).
5. Alternatively, use **Import CSV**. Import matches first, then participants by seed.
   Import never overwrites existing matches.
6. Resolve any **schedule overlap** and **fewer than two teams** warnings.

## 5. Assign scorers and managers

**Create the account in Supabase:** *Authentication → Users → Add user → Create new
user*. Enter their email and a temporary password, and tick **Auto Confirm User**. Don't
use *Invite user*.

Give them the temporary password directly (in person or by phone, not in a group chat).
They change it in the app under **Change Password**. To reset a forgotten password, open
the user in Supabase and set a new one.

**Then in the app, Ops → Users**:

1. Find the person.
2. **Activate** the account.
3. Set the primary role.
4. **Add assignments**: role + event + venue. Leave the venue blank for all venues.

Guidance by role:

- **Scorer:** event + venue.
- **Venue lead:** event + venue. Can validate results at that venue.
- **Sport manager:** event, all venues. Manages setup, advancement, corrections and
  placements.
- **Read only:** set it as the primary role for a view of everything, or as an event
  assignment for one event.

## 6. Test result submission (dry run, T-1)

1. Create test teams with an obvious name, e.g. `TEST A`, in a test stage.
2. Have each scorer sign in on their own phone and submit a result.
3. The venue lead returns one result and marks another Official.
4. Check the public page.
5. **Delete the test data** afterwards. Delete matches first, then the registrations, then
   the teams. The audit log keeps the history.

## 7. Validate and publish results

**Ops → Validation → Awaiting Validation.** Compare each card with the paper or referee
sheet, then choose:

- **Mark Official:** publishes immediately to the public pages.
- **Return for Correction** (reason required): the scorer submits again.
- **Mark Disputed** (reason required): stays unofficial until resolved.
- **Void** (reason required).

A result can only become Official if the referee confirmation box was checked.

## 8. Correct a result

A scorer or venue lead requests a correction from the result card (Score Entry → *My
recent submissions → Request correction*).

The sport manager then goes to **Validation → Correction requests**:

- **Approve** (notes required). An Official result is **voided** and removed from the
  public pages. A pending result is returned. The match reopens, and a corrected result
  is submitted and validated as usual.
- **Deny** (notes required).

Sport managers can also void an Official result directly from **Recently decided**.

## 9. Advance winners and losers

**Ops → Match Management.** On an Official match:

1. Press **Advance winner** or **Route loser**.
2. The destination defaults to the match's routing. Confirm the match and slot.
3. If the slot is occupied, you must tick **overwrite**.
4. Tick **I confirm** to complete the move.

Other controls:

- **Move…** moves any team manually.
- **Eliminate** marks a team out.
- The status selector sets Delayed, In progress, Ready, Complete or Void.

For pools, use **Match Setup → Stages & Pools → Recompute standings**. Then set the rank
and mark each team Advances, Wild card, or Did not advance.

## 10. Enter final placements

**Ops → Placements**:

1. Enter places 1–8 (more if needed). Points fill in automatically from the matrix.
2. An operations admin presses **Approve & Publish** to put them on the public page and
   the leaderboard.

Editing an approved placement automatically withdraws its approval and publication.

**No-show penalty:** press *Apply penalty* for the team and give a reason. This applies
the configured points and marks the team No show. It can be deactivated later.

## 11. Close out an event

- [ ] All matches are Official, Complete or Void. Check the Dashboard's completion bar.
- [ ] No results are left Awaiting Validation, Disputed or Returned.
- [ ] No pending corrections.
- [ ] Placements are entered, approved and published.
- [ ] Penalties are reviewed.
- [ ] **Settings → Events**: set the status to **Complete**.
- [ ] Export or screenshot the leaderboard for the record, if required.
