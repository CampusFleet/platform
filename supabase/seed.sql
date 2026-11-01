-- ==============================================================================
-- BusSync: Campus Transit Seed Data
-- ==============================================================================

-- 1. Insert Sample Buses
INSERT INTO public.buses (id, bus_number, registration_no, model, capacity, seat_layout, status, gps_device_id, insurance_expiry, maintenance_due_date) VALUES
('b1111111-1111-1111-1111-111111111111', 'BUS-01 (North Express)', 'DL-01-AX-4821', 'Tata Starbus Ultra 40-Seater', 40, '2x2', 'ACTIVE', 'GPS-TRK-901', '2027-04-15', '2026-11-20'),
('b2222222-2222-2222-2222-222222222222', 'BUS-02 (Metro City Link)', 'DL-01-CZ-8842', 'BharatBenz Tourer 45-Seater', 45, '2x2', 'ACTIVE', 'GPS-TRK-902', '2027-06-30', '2026-12-05'),
('b3333333-3333-3333-3333-333333333333', 'BUS-03 (South Campus Loop)', 'DL-02-EE-1994', 'Ashok Leyland Lynx Smart', 36, '2x2', 'ACTIVE', 'GPS-TRK-903', '2027-01-10', '2026-10-15'),
('b4444444-4444-4444-4444-444444444444', 'BUS-04 (Ring Road Shuttle)', 'DL-03-MK-7721', 'Eicher Skyline Pro 42-Seater', 42, '2x2', 'ACTIVE', 'GPS-TRK-904', '2027-08-25', '2026-12-30'),
('b5555555-5555-5555-5555-555555555555', 'BUS-05 (Hostel Shuttle Mini)', 'DL-04-TR-3310', 'Force Traveller Executive 26', 26, '2x2', 'MAINTENANCE', 'GPS-TRK-905', '2026-12-31', '2026-09-10')
ON CONFLICT DO NOTHING;

-- 2. Insert Stops
INSERT INTO public.stops (id, name, code, latitude, longitude, landmark, geofence_radius_meters) VALUES
('s1111111-1111-1111-1111-111111111111', 'Sector 62 Metro Station Gate 2', 'ST-62', 28.6279, 77.3725, 'Near Metro Pillar 140', 80),
('s2222222-2222-2222-2222-222222222222', 'Indirapuram Habitat Center', 'ST-IHC', 28.6438, 77.3712, 'Opposite Shipra Mall', 90),
('s3333333-3333-3333-3333-333333333333', 'Vaishali Metro Station', 'ST-VSH', 28.6499, 77.3398, 'Subway Gate 1', 100),
('s4444444-4444-4444-4444-444444444444', 'Anand Vihar ISBT Terminal', 'ST-AV', 28.6469, 77.3160, 'Bay 4 DTC interchange', 120),
('s5555555-5555-5555-5555-555555555555', 'Main University Campus Terminal', 'ST-CAMPUS', 28.5450, 77.3340, 'Admin Block Gate 1', 150)
ON CONFLICT DO NOTHING;

-- 3. Insert Routes & Stops
INSERT INTO public.routes (id, code, name, description, direction, color, total_distance_km, estimated_duration_mins, is_active) VALUES
('r1111111-1111-1111-1111-111111111111', 'RT-101', 'North City Campus Direct', 'Direct morning express via Indirapuram & Sector 62', 'HOME_TO_CAMPUS', '#1D4ED8', 18.5, 45, TRUE),
('r2222222-2222-2222-2222-222222222222', 'RT-202', 'Metro Feeder Link', 'Frequent connector between Anand Vihar, Vaishali & Campus', 'HOME_TO_CAMPUS', '#0D9488', 14.2, 35, TRUE)
ON CONFLICT DO NOTHING;

-- 3b. Insert Route Stops (All routes start at origin and end at Campus Terminal)
INSERT INTO public.route_stops (route_id, stop_id, stop_order, arrival_offset_minutes, buffer_time_minutes) VALUES
('r1111111-1111-1111-1111-111111111111', 's2222222-2222-2222-2222-222222222222', 1, 0, 2),
('r1111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111', 2, 15, 2),
('r1111111-1111-1111-1111-111111111111', 's5555555-5555-5555-5555-555555555555', 3, 45, 5),
('r2222222-2222-2222-2222-222222222222', 's4444444-4444-4444-4444-444444444444', 1, 0, 2),
('r2222222-2222-2222-2222-222222222222', 's3333333-3333-3333-3333-333333333333', 2, 12, 2),
('r2222222-2222-2222-2222-222222222222', 's5555555-5555-5555-5555-555555555555', 3, 35, 5)
ON CONFLICT DO NOTHING;

-- 4. Shifts
INSERT INTO public.shifts (id, name, shift_type, start_time, end_time, booking_cutoff_mins) VALUES
('sh111111-1111-1111-1111-111111111111', 'Morning Shift 1 (Early Classes)', 'MORNING', '07:30:00', '08:45:00', 45),
('sh222222-2222-2222-2222-222222222222', 'Morning Shift 2 (Regular Classes)', 'MORNING', '08:45:00', '10:00:00', 45),
('sh333333-3333-3333-3333-333333333333', 'Evening Return Shift', 'EVENING', '17:15:00', '18:45:00', 60)
ON CONFLICT DO NOTHING;

-- 5. Subscription Plans
INSERT INTO public.subscription_plans (id, name, duration_months, price, description) VALUES
('p1111111-1111-1111-1111-111111111111', 'Monthly Student Pass', 1, 2400.00, 'Unlimited morning & evening trips for 30 days on assigned route'),
('p2222222-2222-2222-2222-222222222222', 'Quarterly Express Pass', 3, 6500.00, 'Save 10% on semester transport with guaranteed priority seats'),
('p3333333-3333-3333-3333-333333333333', 'Full Academic Term (6 Months)', 6, 12000.00, 'All-inclusive campus transit pass with free route change allowance')
ON CONFLICT DO NOTHING;
