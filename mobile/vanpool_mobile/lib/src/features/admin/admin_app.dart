import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/dashboard_providers.dart';
import '../../core/data/models/api_models.dart';
import '../../core/data/repositories/admin_repository.dart';
import '../../core/session/session_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';

class AdminAppPage extends ConsumerStatefulWidget {
  const AdminAppPage({super.key});

  @override
  ConsumerState<AdminAppPage> createState() => _AdminAppPageState();
}

class _AdminAppPageState extends ConsumerState<AdminAppPage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final fleetAsync = ref.watch(adminFleetProvider);
    final demandAsync = ref.watch(adminDemandProvider);
    final session = ref.watch(sessionControllerProvider);
    final fleetData = fleetAsync.asData?.value;
    final demandData = demandAsync.asData?.value;

    final screens = [
      _AdminFleetPage(
        data: fleetData,
        isLoading: fleetAsync.isLoading,
        onRetry: () => ref.invalidate(adminFleetProvider),
      ),
      _AdminTripsPage(
        data: fleetData,
        isLoading: fleetAsync.isLoading,
        onRetry: () => ref.invalidate(adminFleetProvider),
      ),
      _AdminDemandPage(
        demand: demandData,
        dashboard: fleetData?.dashboard,
        isLoading: demandAsync.isLoading,
        onRetry: () {
          ref.invalidate(adminDemandProvider);
          ref.invalidate(adminFleetProvider);
        },
      ),
      _AdminAlertsPage(
        data: fleetData,
        isLoading: fleetAsync.isLoading,
        onRetry: () => ref.invalidate(adminFleetProvider),
      ),
      _AdminSettingsPage(
        profile: fleetData?.profile ?? session.user,
        dashboard: fleetData?.dashboard,
      ),
    ];

    return RoleShellScaffold(
      currentIndex: _index,
      onTap: (value) => setState(() => _index = value),
      items: const [
        NavItemData(label: 'Fleet', icon: Icons.map_rounded),
        NavItemData(label: 'Trips', icon: Icons.alt_route_rounded),
        NavItemData(label: 'Demand', icon: Icons.bar_chart_rounded),
        NavItemData(label: 'Alerts', icon: Icons.notifications_active_rounded),
        NavItemData(label: 'Settings', icon: Icons.settings_rounded),
      ],
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        child: KeyedSubtree(key: ValueKey(_index), child: screens[_index]),
      ),
    );
  }
}

class _AdminFleetPage extends ConsumerStatefulWidget {
  const _AdminFleetPage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final AdminFleetData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  ConsumerState<_AdminFleetPage> createState() => _AdminFleetPageState();
}

class _AdminFleetPageState extends ConsumerState<_AdminFleetPage> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    if (widget.data == null && widget.isLoading) {
      return const DashboardSkeleton();
    }
    if (widget.data == null) {
      return _AdminAsyncCard(
        title: 'Fleet map unavailable',
        message: 'We could not load live fleet data for your company.',
        onRetry: widget.onRetry,
      );
    }

    final vans = widget.data!.vans.where((van) {
      switch (_filter) {
        case 'active':
          return van.status == 'on_trip' || van.status == 'active';
        case 'idle':
          return van.status == 'available' || van.status == 'idle';
        case 'stale':
          return van.status == 'stale' || van.status == 'offline';
        default:
          return true;
      }
    }).toList();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            eyebrow: 'Admin',
            title: 'Live fleet map',
            subtitle:
                '${widget.data!.profile.companyName ?? 'Company'} • ${widget.data!.dashboard?.activeVans ?? 0} active vans',
          ),
          const SizedBox(height: 16),
          AppSurfaceCard(
            padding: const EdgeInsets.all(12),
            child: Stack(
              children: [
                AdaptiveMapCard(
                  height: 340,
                  locations: [
                    for (final van in widget.data!.vans)
                      if (van.latitude != null && van.longitude != null)
                        MapLocationData(
                          id: van.id,
                          latitude: van.latitude!,
                          longitude: van.longitude!,
                          color: _adminVanColor(van.status),
                          icon: Icons.directions_bus_rounded,
                          label:
                              '${van.licensePlate} ${van.currentOccupancy}/${van.capacity}',
                        ),
                  ],
                ),
                Positioned(
                  top: 12,
                  left: 12,
                  right: 12,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      height: 52,
                      color: AppColors.surface.withValues(alpha: 0.82),
                      child: const Row(
                        children: [
                          Icon(Icons.search_rounded, color: AppColors.textSecondary),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Search van, driver, trip ID',
                              style: TextStyle(color: AppColors.textSecondary),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Live fleet',
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    StatusPill(
                      label: '${widget.data!.dashboard?.totalVans ?? vans.length} vans',
                      color: AppColors.success,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final filter in const [
                      ('all', 'All'),
                      ('active', 'Active'),
                      ('idle', 'Idle'),
                      ('stale', 'Stale'),
                    ])
                      ChoiceChip(
                        label: Text(filter.$2),
                        selected: _filter == filter.$1,
                        onSelected: (_) => setState(() => _filter = filter.$1),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                ...vans.map(
                  (van) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AppSurfaceCard(
                      backgroundColor: AppColors.surfaceElevated,
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${van.licensePlate} • ${van.driverName ?? 'Driver pending'}',
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                                const SizedBox(height: 6),
                                LinearProgressIndicator(
                                  value: van.capacity == 0
                                      ? 0
                                      : van.currentOccupancy / van.capacity,
                                  backgroundColor: AppColors.surface,
                                  color: AppColors.accent,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Occupancy ${van.currentOccupancy}/${van.capacity}',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                          StatusPill(
                            label: van.status.replaceAll('_', ' '),
                            color: _adminVanColor(van.status),
                          ),
                          const SizedBox(width: 10),
                          MiniActionButton(
                            label: 'View',
                            onPressed: () => _showVanSheet(context, van),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showVanSheet(BuildContext context, VanSummary van) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => AppSurfaceCard(
        borderRadius: 24,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(van.licensePlate, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Driver: ${van.driverName ?? 'Unassigned'}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 6),
            Text(
              'Occupancy ${van.currentOccupancy}/${van.capacity}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 6),
            StatusPill(
              label: van.status.replaceAll('_', ' '),
              color: _adminVanColor(van.status),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminTripsPage extends ConsumerWidget {
  const _AdminTripsPage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final AdminFleetData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (data == null && isLoading) {
      return const DashboardSkeleton();
    }
    if (data == null) {
      return _AdminAsyncCard(
        title: 'Trip board unavailable',
        message: 'We could not load the current trip list.',
        onRetry: onRetry,
      );
    }

    final trips = data!.trips;
    if (trips.isEmpty) {
      return _AdminAsyncCard(
        title: 'No trips yet',
        message: 'Matched and planned trips will appear here as demand enters the system.',
        onRetry: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Trips',
            title: 'Trip board',
            subtitle: 'Track active, queued, and pooled workload across the fleet.',
          ),
          const SizedBox(height: 16),
          ...trips.map(
            (trip) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppSurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            trip.id.substring(0, 8).toUpperCase(),
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                        ),
                        StatusPill(
                          label: trip.status.replaceAll('_', ' '),
                          color: _tripColor(trip.status),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${trip.vanLicensePlate ?? trip.vanId} • ${trip.passengerCount} riders',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        MiniActionButton(
                          label: 'Reassign',
                          onPressed: () => _showReassignSheet(
                            context,
                            ref,
                            trip.id,
                            data!.vans,
                          ),
                        ),
                        MiniActionButton(
                          label: 'Cancel',
                          onPressed: () => _cancelTrip(context, ref, trip.id),
                        ),
                      ],
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

  Future<void> _showReassignSheet(
    BuildContext context,
    WidgetRef ref,
    String tripId,
    List<VanSummary> vans,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => AppSurfaceCard(
        borderRadius: 24,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Reassign trip', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            ...vans.map(
              (van) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppSurfaceCard(
                  backgroundColor: AppColors.surfaceElevated,
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${van.licensePlate} • ${van.driverName ?? 'No driver'}',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                      MiniActionButton(
                        label: 'Assign',
                        onPressed: () async {
                          await ref.read(adminRepositoryProvider).reassignTrip(
                                tripId: tripId,
                                vanId: van.id,
                                reason: 'Reassigned from mobile admin console',
                              );
                          ref.invalidate(adminFleetProvider);
                          if (context.mounted) {
                            Navigator.of(context).pop();
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _cancelTrip(
    BuildContext context,
    WidgetRef ref,
    String tripId,
  ) async {
    await ref.read(adminRepositoryProvider).cancelTrip(
          tripId: tripId,
          reason: 'Cancelled from mobile admin console',
        );
    ref.invalidate(adminFleetProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Trip cancelled.')),
      );
    }
  }
}

class _AdminDemandPage extends StatelessWidget {
  const _AdminDemandPage({
    required this.demand,
    required this.dashboard,
    required this.isLoading,
    required this.onRetry,
  });

  final AdminDemandData? demand;
  final AdminDashboardSummary? dashboard;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (demand == null && isLoading) {
      return const DashboardSkeleton();
    }
    if (demand == null) {
      return _AdminAsyncCard(
        title: 'Demand view unavailable',
        message: 'We could not load KPI and incident data.',
        onRetry: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Demand',
            title: 'Ops intelligence',
            subtitle: 'Understand dispatch pressure, ride demand, and service balance.',
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            childAspectRatio: 1.35,
            shrinkWrap: true,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              StatCard(
                label: 'P95 wait',
                value:
                    '${demand!.kpis?.p95WaitTimeMinutes?.round() ?? dashboard?.pendingRequests ?? 0}m',
                color: AppColors.warning,
              ),
              StatCard(
                label: 'Dispatch success',
                value:
                    '${demand!.kpis?.dispatchSuccessPercent?.round() ?? 0}%',
                color: AppColors.success,
              ),
              StatCard(
                label: 'Seat use',
                value:
                    '${demand!.kpis?.seatUtilizationPercent?.round() ?? 0}%',
                color: AppColors.accent,
              ),
              StatCard(
                label: 'Open alerts',
                value: '${dashboard?.openAlerts ?? 0}',
                color: AppColors.danger,
              ),
            ],
          ),
          const SizedBox(height: 16),
          const DemandChartCard(),
          const SizedBox(height: 16),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Incident timeline',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                if (demand!.incidents.isEmpty)
                  Text(
                    'No incidents recorded in the current window.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  )
                else
                  ...demand!.incidents.take(6).map(
                        (incident) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 4,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: _incidentColor(incident.severity),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      incident.title ?? 'Incident',
                                      style: Theme.of(context).textTheme.titleLarge,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      incident.message,
                                      style: Theme.of(context).textTheme.bodyMedium,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminAlertsPage extends ConsumerWidget {
  const _AdminAlertsPage({
    required this.data,
    required this.isLoading,
    required this.onRetry,
  });

  final AdminFleetData? data;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (data == null && isLoading) {
      return const DashboardSkeleton();
    }
    if (data == null) {
      return _AdminAsyncCard(
        title: 'Alerts unavailable',
        message: 'We could not load operational alerts.',
        onRetry: onRetry,
      );
    }
    if (data!.alerts.isEmpty) {
      return _AdminAsyncCard(
        title: 'No open alerts',
        message: 'The system has no unresolved ops alerts right now.',
        onRetry: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'Alerts',
            title: 'Operational alerts',
            subtitle: 'Handle service issues before they turn into rider-facing delays.',
          ),
          const SizedBox(height: 16),
          ...data!.alerts.map(
            (alert) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppSurfaceCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 4,
                      height: 96,
                      decoration: BoxDecoration(
                        color: _incidentColor(alert.severity),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  alert.title ?? 'Operational alert',
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                              ),
                              StatusPill(
                                label: alert.severity,
                                color: _incidentColor(alert.severity),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            alert.message,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              MiniActionButton(
                                label: 'Resolve',
                                onPressed: () async {
                                  await ref
                                      .read(adminRepositoryProvider)
                                      .resolveAlert(alert.id);
                                  ref.invalidate(adminFleetProvider);
                                },
                              ),
                              if (alert.tripId != null)
                                MiniActionButton(
                                  label: 'Cancel trip',
                                  onPressed: () async {
                                    await ref
                                        .read(adminRepositoryProvider)
                                        .cancelTrip(
                                          tripId: alert.tripId!,
                                          reason: 'Cancelled from alert workflow',
                                        );
                                    ref.invalidate(adminFleetProvider);
                                  },
                                ),
                            ],
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

class _AdminSettingsPage extends StatelessWidget {
  const _AdminSettingsPage({
    required this.profile,
    required this.dashboard,
  });

  final UserProfile? profile;
  final AdminDashboardSummary? dashboard;

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
            eyebrow: 'Settings',
            title: 'Ops settings',
            subtitle: 'Read-only operational policy snapshots for the tenant workspace.',
          ),
          const SizedBox(height: 16),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _AdminSettingRow(
                  icon: Icons.business_outlined,
                  title: profile!.companyName ?? 'Company workspace',
                  subtitle: profile!.email,
                ),
                const SizedBox(height: 12),
                _AdminSettingRow(
                  icon: Icons.directions_bus_outlined,
                  title: 'Fleet capacity',
                  subtitle:
                      '${dashboard?.totalVans ?? 0} vans • ${dashboard?.activeVans ?? 0} active • ${dashboard?.availableVans ?? 0} available',
                ),
                const SizedBox(height: 12),
                _AdminSettingRow(
                  icon: Icons.groups_outlined,
                  title: 'Tenant roster',
                  subtitle:
                      '${dashboard?.employeesCount ?? 0} employees • ${dashboard?.driversCount ?? 0} drivers',
                ),
                const SizedBox(height: 12),
                const _AdminSettingRow(
                  icon: Icons.policy_outlined,
                  title: 'Dispatch policy',
                  subtitle:
                      'Matching constants remain configurable on the backend. Mobile shows this as a read-only operational snapshot.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminAsyncCard extends StatelessWidget {
  const _AdminAsyncCard({
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

class _AdminSettingRow extends StatelessWidget {
  const _AdminSettingRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: AppColors.accent),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

Color _adminVanColor(String status) {
  switch (status) {
    case 'on_trip':
    case 'active':
      return AppColors.success;
    case 'available':
    case 'idle':
      return AppColors.warning;
    case 'stale':
    case 'offline':
      return AppColors.danger;
    default:
      return AppColors.accent;
  }
}

Color _tripColor(String status) {
  switch (status) {
    case 'active_to_pickup':
    case 'active_in_transit':
    case 'active_mixed':
      return AppColors.success;
    case 'planned':
    case 'dispatch_ready':
      return AppColors.warning;
    case 'cancelled':
    case 'failed_operational_issue':
      return AppColors.danger;
    default:
      return AppColors.accent;
  }
}

Color _incidentColor(String severity) {
  switch (severity) {
    case 'critical':
    case 'high':
      return AppColors.danger;
    case 'medium':
      return AppColors.warning;
    default:
      return AppColors.accent;
  }
}
