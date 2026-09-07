import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pi_agent_mobile_os/models.dart';
import 'package:pi_agent_mobile_os/widgets/change_graph_view.dart';
import 'package:pi_agent_mobile_os/widgets/task_result_view.dart';

void main() {
  testWidgets('renders workflow output as a readable report', (tester) async {
    final result = <String, Object?>{
      'workflowId': 'detailed_analysis',
      'steps': <Object?>[
        <String, Object?>{
          'stepId': 'repository',
          'startedAt': '2026-08-26T10:00:00Z',
          'completedAt': '2026-08-26T10:00:01Z',
          'output': <String, Object?>{
            'name': 'pi-agent',
            'summary': 'An English-only project summary.',
            'languages': <Object?>['Dart', 'TypeScript'],
            'frameworks': <Object?>['Flutter'],
            'manifests': <Object?>['pubspec.yaml', 'package.json'],
          },
        },
        <String, Object?>{
          'stepId': 'analysis',
          'startedAt': '2026-08-26T10:00:01Z',
          'completedAt': '2026-08-26T10:00:03Z',
          'output': '## 项目目标\n\n- 提供清晰的移动端分析结果',
        },
      ],
      'output': '## 项目目标\n\n- 提供清晰的移动端分析结果',
    };

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: TaskResultView(result: result)),
        ),
      ),
    );

    expect(find.text('pi-agent'), findsOneWidget);
    expect(
      find.text('「pi-agent」是一个主要使用 Flutter、Dart、TypeScript 构建的软件项目。'),
      findsOneWidget,
    );
    expect(find.text('分析报告'), findsOneWidget);
    expect(find.text('项目目标'), findsOneWidget);
    expect(find.text('提供清晰的移动端分析结果'), findsOneWidget);
    expect(find.text('原始数据'), findsOneWidget);
  });

  testWidgets('draws no more than five function-level impact nodes', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    const graph = ChangeGraph(
      nodes: [
        ChangeNode(
          id: 'mobile/lib/screens/project_screen.dart',
          label: 'mobile/lib/screens/project_screen.dart',
          change: 'modified',
          additions: 30,
          deletions: 0,
        ),
        ChangeNode(
          id: 'mobile/lib/api_client.dart',
          label: 'mobile/lib/api_client.dart',
          change: 'added',
          additions: 25,
          deletions: 0,
        ),
        ChangeNode(
          id: 'packages/mobile-os/src/gateway.ts',
          label: 'packages/mobile-os/src/gateway.ts',
          change: 'modified',
          additions: 20,
          deletions: 0,
        ),
        ChangeNode(
          id: 'packages/mobile-os/src/runtime/pi-agent-adapter.ts',
          label: 'packages/mobile-os/src/runtime/pi-agent-adapter.ts',
          change: 'modified',
          additions: 15,
          deletions: 0,
        ),
        ChangeNode(
          id: 'packages/mobile-os/workflows/detailed-analysis.yaml',
          label: 'packages/mobile-os/workflows/detailed-analysis.yaml',
          change: 'modified',
          additions: 10,
          deletions: 0,
        ),
        ChangeNode(
          id: 'mobile/test/widget_test.dart',
          label: 'mobile/test/widget_test.dart',
          change: 'modified',
          additions: 0,
          deletions: 0,
        ),
      ],
      edges: [],
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ChangeGraphView(graph: graph)),
      ),
    );

    expect(find.text('主要功能影响图'), findsOneWidget);
    expect(find.text('移动端交互界面'), findsOneWidget);
    expect(find.text('App 状态与通信'), findsOneWidget);
    expect(find.text('电脑端 Gateway'), findsOneWidget);
    expect(find.text('Pi-Agent Runtime'), findsOneWidget);
    expect(find.text('Agent 工作流'), findsOneWidget);
    expect(find.text('测试与质量保障'), findsNothing);
    expect(find.text('project_screen.dart'), findsNothing);
    expect(find.byKey(const Key('feature-impact-links')), findsOneWidget);
  });
}
