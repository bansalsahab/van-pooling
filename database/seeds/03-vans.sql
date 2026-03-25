-- Seed sample van data

-- Insert vans for TechCorp
INSERT INTO vans (
    id,
    company_id,
    driver_id,
    license_plate,
    capacity,
    current_location,
    current_occupancy,
    status,
    last_location_update
) VALUES 
(
    '770e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440001',
    'KA-01-AB-1234',
    8,
    ST_GeogFromText('POINT(77.5950 12.9700)'),
    0,
    'available',
    NOW()
),
(
    '770e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440002',
    'KA-01-AB-5678',
    8,
    ST_GeogFromText('POINT(77.6100 12.9400)'),
    0,
    'available',
    NOW()
),
(
    '770e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440003',
    'KA-01-AB-9012',
    8,
    ST_GeogFromText('POINT(77.5900 12.9600)'),
    0,
    'available',
    NOW()
),
(
    '770e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440000',
    NULL,
    'KA-01-AB-3456',
    10,
    ST_GeogFromText('POINT(77.6000 12.9750)'),
    0,
    'offline',
    NOW()
),
(
    '770e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440000',
    NULL,
    'KA-01-AB-7890',
    8,
    ST_GeogFromText('POINT(77.6050 12.9500)'),
    0,
    'maintenance',
    NOW()
);

-- Verify insertions
SELECT 
    v.license_plate,
    v.capacity,
    v.status,
    u.name as driver_name,
    ST_AsText(v.current_location) as location
FROM vans v
LEFT JOIN users u ON v.driver_id = u.id
ORDER BY v.license_plate;

-- Made with Bob
