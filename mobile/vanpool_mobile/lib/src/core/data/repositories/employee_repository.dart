import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../models/api_models.dart';

class EmployeeRepository {
  const EmployeeRepository(this._dio);

  final Dio _dio;

  Future<RideSummary?> getActiveRide() async {
    final response = await _dio.get('/rides/active');
    final data = response.data;
    if (data == null || data is! Map<String, dynamic>) {
      return null;
    }
    return RideSummary.fromJson(data);
  }

  Future<List<RideSummary>> getRideHistory() async {
    final response = await _dio.get<List<dynamic>>('/rides/history');
    return (response.data ?? [])
        .map((item) => RideSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<RideSummary> cancelRide(String rideId) async {
    final response = await _dio.post<Map<String, dynamic>>('/rides/$rideId/cancel');
    return RideSummary.fromJson(response.data ?? {});
  }

  Future<NotificationFeed> getNotifications() async {
    final response = await _dio.get<Map<String, dynamic>>('/notifications');
    return NotificationFeed.fromJson(response.data ?? {});
  }

  Future<RideSummary> requestRide({
    required RouteWaypoint pickup,
    required RouteWaypoint destination,
    DateTime? scheduledTime,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/rides/request',
      data: {
        'pickup': {
          'latitude': pickup.latitude,
          'longitude': pickup.longitude,
          'address': pickup.address,
        },
        'destination': {
          'latitude': destination.latitude,
          'longitude': destination.longitude,
          'address': destination.address,
        },
        'scheduled_time': scheduledTime?.toIso8601String(),
      },
    );
    return RideSummary.fromJson(response.data ?? {});
  }
}

final employeeRepositoryProvider = Provider<EmployeeRepository>((ref) {
  return EmployeeRepository(ref.watch(dioProvider));
});
