import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import '../widgets/change_graph_view.dart';
import '../widgets/task_result_view.dart';

class TaskScreen extends ConsumerWidget {
  const TaskScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(mobileControllerProvider);
    final task = state.task;
    if (task == null) return const Scaffold(body: Center(child: Text('任务不存在')));
    return Scaffold(
      appBar: AppBar(
        title: Text(task.title),
        actions: [
          if (!task.isDone)
            IconButton(
              tooltip: '取消任务',
              onPressed: ref.read(mobileControllerProvider.notifier).cancelTask,
              icon: const Icon(Icons.stop_circle_outlined),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              _StatusBadge(status: task.status),
              const SizedBox(width: 12),
              Expanded(
                child: Text(task.currentStep ?? _statusText(task.status)),
              ),
              Text('${(task.progress * 100).round()}%'),
            ],
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(value: task.isDone ? 1 : task.progress),
          if (task.prompt != null) ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(task.prompt!),
              ),
            ),
          ],
          if (state.liveText.isNotEmpty &&
              (!task.isDone || task.result == null)) ...[
            const SizedBox(height: 20),
            Text('实时输出', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            SelectableText(state.liveText),
          ],
          if (task.error != null) ...[
            const SizedBox(height: 20),
            Text(
              task.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          if (task.changeGraph != null &&
              task.changeGraph!.nodes.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('代码变更影响', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ChangeGraphView(graph: task.changeGraph!),
          ],
          if (task.result != null) ...[
            const SizedBox(height: 20),
            TaskResultView(result: task.result!),
          ],
        ],
      ),
    );
  }

  String _statusText(String status) => switch (status) {
    'CREATED' => '等待执行',
    'RUNNING' => 'Pi-Agent 正在执行',
    'WAITING_CONFIRM' => '等待确认',
    'SUCCESS' => '执行成功',
    'FAILED' => '执行失败',
    'CANCELLED' => '已取消',
    _ => status,
  };
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'SUCCESS' => Colors.green,
      'FAILED' => Colors.red,
      'CANCELLED' => Colors.grey,
      'WAITING_CONFIRM' => Colors.orange,
      _ => Theme.of(context).colorScheme.primary,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        _label(status),
        style: TextStyle(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }

  String _label(String value) => switch (value) {
    'CREATED' => '待执行',
    'RUNNING' => '执行中',
    'WAITING_CONFIRM' => '待确认',
    'SUCCESS' => '已完成',
    'FAILED' => '失败',
    'CANCELLED' => '已取消',
    _ => value,
  };
}
