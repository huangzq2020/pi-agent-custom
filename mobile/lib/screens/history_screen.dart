import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import 'task_screen.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String? loadedDeviceId;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    if (!state.connected) return const Center(child: Text('绑定电脑后可以查看会话记录'));
    if (loadedDeviceId != state.device?.id) {
      loadedDeviceId = state.device?.id;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => ref.read(mobileControllerProvider.notifier).loadHistory(),
      );
    }
    if (state.history.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.forum_outlined, size: 56),
            const SizedBox(height: 12),
            const Text('还没有项目能力或 Agent 会话记录'),
            TextButton.icon(
              onPressed: () =>
                  ref.read(mobileControllerProvider.notifier).loadHistory(),
              icon: const Icon(Icons.refresh),
              label: const Text('刷新'),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: ref.read(mobileControllerProvider.notifier).loadHistory,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: state.history.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final task = state.history[index];
          return Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: _statusColor(
                  task.status,
                ).withValues(alpha: 0.18),
                child: Icon(
                  task.kind == 'chat'
                      ? Icons.chat_bubble_outline
                      : Icons.account_tree,
                  color: _statusColor(task.status),
                ),
              ),
              title: Text(
                task.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${task.projectName} · ${_date(task.createdAt)} · ${_statusText(task.status)}',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                await ref
                    .read(mobileControllerProvider.notifier)
                    .openTask(task.id);
                if (context.mounted) {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const TaskScreen()),
                  );
                }
              },
            ),
          );
        },
      ),
    );
  }

  Color _statusColor(String status) => switch (status) {
    'SUCCESS' => Colors.green,
    'FAILED' => Colors.red,
    'CANCELLED' => Colors.grey,
    'RUNNING' => Colors.blue,
    _ => Colors.orange,
  };

  String _statusText(String status) => switch (status) {
    'SUCCESS' => '已完成',
    'FAILED' => '失败',
    'CANCELLED' => '已取消',
    'RUNNING' => '执行中',
    _ => '排队中',
  };

  String _date(DateTime value) =>
      '${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')} ${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
