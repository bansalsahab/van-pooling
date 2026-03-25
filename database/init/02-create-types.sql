-- Create ENUM types for the database

-- User role types
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'DRIVER', 'ADMIN');

-- User status types
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- Van status types
CREATE TYPE van_status AS ENUM ('AVAILABLE', 'ON_TRIP', 'OFFLINE', 'MAINTENANCE');

-- Ride request status types
CREATE TYPE ride_request_status AS ENUM (
    'REQUESTED',
    'MATCHING',
    'MATCHED',
    'DRIVER_EN_ROUTE',
    'ARRIVED_AT_PICKUP',
    'PICKED_UP',
    'IN_TRANSIT',
    'ARRIVED_AT_DESTINATION',
    'DROPPED_OFF',
    'COMPLETED',
    'CANCELLED_BY_EMPLOYEE',
    'CANCELLED_BY_ADMIN',
    'NO_SHOW',
    'REASSIGNED',
    'FAILED_NO_CAPACITY',
    'FAILED_DRIVER_UNREACHABLE',
    'FAILED_OPERATIONAL_ISSUE',
    'SCHEDULED_REQUESTED',
    'SCHEDULED_QUEUED',
    'MATCHING_AT_DISPATCH_WINDOW'
);

-- Trip status types
CREATE TYPE trip_status AS ENUM (
    'PLANNED',
    'DISPATCH_READY',
    'ACTIVE_TO_PICKUP',
    'ACTIVE_IN_TRANSIT',
    'ACTIVE_MIXED',
    'COMPLETED',
    'REASSIGNED',
    'CANCELLED',
    'FAILED_OPERATIONAL_ISSUE'
);

-- Passenger status types
CREATE TYPE passenger_status AS ENUM (
    'ASSIGNED',
    'NOTIFIED',
    'PICKED_UP',
    'DROPPED_OFF',
    'NO_SHOW'
);

-- Analytics event types
CREATE TYPE event_type AS ENUM (
    'RIDE_REQUESTED',
    'RIDE_MATCHED',
    'RIDE_STARTED',
    'RIDE_COMPLETED',
    'RIDE_CANCELLED',
    'VAN_ONLINE',
    'VAN_OFFLINE',
    'DEMAND_SURGE'
);

-- Notification types
CREATE TYPE notification_type AS ENUM ('PUSH', 'SMS', 'EMAIL');

-- Notification status types
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Made with Bob
