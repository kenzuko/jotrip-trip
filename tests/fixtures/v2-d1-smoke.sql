-- Local D1-only smoke fixture. Never execute against remote production.
-- Checks canonical session/turn persistence, JSON analytics and deletion.
CREATE TABLE IF NOT EXISTS qa_v2_assert (
  id INTEGER PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid = 1)
);
INSERT INTO trip_sessions_v2
  (session_id, trip_id, state_json, version, last_turn_id, updated_at)
VALUES
  ('qa-session-0001', 'qa-trip-0001',
   '{"days":3,"nights":2,"adults":2,"interests":["Safari"],"checkin":"2030-01-10","checkout":"2030-01-12"}',
   1, 'qa-turn-0001', '2030-01-01T00:00:00.000Z');
INSERT INTO trip_turns_v2
  (session_id, client_turn_id, trip_id, input_text, response_json)
VALUES
  ('qa-session-0001', 'qa-turn-0001', 'qa-trip-0001', 'Safari',
   '{"action":"set_dates","version":1,"plan":{"ok":true},"parsed":{"checkin":"2030-01-10"}}');
INSERT INTO qa_v2_assert(valid)
  SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END FROM trip_turns_v2
  WHERE session_id='qa-session-0001' AND client_turn_id='qa-turn-0001';
INSERT INTO qa_v2_assert(valid)
  SELECT CASE WHEN json_extract(state_json,'$.nights')=2
    AND json_extract(state_json,'$.checkin')='2030-01-10'
    THEN 1 ELSE 0 END FROM trip_sessions_v2 WHERE session_id='qa-session-0001';
UPDATE trip_sessions_v2 SET version=2,last_turn_id='qa-turn-0002'
  WHERE session_id='qa-session-0001' AND version=1;
INSERT OR IGNORE INTO trip_turns_v2
  (session_id, client_turn_id, trip_id, input_text, response_json)
  SELECT 'qa-session-0001','qa-turn-0002','qa-trip-0001','a',
    '{"action":"acknowledgement","version":2}'
  FROM trip_sessions_v2
  WHERE session_id='qa-session-0001' AND version=2 AND last_turn_id='qa-turn-0002';
INSERT INTO qa_v2_assert(valid)
  SELECT CASE WHEN COUNT(*)=2 THEN 1 ELSE 0 END FROM trip_turns_v2
  WHERE session_id='qa-session-0001';
INSERT INTO qa_v2_assert(valid)
  SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END
  FROM trip_sessions_v2, json_each(trip_sessions_v2.state_json,'$.interests')
  WHERE value='Safari' AND session_id='qa-session-0001';
DELETE FROM trip_turns_v2 WHERE session_id='qa-session-0001';
DELETE FROM trip_sessions_v2 WHERE session_id='qa-session-0001';
INSERT INTO qa_v2_assert(valid)
  SELECT CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END
  FROM trip_sessions_v2 WHERE session_id='qa-session-0001';
DROP TABLE qa_v2_assert;
