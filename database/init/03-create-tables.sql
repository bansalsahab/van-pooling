-- Create all database tables with PostGIS support

-- Companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    service_zone GEOGRAPHY(POLYGON, 4326),
    operating_hours JSONB DEFAULT '{"weekday": {"start": "07:00", "end": "22:00"}, "weekend": {"start": "08:00", "end": "20:00"}}'::jsonb,
    max_pickup_radius_meters INTEGER DEFAULT 800,
    max_detour_minutes INTEGER DEFAULT 15,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users table (employees, drivers, admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL,
    status user_status DEFAULT 'active',
    must_reset_password BOOLEAN DEFAULT FALSE NOT NULL,
    home_location GEOGRAPHY(POINT, 4326),
    home_address TEXT,
    default_destination GEOGRAPHY(POINT, 4326),
    default_destination_address TEXT,
    notification_preferences JSONB DEFAULT '{"push": true, "sms": false, "email": true}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vans table
CREATE TABLE vans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 8,
    current_location GEOGRAPHY(POINT, 4326),
    current_occupancy INTEGER DEFAULT 0,
    status van_status DEFAULT 'offline',
    last_location_update TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT check_occupancy CHECK (current_occupancy >= 0 AND current_occupancy <= capacity)
);

-- Ride requests table
CREATE TABLE ride_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    pickup_location GEOGRAPHY(POINT, 4326) NOT NULL,
    pickup_address TEXT NOT NULL,
    destination GEOGRAPHY(POINT, 4326) NOT NULL,
    destination_address TEXT NOT NULL,
    status ride_request_status DEFAULT 'pending',
    scheduled_time TIMESTAMP,
    requested_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    estimated_wait_minutes INTEGER,
    estimated_cost DECIMAL(10, 2),
    dispatch_metadata JSONB DEFAULT '{}'::jsonb,
    actual_pickup_time TIMESTAMP,
    actual_dropoff_time TIMESTAMP,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Trips table
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    van_id UUID REFERENCES vans(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    status trip_status DEFAULT 'planned',
    route JSONB NOT NULL,
    total_distance_meters INTEGER,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    accepted_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Trip passengers table (join table)
CREATE TABLE trip_passengers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    ride_request_id UUID REFERENCES ride_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pickup_stop_index INTEGER NOT NULL,
    dropoff_stop_index INTEGER NOT NULL,
    status passenger_status DEFAULT 'assigned',
    pickup_eta TIMESTAMP,
    actual_pickup_time TIMESTAMP,
    actual_dropoff_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT check_stop_order CHECK (pickup_stop_index < dropoff_stop_index)
);

-- Analytics events table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    payload JSONB NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255),
    message TEXT NOT NULL,
    status notification_status DEFAULT 'pending',
    metadata JSONB,
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dispatch audit events table
CREATE TABLE dispatch_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ride_id UUID REFERENCES ride_requests(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    from_state VARCHAR(100),
    to_state VARCHAR(100),
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vans_updated_at BEFORE UPDATE ON vans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ride_requests_updated_at BEFORE UPDATE ON ride_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trip_passengers_updated_at BEFORE UPDATE ON trip_passengers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Made with Bob
