-- Example family. Edit the names to your own, keep ids short and lowercase.
-- 'me' is the person id the Habits kit counts memories for. Safe to re-run.
INSERT OR IGNORE INTO people (id, name, initial, kind, sort) VALUES
  ('mom', 'Mom', 'M', 'person', 1),
  ('dad', 'Dad', 'D', 'person', 2),
  ('sis', 'Sam', 'S', 'person', 3),
  ('me', 'Me', 'Y', 'person', 4),
  ('dog', 'Biscuit', 'B', 'pet', 5);

-- Sample memories so the map isn't empty. Every id starts with "sample-";
-- remove them all with `npm run db:clear-samples`.
INSERT OR IGNORE INTO places (id, name, lat, lng, created_by) VALUES
  ('sample-p1', 'Yosemite Valley', 37.7456, -119.5936, 'dad'),
  ('sample-p2', 'Santa Monica Pier', 34.0094, -118.4973, 'mom'),
  ('sample-p3', 'Lisbon', 38.7223, -9.1393, 'sis'),
  ('sample-p4', 'Mammoth Mountain', 37.6308, -119.0326, 'me');

INSERT OR IGNORE INTO memories (id, place_id, title, category, date_start, date_precision, story, created_by) VALUES
  ('sample-m1', 'sample-p1', 'First family camping trip', 'travel', '2019-07-01', 'month', 'Sample memory. Half Dome from the meadow and a very wet tent.', 'dad'),
  ('sample-m2', 'sample-p2', 'Grandma''s 80th', 'food', '2023-06-14', 'day', 'Sample memory. Everyone in one place for the first time in months.', 'mom'),
  ('sample-m3', 'sample-p3', 'Semester abroad', 'travel', '2027-01-01', 'season', 'Sample plan.', 'sis'),
  ('sample-m4', 'sample-p4', 'Ski week', 'experience', '2026-12-26', 'day', 'Sample plan. Same cabin as last year, hopefully more snow.', 'me'),
  ('sample-m5', 'sample-p2', 'Saturday walk', 'experience', '2021-01-01', 'year', 'Sample memory. Biscuit stole a churro.', 'dog');

INSERT OR IGNORE INTO memory_people (memory_id, person_id) VALUES
  ('sample-m1', 'mom'), ('sample-m1', 'dad'), ('sample-m1', 'sis'), ('sample-m1', 'me'),
  ('sample-m2', 'mom'), ('sample-m2', 'dad'), ('sample-m2', 'sis'), ('sample-m2', 'me'),
  ('sample-m3', 'sis'),
  ('sample-m4', 'mom'), ('sample-m4', 'dad'), ('sample-m4', 'sis'), ('sample-m4', 'me'), ('sample-m4', 'dog'),
  ('sample-m5', 'mom'), ('sample-m5', 'dog');
