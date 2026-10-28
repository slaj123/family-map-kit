-- Removes every sample place and memory (ids starting with "sample-"). Family members stay.
DELETE FROM memory_people WHERE memory_id LIKE 'sample-%';
DELETE FROM media WHERE memory_id LIKE 'sample-%';
DELETE FROM thoughts WHERE memory_id LIKE 'sample-%';
DELETE FROM memories WHERE id LIKE 'sample-%';
DELETE FROM places WHERE id LIKE 'sample-%' AND id NOT IN (SELECT place_id FROM memories);
