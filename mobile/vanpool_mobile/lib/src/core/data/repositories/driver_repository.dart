import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../models/api_models.dart';

class DriverRepository {
  const DriverRepository(this._dio);

  final Dio _dio;

  Future<DriverDashboardSummary> getDashboard() async {
    final response = await _dio.get<Map<String, dynamic>>('/driver/dashboard');
    return DriverDashboardSummary.fromJson(response.data ?? {});
  }

  Future<DriverTripSummary?> getActiveTrip() async {
    final response = await _dio.get('/driver/trips/active');
    final data = response.data;
    if (data == null || data is! Map<String, dynamic>) {
      return null;
    }
    return DriverTripSummary.fromJson(data);
  }

  Future<List<DriverShiftEntry>> getShifts() async {
    final response = await _dio.get<List<dynamic>>('/driver/shifts');
    return (response.data ?? [])
        .map((item) => DriverShiftEntry.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<NotificationFeed> getNotifications() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/notifications',
      queryParameters: {'include_alerts': true},
    );
    return NotificationFeed.fromJson(response.data ?? {});
  }

  Future<void> updateLocation({
    required double latitude,
    required double longitude,
  }) async {
    await _dio.post(
      '/driver/location',
      data: {'latitude': latitude, 'longitude': longitude},
    );
  }

  Future<void> acceptTrip(String tripId) async {
    await _dio.post('/driver/trips/$tripId/accept');
  }

  Future<void> startTrip(String tripId) async {
    await _dio.post('/driver/trips/$tripId/start');
  }

  Future<void> pickupPassenger({
    required String tripId,
    required String rideRequestId,
    required String otpCode,
  }) async {
    await _dio.post(
      '/driver/trips/$tripId/pickup/$rideRequestId',
      data: {'otp_code': otpCode},
    );
  }

  Future<void> dropoffPassenger({
    required String tripId,
    required String rideRequestId,
  }) async {
    await _dio.post('/driver/trips/$tripId/dropoff/$rideRequestId');
  }

  Future<void> noShowPassenger({
    required String tripId,
    required String rideRequestId,
  }) async {
    await _dio.post('/driver/trips/$tripId/no-show/$rideRequestId');
  }

  Future<void> completeTrip(String tripId) async {
    await _dio.post('/driver/trips/$tripId/complete');
  }
}

final driverRepositoryProvider = Provider<DriverRepository>((ref) {
  return DriverRepository(ref.watch(dioProvider));
});
