-- Level Up — reference data (categories + achievement catalog)
-- Achievement `metric` values are computed by public._user_metrics() in 0002_functions.sql.

insert into public.categories (key, name, attribute, icon, sort) values
  ('basketball', 'Basketball',        'SKILL',     'basketball',       1),
  ('college',    'College',           'KNOWLEDGE', 'graduation-cap', 2),
  ('dev',        'Development',       'CAREER',    'code-xml',       3),
  ('health',     'Health & Physique', 'VITALITY',  'heart-pulse',    4),
  ('life',       'Life',              null,        'sparkles',       5)
on conflict (key) do nothing;

insert into public.achievement_defs (key, name, description, category, icon, metric, threshold, title, tier, sort) values
  -- overall
  ('first_quest',   'First Steps',        'Complete your first quest.',                       null, 'footprints', 'quests_done', 1,    null,            1, 10),
  ('quests_10',     'Getting Rolling',    'Complete 10 quests.',                              null, 'list-checks','quests_done', 10,   null,            1, 11),
  ('quests_50',     'Quest Regular',      'Complete 50 quests.',                              null, 'list-checks','quests_done', 50,   'Regular',       2, 12),
  ('quests_250',    'Grinder',            'Complete 250 quests.',                             null, 'trophy',     'quests_done', 250,  'Grinder',       3, 13),
  ('level_5',       'Level 5',            'Reach overall level 5.',                           null, 'star',       'level',       5,    'Adventurer',    1, 20),
  ('level_10',      'Level 10',           'Reach overall level 10.',                          null, 'star',       'level',       10,   'Veteran',       2, 21),
  ('level_20',      'Level 20',           'Reach overall level 20.',                          null, 'crown',      'level',       20,   'Champion',      3, 22),
  ('streak_3',      'Three in a Row',     'Be active 3 days in a row.',                       null, 'flame',      'best_streak', 3,    null,            1, 30),
  ('streak_7',      'One Full Week',      'Be active 7 days in a row.',                       null, 'flame',      'best_streak', 7,    'Consistent',    2, 31),
  ('streak_14',     'Fortnight',          'Be active 14 days in a row.',                      null, 'flame',      'best_streak', 14,   null,            2, 32),
  ('streak_30',     'Unbreakable',        'Be active 30 days in a row.',                      null, 'flame',      'best_streak', 30,   'Unbreakable',   3, 33),
  ('boss_1',        'Boss Slayer',        'Complete a Boss Quest.',                           null, 'swords',     'boss_done',   1,    'Boss Slayer',   2, 40),
  ('boss_5',        'Boss Hunter',        'Complete 5 Boss Quests.',                          null, 'swords',     'boss_done',   5,    null,            3, 41),
  ('active_30',     'Thirty Active Days', 'Complete at least one quest on 30 different days.',null, 'calendar-check','active_days',30,  null,            2, 42),
  ('rest_3',        'Recovery Is Training','Take 3 planned rest days.',                       null, 'moon',       'rest_days',   3,    'Well-Rested',   1, 43),
  -- basketball
  ('bb_level_3',    'Rotation Player',    'Reach Basketball level 3.',                        'basketball', 'basketball', 'cat_level_basketball', 3,  'Rotation Player', 1, 100),
  ('bb_level_6',    'Starter',            'Reach Basketball level 6.',                        'basketball', 'basketball', 'cat_level_basketball', 6,  'Starter',         2, 101),
  ('bb_level_10',   'All-Star',           'Reach Basketball level 10.',                       'basketball', 'basketball', 'cat_level_basketball', 10, 'All-Star',        3, 102),
  ('practice_5',    'Gym Door Opener',    'Log 5 finished practice sessions.',                'basketball', 'timer',    'practice_sessions',    5,  null,              1, 103),
  ('practice_25',   'Floor General',      'Log 25 finished practice sessions.',               'basketball', 'timer',    'practice_sessions',    25, 'Floor General',   2, 104),
  ('shots_500',     'Five Hundred',       'Log 500 shot attempts.',                           'basketball', 'target',   'shots_logged',         500,  null,            1, 105),
  ('shots_5000',    'Gym Rat Hours',      'Log 5,000 shot attempts.',                         'basketball', 'target',   'shots_logged',         5000, 'Shot Maker',    3, 106),
  ('sharp_80',      'Sharpshooter',       'Hit 80% or better over at least 20 attempts in one day.', 'basketball', 'crosshair', 'shooting_best_pct', 80, 'Sharpshooter', 2, 107),
  -- college
  ('col_level_3',   'Attentive',          'Reach College level 3.',                           'college', 'graduation-cap', 'cat_level_college', 3,  null,            1, 200),
  ('col_level_6',   'Scholar',            'Reach College level 6.',                           'college', 'graduation-cap', 'cat_level_college', 6,  'Scholar',        2, 201),
  ('col_level_10',  'Dean''s List',       'Reach College level 10.',                          'college', 'graduation-cap', 'cat_level_college', 10, 'Dean''s List',   3, 202),
  ('study_10h',     'Ten Focused Hours',  'Log 10 focused study hours.',                      'college', 'brain',          'focus_minutes_college', 600,  null,       1, 203),
  ('study_50h',     'Deep Worker',        'Log 50 focused study hours.',                      'college', 'brain',          'focus_minutes_college', 3000, 'Deep Worker', 3, 204),
  ('syllabus_10',   'Covering Ground',    'Finish 10 syllabus topics.',                       'college', 'book-open-check','syllabus_done', 10, null,                  1, 205),
  ('syllabus_50',   'Syllabus Cleared',   'Finish 50 syllabus topics.',                       'college', 'book-open-check','syllabus_done', 50, 'Well-Read',          3, 206),
  ('revise_10',     'Spaced Out',         'Revise topics 10 times.',                          'college', 'repeat',         'revisions',     10, null,                  2, 207),
  ('exam_1',        'Exam Taken',         'Finish your first exam.',                          'college', 'clipboard-check','exams_taken',   1,  null,                  1, 208),
  -- development
  ('dev_level_3',   'Hello World',        'Reach Development level 3.',                       'dev', 'code-xml', 'cat_level_dev', 3,  'Junior Dev',    1, 300),
  ('dev_level_6',   'Full-Stack Dev',     'Reach Development level 6.',                       'dev', 'code-xml', 'cat_level_dev', 6,  'Full-Stack Dev',2, 301),
  ('dev_level_10',  'Senior Builder',     'Reach Development level 10.',                      'dev', 'code-xml', 'cat_level_dev', 10, 'Senior Builder',3, 302),
  ('code_10h',      'Ten Hours of Code',  'Log 10 focused coding hours.',                     'dev', 'terminal', 'focus_minutes_dev', 600,  null,       1, 303),
  ('code_100h',     'Hundred Hours',      'Log 100 focused coding hours.',                    'dev', 'terminal', 'focus_minutes_dev', 6000, 'Craftsman',3, 304),
  ('roadmap_5',     'On the Map',         'Finish 5 roadmap milestones.',                     'dev', 'map',      'roadmap_done', 5,   null,             1, 305),
  ('roadmap_25',    'Cartographer',       'Finish 25 roadmap milestones.',                    'dev', 'map',      'roadmap_done', 25,  null,             3, 306),
  ('ship_1',        'Shipped It',         'Deploy your first project.',                       'dev', 'rocket',   'projects_deployed', 1, 'Shipper',     2, 307),
  ('ship_3',        'Portfolio Builder',  'Deploy 3 projects.',                               'dev', 'rocket',   'projects_deployed', 3, null,          3, 308),
  ('outreach_10',   'Cold Start',         'Send 10 outreach messages.',                       'dev', 'send',     'outreach_count', 10, null,            1, 309),
  ('outreach_50',   'Hustler',            'Send 50 outreach messages.',                       'dev', 'send',     'outreach_count', 50, 'Hustler',       3, 310),
  ('client_1',      'First Client',       'Win your first freelance client.',                 'dev', 'handshake','leads_won', 1,  'Freelancer',         3, 311),
  ('income_1',      'First Payment',      'Record your first real payment received (INR).',   'dev', 'banknote', 'income_received_inr', 1,      null,   3, 312),
  ('income_10k',    'Ten Thousand',       'Record ₹10,000 received.',                         'dev', 'banknote', 'income_received_inr', 10000,  null,   3, 313),
  ('income_100k',   'One Lakh',           'Record ₹1,00,000 received.',                       'dev', 'banknote', 'income_received_inr', 100000, 'Earner', 3, 314),
  -- health
  ('hp_level_3',    'Warmed Up',          'Reach Health level 3.',                            'health', 'heart-pulse', 'cat_level_health', 3,  'Athlete',     1, 400),
  ('hp_level_6',    'In Form',            'Reach Health level 6.',                            'health', 'heart-pulse', 'cat_level_health', 6,  null,          2, 401),
  ('hp_level_10',   'Peak Condition',     'Reach Health level 10.',                           'health', 'heart-pulse', 'cat_level_health', 10, 'Peak Form',   3, 402),
  ('workout_1',     'First Rep',          'Log your first workout.',                          'health', 'dumbbell', 'workouts', 1,   null,                   1, 403),
  ('workout_10',    'Ten Sessions',       'Log 10 workouts.',                                 'health', 'dumbbell', 'workouts', 10,  null,                   2, 404),
  ('workout_50',    'Iron Habit',         'Log 50 workouts.',                                 'health', 'dumbbell', 'workouts', 50,  'Gym Rat',              3, 405),
  ('sets_100',      'Hundred Sets',       'Log 100 sets.',                                    'health', 'layers',   'sets_logged', 100, null,                2, 406),
  ('weigh_10',      'Honest Scale',       'Log your bodyweight 10 times.',                    'health', 'scale',    'bodyweight_logs', 10, null,             1, 407),
  ('protein_7',     'Protein Week',       'Hit your protein target on 7 days.',               'health', 'beef',     'protein_days', 7, null,                 2, 408),
  ('water_7',       'Hydrated',           'Hit your water target on 7 days.',                 'health', 'droplets', 'water_days', 7,   null,                 2, 409),
  ('sleep_7',       'Sleep Is a Skill',   'Sleep within your healthy range on 7 days.',       'health', 'bed',      'sleep_days', 7,   'Rested',             2, 410)
on conflict (key) do nothing;
