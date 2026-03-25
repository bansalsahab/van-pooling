-- Seed sample company data

-- Insert TechCorp company with service zone in Bangalore, India
INSERT INTO companies (
    id,
    name,
    domain,
    service_zone,
    operating_hours,
    max_pickup_radius_meters,
    max_detour_minutes
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'TechCorp India',
    'techcorp.com',
    ST_GeogFromText('POLYGON((77.5800 12.9600, 77.6200 12.9600, 77.6200 12.9900, 77.5800 12.9900, 77.5800 12.9600))'),
    '{"weekday": {"start": "07:00", "end": "22:00"}, "weekend": {"start": "08:00", "end": "20:00"}}'::jsonb,
    800,
    15
);

-- Insert another company for testing multi-tenancy
INSERT INTO companies (
    id,
    name,
    domain,
    service_zone,
    operating_hours,
    max_pickup_radius_meters,
    max_detour_minutes
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    'StartupHub',
    'startuphub.com',
    ST_GeogFromText('POLYGON((77.6000 12.9300, 77.6400 12.9300, 77.6400 12.9600, 77.6000 12.9600, 77.6000 12.9300))'),
    '{"weekday": {"start": "08:00", "end": "21:00"}, "weekend": {"start": "09:00", "end": "19:00"}}'::jsonb,
    1000,
    20
);

-- Verify insertions
SELECT id, name, domain, max_pickup_radius_meters FROM companies;

-- Made with Bob
