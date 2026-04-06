import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/jwt_utils.dart';
import '../data/models/api_models.dart';
import '../data/repositories/auth_repository.dart';
import '../data/repositories/live_repository.dart';
import '../data/session_storage.dart';

enum AppRole { employee, driver, admin }

extension AppRoleX on AppRole {
  String get label => switch (this) {
        AppRole.employee => 'Employee',
        AppRole.driver => 'Driver',
        AppRole.admin => 'Admin',
      };

  String get apiValue => switch (this) {
        AppRole.employee => 'employee',
        AppRole.driver => 'driver',
        AppRole.admin => 'admin',
      };

  String get routePath => switch (this) {
        AppRole.employee => '/employee',
        AppRole.driver => '/driver',
        AppRole.admin => '/admin',
      };

  String get welcomeMessage => switch (this) {
        AppRole.employee => 'Book, track, and manage your daily commute.',
        AppRole.driver => 'Run dispatch-ready trips with clearer next actions.',
        AppRole.admin => 'Monitor fleet readiness, demand, and service risk live.',
      };

  Color get accentColor => switch (this) {
        AppRole.employee => const Color(0xFF1D9E75),
        AppRole.driver => const Color(0xFFF59E0B),
        AppRole.admin => const Color(0xFF6D5EF8),
      };
}

AppRole roleFromValue(String? value) {
  switch ((value ?? '').toLowerCase()) {
    case 'driver':
      return AppRole.driver;
    case 'admin':
      return AppRole.admin;
    case 'employee':
    default:
      return AppRole.employee;
  }
}

final sessionStorageProvider = Provider<SessionStorage>((ref) {
  return SessionStorage();
});

class SessionState {
  const SessionState({
    required this.bootstrapped,
    required this.isLoading,
    required this.role,
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.errorMessage,
  });

  const SessionState.initial()
      : bootstrapped = false,
        isLoading = false,
        role = null,
        user = null,
        accessToken = null,
        refreshToken = null,
        errorMessage = null;

  final bool bootstrapped;
  final bool isLoading;
  final AppRole? role;
  final UserProfile? user;
  final String? accessToken;
  final String? refreshToken;
  final String? errorMessage;

  bool get isAuthenticated => accessToken != null && role != null;
  String get userName => user?.name ?? 'Operator';
  String get companyName => user?.companyName ?? 'Van Pooling';
  String get email => user?.email ?? '';

  SessionState copyWith({
    bool? bootstrapped,
    bool? isLoading,
    AppRole? role,
    bool clearRole = false,
    UserProfile? user,
    bool clearUser = false,
    String? accessToken,
    bool clearAccessToken = false,
    String? refreshToken,
    bool clearRefreshToken = false,
    String? errorMessage,
    bool clearError = false,
  }) {
    return SessionState(
      bootstrapped: bootstrapped ?? this.bootstrapped,
      isLoading: isLoading ?? this.isLoading,
      role: clearRole ? null : (role ?? this.role),
      user: clearUser ? null : (user ?? this.user),
      accessToken: clearAccessToken ? null : (accessToken ?? this.accessToken),
      refreshToken:
          clearRefreshToken ? null : (refreshToken ?? this.refreshToken),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState.initial();

  Future<void> bootstrap() async {
    if (state.bootstrapped || state.isLoading) {
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final persisted = await ref.read(sessionStorageProvider).restore();
      if (persisted == null) {
        state = state.copyWith(
          bootstrapped: true,
          isLoading: false,
          clearRole: true,
          clearUser: true,
          clearAccessToken: true,
          clearRefreshToken: true,
        );
        return;
      }

      final role = _roleFromTokenOrUser(
        persisted.accessToken,
        persisted.user.role,
      );

      state = state.copyWith(
        bootstrapped: true,
        isLoading: false,
        role: role,
        user: persisted.user,
        accessToken: persisted.accessToken,
        refreshToken: persisted.refreshToken,
        clearError: true,
      );

      ref.read(liveConnectionProvider.notifier).start(persisted.accessToken);
      await refreshProfile(silent: true);
    } catch (error) {
      await ref.read(sessionStorageProvider).clear();
      state = state.copyWith(
        bootstrapped: true,
        isLoading: false,
        clearRole: true,
        clearUser: true,
        clearAccessToken: true,
        clearRefreshToken: true,
        errorMessage: readErrorMessage(error),
      );
    }
  }

  Future<bool> signIn({
    required AppRole role,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final response = await ref.read(authRepositoryProvider).login(
            email: email,
            password: password,
            requestedRole: role.apiValue,
          );
      final resolvedRole = _roleFromTokenOrUser(
        response.accessToken,
        response.user.role,
      );
      await ref.read(sessionStorageProvider).save(response);
      state = state.copyWith(
        bootstrapped: true,
        isLoading: false,
        role: resolvedRole,
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        clearError: true,
      );
      ref.read(liveConnectionProvider.notifier).start(response.accessToken);
      return true;
    } catch (error) {
      state = state.copyWith(
        bootstrapped: true,
        isLoading: false,
        errorMessage: readErrorMessage(error),
      );
      return false;
    }
  }

  Future<void> refreshProfile({bool silent = false}) async {
    if (state.accessToken == null) {
      return;
    }
    if (!silent) {
      state = state.copyWith(isLoading: true, clearError: true);
    }
    try {
      final user = await ref.read(authRepositoryProvider).me();
      state = state.copyWith(
        isLoading: false,
        user: user,
        role: _roleFromTokenOrUser(state.accessToken!, user.role),
        clearError: true,
      );
      await _persistCurrentSession(userOverride: user);
    } catch (error) {
      if (!silent) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: readErrorMessage(error),
        );
      }
    }
  }

  Future<void> updateProfile(Map<String, dynamic> payload) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await ref.read(authRepositoryProvider).updateProfile(payload);
      state = state.copyWith(
        isLoading: false,
        user: user,
        clearError: true,
      );
      await _persistCurrentSession(userOverride: user);
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: readErrorMessage(error),
      );
    }
  }

  Future<void> signOut() async {
    await ref.read(sessionStorageProvider).clear();
    ref.read(liveConnectionProvider.notifier).stop();
    state = state.copyWith(
      bootstrapped: true,
      isLoading: false,
      clearRole: true,
      clearUser: true,
      clearAccessToken: true,
      clearRefreshToken: true,
      clearError: true,
    );
  }

  void clearError() {
    state = state.copyWith(clearError: true);
  }

  AppRole _roleFromTokenOrUser(String token, String? fallbackRole) {
    final payload = decodeJwtPayload(token);
    return roleFromValue(payload['role']?.toString() ?? fallbackRole);
  }

  Future<void> _persistCurrentSession({UserProfile? userOverride}) async {
    if (state.accessToken == null ||
        state.refreshToken == null ||
        (userOverride ?? state.user) == null) {
      return;
    }
    await ref.read(sessionStorageProvider).save(
          AuthResponse(
            accessToken: state.accessToken!,
            refreshToken: state.refreshToken!,
            tokenType: 'bearer',
            user: userOverride ?? state.user!,
          ),
        );
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
