import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vanpool_mobile/src/core/theme/app_theme.dart';
import 'package:vanpool_mobile/src/shared/widgets/common_widgets.dart';

void main() {
  testWidgets('renders mobile brand logo', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(
          body: Center(
            child: GradientLogo(size: 80),
          ),
        ),
      ),
    );

    expect(find.text('VP'), findsOneWidget);
  });
}
