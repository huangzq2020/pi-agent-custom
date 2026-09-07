import 'package:flutter/material.dart';

import '../models.dart';

class ChangeGraphView extends StatelessWidget {
  const ChangeGraphView({super.key, required this.graph});

  final ChangeGraph graph;

  @override
  Widget build(BuildContext context) {
    final features = _collectFeatureImpacts(graph);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.hub_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '主要功能影响图',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '已归纳为 ${features.length} 个主要功能',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 96 + ((features.length + 1) ~/ 2) * 76,
              child: _ImpactDiagram(features: features),
            ),
          ],
        ),
      ),
    );
  }
}

class _ImpactDiagram extends StatelessWidget {
  const _ImpactDiagram({required this.features});

  final List<_FeatureImpact> features;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final size = Size(constraints.maxWidth, constraints.maxHeight);
      final center = _centerRect(size);
      final nodes = _featureRects(size, features.length);
      return Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              key: const Key('feature-impact-links'),
              painter: _ImpactLinkPainter(
                nodeCount: features.length,
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
            ),
          ),
          Positioned.fromRect(
            rect: center,
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                '本次代码改动',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          for (var index = 0; index < features.length; index++)
            Positioned.fromRect(
              rect: nodes[index],
              child: _FeatureNode(
                key: Key('feature-impact-$index'),
                feature: features[index],
                color: _nodeColor(context, index),
              ),
            ),
        ],
      );
    },
  );
}

class _FeatureNode extends StatelessWidget {
  const _FeatureNode({super.key, required this.feature, required this.color});

  final _FeatureImpact feature;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.14),
      border: Border.all(color: color.withValues(alpha: 0.75)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(_featureIcon(feature.label), size: 20, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            feature.label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

class _ImpactLinkPainter extends CustomPainter {
  const _ImpactLinkPainter({required this.nodeCount, required this.color});

  final int nodeCount;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = _centerRect(size);
    final nodes = _featureRects(size, nodeCount);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final markerPaint = Paint()..color = color;
    final start = Offset(center.center.dx, center.bottom);
    for (final node in nodes) {
      final end = Offset(node.center.dx, node.top);
      final middleY = start.dy + (end.dy - start.dy) * 0.5;
      final path = Path()
        ..moveTo(start.dx, start.dy)
        ..cubicTo(start.dx, middleY, end.dx, middleY, end.dx, end.dy);
      canvas.drawPath(path, paint);
      canvas.drawCircle(end, 3, markerPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _ImpactLinkPainter oldDelegate) =>
      oldDelegate.nodeCount != nodeCount || oldDelegate.color != color;
}

class _FeatureImpact {
  const _FeatureImpact({required this.label, required this.score});

  final String label;
  final int score;
}

List<_FeatureImpact> _collectFeatureImpacts(ChangeGraph graph) {
  final scores = <String, int>{};
  for (final node in graph.nodes) {
    final label = _featureLabel(node.label);
    final weight = 1000 + node.additions + node.deletions;
    scores.update(label, (value) => value + weight, ifAbsent: () => weight);
  }
  final features =
      scores.entries
          .map((entry) => _FeatureImpact(label: entry.key, score: entry.value))
          .toList()
        ..sort((left, right) => right.score.compareTo(left.score));
  return features.take(5).toList();
}

String _featureLabel(String path) {
  final value = path.replaceAll('\\', '/').toLowerCase();
  if (value.startsWith('test/') ||
      value.contains('/test/') ||
      value.contains('/tests/') ||
      value.endsWith('_test.dart') ||
      value.endsWith('.test.ts')) {
    return '测试与质量保障';
  }
  if (value.startsWith('mobile/lib/screens/') ||
      value.startsWith('mobile/lib/widgets/') ||
      value == 'mobile/lib/main.dart') {
    return '移动端交互界面';
  }
  if (value.startsWith('mobile/lib/')) return 'App 状态与通信';
  if (value.contains('packages/mobile-os/src/runtime/')) {
    return 'Pi-Agent Runtime';
  }
  if (value.contains('packages/mobile-os/workflows/') ||
      value.contains('packages/mobile-os/src/workflow/') ||
      value.contains('packages/mobile-os/src/capability') ||
      value.contains('packages/mobile-os/src/marketplace/')) {
    return 'Agent 工作流';
  }
  if (value.contains('packages/mobile-os/src/')) return '电脑端 Gateway';
  if (value.startsWith('mobile/android/')) return 'Android 平台适配';
  if (value.contains('packages/coding-agent/') ||
      value.contains('packages/agent/') ||
      value.contains('packages/ai/')) {
    return 'Pi-Agent 核心能力';
  }
  if (value.endsWith('.md') ||
      value.endsWith('.yaml') ||
      value.endsWith('.json')) {
    return '配置与文档';
  }
  return '项目基础设施';
}

Rect _centerRect(Size size) =>
    Rect.fromLTWH((size.width - 132) / 2, 8, 132, 46);

List<Rect> _featureRects(Size size, int count) {
  const outer = 4.0;
  const gap = 10.0;
  const height = 58.0;
  const rowGap = 18.0;
  const top = 82.0;
  final width = (size.width - outer * 2 - gap) / 2;
  return [
    for (var index = 0; index < count; index++)
      Rect.fromLTWH(
        count.isOdd && index == count - 1
            ? (size.width - width) / 2
            : outer + (index % 2) * (width + gap),
        top + (index ~/ 2) * (height + rowGap),
        width,
        height,
      ),
  ];
}

Color _nodeColor(BuildContext context, int index) => switch (index) {
  0 => Theme.of(context).colorScheme.primary,
  1 => Theme.of(context).colorScheme.secondary,
  2 => Theme.of(context).colorScheme.tertiary,
  3 => Colors.green,
  _ => Colors.orange,
};

IconData _featureIcon(String label) => switch (label) {
  '移动端交互界面' => Icons.smartphone,
  'App 状态与通信' => Icons.sync_alt,
  '电脑端 Gateway' => Icons.dns_outlined,
  'Pi-Agent Runtime' => Icons.memory,
  'Agent 工作流' => Icons.account_tree_outlined,
  '测试与质量保障' => Icons.verified_outlined,
  'Android 平台适配' => Icons.android,
  'Pi-Agent 核心能力' => Icons.psychology_outlined,
  '配置与文档' => Icons.description_outlined,
  _ => Icons.settings_suggest_outlined,
};
