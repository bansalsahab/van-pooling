import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../models/api_models.dart';

class AdminRepository {
  const AdminRepository(this._dio);

  final Dio _dio;

  Future<AdminDashboardSummary> getDashboard() async {
    final response = await _dio.get<Map<String, dynamic>>('/admin/dashboard');
    return AdminDashboardSummary.fromJson(response.data ?? {});
  }

  Future<List<VanSummary>> getVans() async {
    final response = await _dio.get<List<dynamic>>('/admin/vans');
    return (response.data ?? [])
        .map((item) => VanSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<TripSummary>> getTrips() async {
    final response = await _dio.get<List<dynamic>>('/admin/trips');
    return (response.data ?? [])
        .map((item) => TripSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<AlertSummary>> getAlerts() async {
    final response = await _dio.get<List<dynamic>>('/admin/alerts');
    return (response.data ?? [])
        .map((item) => AlertSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<AdminKpiSummary> getKpis() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/admin/kpis',
      queryParameters: {'window': 'today'},
    );
    return AdminKpiSummary.fromJson(response.data ?? {});
  }

  Future<List<IncidentTimelineItem>> getIncidents() async {
    final response = await _dio.get<List<dynamic>>(
      '/admin/incidents',
      queryParameters: {'include_resolved': true, 'limit': 30},
    );
    return (response.data ?? [])
        .map((item) => IncidentTimelineItem.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> resolveAlert(String alertId) async {
    await _dio.post('/admin/alerts/$alertId/resolve');
  }

  Future<void> reassignTrip({
    required String tripId,
    required String vanId,
    String? reason,
  }) async {
    await _dio.post(
      '/admin/trips/$tripId/reassign',
      data: {'van_id': vanId, 'reason': reason},
    );
  }

  Future<void> cancelTrip({
    required String tripId,
    String? reason,
  }) async {
    await _dio.post(
      '/admin/trips/$tripId/cancel',
      data: {'reason': reason},
    );
  }
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return AdminRepository(ref.watch(dioProvider));
});
