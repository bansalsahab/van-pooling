import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';

import '../../core/data/dashboard_providers.dart';
import '../../core/data/models/api_models.dart';
import '../../core/data/repositories/employee_repository.dart';
import '../../core/data/repositories/live_repository.dart';
import '../../core/data/repositories/maps_repository.dart';
import '../../core/session/session_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';

class EmployeeAppPage extends ConsumerStatefulWidget {
  const EmployeeAppPage({super.key});

  @override
  ConsumerState<EmployeeAppPage> createState() => _EmployeeAppPageState();
}

class _EmployeeAppPageState extends ConsumerState<EmployeeAppPage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final homeAsync = ref.watch(employeeHomeProvider);
    final session = ref.watch(sessionControllerProvider);
    final liveConnection = ref.watch(liveConnectionProvider);
    final data = homeAsync.asData?.value;

    final screens = [
      _EmployeeHome(
        data: data,
        isLoading: homeAsync.isLoading,
        errorText: homeAsync.hasError ? homeAsync.error.toString() : null,
        onBookNow: _openBookingSheet,
        onTrackRide: () => setState(() => _index = 2),
        onRetry: () => ref.invalidate(employeeHomeProvider),
      ),
      _EmployeeBookPage(
        profile: data?.profile ?? session.user,
        activeRide: data?.activeRide,
        onBooked: _handleRideBooked,
      ),
      _EmployeeTrackPage(
        ride: data?.activeRide,
        liveConnection: liveConnection,
        onRetry: () => ref.invalidate(employeeHomeProvider),
        onCancelRide: data?.activeRide == null ? null : _cancelRide,
      ),
      _EmployeeHistoryPage(
        history: data?.history,
        isLoading: homeAsync.isLoading,
        onRetry: () => ref.invalidate(employeeHomeProvider),
      ),
      _EmployeeProfilePage(
        profile: data?.profile ?? session.user,
        unreadCount: data?.notifications.unreadCount ?? 0,
        onSaved: () => ref.invalidate(employeeHomeProvider),
      ),
    ];

    return RoleShellScaffold(
      currentIndex: _index,
      onTap: (value) => setState(() => _index = value),
      items: const [
        NavItemData(label: 'Home', icon: Icons.home_rounded),
        NavItemData(label: 'Book', icon: Icons.add_road_rounded),
        NavItemData(label: 'Track', icon: Icons.location_searching_rounded),
        NavItemData(label: 'History', icon: Icons.history_rounded),
        NavItemData(label: 'Profile', icon: Icons.person_rounded),
      ],
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.03, 0.02),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        ),
        child: KeyedSubtree(key: ValueKey(_index), child: screens[_index]),
      ),
    );
  }

  Future<void> _openBookingSheet() async {
    final data = ref.read(employeeHomeProvider).asData?.value;
    final session = ref.read(sessionControllerProvider);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _BookRideSheet(
        profile: data?.profile ?? session.user,
        activeRide: data?.activeRide,
        onBooked: _handleRideBooked,
      ),
    );
  }

  Future<void> _handleRideBooked() async {
    ref.invalidate(employeeHomeProvider);
    if (mounted) {
      setState(() => _index = 2);
    }
  }

  Future<void> _cancelRide() async {
    final ride = ref.read(employeeHomeProvider).asData?.value.activeRide;
    if (ride == null) {
      return;
    }
    try {
      await ref.read(employeeRepositoryProvider).cancelRide(ride.id);
      ref.invalidate(employeeHomeProvider);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ride cancelled.')),
      );
      setState(() => _index = 0);
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }
}

class _EmployeeHome extends StatelessWidget {
  const _EmployeeHome({
    required this.data,
    required this.isLoading,
    required this.errorText,
    required this.onBookNow,
    required this.onTrackRide,
    required this.onRetry,
  });

  final EmployeeHomeData? data;
  final bool isLoading;
  final String? errorText;
  final VoidCallback onBookNow;
  final VoidCallback onTrackRide;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (data == null && isLoading) {
      return const DashboardSkeleton();
    }

    if (data == null) {
      return _AsyncStateCard(
        title: 'Employee feed unavailable',
        message: errorText ?? 'We could not load your rider workspace yet.',
        actionLabel: 'Retry',
        onPressed: onRetry,
      );
    }

    final activeRide = data!.activeRide;
    final recentRides = data!.history.take(6).toList();
    final mapLocations = _serviceZoneLocations(data!.profile, activeRide);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: SectionHeader(
                  eyebrow: 'Employee',
                  title: 'Good morning, ${_firstName(data!.profile.name)}',
                  subtitle: activeRide != null
                      ? 'Your ride is live and synced with dispatch.'
                      : 'No active ride right now. You can book or schedule your next commute.',
                ),
              ),
              Stack(
                children: [
                  const Icon(
                    Icons.notifications_none_rounded,
                    color: AppColors.textPrimary,
                    size: 28,
                  ),
                  if (data!.notifications.unreadCount > 0)
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          color: AppColors.danger,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            onTap: activeRide != null ? onTrackRide : onBookNow,
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: 78,
                  decoration: BoxDecoration(
                    color: activeRide != null ? AppColors.success : AppColors.accent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                const SizedBox(width: 14),
                PulseDot(
                  color: activeRide != null ? AppColors.success : AppColors.accent,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        activeRide != null
                            ? _activeRideHeadline(activeRide)
                            : 'No active ride yet',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        activeRide != null
                            ? _activeRideSubhead(activeRide)
                            : 'Tap here to request a pooled ride or schedule one for later.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: RoleCard(
                  icon: Icons.flash_on_rounded,
                  title: 'Book now',
                  subtitle: 'Request an immediate pooled ride.',
                  onTap: onBookNow,
                  accent: AppColors.accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: RoleCard(
                  icon: Icons.schedule_rounded,
                  title: 'Schedule ride',
                  subtitle: 'Plan tomorrow\'s pickup ahead.',
                  onTap: onBookNow,
                  accent: AppColors.warning,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Text('Your commute zone', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AdaptiveMapCard(
                  height: 160,
                  locations: mapLocations,
                  routePoints: _mapRoutePoints(activeRide),
                  overlay: const Align(
                    alignment: Alignment.topRight,
                    child: Padding(
                      padding: EdgeInsets.all(12),
                      child: StatusPill(
                        label: 'Service zone live',
                        color: AppColors.accent,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        data!.profile.companyName == null
                            ? 'Live rider workspace'
                            : '${data!.profile.companyName} commuter network',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: AppColors.textPrimary,
                            ),
                      ),
                    ),
                    StatusPill(
                      label: activeRide != null
                          ? activeRide.status.replaceAll('_', ' ')
                          : '${recentRides.length} recent rides',
                      color: activeRide != null
                          ? _statusColor(activeRide.status)
                          : AppColors.success,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Text('Recent rides', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          if (recentRides.isEmpty)
            AppSurfaceCard(
              child: Text(
                'Your completed and cancelled rides will appear here once you start commuting.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            )
          else
            SizedBox(
              height: 168,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: recentRides.length,
                separatorBuilder: (_, index) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final ride = recentRides[index];
                  return SizedBox(
                    width: 176,
                    child: AppSurfaceCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _rideDateLabel(ride),
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 10),
                          Text(
                            '${ride.pickupAddress} -> ${ride.destinationAddress}',
                            style: Theme.of(context).textTheme.titleLarge,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Spacer(),
                          StatusPill(
                            label: ride.status.replaceAll('_', ' '),
                            color: _statusColor(ride.status),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _EmployeeBookPage extends StatelessWidget {
  const _EmployeeBookPage({
    required this.profile,
    required this.activeRide,
    required this.onBooked,
  });

  final UserProfile? profile;
  final RideSummary? activeRide;
  final Future<void> Function() onBooked;

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
            eyebrow: 'Booking',
            title: 'Plan your next ride',
            subtitle:
                'Use live geocoding, route preview, and scheduling from the same rider flow.',
          ),
          const SizedBox(height: 18),
          _EmployeeBookingComposer(
            profile: profile!,
            activeRide: activeRide,
            onBooked: onBooked,
            embeddedInSheet: false,
          ),
        ],
      ),
    );
  }
}

class _EmployeeTrackPage extends StatelessWidget {
  const _EmployeeTrackPage({
    required this.ride,
    required this.liveConnection,
    required this.onRetry,
    required this.onCancelRide,
  });

  final RideSummary? ride;
  final LiveConnectionState liveConnection;
  final VoidCallback onRetry;
  final Future<void> Function()? onCancelRide;

  @override
  Widget build(BuildContext context) {
    if (ride == null) {
      return _AsyncStateCard(
        title: 'No active ride',
        message:
            'Once you request a van, live tracking, ETA updates, and boarding OTP will appear here.',
        actionLabel: 'Refresh',
        onPressed: onRetry,
      );
    }

    final locations = _trackingLocations(ride!);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            eyebrow: 'Live tracking',
            title: _statusLabel(ride!.status),
            subtitle: _trackingSubtitle(ride!, liveConnection),
            trailing: StatusPill(
              label: _connectionLabel(liveConnection.status),
              color: _connectionColor(liveConnection.status),
            ),
          ),
          const SizedBox(height: 16),
          AdaptiveMapCard(
            height: 340,
            locations: locations,
            routePoints: _mapRoutePoints(ride),
            overlay: ride!.minutesUntilPickup != null
                ? Align(
                    alignment: Alignment.topLeft,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: StatusPill(
                        label: '${ride!.minutesUntilPickup} min away',
                        color: AppColors.warning,
                      ),
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 16),
          AppSurfaceCard(
            borderRadius: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 400),
                  child: Text(
                    _statusLabel(ride!.status),
                    key: ValueKey(ride!.status),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(
                        color: AppColors.accentDeep,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _driverInitials(ride!.driverName),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ride!.driverName ?? 'Driver assigned soon',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            ride!.vanLicensePlate == null
                                ? 'Dispatch is finalizing your van.'
                                : '${ride!.vanLicensePlate} • ${ride!.nextStopAddress ?? 'Live route active'}',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    if (ride!.minutesUntilPickup != null)
                      StatusPill(
                        label: '${ride!.minutesUntilPickup} min',
                        color: AppColors.warning,
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const AvatarStack(initials: ['RK', 'MS']),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '2 others may share this van when pooling rules allow.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
                if (ride!.boardingOtpCode != null &&
                    !_isRideAfterPickup(ride!.status)) ...[
                  const SizedBox(height: 16),
                  AppSurfaceCard(
                    backgroundColor: AppColors.surfaceElevated,
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.password_rounded,
                          color: AppColors.accent,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Boarding OTP',
                                style: Theme.of(context).textTheme.labelMedium,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                ride!.boardingOtpCode!,
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(letterSpacing: 4),
                              ),
                            ],
                          ),
                        ),
                        const StatusPill(
                          label: 'Share at boarding',
                          color: AppColors.accent,
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: 'Cancel ride',
                        onPressed: _canCancelRide(ride!.status)
                            ? onCancelRide
                            : null,
                        icon: Icons.close_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SecondaryButton(
                        label: 'Contact driver',
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Driver contact handoff can be wired to in-app calling or masked phone relay.',
                              ),
                            ),
                          );
                        },
                        icon: Icons.call_outlined,
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
}

class _EmployeeHistoryPage extends StatelessWidget {
  const _EmployeeHistoryPage({
    required this.history,
    required this.isLoading,
    required this.onRetry,
  });

  final List<RideSummary>? history;
  final bool isLoading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (history == null && isLoading) {
      return const DashboardSkeleton();
    }

    if (history == null) {
      return _AsyncStateCard(
        title: 'History unavailable',
        message: 'We could not load your past rides yet.',
        actionLabel: 'Retry',
        onPressed: onRetry,
      );
    }

    if (history!.isEmpty) {
      return _AsyncStateCard(
        title: 'No rides yet',
        message: 'Your completed pooled trips and receipts will appear here.',
        actionLabel: 'Refresh',
        onPressed: onRetry,
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            eyebrow: 'History',
            title: 'Ride history',
            subtitle: 'Review previous trips, statuses, and ride receipts.',
          ),
          const SizedBox(height: 18),
          ...history!.map(
            (ride) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppSurfaceCard(
                padding: EdgeInsets.zero,
                child: Theme(
                  data: Theme.of(context).copyWith(
                    dividerColor: Colors.transparent,
                  ),
                  child: ExpansionTile(
                    tilePadding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
                    childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                    title: Text(
                      '${ride.pickupAddress} -> ${ride.destinationAddress}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        _rideDateLabel(ride),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    trailing: StatusPill(
                      label: ride.status.replaceAll('_', ' '),
                      color: _statusColor(ride.status),
                    ),
                    children: [
                      const SizedBox(height: 8),
                      AdaptiveMapCard(
                        height: 150,
                        locations: _historyLocations(ride),
                        routePoints: _mapRoutePoints(ride),
                      ),
                      const SizedBox(height: 14),
                      _ReceiptRow(
                        label: 'Requested',
                        value: ride.requestedAt == null
                            ? 'Unavailable'
                            : DateFormat('dd MMM yyyy, hh:mm a')
                                .format(ride.requestedAt!.toLocal()),
                      ),
                      _ReceiptRow(
                        label: 'Driver',
                        value: ride.driverName ?? 'Not assigned',
                      ),
                      _ReceiptRow(
                        label: 'Van',
                        value: ride.vanLicensePlate ?? 'Not assigned',
                      ),
                      _ReceiptRow(
                        label: 'Route ETA',
                        value: ride.routeDurationMinutes == null
                            ? 'Unavailable'
                            : '${ride.routeDurationMinutes} min',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmployeeProfilePage extends ConsumerStatefulWidget {
  const _EmployeeProfilePage({
    required this.profile,
    required this.unreadCount,
    required this.onSaved,
  });

  final UserProfile? profile;
  final int unreadCount;
  final VoidCallback onSaved;

  @override
  ConsumerState<_EmployeeProfilePage> createState() =>
      _EmployeeProfilePageState();
}

class _EmployeeProfilePageState extends ConsumerState<_EmployeeProfilePage> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _homeController = TextEditingController();
  final _destinationController = TextEditingController();
  bool _push = true;
  bool _sms = false;
  bool _email = true;
  String? _profileId;

  @override
  void initState() {
    super.initState();
    _seedFromProfile();
  }

  @override
  void didUpdateWidget(covariant _EmployeeProfilePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    _seedFromProfile();
  }

  void _seedFromProfile() {
    final profile = widget.profile;
    if (profile == null || _profileId == profile.id) {
      return;
    }
    _profileId = profile.id;
    _nameController.text = profile.name;
    _phoneController.text = profile.phone ?? '';
    _homeController.text = profile.homeAddress ?? '';
    _destinationController.text = profile.defaultDestinationAddress ?? '';
    _push = profile.notificationPreferences.push;
    _sms = profile.notificationPreferences.sms;
    _email = profile.notificationPreferences.email;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _homeController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final session = ref.watch(sessionControllerProvider);

    if (profile == null) {
      return const DashboardSkeleton();
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            eyebrow: 'Profile',
            title: 'Rider preferences',
            subtitle:
                '${widget.unreadCount} unread notifications • ${profile.companyName ?? 'Workspace'}',
          ),
          const SizedBox(height: 18),
          AppSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 54,
                      height: 54,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.accentDeep,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _initials(profile.name),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(profile.name,
                              style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 4),
                          Text(profile.email,
                              style: Theme.of(context).textTheme.bodyMedium),
                        ],
                      ),
                    ),
                    StatusPill(
                      label: profile.companyName ?? 'Workspace',
                      color: AppColors.accent,
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    hintText: 'Full name',
                    prefixIcon: Icon(Icons.person_outline_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _phoneController,
                  decoration: const InputDecoration(
                    hintText: 'Phone number',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _homeController,
                  decoration: const InputDecoration(
                    hintText: 'Home address',
                    prefixIcon: Icon(Icons.home_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _destinationController,
                  decoration: const InputDecoration(
                    hintText: 'Default destination',
                    prefixIcon: Icon(Icons.flag_outlined),
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
                Text('Notifications', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _push,
                  onChanged: (value) => setState(() => _push = value),
                  title: const Text('Push alerts'),
                  subtitle: const Text('Ride, ETA, and dispatch updates'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _email,
                  onChanged: (value) => setState(() => _email = value),
                  title: const Text('Email summaries'),
                  subtitle: const Text('Trip receipts and policy notices'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _sms,
                  onChanged: (value) => setState(() => _sms = value),
                  title: const Text('SMS fallback'),
                  subtitle: const Text('Critical delay updates only'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: session.isLoading ? 'Saving...' : 'Save preferences',
            onPressed: session.isLoading
                ? null
                : () async {
                    await ref.read(sessionControllerProvider.notifier).updateProfile(
                      {
                        'name': _nameController.text.trim(),
                        'phone': _phoneController.text.trim().isEmpty
                            ? null
                            : _phoneController.text.trim(),
                        'home_address': _homeController.text.trim().isEmpty
                            ? null
                            : _homeController.text.trim(),
                        'default_destination_address':
                            _destinationController.text.trim().isEmpty
                                ? null
                                : _destinationController.text.trim(),
                        'notification_preferences': {
                          'push': _push,
                          'sms': _sms,
                          'email': _email,
                        },
                      },
                    );
                    widget.onSaved();
                    if (!context.mounted) {
                      return;
                    }
                    final latestSession = ref.read(sessionControllerProvider);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          latestSession.errorMessage ??
                              'Your rider preferences have been updated.',
                        ),
                      ),
                    );
                  },
          ),
          const SizedBox(height: 12),
          SecondaryButton(
            label: 'Sign out',
            onPressed: () {
              ref.read(sessionControllerProvider.notifier).signOut();
            },
            icon: Icons.logout_rounded,
          ),
        ],
      ),
    );
  }
}

class _BookRideSheet extends StatelessWidget {
  const _BookRideSheet({
    required this.profile,
    required this.activeRide,
    required this.onBooked,
  });

  final UserProfile? profile;
  final RideSummary? activeRide;
  final Future<void> Function() onBooked;

  @override
  Widget build(BuildContext context) {
    if (profile == null) {
      return const SizedBox.shrink();
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.6,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, controller) {
        return AppSurfaceCard(
          borderRadius: 28,
          child: ListView(
            controller: controller,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.textMuted,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Book a ride', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 14),
              _EmployeeBookingComposer(
                profile: profile!,
                activeRide: activeRide,
                onBooked: () async {
                  await onBooked();
                  if (context.mounted) {
                    Navigator.of(context).pop();
                  }
                },
                embeddedInSheet: true,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _EmployeeBookingComposer extends ConsumerStatefulWidget {
  const _EmployeeBookingComposer({
    required this.profile,
    required this.activeRide,
    required this.onBooked,
    required this.embeddedInSheet,
  });

  final UserProfile profile;
  final RideSummary? activeRide;
  final Future<void> Function() onBooked;
  final bool embeddedInSheet;

  @override
  ConsumerState<_EmployeeBookingComposer> createState() =>
      _EmployeeBookingComposerState();
}

class _EmployeeBookingComposerState
    extends ConsumerState<_EmployeeBookingComposer> {
  final _pickupController = TextEditingController();
  final _destinationController = TextEditingController();

  RouteWaypoint? _pickupPoint;
  RouteWaypoint? _destinationPoint;
  RoutePlan? _previewPlan;
  bool _scheduled = false;
  DateTime? _scheduledAt;
  bool _loadingLocation = true;
  bool _loadingPreview = false;
  bool _submitting = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_hydrateDefaults);
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  Future<void> _hydrateDefaults() async {
    final profile = widget.profile;

    if (profile.homeAddress != null &&
        profile.homeLatitude != null &&
        profile.homeLongitude != null) {
      _pickupController.text = profile.homeAddress!;
      _pickupPoint = RouteWaypoint(
        latitude: profile.homeLatitude!,
        longitude: profile.homeLongitude!,
        address: profile.homeAddress!,
        label: 'Pickup',
        kind: 'origin',
      );
    } else {
      await _useCurrentLocation();
    }

    if (profile.defaultDestinationAddress != null &&
        profile.defaultDestinationLatitude != null &&
        profile.defaultDestinationLongitude != null) {
      _destinationController.text = profile.defaultDestinationAddress!;
      _destinationPoint = RouteWaypoint(
        latitude: profile.defaultDestinationLatitude!,
        longitude: profile.defaultDestinationLongitude!,
        address: profile.defaultDestinationAddress!,
        label: 'Destination',
        kind: 'destination',
      );
    }

    if (_pickupPoint != null && _destinationPoint != null) {
      await _previewRoute();
    }

    if (mounted) {
      setState(() => _loadingLocation = false);
    }
  }

  Future<void> _useCurrentLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      var effectivePermission = permission;
      if (effectivePermission == LocationPermission.denied) {
        effectivePermission = await Geolocator.requestPermission();
      }
      if (effectivePermission == LocationPermission.deniedForever ||
          effectivePermission == LocationPermission.denied) {
        if (mounted) {
          setState(() {
            _loadingLocation = false;
            _errorText =
                'Location permission is blocked. Add a saved home address or enable location access.';
          });
        }
        return;
      }

      final position = await Geolocator.getCurrentPosition();
      final address = widget.profile.homeAddress ??
          'Current location (${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)})';
      if (mounted) {
        setState(() {
          _pickupController.text = address;
          _pickupPoint = RouteWaypoint(
            latitude: position.latitude,
            longitude: position.longitude,
            address: address,
            label: 'Pickup',
            kind: 'origin',
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingLocation = false;
          _errorText =
              'Could not access your current location. You can still use your saved home address.';
        });
      }
    }
  }

  Future<void> _resolveDestination([String? preset]) async {
    final address = (preset ?? _destinationController.text).trim();
    if (address.isEmpty) {
      setState(() => _errorText = 'Enter a destination to preview the route.');
      return;
    }

    setState(() {
      _loadingPreview = true;
      _errorText = null;
    });

    try {
      final geocode = await ref.read(mapsRepositoryProvider).geocode(address);
      final destination = RouteWaypoint(
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        address: geocode.address,
        label: 'Destination',
        kind: 'destination',
      );

      _destinationController.text = geocode.address;
      _destinationPoint = destination;
      await _previewRoute();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loadingPreview = false;
        _errorText = error.toString();
      });
    }
  }

  Future<void> _previewRoute() async {
    if (_pickupPoint == null || _destinationPoint == null) {
      if (mounted) {
        setState(() => _loadingPreview = false);
      }
      return;
    }

    try {
      final plan = await ref.read(mapsRepositoryProvider).previewRoute(
            origin: _pickupPoint!,
            destination: _destinationPoint!,
          );
      if (!mounted) {
        return;
      }
      setState(() {
        _previewPlan = plan;
        _loadingPreview = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loadingPreview = false;
        _errorText = error.toString();
      });
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _scheduledAt ?? now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (picked == null) {
      return;
    }
    setState(() {
      _scheduledAt = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _scheduledAt?.hour ?? now.hour,
        _scheduledAt?.minute ?? now.minute,
      );
    });
  }

  Future<void> _pickTime() async {
    final initial = TimeOfDay.fromDateTime(_scheduledAt ?? DateTime.now());
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
    );
    if (picked == null) {
      return;
    }
    final base = _scheduledAt ?? DateTime.now();
    setState(() {
      _scheduledAt = DateTime(
        base.year,
        base.month,
        base.day,
        picked.hour,
        picked.minute,
      );
    });
  }

  Future<void> _confirmBooking() async {
    if (widget.activeRide != null && !_isRideTerminal(widget.activeRide!.status)) {
      setState(() {
        _errorText =
            'Complete or cancel the current ride before requesting another one.';
      });
      return;
    }

    if (_destinationPoint == null) {
      await _resolveDestination();
      if (_destinationPoint == null) {
        return;
      }
    }

    if (_pickupPoint == null || _destinationPoint == null) {
      setState(() {
        _errorText =
            'Pickup and destination are required before creating a ride.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      await ref.read(employeeRepositoryProvider).requestRide(
            pickup: _pickupPoint!,
            destination: _destinationPoint!,
            scheduledTime: _scheduled ? _scheduledAt : null,
          );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ride request created and sent to dispatch.'),
        ),
      );
      await widget.onBooked();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _submitting = false;
        _errorText = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final previewLocations = <MapLocationData>[
      if (_pickupPoint != null)
        MapLocationData(
          id: 'pickup',
          latitude: _pickupPoint!.latitude,
          longitude: _pickupPoint!.longitude,
          color: AppColors.accent,
          icon: Icons.my_location_rounded,
          label: 'Pickup',
          fallbackAlignment: const Alignment(-0.55, 0.26),
        ),
      if (_destinationPoint != null)
        MapLocationData(
          id: 'destination',
          latitude: _destinationPoint!.latitude,
          longitude: _destinationPoint!.longitude,
          color: AppColors.success,
          icon: Icons.flag_rounded,
          label: 'Destination',
          fallbackAlignment: const Alignment(0.58, -0.24),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_errorText != null) ...[
          AppSurfaceCard(
            backgroundColor: AppColors.danger.withValues(alpha: 0.1),
            child: Text(
              _errorText!,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: AppColors.textPrimary),
            ),
          ),
          const SizedBox(height: 14),
        ],
        AppSurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _FieldLabel('Pickup'),
              const SizedBox(height: 8),
              TextField(
                controller: _pickupController,
                readOnly: true,
                decoration: InputDecoration(
                  hintText: _loadingLocation
                      ? 'Detecting current location...'
                      : 'Pickup location',
                  prefixIcon: const Icon(Icons.my_location_rounded),
                  suffixIcon: IconButton(
                    onPressed: _useCurrentLocation,
                    icon: const Icon(Icons.gps_fixed_rounded),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _FieldLabel('Destination'),
              const SizedBox(height: 8),
              TextField(
                controller: _destinationController,
                decoration: InputDecoration(
                  hintText: 'Where do you need to go?',
                  prefixIcon: const Icon(Icons.flag_rounded),
                  suffixIcon: IconButton(
                    onPressed: _loadingPreview ? null : _resolveDestination,
                    icon: const Icon(Icons.search_rounded),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final campus in const [
                    'IBM Tech Park',
                    'Cyber Hub',
                    'DLF Tower',
                    'Airport Metro',
                  ])
                    MiniActionButton(
                      label: campus,
                      onPressed: () => _resolveDestination(campus),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Now'),
                      selected: !_scheduled,
                      onSelected: (_) => setState(() => _scheduled = false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Schedule'),
                      selected: _scheduled,
                      onSelected: (_) => setState(() {
                        _scheduled = true;
                        _scheduledAt ??=
                            DateTime.now().add(const Duration(hours: 1));
                      }),
                    ),
                  ),
                ],
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                height: _scheduled ? 110 : 0,
                child: _scheduled
                    ? Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Pressable(
                                onTap: _pickDate,
                                child: _ReadOnlyField(
                                  icon: Icons.calendar_today_outlined,
                                  value: _scheduledAt == null
                                      ? 'Select date'
                                      : DateFormat('dd MMM yyyy')
                                          .format(_scheduledAt!),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Pressable(
                                onTap: _pickTime,
                                child: _ReadOnlyField(
                                  icon: Icons.schedule_rounded,
                                  value: _scheduledAt == null
                                      ? 'Select time'
                                      : DateFormat('hh:mm a')
                                          .format(_scheduledAt!),
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    : null,
              ),
              const SizedBox(height: 12),
              Row(
                children: const [
                  Expanded(
                    child: StatusPill(
                      label: 'Pooling enabled',
                      color: AppColors.accent,
                    ),
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: StatusPill(
                      label: 'Live route preview',
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        AppSurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Trip preview', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              if (_loadingPreview)
                const ShimmerBlock(height: 220, radius: 18)
              else
                AdaptiveMapCard(
                  height: 220,
                  locations: previewLocations,
                  routePoints: _previewRoutePoints(_previewPlan),
                ),
              const SizedBox(height: 14),
              Text(
                _previewPlan == null
                    ? 'Resolve a destination to preview ETA, route, and pooling fit.'
                    : 'Estimated ${_previewPlan!.durationMinutes} min • ${(_previewPlan!.distanceMeters / 1000).toStringAsFixed(1)} km',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 8),
              Text(
                widget.activeRide != null && !_isRideTerminal(widget.activeRide!.status)
                    ? 'You already have an active ride, so this form is locked until that trip completes or is cancelled.'
                    : 'The matcher will try pooling first, then spawn a new trip if capacity or detour rules do not fit.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        PrimaryButton(
          label: _submitting ? 'Submitting...' : 'Confirm booking',
          onPressed: (_submitting || _loadingLocation) ? null : _confirmBooking,
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: Theme.of(context).textTheme.labelMedium,
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  const _ReadOnlyField({
    required this.icon,
    required this.value,
  });

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
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
      ),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.textPrimary,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AsyncStateCard extends StatelessWidget {
  const _AsyncStateCard({
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onPressed,
  });

  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onPressed;

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
            PrimaryButton(label: actionLabel, onPressed: onPressed),
          ],
        ),
      ),
    );
  }
}

String _firstName(String name) {
  if (name.trim().isEmpty) {
    return 'there';
  }
  return name.trim().split(RegExp(r'\s+')).first;
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) {
    return 'VP';
  }
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

String _driverInitials(String? name) {
  if (name == null || name.trim().isEmpty) {
    return 'DR';
  }
  return _initials(name);
}

String _rideDateLabel(RideSummary ride) {
  if (ride.requestedAt == null) {
    return 'Unknown date';
  }
  return DateFormat('dd MMM yyyy').format(ride.requestedAt!.toLocal());
}

bool _isRideTerminal(String status) {
  return {
    'completed',
    'cancelled_by_employee',
    'cancelled_by_admin',
    'no_show',
    'failed_no_capacity',
    'failed_driver_unreachable',
    'failed_operational_issue',
  }.contains(status);
}

bool _isRideAfterPickup(String status) {
  return {
    'picked_up',
    'in_transit',
    'arrived_at_destination',
    'dropped_off',
    'completed',
  }.contains(status);
}

bool _canCancelRide(String status) => !_isRideAfterPickup(status);

Color _statusColor(String status) {
  switch (status) {
    case 'completed':
    case 'picked_up':
    case 'in_transit':
    case 'dropped_off':
      return AppColors.success;
    case 'cancelled_by_employee':
    case 'cancelled_by_admin':
    case 'no_show':
    case 'failed_no_capacity':
    case 'failed_driver_unreachable':
    case 'failed_operational_issue':
      return AppColors.danger;
    case 'arrived_at_pickup':
    case 'arrived_at_destination':
      return AppColors.warning;
    default:
      return AppColors.accent;
  }
}

String _activeRideHeadline(RideSummary ride) {
  if (ride.minutesUntilPickup != null && !_isRideAfterPickup(ride.status)) {
    return 'Van is ${ride.minutesUntilPickup} min away';
  }
  return _statusLabel(ride.status);
}

String _activeRideSubhead(RideSummary ride) {
  final parts = <String>[
    if (ride.vanLicensePlate != null) ride.vanLicensePlate!,
    if (ride.nextStopAddress != null) ride.nextStopAddress!,
    if (ride.driverName != null) ride.driverName!,
  ];
  return parts.isEmpty ? 'Dispatch is preparing your ride.' : parts.join(' • ');
}

String _statusLabel(String status) {
  return status
      .split('_')
      .map((segment) {
        if (segment.isEmpty) {
          return segment;
        }
        return '${segment[0].toUpperCase()}${segment.substring(1)}';
      })
      .join(' ');
}

String _trackingSubtitle(RideSummary ride, LiveConnectionState liveConnection) {
  final liveLabel = _connectionLabel(liveConnection.status);
  final timing = ride.minutesUntilPickup != null
      ? '${ride.minutesUntilPickup} minutes until pickup'
      : 'Realtime tracking active';
  return '$timing • $liveLabel';
}

String _connectionLabel(LiveConnectionStatus status) {
  switch (status) {
    case LiveConnectionStatus.connected:
      return 'Live';
    case LiveConnectionStatus.connecting:
      return 'Connecting';
    case LiveConnectionStatus.degraded:
      return 'Degraded';
    case LiveConnectionStatus.disconnected:
      return 'Offline';
  }
}

Color _connectionColor(LiveConnectionStatus status) {
  switch (status) {
    case LiveConnectionStatus.connected:
      return AppColors.success;
    case LiveConnectionStatus.connecting:
    case LiveConnectionStatus.degraded:
      return AppColors.warning;
    case LiveConnectionStatus.disconnected:
      return AppColors.danger;
  }
}

List<MapLocationData> _serviceZoneLocations(
  UserProfile profile,
  RideSummary? activeRide,
) {
  final locations = <MapLocationData>[];
  if (activeRide?.pickupLatitude != null && activeRide?.pickupLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'pickup',
        latitude: activeRide!.pickupLatitude!,
        longitude: activeRide.pickupLongitude!,
        color: AppColors.accent,
        icon: Icons.location_pin,
        label: 'Pickup',
        fallbackAlignment: const Alignment(-0.55, 0.24),
      ),
    );
  } else if (profile.homeLatitude != null && profile.homeLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'home',
        latitude: profile.homeLatitude!,
        longitude: profile.homeLongitude!,
        color: AppColors.accentDeep,
        icon: Icons.home_rounded,
        label: 'Home',
        fallbackAlignment: const Alignment(-0.55, 0.24),
      ),
    );
  }
  if (activeRide?.destinationLatitude != null &&
      activeRide?.destinationLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'destination',
        latitude: activeRide!.destinationLatitude!,
        longitude: activeRide.destinationLongitude!,
        color: AppColors.success,
        icon: Icons.apartment_rounded,
        label: 'Destination',
        fallbackAlignment: const Alignment(0.55, -0.24),
      ),
    );
  } else if (profile.defaultDestinationLatitude != null &&
      profile.defaultDestinationLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'office',
        latitude: profile.defaultDestinationLatitude!,
        longitude: profile.defaultDestinationLongitude!,
        color: AppColors.success,
        icon: Icons.apartment_rounded,
        label: 'Office',
        fallbackAlignment: const Alignment(0.55, -0.24),
      ),
    );
  }
  if (activeRide?.vanLatitude != null && activeRide?.vanLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'van',
        latitude: activeRide!.vanLatitude!,
        longitude: activeRide.vanLongitude!,
        color: AppColors.warning,
        icon: Icons.directions_bus_rounded,
        label: activeRide.vanLicensePlate ?? 'Van',
        fallbackAlignment: const Alignment(0.0, 0.04),
      ),
    );
  }
  return locations;
}

List<MapLocationData> _trackingLocations(RideSummary ride) {
  final locations = <MapLocationData>[];
  if (ride.pickupLatitude != null && ride.pickupLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'pickup',
        latitude: ride.pickupLatitude!,
        longitude: ride.pickupLongitude!,
        color: AppColors.accent,
        icon: Icons.person_pin_circle_rounded,
        label: 'Pickup',
        fallbackAlignment: const Alignment(-0.58, 0.32),
      ),
    );
  }
  if (ride.vanLatitude != null && ride.vanLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'van',
        latitude: ride.vanLatitude!,
        longitude: ride.vanLongitude!,
        color: AppColors.accentDeep,
        icon: Icons.directions_bus_rounded,
        label: ride.vanLicensePlate ?? 'Van',
        fallbackAlignment: const Alignment(0.1, 0.08),
      ),
    );
  }
  if (ride.destinationLatitude != null && ride.destinationLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'destination',
        latitude: ride.destinationLatitude!,
        longitude: ride.destinationLongitude!,
        color: AppColors.success,
        icon: Icons.flag_rounded,
        label: 'Destination',
        fallbackAlignment: const Alignment(0.66, -0.42),
      ),
    );
  }
  return locations;
}

List<MapLocationData> _historyLocations(RideSummary ride) {
  final locations = <MapLocationData>[];
  if (ride.pickupLatitude != null && ride.pickupLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'pickup',
        latitude: ride.pickupLatitude!,
        longitude: ride.pickupLongitude!,
        color: AppColors.accent,
        icon: Icons.location_on_rounded,
        label: 'Pickup',
      ),
    );
  }
  if (ride.destinationLatitude != null && ride.destinationLongitude != null) {
    locations.add(
      MapLocationData(
        id: 'destination',
        latitude: ride.destinationLatitude!,
        longitude: ride.destinationLongitude!,
        color: AppColors.success,
        icon: Icons.flag_rounded,
        label: 'Destination',
      ),
    );
  }
  return locations;
}

List<LatLng> _mapRoutePoints(RideSummary? ride) {
  if (ride == null) {
    return const [];
  }
  final points = <LatLng>[];
  if (ride.vanLatitude != null && ride.vanLongitude != null) {
    points.add(LatLng(ride.vanLatitude!, ride.vanLongitude!));
  }
  if (ride.pickupLatitude != null && ride.pickupLongitude != null) {
    points.add(LatLng(ride.pickupLatitude!, ride.pickupLongitude!));
  }
  if (ride.destinationLatitude != null && ride.destinationLongitude != null) {
    points.add(LatLng(ride.destinationLatitude!, ride.destinationLongitude!));
  }
  return points;
}

List<LatLng> _previewRoutePoints(RoutePlan? plan) {
  if (plan == null) {
    return const [];
  }
  final points = <LatLng>[];
  if (plan.origin != null) {
    points.add(LatLng(plan.origin!.latitude, plan.origin!.longitude));
  }
  for (final waypoint in plan.waypoints) {
    points.add(LatLng(waypoint.latitude, waypoint.longitude));
  }
  if (plan.destination != null) {
    points.add(LatLng(plan.destination!.latitude, plan.destination!.longitude));
  }
  return points;
}
