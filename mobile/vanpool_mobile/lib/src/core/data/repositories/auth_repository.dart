import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../models/api_models.dart';

class AuthRepository {
  const AuthRepository(this._dio);

  final Dio _dio;

  Future<AuthResponse> login({
    required String email,
    required String password,
    required String requestedRole,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {
        'email': email,
        'password': password,
        'requested_role': requestedRole,
      },
    );
    return AuthResponse.fromJson(response.data ?? {});
  }

  Future<UserProfile> me() async {
    final response = await _dio.get<Map<String, dynamic>>('/auth/me');
    return UserProfile.fromJson(response.data ?? {});
  }

  Future<UserProfile> updateProfile(Map<String, dynamic> payload) async {
    final response = await _dio.put<Map<String, dynamic>>(
      '/auth/me',
      data: payload,
    );
    return UserProfile.fromJson(response.data ?? {});
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(dioProvider));
});
