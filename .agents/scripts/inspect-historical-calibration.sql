.headers on
.mode column
.width 18 18 24 24 18

SELECT
  'thickness_raw' AS table_name,
  COUNT(*) AS rows,
  MIN(timestamp) AS min_ts,
  MAX(timestamp) AS max_ts,
  SUM(CASE WHEN ad > 0 THEN 1 ELSE 0 END) AS positive_rows
FROM thickness_raw;

SELECT
  'rotation_raw' AS table_name,
  COUNT(*) AS rows,
  MIN(timestamp) AS min_ts,
  MAX(timestamp) AS max_ts,
  SUM(CASE WHEN forwardDirChange > 0 OR reverseDirChange > 0 THEN 1 ELSE 0 END) AS explicit_changes
FROM rotation_raw;

SELECT
  'rotation_trip' AS table_name,
  COUNT(*) AS rows,
  MIN(start_ts) AS min_ts,
  MAX(end_ts) AS max_ts,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_rows
FROM rotation_trip;

SELECT
  timestamp,
  datetime(timestamp / 1000, 'unixepoch', 'localtime') AS local_time,
  forwardRotation AS forward_state,
  reverseRotation AS reverse_state,
  forwardDirChange AS forward_change,
  reverseDirChange AS reverse_change
FROM rotation_raw
WHERE forwardDirChange > 0 OR reverseDirChange > 0
ORDER BY timestamp DESC
LIMIT 20;

WITH latest AS (
  SELECT MAX(timestamp) AS ts FROM thickness_raw
),
states AS (
  SELECT
    timestamp,
    CASE
      WHEN forwardRotation > 0 AND reverseRotation <= 0 THEN 'forward'
      WHEN reverseRotation > 0 AND forwardRotation <= 0 THEN 'reverse'
      ELSE NULL
    END AS direction
  FROM rotation_raw, latest
  WHERE timestamp >= latest.ts - 21600000
    AND timestamp <= latest.ts
),
state_changes AS (
  SELECT
    timestamp,
    direction,
    LAG(direction) OVER (ORDER BY timestamp) AS previous_direction
  FROM states
  WHERE direction IS NOT NULL
),
boundaries AS (
  SELECT timestamp, direction
  FROM state_changes
  WHERE previous_direction IS NULL OR direction <> previous_direction
),
intervals AS (
  SELECT
    timestamp AS start_ts,
    LEAD(timestamp) OVER (ORDER BY timestamp) AS end_ts,
    direction
  FROM boundaries
)
SELECT
  start_ts,
  end_ts,
  direction,
  ROUND((end_ts - start_ts) / 60000.0, 2) AS duration_min,
  (
    SELECT COUNT(*)
    FROM thickness_raw t
    WHERE t.timestamp >= intervals.start_ts
      AND t.timestamp < intervals.end_ts + 1
      AND t.ad > 0
  ) AS usable_thickness,
  (
    SELECT COUNT(*)
    FROM thickness_raw t
    WHERE t.timestamp >= intervals.start_ts
      AND t.timestamp < intervals.end_ts + 1
      AND t.pulse > 0
  ) AS positive_pulse_rows,
  (
    SELECT MAX(t.pulse)
    FROM thickness_raw t
    WHERE t.timestamp >= intervals.start_ts
      AND t.timestamp < intervals.end_ts + 1
  ) AS max_pulse
FROM intervals
WHERE end_ts IS NOT NULL
ORDER BY start_ts DESC
LIMIT 20;
