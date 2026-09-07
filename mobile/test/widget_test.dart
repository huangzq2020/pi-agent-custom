import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pi_agent_mobile_os/main.dart';

void main() {
  testWidgets('shows the computer binding and main navigation', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: PiMobileApp()));
    await tester.pump();

    expect(find.text('Pi-Agent Mobile OS'), findsOneWidget);
    expect(find.text('请先绑定运行 Gateway 的电脑'), findsOneWidget);
    expect(find.text('绑定电脑'), findsWidgets);
    expect(find.text('文件'), findsOneWidget);
    expect(find.text('GitHub'), findsOneWidget);
    expect(find.text('记录'), findsOneWidget);
  });
}
