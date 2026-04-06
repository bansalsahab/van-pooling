import 'dart:math' as math;
import 'dart:ui';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shimmer/shimmer.dart';

import '../../core/theme/app_theme.dart';

class AppGradientBackground extends StatelessWidget {
  const AppGradientBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF112642),
            AppColors.background,
            Color(0xFF0A1521),
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -60,
            right: -20,
            child: _blurOrb(AppColors.accent.withValues(alpha: 0.18), 220),
          ),
          Positioned(
            bottom: -80,
            left: -40,
            child: _blurOrb(AppColors.accentDeep.withValues(alpha: 0.22), 260),
          ),
          child,
        ],
      ),
    );
  }

  Widget _blurOrb(Color color, double size) {
    return IgnorePointer(
      child: ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
        ),
      ),
    );
  }
}

class GradientLogo extends StatelessWidget {
  const GradientLogo({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.28),
        gradient: const LinearGradient(
          colors: [AppColors.accent, AppColors.accentDeep],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Center(
        child: Text(
          'VP',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
        ),
      ),
    );
  }
}

class AppSurfaceCard extends StatelessWidget {
  const AppSurfaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.backgroundColor,
    this.borderRadius = 20,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor ?? AppColors.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );

    if (onTap == null) {
      return card;
    }

    return Pressable(onTap: onTap, child: card);
  }
}

class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    this.onTap,
  });

  final Widget child;
  final VoidCallback? onTap;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  double _scale = 1;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _scale = 0.96),
      onTapCancel: () => setState(() => _scale = 1),
      onTapUp: (_) => setState(() => _scale = 1),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _scale,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutBack,
        child: widget.child,
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.gradientColors = const [AppColors.accent, AppColors.accentDeep],
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final List<Color> gradientColors;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return Pressable(
      onTap: onPressed,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: disabled
                ? [
                    AppColors.surfaceElevated,
                    AppColors.surfaceElevated.withValues(alpha: 0.88),
                  ]
                : gradientColors,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 10),
            ],
            Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: disabled ? AppColors.textMuted : Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return Pressable(
      onTap: onPressed,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          color: AppColors.surface.withValues(alpha: disabled ? 0.28 : 0.45),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, color: AppColors.textPrimary, size: 18),
              const SizedBox(width: 10),
            ],
            Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: disabled ? AppColors.textMuted : AppColors.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class MiniActionButton extends StatelessWidget {
  const MiniActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.color = AppColors.surfaceElevated,
  });

  final String label;
  final VoidCallback onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.8),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.textPrimary,
              ),
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: Theme.of(context).textTheme.labelMedium,
              ),
              const SizedBox(height: 4),
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ],
          ),
        ),
        ...?trailing == null ? null : [trailing!],
      ],
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textPrimary,
                ),
          ),
        ],
      ),
    );
  }
}

class PulseDot extends StatefulWidget {
  const PulseDot({super.key, required this.color, this.size = 12});

  final Color color;
  final double size;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size * 2,
      height: widget.size * 2,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final pulse = Curves.easeOut.transform(_controller.value);
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: widget.size + (widget.size * pulse),
                height: widget.size + (widget.size * pulse),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(alpha: 0.3 - (pulse * 0.3)),
                ),
              ),
              child!,
            ],
          );
        },
        child: Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color),
        ),
      ),
    );
  }
}

class MapLocationData {
  const MapLocationData({
    required this.id,
    required this.latitude,
    required this.longitude,
    required this.color,
    required this.icon,
    this.label,
    this.fallbackAlignment,
  });

  final String id;
  final double latitude;
  final double longitude;
  final Color color;
  final IconData icon;
  final String? label;
  final Alignment? fallbackAlignment;

  LatLng get latLng => LatLng(latitude, longitude);
}

class AdaptiveMapCard extends StatelessWidget {
  const AdaptiveMapCard({
    super.key,
    required this.height,
    this.locations = const [],
    this.routePoints = const [],
    this.overlay,
  });

  final double height;
  final List<MapLocationData> locations;
  final List<LatLng> routePoints;
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    final showInteractiveMap =
        !kIsWeb &&
        locations.isNotEmpty &&
        locations.every(
          (location) => location.latitude != 0 || location.longitude != 0,
        );

    if (!showInteractiveMap) {
      return FauxMapSurface(
        height: height,
        showRoute: routePoints.length > 1,
        pins: [
          for (var index = 0; index < locations.length; index++)
            MapPinData(
              alignment: locations[index].fallbackAlignment ??
                  _fallbackAlignment(index, locations.length),
              color: locations[index].color,
              icon: locations[index].icon,
              label: locations[index].label,
            ),
        ],
        overlay: overlay,
      );
    }

    final markers = locations
        .map(
          (location) => Marker(
            markerId: MarkerId(location.id),
            position: location.latLng,
            infoWindow: InfoWindow(title: location.label),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              _markerHue(location.color),
            ),
          ),
        )
        .toSet();

    final linePoints = routePoints.length >= 2
        ? routePoints
        : locations.map((location) => location.latLng).toList();

    final polylines = linePoints.length >= 2
        ? {
            Polyline(
              polylineId: const PolylineId('route'),
              points: linePoints,
              color: AppColors.accent,
              width: 5,
            ),
          }
        : <Polyline>{};

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: locations.first.latLng,
                zoom: 13,
              ),
              markers: markers,
              polylines: polylines,
              zoomControlsEnabled: false,
              mapToolbarEnabled: false,
              myLocationButtonEnabled: false,
              compassEnabled: false,
            ),
            ..._overlayChildren,
          ],
        ),
      ),
    );
  }

  List<Widget> get _overlayChildren =>
      overlay == null ? const <Widget>[] : <Widget>[overlay!];

  Alignment _fallbackAlignment(int index, int total) {
    const alignments = [
      Alignment(-0.58, 0.3),
      Alignment(0.0, 0.08),
      Alignment(0.56, -0.28),
      Alignment(0.38, 0.42),
    ];
    if (index < alignments.length) {
      return alignments[index];
    }
    return Alignment(-0.7 + ((index % math.max(total, 1)) * 0.35), 0.1);
  }

  double _markerHue(Color color) {
    if (color == AppColors.success) {
      return BitmapDescriptor.hueGreen;
    }
    if (color == AppColors.warning) {
      return BitmapDescriptor.hueOrange;
    }
    if (color == AppColors.danger) {
      return BitmapDescriptor.hueRed;
    }
    return BitmapDescriptor.hueAzure;
  }
}

class MapPinData {
  const MapPinData({
    required this.alignment,
    required this.color,
    required this.icon,
    this.label,
  });

  final Alignment alignment;
  final Color color;
  final IconData icon;
  final String? label;
}

class FauxMapSurface extends StatelessWidget {
  const FauxMapSurface({
    super.key,
    required this.height,
    this.pins = const [],
    this.showRoute = false,
    this.overlay,
  });

  final double height;
  final List<MapPinData> pins;
  final bool showRoute;
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF11243A),
                    Color(0xFF0C1624),
                    Color(0xFF142E46),
                  ],
                ),
              ),
            ),
            CustomPaint(painter: _MapGridPainter(showRoute: showRoute)),
            ...pins.map(
              (pin) => Align(
                alignment: pin.alignment,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: pin.color,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 18,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Icon(pin.icon, color: Colors.white, size: 18),
                    )
                        .animate()
                        .fadeIn(duration: 320.ms)
                        .scale(begin: const Offset(0.88, 0.88)),
                    if (pin.label != null) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated.withValues(alpha: 0.9),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          pin.label!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: AppColors.textPrimary,
                              ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            ...?overlay == null ? null : [overlay!],
          ],
        ),
      ),
    );
  }
}

class _MapGridPainter extends CustomPainter {
  const _MapGridPainter({required this.showRoute});

  final bool showRoute;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..style = PaintingStyle.stroke
      ..color = Colors.white.withValues(alpha: 0.05)
      ..strokeWidth = 1;

    for (var i = 0; i <= 10; i++) {
      final dy = size.height * i / 10;
      canvas.drawLine(Offset(0, dy), Offset(size.width, dy), grid);
    }

    for (var i = 0; i <= 8; i++) {
      final dx = size.width * i / 8;
      canvas.drawLine(Offset(dx, 0), Offset(dx, size.height), grid);
    }

    final roads = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: 0.08);

    final diagonal = Path()
      ..moveTo(-20, size.height * 0.78)
      ..quadraticBezierTo(
        size.width * 0.26,
        size.height * 0.58,
        size.width * 0.54,
        size.height * 0.64,
      )
      ..quadraticBezierTo(
        size.width * 0.82,
        size.height * 0.72,
        size.width + 20,
        size.height * 0.36,
      );
    canvas.drawPath(diagonal, roads);

    final cross = Path()
      ..moveTo(size.width * 0.1, 0)
      ..quadraticBezierTo(
        size.width * 0.18,
        size.height * 0.22,
        size.width * 0.12,
        size.height,
      );
    canvas.drawPath(cross, roads..strokeWidth = 14);

    if (showRoute) {
      final routePaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = AppColors.accent
        ..strokeCap = StrokeCap.round;
      final dashPath = Path()
        ..moveTo(size.width * 0.2, size.height * 0.78)
        ..quadraticBezierTo(
          size.width * 0.34,
          size.height * 0.62,
          size.width * 0.58,
          size.height * 0.58,
        )
        ..quadraticBezierTo(
          size.width * 0.76,
          size.height * 0.56,
          size.width * 0.84,
          size.height * 0.28,
        );

      for (final metric in dashPath.computeMetrics()) {
        var distance = 0.0;
        while (distance < metric.length) {
          const dashLength = 14.0;
          canvas.drawPath(
            metric.extractPath(distance, distance + dashLength),
            routePaint,
          );
          distance += dashLength + 9;
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _MapGridPainter oldDelegate) =>
      oldDelegate.showRoute != showRoute;
}

class InlineMetricCard extends StatelessWidget {
  const InlineMetricCard({
    super.key,
    required this.label,
    required this.value,
    this.color = AppColors.accent,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelMedium),
          const Spacer(),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.caption,
    this.color = AppColors.accent,
  });

  final String label;
  final String value;
  final String? caption;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelMedium),
          const Spacer(),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(color: color),
          ),
          if (caption != null) ...[
            const SizedBox(height: 6),
            Text(caption!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class RoleCard extends StatelessWidget {
  const RoleCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.accent = AppColors.accent,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: accent, size: 28),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class CopilotPanel extends StatelessWidget {
  const CopilotPanel({
    super.key,
    required this.title,
    required this.message,
    this.healthLabel,
    this.promptChips = const [],
    this.expanded = true,
    this.onToggle,
  });

  final String title;
  final String message;
  final String? healthLabel;
  final List<String> promptChips;
  final bool expanded;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.psychology_alt_outlined, color: AppColors.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(title, style: Theme.of(context).textTheme.titleLarge),
              ),
              if (healthLabel != null)
                StatusPill(label: healthLabel!, color: AppColors.warning),
              IconButton(
                onPressed: onToggle,
                icon: Icon(
                  expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                ),
              ),
            ],
          ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 240),
            firstChild: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message, style: Theme.of(context).textTheme.bodyMedium),
                if (promptChips.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final chip in promptChips) Chip(label: Text(chip)),
                    ],
                  ),
                ],
              ],
            ),
            secondChild: const SizedBox.shrink(),
            crossFadeState:
                expanded ? CrossFadeState.showFirst : CrossFadeState.showSecond,
          ),
        ],
      ),
    );
  }
}

class NavItemData {
  const NavItemData({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;
}

class RoleShellScaffold extends StatelessWidget {
  const RoleShellScaffold({
    super.key,
    required this.body,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final Widget body;
  final List<NavItemData> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AppGradientBackground(
        child: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              Positioned.fill(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  child: body,
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 12,
                child: GlassBottomNavBar(
                  items: items,
                  currentIndex: currentIndex,
                  onTap: onTap,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GlassBottomNavBar extends StatelessWidget {
  const GlassBottomNavBar({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<NavItemData> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.75),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Row(
            children: List.generate(items.length, (index) {
              final active = index == currentIndex;
              final item = items[index];
              return Expanded(
                child: Pressable(
                  onTap: () => onTap(index),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    decoration: BoxDecoration(
                      color: active
                          ? AppColors.accent.withValues(alpha: 0.14)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          item.icon,
                          size: 20,
                          color: active
                              ? AppColors.accent
                              : AppColors.textSecondary,
                        ),
                        const SizedBox(height: 5),
                        Text(
                          item.label,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: active
                                    ? AppColors.textPrimary
                                    : AppColors.textSecondary,
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class RouteLinesBackground extends StatelessWidget {
  const RouteLinesBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: CustomPaint(
        painter: _RouteLinesPainter(),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _RouteLinesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = AppColors.accent.withValues(alpha: 0.08);

    for (var i = -1; i < 8; i++) {
      final path = Path()
        ..moveTo(size.width * (i * 0.18), 0)
        ..cubicTo(
          size.width * (0.12 + i * 0.16),
          size.height * 0.24,
          size.width * (-0.08 + i * 0.18),
          size.height * 0.72,
          size.width * (0.2 + i * 0.15),
          size.height,
        );
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class DemandChartCard extends StatelessWidget {
  const DemandChartCard({super.key});

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Demand by zone', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          SizedBox(
            height: 180,
            child: BarChart(
              BarChartData(
                borderData: FlBorderData(show: false),
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: Colors.white.withValues(alpha: 0.06),
                    strokeWidth: 1,
                  ),
                ),
                titlesData: FlTitlesData(
                  rightTitles:
                      const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles:
                      const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      getTitlesWidget: (value, meta) => Text(
                        value.toInt().toString(),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        const labels = ['Hub', 'North', 'Cyber', 'DLF', 'South'];
                        final index = value.toInt();
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            labels[index],
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  _group(0, 8),
                  _group(1, 5),
                  _group(2, 10),
                  _group(3, 7),
                  _group(4, 6),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  BarChartGroupData _group(int x, double y) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(
          toY: y,
          borderRadius: BorderRadius.circular(6),
          gradient: const LinearGradient(
            colors: [AppColors.accent, AppColors.accentDeep],
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
          ),
          width: 18,
        ),
      ],
    );
  }
}

class CountUpStat extends StatelessWidget {
  const CountUpStat({
    super.key,
    required this.label,
    required this.value,
    this.suffix = '',
  });

  final String label;
  final int value;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    return AppSurfaceCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelMedium),
          const Spacer(),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value.toDouble()),
            duration: const Duration(milliseconds: 1200),
            curve: Curves.easeOutCubic,
            builder: (context, animatedValue, child) {
              return Text(
                '${animatedValue.round()}$suffix',
                style: Theme.of(context).textTheme.headlineMedium,
              );
            },
          ),
        ],
      ),
    );
  }
}

class AvatarStack extends StatelessWidget {
  const AvatarStack({super.key, required this.initials});

  final List<String> initials;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: math.max(38, initials.length * 22),
      height: 24,
      child: Stack(
        children: [
          for (var i = 0; i < initials.length; i++)
            Positioned(
              left: i * 18,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: i.isEven ? AppColors.accentDeep : AppColors.success,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.background, width: 2),
                ),
                alignment: Alignment.center,
                child: Text(
                  initials[i],
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white,
                        letterSpacing: 0,
                      ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class DelayedReveal extends StatefulWidget {
  const DelayedReveal({
    super.key,
    required this.child,
    required this.placeholder,
    this.delay = const Duration(milliseconds: 650),
  });

  final Widget child;
  final Widget placeholder;
  final Duration delay;

  @override
  State<DelayedReveal> createState() => _DelayedRevealState();
}

class _DelayedRevealState extends State<DelayedReveal> {
  bool _revealed = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.delay, () {
      if (mounted) {
        setState(() => _revealed = true);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      child: _revealed ? widget.child : widget.placeholder,
    );
  }
}

class ShimmerBlock extends StatelessWidget {
  const ShimmerBlock({
    super.key,
    required this.height,
    this.width,
    this.radius = 14,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.surfaceElevated,
      highlightColor: const Color(0xFF284762),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          ShimmerBlock(height: 18, width: 90, radius: 8),
          SizedBox(height: 10),
          ShimmerBlock(height: 34, width: 220, radius: 10),
          SizedBox(height: 8),
          ShimmerBlock(height: 16, width: 280, radius: 8),
          SizedBox(height: 20),
          ShimmerBlock(height: 110, radius: 22),
          SizedBox(height: 14),
          ShimmerBlock(height: 180, radius: 22),
          SizedBox(height: 14),
          ShimmerBlock(height: 220, radius: 22),
        ],
      ),
    );
  }
}

