import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';

class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage> {
  @override
  void initState() {
    super.initState();
    Future<void>.microtask(() async {
      await ref.read(sessionControllerProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AppGradientBackground(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 36),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                const GradientLogo(size: 80)
                    .animate()
                    .fadeIn(duration: 300.ms)
                    .scale(duration: 400.ms, curve: Curves.easeOutBack),
                const SizedBox(height: 20),
                Text(
                  'Van Pooling',
                  style: Theme.of(context).textTheme.displayLarge,
                ).animate().fadeIn(delay: 120.ms, duration: 280.ms),
                const SizedBox(height: 10),
                Text(
                  'Demand-responsive commute',
                  style: Theme.of(context).textTheme.bodyMedium,
                ).animate().fadeIn(delay: 220.ms, duration: 280.ms),
                const Spacer(),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: const LinearProgressIndicator(
                    minHeight: 4,
                    color: AppColors.accent,
                    backgroundColor: AppColors.surfaceElevated,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
