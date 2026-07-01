PRAGMA foreign_keys=OFF;
BEGIN;

DROP TABLE IF EXISTS rotation_trip_backup_20260701;
CREATE TABLE rotation_trip_backup_20260701 AS SELECT * FROM rotation_trip;

DELETE FROM rotation_trip;

WITH direction_changes AS (
  SELECT
    id,
    timestamp AS ts,
    CASE
      WHEN forwardDirChange > 0 AND reverseDirChange <= 0 THEN 1
      WHEN reverseDirChange > 0 AND forwardDirChange <= 0 THEN 0
      ELSE NULL
    END AS direction
  FROM rotation_raw
  WHERE (forwardDirChange > 0 OR reverseDirChange > 0)
),
filtered AS (
  SELECT
    id,
    ts,
    direction,
    LAG(direction) OVER (ORDER BY ts, id) AS prev_direction,
    LAG(ts) OVER (ORDER BY ts, id) AS prev_ts
  FROM direction_changes
  WHERE direction IS NOT NULL
),
edges AS (
  SELECT
    id,
    ts,
    direction
  FROM filtered
  WHERE prev_direction IS NULL
     OR direction <> prev_direction
     OR ts - prev_ts >= 2000
),
trips AS (
  SELECT
    ts AS start_ts,
    LEAD(ts) OVER (ORDER BY ts, id) AS end_ts,
    direction
  FROM edges
)
INSERT INTO rotation_trip (start_ts, end_ts, direction, status, created_at)
SELECT
  start_ts,
  end_ts,
  direction,
  'estimated',
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM trips
WHERE end_ts IS NOT NULL
  AND end_ts > start_ts
  AND (end_ts - start_ts) >= 30000;

UPDATE scan_pass
SET rotation_trip_id = (
  SELECT rt.id
  FROM rotation_trip rt
  WHERE scan_pass.start_ts >= rt.start_ts
    AND scan_pass.end_ts <= rt.end_ts
  ORDER BY rt.start_ts ASC
  LIMIT 1
)
WHERE 1 = 1;

COMMIT;
PRAGMA foreign_keys=ON;

SELECT 'rotation_trip_after_rebuild', COUNT(*) FROM rotation_trip;
SELECT 'rotation_trip_dur_stats', COUNT(*), MIN(end_ts-start_ts), AVG(end_ts-start_ts), MAX(end_ts-start_ts) FROM rotation_trip;
SELECT 'scan_pass_linked', COUNT(*) FROM scan_pass WHERE rotation_trip_id IS NOT NULL;
