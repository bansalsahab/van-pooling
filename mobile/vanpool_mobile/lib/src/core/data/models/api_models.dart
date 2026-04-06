class NotificationPreferences {
  const NotificationPreferences({
    required this.push,
    required this.sms,
    required this.email,
  });

  final bool push;
  final bool sms;
  final bool email;

  factory NotificationPreferences.fromJson(Map<String, dynamic>? json) {
    return NotificationPreferences(
      push: json?['push'] as bool? ?? true,
      sms: json?['sms'] as bool? ?? false,
      email: json?['email'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'push': push,
        'sms': sms,
        'email': email,
      };
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    this.companyId,
    this.companyName,
    this.phone,
    this.homeAddress,
    this.homeLatitude,
    this.homeLongitude,
    this.defaultDestinationAddress,
    this.defaultDestinationLatitude,
    this.defaultDestinationLongitude,
    this.notificationPreferences = const NotificationPreferences(
      push: true,
      sms: false,
      email: true,
    ),
  });

  final String id;
  final String? companyId;
  final String name;
  final String email;
  final String role;
  final String status;
  final String? companyName;
  final String? phone;
  final String? homeAddress;
  final double? homeLatitude;
  final double? homeLongitude;
  final String? defaultDestinationAddress;
  final double? defaultDestinationLatitude;
  final double? defaultDestinationLongitude;
  final NotificationPreferences notificationPreferences;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      companyId: json['company_id'] as String?,
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      role: json['role'] as String? ?? 'employee',
      status: json['status'] as String? ?? 'active',
      companyName: json['company_name'] as String?,
      phone: json['phone'] as String?,
      homeAddress: json['home_address'] as String?,
      homeLatitude: _asDouble(json['home_latitude']),
      homeLongitude: _asDouble(json['home_longitude']),
      defaultDestinationAddress: json['default_destination_address'] as String?,
      defaultDestinationLatitude: _asDouble(json['default_destination_latitude']),
      defaultDestinationLongitude: _asDouble(json['default_destination_longitude']),
      notificationPreferences: NotificationPreferences.fromJson(
        json['notification_preferences'] as Map<String, dynamic>?,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'company_id': companyId,
        'name': name,
        'email': email,
        'role': role,
        'status': status,
        'company_name': companyName,
        'phone': phone,
        'home_address': homeAddress,
        'home_latitude': homeLatitude,
        'home_longitude': homeLongitude,
        'default_destination_address': defaultDestinationAddress,
        'default_destination_latitude': defaultDestinationLatitude,
        'default_destination_longitude': defaultDestinationLongitude,
        'notification_preferences': notificationPreferences.toJson(),
      };
}

class AuthResponse {
  const AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final UserProfile user;

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['access_token'] as String? ?? '',
      refreshToken: json['refresh_token'] as String? ?? '',
      tokenType: json['token_type'] as String? ?? 'bearer',
      user: UserProfile.fromJson(json['user'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class NotificationSummary {
  const NotificationSummary({
    required this.id,
    required this.type,
    required this.message,
    required this.status,
    this.title,
    this.severity,
    this.createdAt,
  });

  final String id;
  final String type;
  final String message;
  final String status;
  final String? title;
  final String? severity;
  final DateTime? createdAt;

  factory NotificationSummary.fromJson(Map<String, dynamic> json) {
    return NotificationSummary(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'push',
      message: json['message'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      title: json['title'] as String?,
      severity: json['severity'] as String?,
      createdAt: _asDateTime(json['created_at']),
    );
  }
}

class NotificationFeed {
  const NotificationFeed({
    required this.items,
    required this.unreadCount,
  });

  final List<NotificationSummary> items;
  final int unreadCount;

  factory NotificationFeed.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? [])
        .map((item) => NotificationSummary.fromJson(item as Map<String, dynamic>))
        .toList();
    return NotificationFeed(
      items: items,
      unreadCount: json['unread_count'] as int? ?? 0,
    );
  }
}

class RouteWaypoint {
  const RouteWaypoint({
    required this.latitude,
    required this.longitude,
    required this.address,
    this.label,
    this.kind,
    this.status,
  });

  final double latitude;
  final double longitude;
  final String address;
  final String? label;
  final String? kind;
  final String? status;

  factory RouteWaypoint.fromJson(Map<String, dynamic> json) {
    return RouteWaypoint(
      latitude: _asDouble(json['latitude']) ?? 0,
      longitude: _asDouble(json['longitude']) ?? 0,
      address: json['address'] as String? ?? '',
      label: json['label'] as String?,
      kind: json['kind'] as String?,
      status: json['status'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'label': label,
        'kind': kind ?? 'stop',
        'status': status,
      };
}

class RouteStep {
  const RouteStep({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    this.encodedPolyline,
  });

  final String instruction;
  final int distanceMeters;
  final int durationSeconds;
  final String? encodedPolyline;

  factory RouteStep.fromJson(Map<String, dynamic> json) {
    return RouteStep(
      instruction: json['instruction'] as String? ?? '',
      distanceMeters: json['distance_meters'] as int? ?? 0,
      durationSeconds: json['duration_seconds'] as int? ?? 0,
      encodedPolyline: json['encoded_polyline'] as String?,
    );
  }
}

class RoutePlan {
  const RoutePlan({
    required this.source,
    required this.travelMode,
    required this.trafficAware,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.durationMinutes,
    required this.waypoints,
    required this.steps,
    required this.warnings,
    this.encodedPolyline,
    this.origin,
    this.destination,
  });

  final String source;
  final String travelMode;
  final bool trafficAware;
  final int distanceMeters;
  final int durationSeconds;
  final int durationMinutes;
  final String? encodedPolyline;
  final RouteWaypoint? origin;
  final RouteWaypoint? destination;
  final List<RouteWaypoint> waypoints;
  final List<RouteStep> steps;
  final List<String> warnings;

  factory RoutePlan.fromJson(Map<String, dynamic> json) {
    return RoutePlan(
      source: json['source'] as String? ?? 'heuristic',
      travelMode: json['travel_mode'] as String? ?? 'DRIVE',
      trafficAware: json['traffic_aware'] as bool? ?? false,
      distanceMeters: json['distance_meters'] as int? ?? 0,
      durationSeconds: json['duration_seconds'] as int? ?? 0,
      durationMinutes: json['duration_minutes'] as int? ?? 0,
      encodedPolyline: json['encoded_polyline'] as String?,
      origin: json['origin'] is Map<String, dynamic>
          ? RouteWaypoint.fromJson(json['origin'] as Map<String, dynamic>)
          : null,
      destination: json['destination'] is Map<String, dynamic>
          ? RouteWaypoint.fromJson(json['destination'] as Map<String, dynamic>)
          : null,
      waypoints: (json['waypoints'] as List<dynamic>? ?? [])
          .map((item) => RouteWaypoint.fromJson(item as Map<String, dynamic>))
          .toList(),
      steps: (json['steps'] as List<dynamic>? ?? [])
          .map((item) => RouteStep.fromJson(item as Map<String, dynamic>))
          .toList(),
      warnings: (json['warnings'] as List<dynamic>? ?? [])
          .map((item) => item.toString())
          .toList(),
    );
  }
}

class RideSummary {
  const RideSummary({
    required this.id,
    required this.status,
    required this.pickupAddress,
    required this.destinationAddress,
    this.estimatedWaitMinutes,
    this.minutesUntilPickup,
    this.requestedAt,
    this.boardingOtpCode,
    this.tripId,
    this.vanLicensePlate,
    this.driverName,
    this.pickupLatitude,
    this.pickupLongitude,
    this.destinationLatitude,
    this.destinationLongitude,
    this.vanLatitude,
    this.vanLongitude,
    this.routePolyline,
    this.routeDistanceMeters,
    this.routeDurationMinutes,
    this.nextStopAddress,
  });

  final String id;
  final String status;
  final String pickupAddress;
  final String destinationAddress;
  final int? estimatedWaitMinutes;
  final int? minutesUntilPickup;
  final DateTime? requestedAt;
  final String? boardingOtpCode;
  final String? tripId;
  final String? vanLicensePlate;
  final String? driverName;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final double? destinationLatitude;
  final double? destinationLongitude;
  final double? vanLatitude;
  final double? vanLongitude;
  final String? routePolyline;
  final int? routeDistanceMeters;
  final int? routeDurationMinutes;
  final String? nextStopAddress;

  factory RideSummary.fromJson(Map<String, dynamic> json) {
    return RideSummary(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'requested',
      pickupAddress: json['pickup_address'] as String? ?? '',
      destinationAddress: json['destination_address'] as String? ?? '',
      estimatedWaitMinutes: json['estimated_wait_minutes'] as int?,
      minutesUntilPickup: json['minutes_until_pickup'] as int?,
      requestedAt: _asDateTime(json['requested_at']),
      boardingOtpCode: json['boarding_otp_code'] as String?,
      tripId: json['trip_id'] as String?,
      vanLicensePlate: json['van_license_plate'] as String?,
      driverName: json['driver_name'] as String?,
      pickupLatitude: _asDouble(json['pickup_latitude']),
      pickupLongitude: _asDouble(json['pickup_longitude']),
      destinationLatitude: _asDouble(json['destination_latitude']),
      destinationLongitude: _asDouble(json['destination_longitude']),
      vanLatitude: _asDouble(json['van_latitude']),
      vanLongitude: _asDouble(json['van_longitude']),
      routePolyline: json['route_polyline'] as String?,
      routeDistanceMeters: json['route_distance_meters'] as int?,
      routeDurationMinutes: json['route_duration_minutes'] as int?,
      nextStopAddress: json['next_stop_address'] as String?,
    );
  }
}

class VanSummary {
  const VanSummary({
    required this.id,
    required this.licensePlate,
    required this.capacity,
    required this.currentOccupancy,
    required this.status,
    this.driverName,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String licensePlate;
  final int capacity;
  final int currentOccupancy;
  final String status;
  final String? driverName;
  final double? latitude;
  final double? longitude;

  factory VanSummary.fromJson(Map<String, dynamic> json) {
    return VanSummary(
      id: json['id'] as String,
      licensePlate: json['license_plate'] as String? ?? '',
      capacity: json['capacity'] as int? ?? 0,
      currentOccupancy: json['current_occupancy'] as int? ?? 0,
      status: json['status'] as String? ?? 'available',
      driverName: json['driver_name'] as String?,
      latitude: _asDouble(json['latitude']),
      longitude: _asDouble(json['longitude']),
    );
  }
}

class TripPassengerSummary {
  const TripPassengerSummary({
    required this.rideRequestId,
    required this.userId,
    required this.status,
    required this.pickupStopIndex,
    required this.dropoffStopIndex,
    this.passengerName,
    this.pickupAddress,
    this.destinationAddress,
  });

  final String rideRequestId;
  final String userId;
  final String status;
  final int pickupStopIndex;
  final int dropoffStopIndex;
  final String? passengerName;
  final String? pickupAddress;
  final String? destinationAddress;

  factory TripPassengerSummary.fromJson(Map<String, dynamic> json) {
    return TripPassengerSummary(
      rideRequestId: json['ride_request_id'] as String? ?? '',
      userId: json['user_id'] as String? ?? '',
      status: json['status'] as String? ?? 'matched',
      pickupStopIndex: json['pickup_stop_index'] as int? ?? 0,
      dropoffStopIndex: json['dropoff_stop_index'] as int? ?? 0,
      passengerName: json['passenger_name'] as String?,
      pickupAddress: json['pickup_address'] as String?,
      destinationAddress: json['destination_address'] as String?,
    );
  }
}

class DriverTripSummary {
  const DriverTripSummary({
    required this.id,
    required this.status,
    required this.vanId,
    required this.route,
    required this.passengerCount,
    required this.passengers,
    this.estimatedDurationMinutes,
    this.acceptedAt,
    this.startedAt,
  });

  final String id;
  final String status;
  final String vanId;
  final RoutePlan route;
  final int passengerCount;
  final List<TripPassengerSummary> passengers;
  final int? estimatedDurationMinutes;
  final DateTime? acceptedAt;
  final DateTime? startedAt;

  factory DriverTripSummary.fromJson(Map<String, dynamic> json) {
    return DriverTripSummary(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'planned',
      vanId: json['van_id'] as String? ?? '',
      route: RoutePlan.fromJson(json['route'] as Map<String, dynamic>? ?? {}),
      estimatedDurationMinutes: json['estimated_duration_minutes'] as int?,
      acceptedAt: _asDateTime(json['accepted_at']),
      startedAt: _asDateTime(json['started_at']),
      passengerCount: json['passenger_count'] as int? ?? 0,
      passengers: (json['passengers'] as List<dynamic>? ?? [])
          .map((item) => TripPassengerSummary.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class DriverDashboardSummary {
  const DriverDashboardSummary({
    required this.driverId,
    required this.driverName,
    this.van,
    this.activeTrip,
    this.upcomingScheduledWork = const [],
  });

  final String driverId;
  final String driverName;
  final VanSummary? van;
  final DriverTripSummary? activeTrip;
  final List<DriverScheduledWorkSummary> upcomingScheduledWork;

  factory DriverDashboardSummary.fromJson(Map<String, dynamic> json) {
    return DriverDashboardSummary(
      driverId: json['driver_id'] as String? ?? '',
      driverName: json['driver_name'] as String? ?? '',
      van: json['van'] is Map<String, dynamic>
          ? VanSummary.fromJson(json['van'] as Map<String, dynamic>)
          : null,
      activeTrip: json['active_trip'] is Map<String, dynamic>
          ? DriverTripSummary.fromJson(json['active_trip'] as Map<String, dynamic>)
          : null,
      upcomingScheduledWork:
          (json['upcoming_scheduled_work'] as List<dynamic>? ?? [])
              .map(
                (item) => DriverScheduledWorkSummary.fromJson(
                  item as Map<String, dynamic>,
                ),
              )
              .toList(),
    );
  }
}

class DriverScheduledWorkSummary {
  const DriverScheduledWorkSummary({
    required this.rideId,
    required this.tripId,
    required this.rideStatus,
    required this.pickupAddress,
    required this.destinationAddress,
    this.scheduledTime,
    this.minutesUntilPickup,
    this.passengerName,
  });

  final String rideId;
  final String tripId;
  final String rideStatus;
  final String pickupAddress;
  final String destinationAddress;
  final DateTime? scheduledTime;
  final int? minutesUntilPickup;
  final String? passengerName;

  factory DriverScheduledWorkSummary.fromJson(Map<String, dynamic> json) {
    return DriverScheduledWorkSummary(
      rideId: json['ride_id'] as String? ?? '',
      tripId: json['trip_id'] as String? ?? '',
      rideStatus: json['ride_status'] as String? ?? 'matched',
      pickupAddress: json['pickup_address'] as String? ?? '',
      destinationAddress: json['destination_address'] as String? ?? '',
      scheduledTime: _asDateTime(json['scheduled_time']),
      minutesUntilPickup: json['minutes_until_pickup'] as int?,
      passengerName: json['passenger_name'] as String?,
    );
  }
}

class DriverShiftEntry {
  const DriverShiftEntry({
    required this.id,
    required this.status,
    this.scheduledStartAt,
    this.scheduledEndAt,
    this.clockedInAt,
    this.clockedOutAt,
    this.durationMinutes,
    this.notes,
  });

  final String id;
  final String status;
  final DateTime? scheduledStartAt;
  final DateTime? scheduledEndAt;
  final DateTime? clockedInAt;
  final DateTime? clockedOutAt;
  final int? durationMinutes;
  final String? notes;

  factory DriverShiftEntry.fromJson(Map<String, dynamic> json) {
    return DriverShiftEntry(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'scheduled',
      scheduledStartAt: _asDateTime(json['scheduled_start_at']),
      scheduledEndAt: _asDateTime(json['scheduled_end_at']),
      clockedInAt: _asDateTime(json['clocked_in_at']),
      clockedOutAt: _asDateTime(json['clocked_out_at']),
      durationMinutes: json['duration_minutes'] as int?,
      notes: json['notes'] as String?,
    );
  }
}

class AdminDashboardSummary {
  const AdminDashboardSummary({
    required this.companyId,
    required this.employeesCount,
    required this.driversCount,
    required this.totalVans,
    required this.availableVans,
    required this.activeVans,
    required this.pendingRequests,
    required this.activeTrips,
    required this.openAlerts,
  });

  final String companyId;
  final int employeesCount;
  final int driversCount;
  final int totalVans;
  final int availableVans;
  final int activeVans;
  final int pendingRequests;
  final int activeTrips;
  final int openAlerts;

  factory AdminDashboardSummary.fromJson(Map<String, dynamic> json) {
    return AdminDashboardSummary(
      companyId: json['company_id'] as String? ?? '',
      employeesCount: json['employees_count'] as int? ?? 0,
      driversCount: json['drivers_count'] as int? ?? 0,
      totalVans: json['total_vans'] as int? ?? 0,
      availableVans: json['available_vans'] as int? ?? 0,
      activeVans: json['active_vans'] as int? ?? 0,
      pendingRequests: json['pending_requests'] as int? ?? 0,
      activeTrips: json['active_trips'] as int? ?? 0,
      openAlerts: json['open_alerts'] as int? ?? 0,
    );
  }
}

class TripSummary {
  const TripSummary({
    required this.id,
    required this.status,
    required this.vanId,
    required this.route,
    required this.passengerCount,
    this.vanLicensePlate,
    this.estimatedDurationMinutes,
    this.acceptedAt,
    this.startedAt,
    this.createdAt,
    this.passengers = const [],
  });

  final String id;
  final String status;
  final String vanId;
  final RoutePlan route;
  final int passengerCount;
  final String? vanLicensePlate;
  final int? estimatedDurationMinutes;
  final DateTime? acceptedAt;
  final DateTime? startedAt;
  final DateTime? createdAt;
  final List<TripPassengerSummary> passengers;

  factory TripSummary.fromJson(Map<String, dynamic> json) {
    return TripSummary(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'planned',
      vanId: json['van_id'] as String? ?? '',
      vanLicensePlate: json['van_license_plate'] as String?,
      route: RoutePlan.fromJson(json['route'] as Map<String, dynamic>? ?? {}),
      estimatedDurationMinutes: json['estimated_duration_minutes'] as int?,
      acceptedAt: _asDateTime(json['accepted_at']),
      startedAt: _asDateTime(json['started_at']),
      createdAt: _asDateTime(json['created_at']),
      passengerCount: json['passenger_count'] as int? ?? 0,
      passengers: (json['passengers'] as List<dynamic>? ?? [])
          .map((item) => TripPassengerSummary.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class AlertSummary {
  const AlertSummary({
    required this.id,
    required this.message,
    required this.status,
    required this.severity,
    required this.kind,
    this.title,
    this.tripId,
    this.createdAt,
  });

  final String id;
  final String message;
  final String status;
  final String severity;
  final String kind;
  final String? title;
  final String? tripId;
  final DateTime? createdAt;

  factory AlertSummary.fromJson(Map<String, dynamic> json) {
    return AlertSummary(
      id: json['id'] as String? ?? '',
      title: json['title'] as String?,
      message: json['message'] as String? ?? '',
      status: json['status'] as String? ?? 'open',
      severity: json['severity'] as String? ?? 'medium',
      kind: json['kind'] as String? ?? 'operational_alert',
      tripId: json['trip_id'] as String?,
      createdAt: _asDateTime(json['created_at']),
    );
  }
}

class IncidentTimelineItem {
  const IncidentTimelineItem({
    required this.id,
    required this.message,
    required this.status,
    required this.severity,
    required this.kind,
    this.title,
    this.createdAt,
  });

  final String id;
  final String message;
  final String status;
  final String severity;
  final String kind;
  final String? title;
  final DateTime? createdAt;

  factory IncidentTimelineItem.fromJson(Map<String, dynamic> json) {
    return IncidentTimelineItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String?,
      message: json['message'] as String? ?? '',
      status: json['status'] as String? ?? 'open',
      severity: json['severity'] as String? ?? 'medium',
      kind: json['kind'] as String? ?? 'incident',
      createdAt: _asDateTime(json['created_at']),
    );
  }
}

class AdminKpiSummary {
  const AdminKpiSummary({
    required this.p95WaitTimeMinutes,
    required this.onTimePickupPercent,
    required this.seatUtilizationPercent,
    required this.dispatchSuccessPercent,
  });

  final double? p95WaitTimeMinutes;
  final double? onTimePickupPercent;
  final double? seatUtilizationPercent;
  final double? dispatchSuccessPercent;

  factory AdminKpiSummary.fromJson(Map<String, dynamic> json) {
    final metrics = json['metrics'] as Map<String, dynamic>? ?? {};
    return AdminKpiSummary(
      p95WaitTimeMinutes: _asDouble(metrics['p95_wait_time_minutes']),
      onTimePickupPercent: _asDouble(metrics['on_time_pickup_percent']),
      seatUtilizationPercent: _asDouble(metrics['seat_utilization_percent']),
      dispatchSuccessPercent: _asDouble(metrics['dispatch_success_percent']),
    );
  }
}

class GeocodeResult {
  const GeocodeResult({
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.source,
    this.placeId,
  });

  final String address;
  final double latitude;
  final double longitude;
  final String source;
  final String? placeId;

  factory GeocodeResult.fromJson(Map<String, dynamic> json) {
    return GeocodeResult(
      address: json['address'] as String? ?? '',
      latitude: _asDouble(json['latitude']) ?? 0,
      longitude: _asDouble(json['longitude']) ?? 0,
      source: json['source'] as String? ?? 'fallback',
      placeId: json['place_id'] as String?,
    );
  }
}

class EmployeeHomeData {
  const EmployeeHomeData({
    required this.profile,
    required this.activeRide,
    required this.history,
    required this.notifications,
  });

  final UserProfile profile;
  final RideSummary? activeRide;
  final List<RideSummary> history;
  final NotificationFeed notifications;
}

class DriverConsoleData {
  const DriverConsoleData({
    required this.profile,
    required this.dashboard,
    required this.notifications,
  });

  final UserProfile profile;
  final DriverDashboardSummary? dashboard;
  final NotificationFeed notifications;
}

class AdminFleetData {
  const AdminFleetData({
    required this.profile,
    required this.dashboard,
    required this.vans,
    required this.trips,
    required this.alerts,
  });

  final UserProfile profile;
  final AdminDashboardSummary? dashboard;
  final List<VanSummary> vans;
  final List<TripSummary> trips;
  final List<AlertSummary> alerts;
}

class AdminDemandData {
  const AdminDemandData({
    required this.kpis,
    required this.incidents,
  });

  final AdminKpiSummary? kpis;
  final List<IncidentTimelineItem> incidents;
}

double? _asDouble(Object? value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

DateTime? _asDateTime(Object? value) {
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value);
  }
  return null;
}
