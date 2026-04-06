import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/admin_app.dart';
import '../../features/auth/login_page.dart';
import '../../features/driver/driver_app.dart';
import '../../features/employee/employee_app.dart';
import '../../features/splash/splash_page.dart';
import '../session/session_controller.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isSplash = location == '/';
      final isLogin = location == '/login';

      if (!session.bootstrapped) {
        return isSplash ? null : '/';
      }

      if (!session.isAuthenticated) {
        return isLogin ? null : '/login';
      }

      final expectedPath = session.role!.routePath;
      if (isSplash || isLogin) {
        return expectedPath;
      }

      if (!location.startsWith(expectedPath)) {
        return expectedPath;
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        pageBuilder: (context, state) =>
            _buildSlidePage(state, const SplashPage()),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) =>
            _buildSlidePage(state, const LoginPage()),
      ),
      GoRoute(
        path: '/employee',
        pageBuilder: (context, state) =>
            _buildSlidePage(state, const EmployeeAppPage()),
      ),
      GoRoute(
        path: '/driver',
        pageBuilder: (context, state) =>
            _buildSlidePage(state, const DriverAppPage()),
      ),
      GoRoute(
        path: '/admin',
        pageBuilder: (context, state) =>
            _buildSlidePage(state, const AdminAppPage()),
      ),
    ],
  );
});

CustomTransitionPage<void> _buildSlidePage(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 250),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
      );

      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.08, 0),
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(opacity: curved, child: child),
      );
    },
  );
}
