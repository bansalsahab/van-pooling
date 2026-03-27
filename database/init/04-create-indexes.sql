-- Create indexes for optimal query performance

-- Companies indexes
CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_service_zone ON companies USING GIST(service_zone);

-- Users indexes
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_home_location ON users USING GIST(home_location);
CREATE INDEX idx_users_default_destination ON users USING GIST(default_destination);

-- Vans indexes
CREATE INDEX idx_vans_company ON vans(company_id);
CREATE INDEX idx_vans_driver ON vans(driver_id);
CREATE INDEX idx_vans_status ON vans(status);
CREATE INDEX idx_vans_license_plate ON vans(license_plate);
CREATE INDEX idx_vans_current_location ON vans USING GIST(current_location);
CREATE INDEX idx_vans_last_location_update ON vans(last_location_update);

-- Ride requests indexes
CREATE INDEX idx_ride_requests_user ON ride_requests(user_id);
CREATE INDEX idx_ride_requests_company ON ride_requests(company_id);
CREATE INDEX idx_ride_requests_status ON ride_requests(status);
CREATE INDEX idx_ride_requests_pickup_location ON ride_requests USING GIST(pickup_location);
CREATE INDEX idx_ride_requests_destination ON ride_requests USING GIST(destination);
CREATE INDEX idx_ride_requests_requested_at ON ride_requests(requested_at);
CREATE INDEX idx_ride_requests_scheduled_time ON ride_requests(scheduled_time);
CREATE INDEX idx_ride_requests_status_requested_at ON ride_requests(status, requested_at);

-- Trips indexes
CREATE INDEX idx_trips_van ON trips(van_id);
CREATE INDEX idx_trips_company ON trips(company_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_accepted_at ON trips(accepted_at);
CREATE INDEX idx_trips_started_at ON trips(started_at);
CREATE INDEX idx_trips_completed_at ON trips(completed_at);
CREATE INDEX idx_trips_status_started_at ON trips(status, started_at);

-- Trip passengers indexes
CREATE INDEX idx_trip_passengers_trip ON trip_passengers(trip_id);
CREATE INDEX idx_trip_passengers_ride_request ON trip_passengers(ride_request_id);
CREATE INDEX idx_trip_passengers_user ON trip_passengers(user_id);
CREATE INDEX idx_trip_passengers_status ON trip_passengers(status);

-- Analytics events indexes
CREATE INDEX idx_analytics_company ON analytics_events(company_id);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_location ON analytics_events USING GIST(location);
CREATE INDEX idx_analytics_company_type_created ON analytics_events(company_id, event_type, created_at);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_notifications_user_read_at ON notifications(user_id, read_at);

-- Dispatch events indexes
CREATE INDEX idx_dispatch_events_company ON dispatch_events(company_id);
CREATE INDEX idx_dispatch_events_trip ON dispatch_events(trip_id);
CREATE INDEX idx_dispatch_events_ride ON dispatch_events(ride_id);
CREATE INDEX idx_dispatch_events_actor_user ON dispatch_events(actor_user_id);
CREATE INDEX idx_dispatch_events_event_type ON dispatch_events(event_type);
CREATE INDEX idx_dispatch_events_created_at ON dispatch_events(created_at);
CREATE INDEX idx_dispatch_events_company_created ON dispatch_events(company_id, created_at);
CREATE INDEX idx_dispatch_events_trip_created ON dispatch_events(trip_id, created_at);

-- Composite indexes for common queries
CREATE INDEX idx_vans_company_status_location ON vans(company_id, status) INCLUDE (current_location);
CREATE INDEX idx_ride_requests_pending_company ON ride_requests(company_id, requested_at) WHERE status = 'pending';
CREATE INDEX idx_trips_active_van ON trips(van_id, status) WHERE status IN ('planned', 'active');

-- Made with Bob
