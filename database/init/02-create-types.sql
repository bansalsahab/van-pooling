-- Create ENUM types for the database

-- User role types
CREATE TYPE user_role AS ENUM ('employee', 'driver', 'admin');

-- User status types
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');

-- Van status types
CREATE TYPE van_status AS ENUM ('available', 'on_trip', 'offline', 'maintenance');

-- Ride request status types
CREATE TYPE ride_request_status AS ENUM (
    'pending',
    'matched',
    'driver_assigned',
    'driver_enroute',
    'picked_up',
    'completed',
    'cancelled',
    'expired'
);

-- Trip status types
CREATE TYPE trip_status AS ENUM ('planned', 'active', 'completed', 'cancelled');

-- Passenger status types
CREATE TYPE passenger_status AS ENUM (
    'assigned',
    'notified',
    'picked_up',
    'dropped_off',
    'no_show'
);

-- Analytics event types
CREATE TYPE event_type AS ENUM (
    'ride_requested',
    'ride_matched',
    'ride_started',
    'ride_completed',
    'ride_cancelled',
    'van_online',
    'van_offline',
    'demand_surge'
);

-- Notification types
CREATE TYPE notification_type AS ENUM ('push', 'sms', 'email');

-- Notification status types
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

-- Made with Bob
