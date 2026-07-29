.headers on
.mode column

SELECT
  MIN(timestamp) AS first_positive_pulse_ts,
  MAX(timestamp) AS last_positive_pulse_ts,
  COUNT(*) AS positive_pulse_rows
FROM thickness_raw
WHERE pulse > 0;

WITH windows(label, start_ts, end_ts) AS (
  VALUES
    ('normal_A', 1782370925179, 1782372141187),
    ('normal_B', 1782370317103, 1782371534163),
    ('latest_short', 1782373215220, 1782373983412),
    ('latest_trip_1', 1782373215220, 1782373358185),
    ('latest_trip_2', 1782373358184, 1782373983412)
),
samples AS (
  SELECT
    windows.label,
    t.timestamp,
    t.pulse,
    LAG(t.timestamp) OVER (
      PARTITION BY windows.label ORDER BY t.timestamp, t.id
    ) AS previous_ts
  FROM windows
  JOIN thickness_raw t
    ON t.timestamp >= windows.start_ts
   AND t.timestamp < windows.end_ts
  WHERE t.ad > 0
)
SELECT
  label,
  COUNT(*) AS samples,
  MIN(pulse) AS pulse_min,
  MAX(pulse) AS pulse_max,
  COUNT(CASE WHEN timestamp - previous_ts > 100 THEN 1 END) AS gaps_over_100ms,
  MAX(timestamp - previous_ts) AS max_gap_ms
FROM samples
GROUP BY label
ORDER BY label;

WITH trips(label, start_ts, end_ts) AS (
  VALUES
    ('short_2.38m', 1782373215220, 1782373358185),
    ('latest_10.42m', 1782373358184, 1782373983412),
    ('normal_10.15m', 1782370925179, 1782371534163),
    ('normal_10.12m', 1782371534162, 1782372141187)
)
SELECT
  trips.label,
  COUNT(r.id) AS rotation_rows,
  ROUND(MIN(r.motorFrequency), 2) AS min_frequency,
  ROUND(AVG(r.motorFrequency), 2) AS avg_frequency,
  ROUND(MAX(r.motorFrequency), 2) AS max_frequency,
  SUM(CASE WHEN r.forwardRotation > 0 AND r.reverseRotation <= 0 THEN 1 ELSE 0 END) AS forward_rows,
  SUM(CASE WHEN r.reverseRotation > 0 AND r.forwardRotation <= 0 THEN 1 ELSE 0 END) AS reverse_rows
FROM trips
LEFT JOIN rotation_raw r
  ON r.timestamp >= trips.start_ts
 AND r.timestamp < trips.end_ts
GROUP BY trips.label
ORDER BY trips.start_ts;
