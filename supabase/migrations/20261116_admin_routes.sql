-- Transport admin: save / delete a route together with its ordered stops (one transaction).
-- Called by src/lib/admin/fleet.ts → /api/transport-admin/routes. Replaces browser writes through /api/db.

CREATE OR REPLACE FUNCTION public.admin_save_route(p_route JSONB, p_stops JSONB, p_actor TEXT, p_actor_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id TEXT := p_route->>'id';
  v_new BOOLEAN;
BEGIN
  IF v_id IS NULL OR v_id = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Route id is required.'); END IF;
  IF COALESCE(trim(p_route->>'name'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Route name is required.'); END IF;
  v_new := NOT EXISTS (SELECT 1 FROM routes WHERE id::text = v_id);

  IF v_new THEN
    INSERT INTO routes (id, code, name, description, direction, color, total_distance_km, estimated_duration_mins, is_active, campus_id)
    VALUES (v_id, p_route->>'code', p_route->>'name', p_route->>'description', p_route->>'direction', p_route->>'color',
            NULLIF(p_route->>'total_distance_km', '')::numeric, NULLIF(p_route->>'estimated_duration_mins', '')::int,
            COALESCE((p_route->>'is_active')::boolean, true), NULLIF(p_route->>'campus_id', ''));
  ELSE
    UPDATE routes SET
      code = COALESCE(p_route->>'code', code),
      name = COALESCE(p_route->>'name', name),
      description = COALESCE(p_route->>'description', description),
      direction = COALESCE(p_route->>'direction', direction),
      color = COALESCE(p_route->>'color', color),
      total_distance_km = COALESCE(NULLIF(p_route->>'total_distance_km', '')::numeric, total_distance_km),
      estimated_duration_mins = COALESCE(NULLIF(p_route->>'estimated_duration_mins', '')::int, estimated_duration_mins),
      is_active = COALESCE((p_route->>'is_active')::boolean, is_active)
    WHERE id::text = v_id;
  END IF;

  -- p_stops = NULL keeps the current stops; an array replaces them in order.
  IF p_stops IS NOT NULL THEN
    DELETE FROM route_stops WHERE route_id::text = v_id;
    INSERT INTO route_stops (route_id, stop_id, stop_order, arrival_offset_minutes, buffer_time_minutes)
    SELECT v_id, s->>'stop_id', COALESCE((s->>'stop_order')::int, ord::int), COALESCE((s->>'arrival_offset_minutes')::int, 0), COALESCE((s->>'buffer_time_minutes')::int, 0)
    FROM jsonb_array_elements(p_stops) WITH ORDINALITY AS t(s, ord)
    WHERE s->>'stop_id' IS NOT NULL;
  END IF;

  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, new_value, reason)
  VALUES (p_actor, p_actor_role, CASE WHEN v_new THEN 'ROUTE_CREATED' ELSE 'ROUTE_UPDATED' END, 'Route', v_id, p_route, 'Route saved by transport admin');
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_route(p_route_id TEXT, p_actor TEXT, p_actor_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM trips WHERE route_id::text = p_route_id AND trip_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date AND status::text <> 'CANCELLED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This route has runs today or later. Cancel them first, or switch the route off instead.');
  END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE route_id::text = p_route_id) THEN
    -- Past trips keep their history: switch the route off instead of deleting it.
    UPDATE routes SET is_active = false WHERE id::text = p_route_id;
    UPDATE buses SET current_route_id = NULL WHERE current_route_id::text = p_route_id;
    INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason)
    VALUES (p_actor, p_actor_role, 'ROUTE_DEACTIVATED', 'Route', p_route_id, 'Route has past trips; switched off instead of deleted');
    RETURN jsonb_build_object('ok', true, 'deactivated', true);
  END IF;
  DELETE FROM route_stops WHERE route_id::text = p_route_id;
  UPDATE buses SET current_route_id = NULL WHERE current_route_id::text = p_route_id;
  DELETE FROM routes WHERE id::text = p_route_id;
  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason)
  VALUES (p_actor, p_actor_role, 'ROUTE_DELETED', 'Route', p_route_id, 'Route deleted by transport admin');
  RETURN jsonb_build_object('ok', true, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_route(JSONB, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_route(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_route(JSONB, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_route(TEXT, TEXT, TEXT) TO service_role;
