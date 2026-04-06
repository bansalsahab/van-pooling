import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session_controller.dart';
import 'models/api_models.dart';
import 'repositories/admin_repository.dart';
import 'repositories/auth_repository.dart';
import 'repositories/driver_repository.dart';
import 'repositories/employee_repository.dart';
import 'repositories/live_repository.dart';

final employeeHomeProvider = FutureProvider<EmployeeHomeData>((ref) async {
  ref.watch(liveRefreshTickProvider);
  final session = ref.watch(sessionControllerProvider);
  if (!session.isAuthenticated) {
    throw StateError('Employee session is not authenticated.');
  }

  final authRepository = ref.read(authRepositoryProvider);
  final employeeRepository = ref.read(employeeRepositoryProvider);

  final profileFuture = authRepository.me();
  final activeRideFuture = employeeRepository.getActiveRide();
  final historyFuture = employeeRepository.getRideHistory();
  final notificationsFuture = employeeRepository.getNotifications();

  return EmployeeHomeData(
    profile: await profileFuture,
    activeRide: await activeRideFuture,
    history: await historyFuture,
    notifications: await notificationsFuture,
  );
});

final driverConsoleProvider = FutureProvider<DriverConsoleData>((ref) async {
  ref.watch(liveRefreshTickProvider);
  final session = ref.watch(sessionControllerProvider);
  if (!session.isAuthenticated) {
    throw StateError('Driver session is not authenticated.');
  }

  final authRepository = ref.read(authRepositoryProvider);
  final driverRepository = ref.read(driverRepositoryProvider);

  final profileFuture = authRepository.me();
  final dashboardFuture = driverRepository.getDashboard();
  final notificationsFuture = driverRepository.getNotifications();

  return DriverConsoleData(
    profile: await profileFuture,
    dashboard: await dashboardFuture,
    notifications: await notificationsFuture,
  );
});

final driverShiftsProvider = FutureProvider<List<DriverShiftEntry>>((ref) async {
  ref.watch(liveRefreshTickProvider);
  final repository = ref.read(driverRepositoryProvider);
  return repository.getShifts();
});

final adminFleetProvider = FutureProvider<AdminFleetData>((ref) async {
  ref.watch(liveRefreshTickProvider);
  final session = ref.watch(sessionControllerProvider);
  if (!session.isAuthenticated) {
    throw StateError('Admin session is not authenticated.');
  }

  final authRepository = ref.read(authRepositoryProvider);
  final adminRepository = ref.read(adminRepositoryProvider);

  final profileFuture = authRepository.me();
  final dashboardFuture = adminRepository.getDashboard();
  final vansFuture = adminRepository.getVans();
  final tripsFuture = adminRepository.getTrips();
  final alertsFuture = adminRepository.getAlerts();

  return AdminFleetData(
    profile: await profileFuture,
    dashboard: await dashboardFuture,
    vans: await vansFuture,
    trips: await tripsFuture,
    alerts: await alertsFuture,
  );
});

final adminDemandProvider = FutureProvider<AdminDemandData>((ref) async {
  ref.watch(liveRefreshTickProvider);
  final adminRepository = ref.read(adminRepositoryProvider);
  final kpisFuture = adminRepository.getKpis();
  final incidentsFuture = adminRepository.getIncidents();

  return AdminDemandData(
    kpis: await kpisFuture,
    incidents: await incidentsFuture,
  );
});
