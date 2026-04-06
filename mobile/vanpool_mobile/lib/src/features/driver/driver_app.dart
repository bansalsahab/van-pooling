import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';

import '../../core/data/dashboard_providers.dart';
import '../../core/data/models/api_models.dart';
import '../../core/data/repositories/driver_repository.dart';
import '../../core/session/session_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';

class DriverAppPage extends ConsumerStatefulWidget {
  const DriverAppPage({super.key});

  @override
  ConsumerState<DriverAppPage> createState() => _DriverAppPageState();
}

class _DriverAppPageState extends ConsumerState<DriverAppPage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final consoleAsync = ref.watch(driverConsoleProvider);
    final shiftsAsync = ref.watch(driverShiftsProvider);
    final session = ref.watch(sessionControllerProvider);
    final data = consoleAsync.asData?.value;

    final screens = [
      _DriverConsolePage(
        data: data,
        isLoading: consoleAsync.isLoading,
        onRetry: () => ref.invalidate(driverConsoleProvider),
      ),
      _DriverActiveTripPage(
        data: data,
        isLoading: consoleAsync.isLoading,
        onRetry: () => ref.invalidate(driverConsoleProvider),
      ),
      _DriverShiftsPage(
        shifts: shiftsAsync.asData?.value,
        isLoading: shiftsAsync.isLoading,
        onRetry: () => ref.invalidate(driverShiftsProvider),
      ),
      _DriverAlertsPage(
        data: data,
        isLoading: consoleAsync.isLoading,
        onRetry: () => ref.invalidate(driverConsoleProvider),
      ),
      _DriverProfilePage(
        profile: data?.profile ?? session.user,
        dashboard: data?.dashboard,
        shifts: shiftsAsync.asData?.value ?? const [],
      ),
    ];

    return RoleShellScaffold(
      currentIndex: _index,
      onTap: (value) => setState(() => _index = value),
      items: const [
        NavItemData(label: 'Console', icon: Icons.dashboard_customize_rounded),
        NavItemData(label: 'Trip', icon: Icons.route_rounded),
        NavItemData(label: 'Shifts', icon: Icons.schedule_rounded),
        NavItemData(label: 'Alerts', icon: Icons.warning_amber_rounded),
        NavItemData(label: 'Profile', icon: Icons.person_rounded),
      ],
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        child: KeyedSubtree(key: ValueKey(_index), child: screens[_index]),
      ),
    );
  }
}

class _DriverConsolePage extends ConsumerStatefulWidget {
  const _DriverConsolePage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final DriverConsoleData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  ConsumerState<_DriverConsolePage> createState() => _DriverConsolePageState();
}

class _DriverConsolePageState extends ConsumerState<_DriverConsolePage> {
  bool _copilotExpanded = true;
  bool _locationSharing = false;
  bool _locationBusy = false;
  String? _locationStatus;
  Timer? _locationTimer;

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.data == null && widget.isLoading) {
      return const DashboardSkeleton();
    }

    if (widget.data == null) {
      return _DriverAsyncCard(
        title: 'Driver console unavailable',
        message: 'We could not load your van and dispatch snapshot.',
        onRetry: widget.onRetry,
      );
    }

    final dashboard = widget.data!.dashboard;
    final van = dashboard?.van;
    final activeTrip = dashboard?.activeTrip;
    final statCards = [
      ('Van ID', van?.licensePlate ?? 'Unassigned', AppColors.success),
      (
        'Occupancy',
        van == null ? '--' : '${van.currentOccupancy}/${van.capacity}',
        AppColors.accent,
      ),
      (
        'Status',
        van?.status.replaceAll('_', ' ') ?? 'Offline',
        _driverStatusColor(van?.status),
      ),
      (
        'Shift',
        _locationSharing ? 'Live GPS on' : 'Standby',
        _locationSharing ? AppColors.success : AppColors.warning,
      ),
    ];
    final mapLocations = <MapLocationData>[
      if (van?.latitude != null && van?.longitude != null)
        MapLocationData(
          id: 'van',
          latitude: van!.latitude!,
          longitude: van.longitude!,
          color: AppColors.accentDeep,
          icon: Icons.directions_bus_rounded,
          label: van.licensePlate,
        ),
      ..._driverTripMarkers(activeTrip),
    ];

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: SectionHeader(
                  eyebrow: 'Driver',
                  title: 'Driver Console',
                  subtitle:
                      '${widget.data!.profile.companyName ?? 'Workspace'} • ${van?.licensePlate ?? 'No van assigned'}',
                ),
              ),
              Row(
                children: [
                  PulseDot(
                    color: _locationSharing ? AppColors.success : AppColors.warning,
                    size: 10,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _locationSharing ? 'Sharing' : 'Standby',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 110,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: statCards.length,
              separatorBuilder: (_, index) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final item = statCards[index];
                return SizedBox(
                  width: 156,
                  child: StatCard(
                    label: item.$1,
                    value: item.$2,
                    color: item.$3,
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            child: activeTrip == null
                ? Column(
                    children: [
                      const Icon(
                        Icons.airport_shuttle_rounded,
                        color: AppColors.accent,
                        size: 42,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Standing by for dispatch',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'No active workload yet. Ops will drop your next pooled trip here.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          StatusPill(
                            label: activeTrip.id.substring(0, 8).toUpperCase(),
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: 8),
                          StatusPill(
                            label: activeTrip.status.replaceAll('_', ' '),
                            color: _driverStatusColor(activeTrip.status),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Trip board',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 10),
                      ...activeTrip.passengers.take(4).map(
                            (stop) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                children: [
                                  Container(
                                    width: 24,
                                    height: 24,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: _passengerDone(stop.status)
                                          ? AppColors.success
                                          : AppColors.surfaceElevated,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Text(
                                      '${stop.pickupStopIndex}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: AppColors.textPrimary,
                                          ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      stop.pickupAddress ??
                                          stop.destinationAddress ??
                                          'Pending stop',
                                      style: Theme.of(context).textTheme.bodyMedium,
                                    ),
                                  ),
                                  StatusPill(
                                    label: stop.status.replaceAll('_', ' '),
                                    color: _driverStatusColor(stop.status),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      const SizedBox(height: 8),
                      AppSurfaceCard(
                        backgroundColor: AppColors.warning.withValues(alpha: 0.12),
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.flash_on_rounded,
                              color: AppColors.warning,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _nextDriverActionLabel(activeTrip),
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
          const SizedBox(height: 18),
          CopilotPanel(
            title: 'Driver copilot',
            message: activeTrip == null
                ? 'GPS health is stable. Stay near the dispatch zone and keep location sharing enabled to receive the next route instantly.'
                : 'Your current priority is ${_nextDriverActionLabel(activeTrip).toLowerCase()}. Keep location sharing active so arrivals and ETA updates stay in sync.',
            healthLabel: activeTrip == null ? '82/100' : '74/100',
            promptChips: const [
              'Next stop priority',
              'GPS troubleshooting',
              'Late rider protocol',
            ],
            expanded: _copilotExpanded,
            onToggle: () => setState(() => _copilotExpanded = !_copilotExpanded),
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Live map',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    StatusPill(
                      label: _locationSharing ? 'GPS sharing on' : 'GPS paused',
                      color: _locationSharing ? AppColors.success : AppColors.warning,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                AdaptiveMapCard(
                  height: 220,
                  locations: mapLocations,
                  routePoints: _tripRoutePoints(activeTrip),
                ),
                const SizedBox(height: 12),
                if (_locationStatus != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _locationStatus!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: PrimaryButton(
                        label: _locationBusy
                            ? 'Updating...'
                            : _locationSharing
                                ? 'Pause sharing'
                                : 'Enable location',
                        onPressed: _locationBusy ? null : _toggleLocationSharing,
                        gradientColors: [
                          _locationSharing
                              ? AppColors.warning
                              : AppColors.accent,
                          AppColors.accentDeep,
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SecondaryButton(
                        label: 'Refresh board',
                        onPressed: widget.onRetry,
                        icon: Icons.refresh_rounded,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleLocationSharing() async {
    if (_locationSharing) {
      setState(() {
        _locationSharing = false;
        _locationBusy = false;
        _locationStatus = 'Location sharing paused.';
      });
      _locationTimer?.cancel();
      return;
    }

    setState(() {
      _locationBusy = true;
      _locationStatus = 'Requesting location permission...';
    });

    try {
      final permission = await Geolocator.checkPermission();
      var effectivePermission = permission;
      if (effectivePermission == LocationPermission.denied) {
        effectivePermission = await Geolocator.requestPermission();
      }
      if (effectivePermission == LocationPermission.denied ||
          effectivePermission == LocationPermission.deniedForever) {
        if (!mounted) {
          return;
        }
        setState(() {
          _locationBusy = false;
          _locationStatus =
              'Location permission is blocked. Enable it to publish live van updates.';
        });
        return;
      }

      await _pushCurrentLocation();
      _locationTimer?.cancel();
      _locationTimer = Timer.periodic(
        const Duration(seconds: 5),
        (_) => _pushCurrentLocation(),
      );
      if (mounted) {
        setState(() {
          _locationSharing = true;
          _locationBusy = false;
          _locationStatus =
              'Location sharing is live. Dispatch and riders will now receive fresh updates.';
        });
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _locationBusy = false;
        _locationStatus = error.toString();
      });
    }
  }

  Future<void> _pushCurrentLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition();
      await ref.read(driverRepositoryProvider).updateLocation(
            latitude: position.latitude,
            longitude: position.longitude,
          );
      ref.invalidate(driverConsoleProvider);
    } catch (_) {
      if (mounted) {
        setState(() {
          _locationStatus =
              'We could not publish the latest van position. Check location services and try again.';
        });
      }
    }
  }
}

class _DriverActiveTripPage extends ConsumerWidget {
  const _DriverActiveTripPage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final DriverConsoleData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (data == null && isLoading) {
      return const DashboardSkeleton();
    }

    final trip = data?.dashboard?.activeTrip;
    if (trip == null) {
      return _DriverAsyncCard(
        title: 'No active trip',
        message:
            'Accept a dispatch-ready workload and the guided stop flow will appear here.',
        onRetry: onRetry,
      );
    }

    final nextPassenger = trip.passengers.cast<TripPassengerSummary?>().firstWhere(
          (passenger) => passenger != null && passenger.status != 'dropped_off',
          orElse: () => null,
        );
    final action = _nextTripAction(trip, nextPassenger);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            eyebrow: 'Active trip',
            title: nextPassenger?.pickupAddress ??
                nextPassenger?.destinationAddress ??
                'Trip in progress',
            subtitle: _nextDriverActionLabel(trip),
          ),
          const SizedBox(height: 16),
          AdaptiveMapCard(
            height: 320,
            locations: _driverTripMarkers(trip),
            routePoints: _tripRoutePoints(trip),
          ),
          const SizedBox(height: 16),
          AppSurfaceCard(
            borderRadius: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Stop list', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 14),
                ...trip.passengers.map(
                  (stop) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: _passengerDone(stop.status)
                                ? AppColors.success
                                : Colors.transparent,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: _passengerDone(stop.status)
                                  ? AppColors.success
                                  : AppColors.textMuted,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '${stop.pickupStopIndex}',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: AppColors.textPrimary,
                                ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                stop.passengerName ?? 'Passenger',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                stop.status == 'picked_up'
                                    ? (stop.destinationAddress ?? 'Drop-off pending')
                                    : (stop.pickupAddress ?? 'Pickup pending'),
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                        StatusPill(
                          label: stop.status.replaceAll('_', ' '),
                          color: _driverStatusColor(stop.status),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                PrimaryButton(
                  label: action.label,
                  onPressed: () async {
                    await _runTripAction(context, ref, trip, nextPassenger, action);
                  },
                  gradientColors: [action.color, AppColors.accentDeep],
                ),
                const SizedBox(height: 10),
                SecondaryButton(
                  label: 'Report issue',
                  icon: Icons.report_gmailerrorred_rounded,
                  onPressed: nextPassenger == null
                      ? null
                      : () async {
                          await ref.read(driverRepositoryProvider).noShowPassenger(
                                tripId: trip.id,
                                rideRequestId: nextPassenger.rideRequestId,
                              );
                          ref.invalidate(driverConsoleProvider);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Passenger marked as no-show and dispatch alerted.',
                                ),
                              ),
                            );
                          }
                        },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverShiftsPage extends StatelessWidget {
  const _DriverShiftsPage({
    required this.shifts,
    required this.isLoading,
    required this.onRetry,
  });

  final List<DriverShiftEntry>? shifts;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (shifts == null && isLoading) {
      return const DashboardSkeleton();
    }
    if (shifts == null || shifts!.isEmpty) {
      return _DriverAsyncCard(
        title: 'No shifts loaded',
        message: 'Upcoming assigned work windows will appear here.',
        onRetry: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Shifts',
            title: 'This week',
            subtitle: 'Assigned work windows and recent shift history.',
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: shifts!
                  .take(6)
                  .map(
                    (shift) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 72,
                            child: Text(
                              shift.scheduledStartAt == null
                                  ? 'Open'
                                  : DateFormat('EEE').format(
                                      shift.scheduledStartAt!.toLocal(),
                                    ),
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              shift.scheduledStartAt == null ||
                                      shift.scheduledEndAt == null
                                  ? 'Dispatch-created shift'
                                  : '${DateFormat('hh:mm a').format(shift.scheduledStartAt!.toLocal())} - ${DateFormat('hh:mm a').format(shift.scheduledEndAt!.toLocal())}',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                          StatusPill(
                            label: shift.status.replaceAll('_', ' '),
                            color: _driverStatusColor(shift.status),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverAlertsPage extends StatelessWidget {
  const _DriverAlertsPage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final DriverConsoleData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (data == null && isLoading) {
      return const DashboardSkeleton();
    }

    final alerts = data?.notifications.items ?? const <NotificationSummary>[];
    if (alerts.isEmpty) {
      return _DriverAsyncCard(
        title: 'No alerts right now',
        message: 'Driver alerts and dispatch changes will land here.',
        onRetry: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Alerts',
            title: 'Driver alerts',
            subtitle: 'Operational updates and exceptions sent by dispatch.',
          ),
          const SizedBox(height: 18),
          ...alerts.map(
            (alert) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppSurfaceCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 4,
                      height: 90,
                      decoration: BoxDecoration(
                        color: _notificationColor(alert),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            alert.title ?? 'Driver alert',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            alert.message,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            alert.createdAt == null
                                ? 'Just now'
                                : DateFormat('dd MMM, hh:mm a')
                                    .format(alert.createdAt!.toLocal()),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverProfilePage extends StatelessWidget {
  const _DriverProfilePage({
    required this.profile,
    required this.dashboard,
    required this.shifts,
  });

  final UserProfile? profile;
  final DriverDashboardSummary? dashboard;
  final List<DriverShiftEntry> shifts;

  @override
  Widget build(BuildContext context) {
    if (profile == null) {
      return const DashboardSkeleton();
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Profile',
            title: 'Driver profile',
            subtitle: 'Identity, assigned vehicle, and trip readiness details.',
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ProfileRow(
                  icon: Icons.person_outline_rounded,
                  value: profile!.name,
                ),
                const SizedBox(height: 12),
                _ProfileRow(
                  icon: Icons.alternate_email_rounded,
                  value: profile!.email,
                ),
                const SizedBox(height: 12),
                _ProfileRow(
                  icon: Icons.airport_shuttle_rounded,
                  value: dashboard?.van?.licensePlate ?? 'No van assigned',
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            childAspectRatio: 1.45,
            shrinkWrap: true,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              StatCard(
                label: 'Trips',
                value: '${dashboard?.activeTrip == null ? 0 : 1}',
                color: AppColors.accent,
              ),
              StatCard(
                label: 'Scheduled work',
                value: '${dashboard?.upcomingScheduledWork.length ?? 0}',
                color: AppColors.warning,
              ),
              StatCard(
                label: 'Shifts',
                value: '${shifts.length}',
                color: AppColors.success,
              ),
              const StatCard(
                label: 'Rating',
                value: '4.9',
                color: AppColors.success,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DriverAsyncCard extends StatelessWidget {
  const _DriverAsyncCard({
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: AppSurfaceCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(message, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 16),
            PrimaryButton(label: 'Retry', onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.value,
  });

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textSecondary),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.textPrimary,
                ),
          ),
        ),
      ],
    );
  }
}

class _TripAction {
  const _TripAction({
    required this.kind,
    required this.label,
    required this.color,
  });

  final String kind;
  final String label;
  final Color color;
}

_TripAction _nextTripAction(
  DriverTripSummary trip,
  TripPassengerSummary? nextPassenger,
) {
  if (trip.passengers.isEmpty) {
    return const _TripAction(
      kind: 'complete',
      label: 'Complete trip',
      color: AppColors.success,
    );
  }
  if (trip.status == 'planned' || trip.status == 'dispatch_ready') {
    if (trip.startedAt == null && trip.passengers.isNotEmpty && trip.acceptedAt == null) {
      return const _TripAction(
        kind: 'accept',
        label: 'Accept trip',
        color: AppColors.warning,
      );
    }
    if (trip.startedAt == null) {
      return const _TripAction(
        kind: 'start',
        label: 'Start route',
        color: AppColors.warning,
      );
    }
  }

  if (nextPassenger == null) {
    return const _TripAction(
      kind: 'complete',
      label: 'All dropped off',
      color: AppColors.success,
    );
  }

  if (nextPassenger.status == 'picked_up') {
    return const _TripAction(
      kind: 'dropoff',
      label: 'Confirm dropoff',
      color: AppColors.success,
    );
  }

  return const _TripAction(
    kind: 'pickup',
    label: 'Passenger boarded',
    color: AppColors.success,
  );
}

Future<void> _runTripAction(
  BuildContext context,
  WidgetRef ref,
  DriverTripSummary trip,
  TripPassengerSummary? nextPassenger,
  _TripAction action,
) async {
  try {
    final repository = ref.read(driverRepositoryProvider);
    switch (action.kind) {
      case 'accept':
        await repository.acceptTrip(trip.id);
        break;
      case 'start':
        await repository.startTrip(trip.id);
        break;
      case 'pickup':
        if (nextPassenger == null) {
          return;
        }
        final otp = await _showOtpDialog(context);
        if (otp == null || otp.isEmpty) {
          return;
        }
        await repository.pickupPassenger(
          tripId: trip.id,
          rideRequestId: nextPassenger.rideRequestId,
          otpCode: otp,
        );
        break;
      case 'dropoff':
        if (nextPassenger == null) {
          return;
        }
        await repository.dropoffPassenger(
          tripId: trip.id,
          rideRequestId: nextPassenger.rideRequestId,
        );
        break;
      case 'complete':
        await repository.completeTrip(trip.id);
        break;
    }
    ref.invalidate(driverConsoleProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${action.label} completed.')),
      );
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }
}

Future<String?> _showOtpDialog(BuildContext context) async {
  final controller = TextEditingController();
  try {
    return await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Enter boarding OTP'),
          content: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            maxLength: 4,
            decoration: const InputDecoration(
              hintText: '4-digit OTP',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              child: const Text('Verify'),
            ),
          ],
        );
      },
    );
  } finally {
    controller.dispose();
  }
}

Color _driverStatusColor(String? status) {
  switch (status) {
    case 'active_to_pickup':
    case 'active_in_transit':
    case 'active_mixed':
    case 'picked_up':
    case 'dropped_off':
    case 'active':
    case 'available':
      return AppColors.success;
    case 'idle':
    case 'dispatch_ready':
    case 'planned':
    case 'maintenance':
    case 'offline':
      return AppColors.warning;
    case 'stale':
    case 'cancelled':
    case 'failed_operational_issue':
      return AppColors.danger;
    default:
      return AppColors.accent;
  }
}

bool _passengerDone(String status) =>
    status == 'picked_up' || status == 'dropped_off';

String _nextDriverActionLabel(DriverTripSummary trip) {
  final nextPassenger = trip.passengers.cast<TripPassengerSummary?>().firstWhere(
        (passenger) => passenger != null && passenger.status != 'dropped_off',
        orElse: () => null,
      );
  return _nextTripAction(trip, nextPassenger).label;
}

List<MapLocationData> _driverTripMarkers(DriverTripSummary? trip) {
  if (trip == null) {
    return const [];
  }

  final markers = <MapLocationData>[];
  final route = trip.route;
  final origin = route.origin;
  if (origin != null) {
    markers.add(
      MapLocationData(
        id: 'origin',
        latitude: origin.latitude,
        longitude: origin.longitude,
        color: AppColors.accentDeep,
        icon: Icons.directions_bus_rounded,
        label: trip.vanId,
      ),
    );
  }
  for (final passenger in trip.passengers.take(3)) {
    final pickup = route.waypoints.cast<RouteWaypoint?>().firstWhere(
          (waypoint) =>
              waypoint != null &&
              waypoint.address == passenger.pickupAddress &&
              waypoint.status != 'completed',
          orElse: () => null,
        );
    if (pickup != null) {
      markers.add(
        MapLocationData(
          id: 'pickup-${passenger.rideRequestId}',
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          color: passenger.status == 'picked_up'
              ? AppColors.success
              : AppColors.warning,
          icon: Icons.looks_one_rounded,
          label: passenger.passengerName,
        ),
      );
    }
  }
  if (route.destination != null) {
    markers.add(
      MapLocationData(
        id: 'destination',
        latitude: route.destination!.latitude,
        longitude: route.destination!.longitude,
        color: AppColors.success,
        icon: Icons.flag_rounded,
        label: 'Destination',
      ),
    );
  }
  return markers;
}

List<LatLng> _tripRoutePoints(DriverTripSummary? trip) {
  if (trip == null) {
    return const [];
  }
  final points = <LatLng>[];
  if (trip.route.origin != null) {
    points.add(
      LatLng(trip.route.origin!.latitude, trip.route.origin!.longitude),
    );
  }
  for (final waypoint in trip.route.waypoints) {
    points.add(LatLng(waypoint.latitude, waypoint.longitude));
  }
  if (trip.route.destination != null) {
    points.add(
      LatLng(trip.route.destination!.latitude, trip.route.destination!.longitude),
    );
  }
  return points;
}

Color _notificationColor(NotificationSummary summary) {
  switch (summary.severity) {
    case 'high':
    case 'critical':
      return AppColors.danger;
    case 'medium':
      return AppColors.warning;
    default:
      return AppColors.accent;
  }
}
