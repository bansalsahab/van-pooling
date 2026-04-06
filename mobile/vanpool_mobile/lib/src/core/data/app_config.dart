class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8000/api/v1',
  );

  static const Duration requestTimeout = Duration(seconds: 20);

  static String get websocketUrl {
    final base = apiBaseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return '$base/live/ws';
  }
}
