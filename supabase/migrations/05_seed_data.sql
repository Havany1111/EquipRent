-- ============================================================================
-- EQUIPRENT DATABASE ENGINEERING SPECIFICATION
-- MIGRATION 05: SEED DATA & BENCHMARK FIXTURES
-- Target: PostgreSQL 15+ / Supabase Cloud Database Cluster
-- Compliance: Realistic Multi-Tier Operational Data, Non-Trivial Relations
-- ============================================================================

-- Fixed deterministic UUIDs for relational consistency
DO $$
DECLARE
    -- User Profile UUIDs
    uid_admin UUID := 'a0000000-0000-0000-0000-000000000001';
    uid_staff UUID := 'b0000000-0000-0000-0000-000000000002';
    uid_cust1 UUID := 'c0000000-0000-0000-0000-000000000003';
    uid_cust2 UUID := 'c0000000-0000-0000-0000-000000000004';

    -- Warehouse UUIDs
    wh_metro UUID := 'b1000000-0000-0000-0000-000000000001';
    wh_north UUID := 'b1000000-0000-0000-0000-000000000002';
    wh_west  UUID := 'b1000000-0000-0000-0000-000000000003';

    -- Category UUIDs
    cat_heavy UUID := 'e1000000-0000-0000-0000-000000000001';
    cat_earth UUID := 'e1000000-0000-0000-0000-000000000002';
    cat_mat   UUID := 'e1000000-0000-0000-0000-000000000003';
    cat_power UUID := 'e1000000-0000-0000-0000-000000000004';

    -- Equipment UUIDs
    eq_cat320 UUID := 'e2000000-0000-0000-0000-000000000001';
    eq_ctl    UUID := 'e2000000-0000-0000-0000-000000000002';
    eq_mini   UUID := 'e2000000-0000-0000-0000-000000000003';
    eq_loader UUID := 'e2000000-0000-0000-0000-000000000004';
    eq_dozer  UUID := 'e2000000-0000-0000-0000-000000000005';
    eq_genie  UUID := 'e2000000-0000-0000-0000-000000000006';

    -- Order UUIDs
    ord_1 UUID := 'd1000000-0000-0000-0000-000000000001';
    ord_2 UUID := 'd1000000-0000-0000-0000-000000000002';
    ord_3 UUID := 'd1000000-0000-0000-0000-000000000003';

    -- Maintenance UUID
    maint_1 UUID := 'f1000000-0000-0000-0000-000000000001';
BEGIN

    -- 1. Insert User Profiles (3 Tiers: Admin, Staff, Customer)
    INSERT INTO user_profiles (id, full_name, email, phone, company_name, role)
    VALUES
        (uid_admin, 'Alex Morgan', 'admin@equiprent.com', '+1-555-0101', 'EquipRent Headquarters', 'admin'),
        (uid_staff, 'Marcus Vance', 'marcus.tech@equiprent.com', '+1-555-0102', 'EquipRent Operations', 'staff'),
        (uid_cust1, 'Jordan Miller', 'jordan.miller@buildcorp.com', '+1-555-0103', 'Apex Construction LLC', 'customer'),
        (uid_cust2, 'Elena Rostova', 'elena@novainfra.com', '+1-555-0104', 'Nova Infrastructure Partners', 'customer')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Insert Warehouse Locations
    INSERT INTO warehouse_locations (id, branch_code, branch_name, address, city, region, contact_phone, manager_id, max_storage_capacity)
    VALUES
        (wh_metro, 'DEP-METRO-01', 'Central Metro Depot', '4400 Logistics Blvd', 'Denver', 'Colorado', '+1-303-555-0180', uid_admin, 150),
        (wh_north, 'DEP-NORTH-02', 'North Valley Storage Yard', '890 Quarry Way', 'Boulder', 'Colorado', '+1-303-555-0182', uid_staff, 90),
        (wh_west,  'DEP-WEST-03',  'West Ridge Industrial Park', '1240 Industrial Park Rd', 'Golden', 'Colorado', '+1-303-555-0185', uid_staff, 120)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Insert Equipment Categories
    INSERT INTO equipment_categories (id, category_name, category_code, description, base_daily_insurance_rate, requires_operator_certification)
    VALUES
        (cat_heavy, 'Heavy Machinery', 'CAT-HVY', 'Full-size excavators, bulldozers, and heavy crawler cranes', 45.00, true),
        (cat_earth, 'Earthmoving', 'CAT-EAR', 'Compact track loaders, mini excavators, and trenchers', 30.00, false),
        (cat_mat,   'Material Handling', 'CAT-MTH', 'Wheel loaders, telehandlers, and rough terrain forklifts', 35.00, false),
        (cat_power, 'Power & Generation', 'CAT-PWR', 'Industrial diesel generators and mobile power substations', 20.00, false)
    ON CONFLICT (id) DO NOTHING;

    -- 4. Insert Equipment Units
    INSERT INTO equipment (id, serial_number, model_name, manufacturer, model_year, category_id, warehouse_id, daily_rental_rate, replacement_value, operational_hours, current_status, image_url, maintenance_interval_hours)
    VALUES
        (eq_cat320, 'CAT-320-X8910', 'CAT 320 Hydraulic Excavator', 'Caterpillar Inc.', 2023, cat_heavy, wh_metro, 485.00, 240000.00, 412.50, 'available', 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=85', 250.00),
        (eq_ctl,    'CTL-TL8-9941', 'Takeuchi TL8 Track Loader', 'Takeuchi Mfg.', 2022, cat_earth, wh_metro, 295.00, 78000.00, 185.00, 'rented', 'https://images.unsplash.com/photo-1583024011792-b165975b52f5?auto=format&fit=crop&w=900&q=85', 200.00),
        (eq_mini,   'KUB-KX040-4', 'Kubota KX040-4 Mini Excavator', 'Kubota Corp.', 2024, cat_heavy, wh_north, 340.00, 92000.00, 310.00, 'under_maintenance', 'https://images.unsplash.com/photo-1495036019936-220b29b930ea?auto=format&fit=crop&w=900&q=85', 250.00),
        (eq_loader, 'KOM-WA270-8', 'Komatsu WA270-8 Wheel Loader', 'Komatsu Ltd.', 2023, cat_mat, wh_west, 420.00, 185000.00, 240.00, 'available', 'https://images.unsplash.com/photo-1580901369227-308f6f40bdeb?auto=format&fit=crop&w=900&q=85', 300.00),
        (eq_dozer,  'CAT-D6-T2901', 'CAT D6T Crawler Dozer', 'Caterpillar Inc.', 2022, cat_heavy, wh_north, 650.00, 380000.00, 720.00, 'available', 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=900&q=85', 300.00),
        (eq_genie,  'GEN-Z45-8812', 'Genie Z-45 Articulated Boom', 'Terex Corp.', 2023, cat_power, wh_metro, 220.00, 65000.00, 95.00, 'available', 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f8?auto=format&fit=crop&w=900&q=85', 250.00)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Insert Rental Orders
    INSERT INTO rental_orders (id, order_number, customer_id, authorized_staff_id, status, order_date, expected_start_date, expected_end_date, subtotal_amount, tax_amount, security_deposit_amount, total_amount, payment_status, delivery_address)
    VALUES
        (ord_1, 'ORD-2026-08101', uid_cust1, uid_staff, 'in_progress', NOW() - INTERVAL '3 days', CURRENT_DATE - 3, CURRENT_DATE + 4, 885.00, 70.80, 500.00, 1455.80, 'paid', '740 Quarry Site Road, Golden CO'),
        (ord_2, 'ORD-2026-08102', uid_cust2, uid_staff, 'confirmed', NOW() - INTERVAL '1 day', CURRENT_DATE + 2, CURRENT_DATE + 7, 1940.00, 155.20, 800.00, 2895.20, 'partially_paid', 'Interstate 70 Bridge Expansion Jobsite'),
        (ord_3, 'ORD-2026-08103', uid_cust1, NULL, 'draft', NOW(), CURRENT_DATE + 5, CURRENT_DATE + 9, 0.00, 0.00, 0.00, 0.00, 'unpaid', 'Apex Downtown Commercial Tower')
    ON CONFLICT (id) DO NOTHING;

    -- 6. Insert Rental Order Items (Junction Table 1)
    INSERT INTO rental_order_items (id, rental_order_id, equipment_id, unit_daily_rate, days_rented, daily_insurance_rate, item_subtotal, item_status, dispatch_odometer_hours, dispatched_at)
    VALUES
        (gen_random_uuid(), ord_1, eq_ctl, 295.00, 3, 30.00, 885.00, 'dispatched', 185.00, NOW() - INTERVAL '3 days')
    ON CONFLICT DO NOTHING;

    INSERT INTO rental_order_items (id, rental_order_id, equipment_id, unit_daily_rate, days_rented, daily_insurance_rate, item_subtotal, item_status)
    VALUES
        (gen_random_uuid(), ord_2, eq_cat320, 485.00, 4, 45.00, 1940.00, 'reserved')
    ON CONFLICT DO NOTHING;

    -- 7. Insert Payment Transactions
    INSERT INTO payment_transactions (rental_order_id, transaction_reference, payment_method, amount, transaction_status)
    VALUES
        (ord_1, 'TXN-DEP-2026-8891', 'credit_card', 1455.80, 'succeeded'),
        (ord_2, 'TXN-DEP-2026-8892', 'corporate_credit', 800.00, 'succeeded')
    ON CONFLICT DO NOTHING;

    -- 8. Insert Maintenance Records & Junction Tasks
    INSERT INTO maintenance_records (id, work_order_number, equipment_id, maintenance_type, maintenance_status, scheduled_date, odometer_hours_at_service, parts_cost, labor_cost, total_maintenance_cost, lead_technician_id, service_description)
    VALUES
        (maint_1, 'WO-20260812-001', eq_mini, 'scheduled_routine', 'in_progress', CURRENT_DATE - 1, 310.00, 240.00, 350.00, 590.00, uid_staff, '300-hour hydraulic fluid flush, seal replacement, and track tensioning calibration')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO maintenance_tasks (maintenance_id, technician_id, task_code, task_name, hours_logged, hourly_labor_rate, progress_status, findings_report)
    VALUES
        (maint_1, uid_staff, 'TASK-HYD-FLUSH', 'Hydraulic System Purge & Fluid Exchange', 3.5, 75.00, 'completed', 'Drained 18 gal contaminated hydraulic fluid. Replaced high-pressure line filter.'),
        (maint_1, uid_staff, 'TASK-TRK-CALIB', 'Rubber Track Tension & Sprocket Alignment', 1.5, 75.00, 'in_progress', 'Left idler tension within spec; adjusting right tension spring')
    ON CONFLICT DO NOTHING;

END $$;
