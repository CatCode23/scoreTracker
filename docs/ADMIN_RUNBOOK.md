# Admin Runbook

Audience: operations admins and sport managers. All of the actions below are recorded in
the **Audit Log**.

## 1. Pre-event setup (T-7 to T-2 days)

1. Confirm the deployment works: open the public URL on an iPhone and on an Android
   phone.
2. **Ops → Settings**:
   - Check each **event's dates and venue** under Events.
   - Check the **no-show penalty**. The default is −6. Change it or disable it if needed.
   - Check the **points matrix**: 1st=8 … 8th=1.
   - Edit each **event**: name, format, venue, responsible unit, dates, target team count,
     counts toward overall, and public visibility.
3. Create staff accounts (see section 5). Optional: configure custom SMTP in Supabase if
   you want the backup email-link sign-in to work reliably.

## 2. Add units and teams

Points are earned by **teams** in each sport and totalled by **unit** on the public
leaderboard.

1. **Ops → Settings → Units:** add every competing unit, e.g. `1-2 SBCT`. Spell each one
   once, here. Teams pick from this list, so a typo can't split a unit's points.
   - **Renaming** a unit renames it on all its teams.
   - **Hide from new teams** keeps it out of the dropdown without touching existing teams.
   - **Delete** only works once the unit has no teams.
2. **Ops → Teams → New team:**
   - Team name, e.g. `1-2 SBCT Soccer`.
   - Unit, chosen from the list.
   - The events the team plays in (tick one or more).
   - Player count, if you want it.
3. **Edit** a team (pencil) to change its unit or events. Unticking an event removes the
   team from it, which is refused once the team is in matches.
4. **Delete** a team (bin, operations admins only). This also removes it from its events.
   It is refused if the team is already in matches: mark it inactive instead, or remove it
   from those matches first.

Use the unit and event filters at the top of the Teams page to check each sport's entries.

### Events

**Ops → Settings → Events:** edit an event, **Add event** for a new sport, or **Delete**
one. Deleting asks you to type the event code, and removes everything in the event
(registrations, matches, results, placements, penalties) but keeps the teams.
To take an event off the public site without losing anything, untick "Visible on public
site" instead.

## 3. Seeds and check-in

**Ops → Teams**, then choose the event in the **All events** filter. The page switches to
that event's teams:

1. Set each team's **seed**.
2. Set **check-in**: Registered, Checked in, No show, or Withdrawn. Setting "No show"
   does **not** apply a penalty (see Placements).
3. Watch for the **target count warning**.
4. **Exclude pts** stops a team's placing from counting toward its unit's points.
5. **Remove** takes a team out of that event; the team itself is kept. This is refused
   once the team is in matches; mark it Withdrawn instead.

To add a team to an event, edit the team (pencil) and tick the event.

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
2. **Matches.** Add each game, bout or heat. Fill in:
   - stage and round name (pick from the list or type one). **Round order, match number
     and match code fill in automatically**, e.g. Basketball → Quarterfinal → match 3 →
     `BSK-QF3`, Final → `BSK-F`. Type in any of them to use your own;
   - type, date, time, area;
   - **Winner goes to:** the next match. When a result is saved, the winner moves into
     that match's first open slot (A, then B). For semifinals and consolation games, tick
     **Loser plays again** and choose where the loser goes (e.g. the 3rd place game).
     Untick **Move teams on: Automatically** for a match if you want to place teams by hand.
   - **Decides places** for the Final, 3rd-place and other placement games (e.g. Final →
     1st/2nd). Saving their results fills in Placements (see section 10).
3. **Assign** teams to slots (A/B, or Lane 1…n for heats).
4. Alternatively, use **Import CSV**. Import matches first, then participants by seed.
   Import never overwrites existing matches.
5. Resolve any **schedule overlap** and **fewer than two teams** warnings.

## 5. Assign scorers and managers

**Create the account in Supabase:** *Authentication → Users → Add user → Create new
user*. For the email, use their real address, or a username in the form
`jsmith@wotb.local` (they then sign in with just `jsmith`). Enter a temporary password and
tick **Auto Confirm User**. Don't use *Invite user*.

Give them their username and temporary password directly (in person or by phone, not in a group chat).
They change it in the app under **My Account**. To reset a forgotten password, open
the user in Supabase and set a new one.

**Then in the app, Ops → Users**:

1. Find the person.
2. **Activate** the account.
3. Set the primary role.
4. **Add assignments**: role + event + venue. Leave the venue blank for all venues.

Guidance by role:

- **Scorer:** event + venue.
- **Venue lead:** event + venue. Results they enter are Official; they can approve Scorer results at that venue.
- **Sport manager:** event, all venues. Manages setup, results (including Edit result),
  advancement and placements.
- **Read only:** set it as the primary role for a view of everything, or as an event
  assignment for one event.

## 6. Test result submission (dry run, T-1)

1. Create test teams with an obvious name, e.g. `TEST A`, in a test stage.
2. Have each person who enters scores sign in on their own phone and save a result.
3. Fix one of the results with **Edit result** (Matches → the match).
4. Check the public page.
5. **Delete the test data** afterwards. Delete matches first, then the registrations, then
   the teams. The audit log keeps the history.

## 7. Enter results

**Ops → Matches:** pick the event, tap the match (the **To play** tab lists what's left),
enter the scores (or times/places), pick the winner and tap **Save Official Result**. It
is live on the public site straight away, and the teams move on to their next match.

Results from **Scorer** accounts (if you use them) are not public until approved. Open the
match and **Approve** it, or use **Approvals (n)** in the menu, which appears only when
something is waiting.

## 8. Fix a mistake (Edit result)

**Ops → Matches →** **Finished** tab → tap the match → **Edit result**.

1. Correct the scores, times, places or winner.
2. Give a short reason, e.g. "typo, was 3-1".
3. Tap **Save corrected result**.

The public site updates immediately. The old result and the reason stay in the **Audit
Log**.

If the winner changes and teams have already been advanced from that match, the dialog
lists them. Leave **swap the corrected teams into those matches** ticked to fix the next
matches automatically. This is refused if a next match already has a result: edit that
one first, or untick the box and move teams by hand.

Operations admins and the event's sport managers can edit results.

## 9. Advance winners and losers

**Normally this happens automatically.** When a result is saved (or a Scorer's result is
approved), the winner goes into the "Winner goes to" slot and the loser into the "Loser
goes to" slot, as set up for that match. The match screen tells you where each team went.

A move is **skipped, never forced**, when:
- that slot already holds a different team;
- the team is already in that match;
- the next match already has a result;
- the match has **Move teams on: Automatically** turned off.

The match screen then warns you, and you place the team by hand:

**Ops → Matches →** tap the match **→ More**:

1. Press **Advance winner** or **Route loser**.
2. The destination defaults to the match's routing. Confirm the match and slot.
3. If the slot is occupied, you must tick **overwrite**.
4. Tick **I confirm** to complete the move.

Other controls under **More**:

- **Move…** moves any team manually.
- **Eliminate** marks a team out.
- The status selector sets Delayed, In progress, Ready, Complete or Void.

For pools, use **Match Setup → Stages & Pools → Recompute standings**. Then set the rank
and mark each team Advances, Wild card, or Did not advance.

## 10. Enter final placements

**Placements fill in by themselves** from matches marked **Decides places** in Match
Setup:

| Match | Decides places |
|---|---|
| Final | 1st (winner) / 2nd (loser) |
| 3rd place game | 3rd / 4th |
| 5th place game | 5th / 6th |
| 7th place game | 7th / 8th |
| A heat or station that sets the final order | 1st: the places entered in the result become the final places (choose a later number to start lower down) |

When such a match's result is saved, its teams appear on **Ops → Placements** with their
points. They are **not public yet**.

**Ops → Placements** (pick the event):

1. Check the places. A note lists any places still to fill, e.g. 5th–8th when there are
   no consolation games. Add those by hand.
2. An operations admin presses **Approve & Publish** to put them on the public page and
   the leaderboard.

If a placement match's result is edited later, its placements are replaced and need
publishing again. If the result is voided, the placements it filled in are removed.

Editing an approved placement automatically withdraws its approval and publication.

**No-show penalty:** press *Apply penalty* for the team and give a reason. This applies
the configured points and marks the team No show. It can be deactivated later.

## 11. Close out an event

- [ ] All matches are Official, Complete or Void. Check the Dashboard's completion bar.
- [ ] No results are left Awaiting Approval (the Approvals menu item is gone).
- [ ] Placements are entered, approved and published.
- [ ] Penalties are reviewed.
- [ ] **Settings → Events**: set the status to **Complete**.
- [ ] Export or screenshot the leaderboard for the record, if required.
