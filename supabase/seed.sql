-- WOTB Tournament Tracker: seed data
--
-- Seeds ONLY configuration: the eight event categories, the 1st-8th points matrix, and
-- scoring settings. It deliberately creates NO teams, rosters, seeds, results, or users.
--
-- The preliminary session schedule is NOT loaded here because it needs a tournament
-- year. Load it afterwards (editable later) with either:
--   * the Operations > Setup page ("Load preliminary schedule"), or
--   * SQL editor:  select public.load_preliminary_schedule(2026);
-- Safe to re-run: uses ON CONFLICT.

insert into public.events
  (event_code, event_name, format_type, venue, responsible_unit, target_team_count,
   counts_toward_overall, status, public_visible, display_order, notes)
values
  ('SOC',  'Soccer',               'single_elimination',  'North Fort Athletic Complex',  '1-2 SBCT',        20, true, 'planning', true, 1, 'Preliminary - editable'),
  ('CMB',  'Combatives',           'weight_class',        'Soldier Field House',          'Bayonet Academy', 20, true, 'planning', true, 2, 'Preliminary - editable'),
  ('ESP',  'E-Sports',             'single_elimination',  'Warrior Zone',                 '2-2 SBCT',        20, true, 'planning', true, 3, 'Preliminary - editable'),
  ('DB',   'Softball / Dodgeball', 'pool_then_playoff',   'North Fort PT Site',           '16th CAB',        20, true, 'planning', true, 4, 'Preliminary - editable'),
  ('BSK',  'Basketball',           'consolation_bracket', 'Wilson Gym',                   '2-2 SBCT',        20, true, 'planning', true, 5, 'Preliminary - editable'),
  ('FFB',  'Flag Football',        'single_elimination',  'Cowen Stadium / Raptor Field', '16th CAB',        20, true, 'planning', true, 6, 'Preliminary - editable'),
  ('BPT',  'Brostrom PT',          'heat_time',           'MDC-PAC HQ',                   '1-51 ADA',        20, true, 'planning', true, 7, 'Preliminary - editable'),
  ('BIG7', 'Big 7 Competition',    'multi_station',       'Cowen Stadium',                '5-3 FA',          20, true, 'planning', true, 8, 'Preliminary - editable')
on conflict (event_code) do nothing;

insert into public.points_matrix (place, points, description) values
  (1, 8, '1st place'), (2, 7, '2nd place'), (3, 6, '3rd place'), (4, 5, '4th place'),
  (5, 4, '5th place'), (6, 3, '6th place'), (7, 2, '7th place'), (8, 1, '8th place')
on conflict (place) do nothing;

insert into public.scoring_settings (setting_key, numeric_value, text_value, enabled) values
  ('no_show_penalty', -6, 'Applied only by explicit admin action', true),
  ('overall_scoring_enabled', null, 'true', true)
on conflict (setting_key) do nothing;
