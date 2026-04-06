import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session_controller.dart';
import 'app_config.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.requestTimeout,
      receiveTimeout: AppConfig.requestTimeout,
      sendTimeout: AppConfig.requestTimeout,
      responseType: ResponseType.json,
      headers: const {
        'Content-Type': 'application/json',
      },
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        // Resolve the token lazily per request so repositories can be used
        // from session bootstrap/login flows without creating a provider cycle.
        final token = ref.read(sessionControllerProvider).accessToken;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) {
        handler.next(error);
      },
    ),
  );

  return dio;
});

String readErrorMessage(Object error) {
  if (error is DioException) {
    final responseData = error.response?.data;
    if (responseData is Map<String, dynamic>) {
      final detail = responseData['detail'];
      if (detail is String && detail.trim().isNotEmpty) {
        return detail.trim();
      }
      if (detail is List) {
        final combined = detail
            .map((item) {
              if (item is Map<String, dynamic>) {
                return item['msg']?.toString() ?? item.toString();
              }
              return item.toString();
            })
            .join(' ');
        if (combined.trim().isNotEmpty) {
          return combined.trim();
        }
      }
      final message = responseData['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
    return error.message ?? 'Request failed.';
  }

  return error.toString();
}
