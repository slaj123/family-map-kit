-- Sample memories so the map isn't empty, all credited to 'me' (you). Every id starts with "sample-";
-- remove them all with `npm run db:clear-samples`.
INSERT OR IGNORE INTO places (id, name, lat, lng, created_by) VALUES
  ('sample-p1', 'Yosemite Valley', 37.7456, -119.5936, 'me'),
  ('sample-p2', 'Santa Monica Pier', 34.0094, -118.4973, 'me'),
  ('sample-p3', 'Lisbon', 38.7223, -9.1393, 'me'),
  ('sample-p4', 'Mammoth Mountain', 37.6308, -119.0326, 'me');

INSERT OR IGNORE INTO memories (id, place_id, title, category, date_start, date_precision, story, created_by) VALUES
  ('sample-m1', 'sample-p1', 'First family camping trip', 'travel', '2019-07-01', 'month', 'Sample memory. Half Dome from the meadow and a very wet tent.', 'me'),
  ('sample-m2', 'sample-p2', 'Grandma''s 80th', 'food', '2023-06-14', 'day', 'Sample memory. Everyone in one place for the first time in months.', 'me'),
  ('sample-m3', 'sample-p3', 'Semester abroad', 'travel', '2027-01-01', 'season', 'Sample plan.', 'me'),
  ('sample-m4', 'sample-p4', 'Ski week', 'experience', '2026-12-26', 'day', 'Sample plan. Same cabin as last year, hopefully more snow.', 'me'),
  ('sample-m5', 'sample-p2', 'Saturday walk', 'experience', '2021-01-01', 'year', 'Sample memory. Someone dropped a churro.', 'me');

INSERT OR IGNORE INTO memory_people (memory_id, person_id) VALUES
  ('sample-m1', 'me'), ('sample-m2', 'me'), ('sample-m3', 'me'), ('sample-m4', 'me'), ('sample-m5', 'me');
