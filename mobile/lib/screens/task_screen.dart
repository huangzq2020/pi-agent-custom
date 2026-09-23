import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import '../models.dart';
import '../widgets/change_graph_view.dart';
import '../widgets/task_result_view.dart';

class TaskScreen extends ConsumerStatefulWidget {
  const TaskScreen({super.key});

  @override
  ConsumerState<TaskScreen> createState() => _TaskScreenState();
}

class _TaskScreenState extends ConsumerState<TaskScreen> {
  final _composer = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _composer.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    final task = state.task;
    if (task == null) {
      return const Scaffold(body: Center(child: Text('任务不存在')));
    }
    if (task.kind == 'chat') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_scrollController.hasClients) return;
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      });
    }
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
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _TaskStatus(task: task),
          if (task.kind == 'chat')
            ..._conversation(task, state.liveText)
          else
            ..._workflow(context, task, state.liveText),
          if (task.error != null) ...[
            const SizedBox(height: 16),
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
        ],
      ),
      bottomNavigationBar: task.kind == 'chat'
          ? _Composer(
              controller: _composer,
              enabled: task.isDone && !state.busy,
              onSend: _sendFollowUp,
            )
          : null,
    );
  }

  List<Widget> _conversation(TaskSnapshot task, String liveText) {
    if (task.messages.isEmpty) {
      return [
        if (task.prompt != null) ...[
          const SizedBox(height: 16),
          _MessageBubble(role: 'user', text: task.prompt!),
        ],
        if (liveText.isNotEmpty) ...[
          const SizedBox(height: 12),
          _MessageBubble(role: 'assistant', text: liveText),
        ] else if (task.result != null) ...[
          const SizedBox(height: 20),
          TaskResultView(result: task.result!),
        ],
      ];
    }
    return [
      const SizedBox(height: 16),
      for (final message in task.messages) ...[
        _MessageBubble(role: message.role, text: message.text),
        const SizedBox(height: 12),
      ],
      if (liveText.isNotEmpty)
        _MessageBubble(role: 'assistant', text: liveText, streaming: true),
    ];
  }

  List<Widget> _workflow(
    BuildContext context,
    TaskSnapshot task,
    String liveText,
  ) => [
    if (task.prompt != null) ...[
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(task.prompt!),
        ),
      ),
    ],
    if (liveText.isNotEmpty && (!task.isDone || task.result == null)) ...[
      const SizedBox(height: 20),
      Text('实时输出', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      SelectableText(liveText),
    ],
    if (task.result != null) ...[
      const SizedBox(height: 20),
      TaskResultView(result: task.result!),
    ],
  ];

  Future<void> _sendFollowUp() async {
    final prompt = _composer.text.trim();
    if (prompt.isEmpty) return;
    final task = await ref
        .read(mobileControllerProvider.notifier)
        .sendFollowUp(prompt);
    if (task != null) _composer.clear();
  }
}

class _TaskStatus extends StatelessWidget {
  const _TaskStatus({required this.task});

  final TaskSnapshot task;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          _StatusBadge(status: task.status),
          const SizedBox(width: 12),
          Expanded(child: Text(task.currentStep ?? _statusText(task.status))),
          Text('${(task.progress * 100).round()}%'),
        ],
      ),
      const SizedBox(height: 10),
      LinearProgressIndicator(value: task.isDone ? 1 : task.progress),
    ],
  );

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

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.role,
    required this.text,
    this.streaming = false,
  });

  final String role;
  final String text;
  final bool streaming;

  @override
  Widget build(BuildContext context) {
    final user = role == 'user';
    final colors = Theme.of(context).colorScheme;
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 680),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: user ? colors.primaryContainer : colors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!user && streaming) ...[
              Text('正在回复', style: Theme.of(context).textTheme.labelSmall),
              const SizedBox(height: 6),
            ],
            if (user) SelectableText(text) else AgentMarkdownView(source: text),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.enabled,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool enabled;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Material(
      elevation: 8,
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                enabled: enabled,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.newline,
                decoration: InputDecoration(
                  hintText: enabled ? '继续提问…' : '等待当前回复完成',
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: '发送',
              onPressed: enabled ? onSend : null,
              icon: const Icon(Icons.send),
            ),
          ],
        ),
      ),
    ),
  );
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
