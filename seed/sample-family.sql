-- A made-up family for trying the app (npm run db:seed). For your real family,
-- run `npm run setup`, which writes seed/family.sql (git-ignored), or add people in the app.
INSERT OR IGNORE INTO people (id, name, initial, kind, sort) VALUES
  ('mom', 'Mom', 'M', 'person', 1),
  ('dad', 'Dad', 'D', 'person', 2),
  ('sis', 'Sam', 'S', 'person', 3),
  ('me', 'Me', 'Y', 'person', 4),
  ('dog', 'Biscuit', 'B', 'pet', 5);

