import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models/api_models.dart';

class PersistedSession {
  const PersistedSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final UserProfile user;
}

class SessionStorage {
  static const _accessTokenKey = 'vp_access_token';
  static const _refreshTokenKey = 'vp_refresh_token';
  static const _userKey = 'vp_user';

  Future<PersistedSession?> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final accessToken = prefs.getString(_accessTokenKey);
    final refreshToken = prefs.getString(_refreshTokenKey);
    final userJson = prefs.getString(_userKey);
    if (accessToken == null || refreshToken == null || userJson == null) {
      return null;
    }

    try {
      return PersistedSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: UserProfile.fromJson(
          jsonDecode(userJson) as Map<String, dynamic>,
        ),
      );
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> save(AuthResponse response) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_accessTokenKey, response.accessToken);
    await prefs.setString(_refreshTokenKey, response.refreshToken);
    await prefs.setString(_userKey, jsonEncode(response.user.toJson()));
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_accessTokenKey);
    await prefs.remove(_refreshTokenKey);
    await prefs.remove(_userKey);
  }
}
