-- Seed sample user data
-- Note: Password hash is for 'password123' using bcrypt
-- In production, these should be generated securely

-- Admin user
INSERT INTO users (
    id,
    company_id,
    email,
    password_hash,
    name,
    phone,
    role,
    status
) VALUES (
    '660e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440000',
    'admin@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Admin User',
    '+91-9876543210',
    'admin',
    'active'
);

-- Driver users
INSERT INTO users (
    id,
    company_id,
    email,
    password_hash,
    name,
    phone,
    role,
    status
) VALUES 
(
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    'driver1@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Rajesh Kumar',
    '+91-9876543211',
    'driver',
    'active'
),
(
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440000',
    'driver2@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Priya Sharma',
    '+91-9876543212',
    'driver',
    'active'
),
(
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440000',
    'driver3@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Amit Patel',
    '+91-9876543213',
    'driver',
    'active'
);

-- Employee users with home locations
INSERT INTO users (
    id,
    company_id,
    email,
    password_hash,
    name,
    phone,
    role,
    status,
    home_location,
    home_address,
    default_destination,
    default_destination_address
) VALUES 
(
    '660e8400-e29b-41d4-a716-446655440010',
    '550e8400-e29b-41d4-a716-446655440000',
    'john.doe@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'John Doe',
    '+91-9876543220',
    'employee',
    'active',
    ST_GeogFromText('POINT(77.5946 12.9716)'),
    'Koramangala, Bangalore',
    ST_GeogFromText('POINT(77.6000 12.9800)'),
    'TechCorp Office, Whitefield'
),
(
    '660e8400-e29b-41d4-a716-446655440011',
    '550e8400-e29b-41d4-a716-446655440000',
    'jane.smith@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Jane Smith',
    '+91-9876543221',
    'employee',
    'active',
    ST_GeogFromText('POINT(77.5950 12.9720)'),
    'Koramangala 5th Block, Bangalore',
    ST_GeogFromText('POINT(77.6000 12.9800)'),
    'TechCorp Office, Whitefield'
),
(
    '660e8400-e29b-41d4-a716-446655440012',
    '550e8400-e29b-41d4-a716-446655440000',
    'alice.johnson@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Alice Johnson',
    '+91-9876543222',
    'employee',
    'active',
    ST_GeogFromText('POINT(77.6100 12.9350)'),
    'HSR Layout, Bangalore',
    ST_GeogFromText('POINT(77.6000 12.9800)'),
    'TechCorp Office, Whitefield'
),
(
    '660e8400-e29b-41d4-a716-446655440013',
    '550e8400-e29b-41d4-a716-446655440000',
    'bob.wilson@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Bob Wilson',
    '+91-9876543223',
    'employee',
    'active',
    ST_GeogFromText('POINT(77.5900 12.9650)'),
    'Indiranagar, Bangalore',
    ST_GeogFromText('POINT(77.6000 12.9800)'),
    'TechCorp Office, Whitefield'
),
(
    '660e8400-e29b-41d4-a716-446655440014',
    '550e8400-e29b-41d4-a716-446655440000',
    'carol.davis@techcorp.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJxMxJ7EW',
    'Carol Davis',
    '+91-9876543224',
    'employee',
    'active',
    ST_GeogFromText('POINT(77.6200 12.9400)'),
    'Bellandur, Bangalore',
    ST_GeogFromText('POINT(77.6000 12.9800)'),
    'TechCorp Office, Whitefield'
);

-- Verify insertions
SELECT 
    name, 
    email, 
    role, 
    ST_AsText(home_location) as home_location 
FROM users 
ORDER BY role, name;

-- Made with Bob
