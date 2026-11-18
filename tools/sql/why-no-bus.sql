-- Why does a student have no bus today? Read-only. Run in the Supabase SQL Editor
-- (project zdjooiztjzmbiwaknfir). One row per student per shift their class needs today.
--
-- It follows the same rules as boarding_chart_tick() (migration 20261113d_boarding_chart.sql):
-- paid + not suspended + not expired, a stop, a route, today's class timetable, and a run of that
-- shift on that route today that has a bus and whose final chart is still open.
-- `reason` is the FIRST rule that fails. 'BOOKED' means the student has a seat row today.
--
-- Filter at the bottom: everyone not booked (default), or one email.

with now_ist as (
  select (now() at time zone 'Asia/Kolkata')::date as d,
         to_char((now() at time zone 'Asia/Kolkata')::date, 'FMDAY') as dow,
         (now() at time zone 'Asia/Kolkata')::time as t
),
st as (
  select sf.id, sf.user_id, sf.class_id, sf.class_name,
         coalesce(sf.auto_assigned_stop_id, sf.primary_stop_id) as stop_id,
         coalesce(sf.primary_route_id,
                  (select rs.route_id from route_stops rs
                    where rs.stop_id = coalesce(sf.auto_assigned_stop_id, sf.primary_stop_id) limit 1)) as route_id,
         coalesce(sf.transport_access_suspended, false) as suspended,
         (sf.has_active_subscription or sf.payment_status in ('APPROVED', 'COMPLETED')) as paid,
         (sf.subscription_expiry_date is null or sf.subscription_expiry_date::date >= (select d from now_ist)) as not_expired
    from students_full sf
),
need as (            -- the shifts each student's class needs today (null shift = no timetable / day off)
  select st.*, css.is_today_off, x.shift_id
    from st
    left join class_shift_schedules css
      on css.class_id = st.class_id and css.day_of_week = (select dow from now_ist)
    left join lateral (
      select unnest(array[css.incoming_shift_id, css.outgoing_shift_id]) as shift_id
    ) x on css.class_id is not null and not css.is_today_off
   where x.shift_id is not null or css.class_id is null or css.is_today_off
),
diag as (
  select n.*,
         sh.name as shift_name, sh.start_time, sh.booking_cutoff_minutes,
         t.id as trip_id, t.bus_id, t.status as trip_status, t.manifest_locked,
         r.status as booking_status, r.cancel_reason
    from need n
    left join shifts sh on sh.id = n.shift_id
    left join lateral (
      select * from trips t
       where t.trip_date = (select d from now_ist)
         and t.route_id = n.route_id and t.shift_id = n.shift_id and t.status <> 'CANCELLED'
       order by (t.bus_id is null), t.id limit 1
    ) t on true
    left join bus_reservations r
      on r.student_id = n.id and r.shift_id = n.shift_id and r.reservation_date = (select d from now_ist)
)
select
  u.email,
  d.id as student_id,
  d.class_name,
  d.shift_name,
  d.start_time,
  case
    when d.booking_status is not null and d.booking_status <> 'CANCELLED' then 'BOOKED (' || d.booking_status || ')'
    when d.booking_status = 'CANCELLED'      then 'SEAT CANCELLED: ' || coalesce(d.cancel_reason, 'by the student')
    when d.suspended                          then 'SUSPENDED'
    when not d.paid                           then 'NOT PAID'
    when not d.not_expired                    then 'PASS EXPIRED'
    when d.class_id is null                   then 'NO CLASS SET'
    when d.stop_id is null                    then 'NO STOP SET'
    when d.route_id is null                   then 'STOP IS ON NO ROUTE'
    when d.is_today_off is null               then 'CLASS HAS NO TIMETABLE FOR TODAY'
    when d.is_today_off                       then 'DAY OFF FOR THIS CLASS'
    when d.trip_id is null                    then 'NO RUN TODAY FOR THIS ROUTE + SHIFT'
    when d.bus_id is null                     then 'RUN HAS NO BUS (assign on dispatch board)'
    when coalesce(d.manifest_locked, false)   then 'FINAL CHART ALREADY OUT (booked too late)'
    when (select t from now_ist) >= d.start_time - make_interval(mins => coalesce(d.booking_cutoff_minutes, 30))
                                              then 'BOOKING TIME PASSED'
    else 'ELIGIBLE: chart books it within 5 min'
  end as reason
from diag d
left join users u on u.id = d.user_id
where (d.booking_status is null or d.booking_status = 'CANCELLED')   -- remove this line to see everyone
  and coalesce(u.role, 'student') = 'student'   -- old teacher test rows also have a student record
-- and lower(u.email) = 'someone@gmail.com'
order by reason, d.class_name, d.start_time;
