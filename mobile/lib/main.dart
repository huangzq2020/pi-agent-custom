import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: PiMobileApp()));
}

class PiMobileApp extends StatelessWidget {
  const PiMobileApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Pi-Agent Mobile OS',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff5b5bd6),
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
      cardTheme: const CardThemeData(margin: EdgeInsets.zero),
    ),
    home: const HomeScreen(),
  );
}
