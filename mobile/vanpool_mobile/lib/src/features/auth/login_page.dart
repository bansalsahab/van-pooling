import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  AppRole _selectedRole = AppRole.employee;
  bool _obscureText = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    final messenger = ScaffoldMessenger.of(context);

    if (email.isEmpty || password.isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Enter your email and password to continue.')),
      );
      return;
    }

    final success = await ref.read(sessionControllerProvider.notifier).signIn(
          role: _selectedRole,
          email: email,
          password: password,
        );
    if (!mounted || !success) {
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height;
    final session = ref.watch(sessionControllerProvider);
    final accentColor = _selectedRole.accentColor;

    return Scaffold(
      body: AppGradientBackground(
        child: Stack(
          children: [
            SizedBox(
              height: height * 0.38,
              child: const RouteLinesBackground(),
            ),
            SafeArea(
              child: Column(
                children: [
                  SizedBox(
                    height: height * 0.28,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text(
                            'One fleet app.\nThree operating roles.',
                            style: Theme.of(context).textTheme.displayLarge,
                          )
                              .animate()
                              .fadeIn(duration: 320.ms)
                              .slideY(begin: 0.08, end: 0),
                          const SizedBox(height: 12),
                          Text(
                            'Sign in to the employee, driver, or admin workspace with one consistent experience.',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ).animate().fadeIn(delay: 100.ms, duration: 320.ms),
                        ],
                      ),
                    ),
                  ),
                  Expanded(
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: AppSurfaceCard(
                        borderRadius: 28,
                        padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const GradientLogo(),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Van Pooling Platform',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleLarge,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Sign in to your workspace',
                                          style:
                                              Theme.of(context).textTheme.bodyMedium,
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 20),
                              Text(
                                _selectedRole.label.toUpperCase(),
                                style: Theme.of(context).textTheme.labelMedium,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _selectedRole.welcomeMessage,
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                              const SizedBox(height: 18),
                              _RoleSelector(
                                value: _selectedRole,
                                onChanged: (role) =>
                                    setState(() => _selectedRole = role),
                              ),
                              const SizedBox(height: 20),
                              TextField(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(color: AppColors.textPrimary),
                                decoration: const InputDecoration(
                                  hintText: 'Work email',
                                  prefixIcon: Icon(Icons.alternate_email_rounded),
                                ),
                              ),
                              const SizedBox(height: 14),
                              TextField(
                                controller: _passwordController,
                                obscureText: _obscureText,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(color: AppColors.textPrimary),
                                decoration: InputDecoration(
                                  hintText: 'Password',
                                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                                  suffixIcon: IconButton(
                                    onPressed: () => setState(
                                      () => _obscureText = !_obscureText,
                                    ),
                                    icon: Icon(
                                      _obscureText
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 18),
                              if (session.errorMessage != null) ...[
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: AppColors.danger.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: AppColors.danger.withValues(alpha: 0.25),
                                    ),
                                  ),
                                  child: Text(
                                    session.errorMessage!,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(color: AppColors.textPrimary),
                                  ),
                                ),
                                const SizedBox(height: 14),
                              ],
                              PrimaryButton(
                                label: session.isLoading ? 'Connecting...' : 'Continue',
                                onPressed: session.isLoading ? null : _submit,
                                gradientColors: [accentColor, AppColors.accentDeep],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: Divider(
                                      color: Colors.white.withValues(alpha: 0.08),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                    child: Text(
                                      'or continue with',
                                      style: Theme.of(context).textTheme.bodySmall,
                                    ),
                                  ),
                                  Expanded(
                                    child: Divider(
                                      color: Colors.white.withValues(alpha: 0.08),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              SecondaryButton(
                                label: 'Enterprise SSO',
                                icon: Icons.business_outlined,
                                onPressed: () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'SSO handoff can be wired to your enterprise identity provider.',
                                      ),
                                    ),
                                  );
                                },
                              ),
                              const SizedBox(height: 18),
                              Center(
                                child: Text(
                                  'Powered by Van Pooling',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                          .animate()
                          .fadeIn(delay: 140.ms, duration: 360.ms)
                          .slideY(begin: 0.1, end: 0),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleSelector extends StatelessWidget {
  const _RoleSelector({
    required this.value,
    required this.onChanged,
  });

  final AppRole value;
  final ValueChanged<AppRole> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: AppRole.values.map((role) {
        final active = role == value;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: role == AppRole.values.last ? 0 : 8,
            ),
            child: Pressable(
              onTap: () => onChanged(role),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: active
                      ? role.accentColor.withValues(alpha: 0.18)
                      : AppColors.surfaceElevated.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: active
                        ? role.accentColor.withValues(alpha: 0.42)
                        : Colors.white.withValues(alpha: 0.06),
                  ),
                ),
                child: Center(
                  child: Text(
                    role.label,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: active
                              ? AppColors.textPrimary
                              : AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

