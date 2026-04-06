import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../models/api_models.dart';

class MapsRepository {
  const MapsRepository(this._dio);

  final Dio _dio;

  Future<GeocodeResult> geocode(String address) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/maps/geocode',
      data: {'address': address},
    );
    return GeocodeResult.fromJson(response.data ?? {});
  }

  Future<RoutePlan> previewRoute({
    required RouteWaypoint origin,
    required RouteWaypoint destination,
    List<RouteWaypoint> intermediates = const [],
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/maps/route-preview',
      data: {
        'origin': origin.toJson(),
        'destination': destination.toJson(),
        'intermediates': intermediates.map((item) => item.toJson()).toList(),
        'travel_mode': 'DRIVE',
      },
    );
    return RoutePlan.fromJson(response.data ?? {});
  }
}

final mapsRepositoryProvider = Provider<MapsRepository>((ref) {
  return MapsRepository(ref.watch(dioProvider));
});
