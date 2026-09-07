import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import '../models.dart';
import 'connection_screen.dart';
import 'task_screen.dart';

class ProjectScreen extends ConsumerStatefulWidget {
  const ProjectScreen({super.key});

  @override
  ConsumerState<ProjectScreen> createState() => _ProjectScreenState();
}

class _ProjectScreenState extends ConsumerState<ProjectScreen> {
  final rootController = TextEditingController();
  final promptController = TextEditingController();

  @override
  void dispose() {
    rootController.dispose();
    promptController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    final controller = ref.read(mobileControllerProvider.notifier);
    if (!state.connected) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.computer_outlined, size: 64),
              const SizedBox(height: 16),
              const Text('请先绑定运行 Gateway 的电脑'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ConnectionScreen(),
                  ),
                ),
                child: const Text('绑定电脑'),
              ),
            ],
          ),
        ),
      );
    }
    final taskActive = state.task != null && !state.task!.isDone;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (state.project == null)
            _ProjectSetup(
              controller: rootController,
              busy: state.busy,
              onAnalyze: controller.analyze,
            )
          else ...[
            _ProjectHeader(project: state.project!),
            const SizedBox(height: 20),
            Text('项目能力', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            _CapabilityGrid(
              capabilities: state.capabilities,
              enabled: !state.busy && !taskActive,
              onRun: (capability) =>
                  _confirmAndRun(context, capability, controller),
            ),
            if (taskActive) ...[
              const SizedBox(height: 10),
              const Text('当前任务完成或取消后才能再次提交，避免产生重复队列。'),
            ],
            const SizedBox(height: 24),
            Text('自然语言 Agent', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            TextField(
              controller: promptController,
              minLines: 3,
              maxLines: 7,
              decoration: const InputDecoration(
                hintText: '例如：帮我优化登录模块，并说明每一处修改',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: state.busy || taskActive
                  ? null
                  : () async {
                      final task = await controller.sendPrompt(
                        promptController.text,
                      );
                      if (task == null || !context.mounted) return;
                      promptController.clear();
                      await Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const TaskScreen(),
                        ),
                      );
                    },
              icon: const Icon(Icons.arrow_upward),
              label: const Text('发送给 Pi-Agent'),
            ),
          ],
          if (state.error != null) ...[
            const SizedBox(height: 16),
            Text(
              state.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmAndRun(
    BuildContext context,
    Capability capability,
    MobileController controller,
  ) async {
    if (capability.destructive) {
      final approved = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('运行“${capability.title}”？'),
          content: const Text('该工作流可以修改项目文件并运行命令。请先确认仓库已提交或有可恢复备份。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('继续'),
            ),
          ],
        ),
      );
      if (approved != true) return;
    }
    final task = await controller.runWorkflow(capability);
    if (task != null && context.mounted) {
      await Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => const TaskScreen()));
    }
  }
}

class _ProjectSetup extends StatelessWidget {
  const _ProjectSetup({
    required this.controller,
    required this.busy,
    required this.onAnalyze,
  });

  final TextEditingController controller;
  final bool busy;
  final Future<void> Function(String root) onAnalyze;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(
            Icons.account_tree_outlined,
            size: 48,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 14),
          Text(
            '选择电脑上的项目',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            '可在“文件”页面浏览电脑目录，也可以在这里输入白名单内的绝对路径。',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          TextField(
            controller: controller,
            decoration: const InputDecoration(
              labelText: '电脑项目路径',
              hintText: r'D:\code\my-project',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : () => onAnalyze(controller.text),
            child: busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('初步分析'),
          ),
        ],
      ),
    ),
  );
}

class _ProjectHeader extends StatelessWidget {
  const _ProjectHeader({required this.project});

  final ProjectProfile project;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.folder_open),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  project.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(project.root, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 12),
          Text(project.displaySummary),
          if (project.featureHighlights.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('功能特点', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            for (final feature in project.featureHighlights.take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 7),
                      child: Icon(Icons.circle, size: 6),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(feature)),
                  ],
                ),
              ),
          ],
          if (project.alerts.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final alert in project.alerts) _ProjectAlertRow(alert: alert),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ...project.languages,
              ...project.frameworks,
            ].map((label) => Chip(label: Text(label))).toList(),
          ),
        ],
      ),
    ),
  );
}

class _ProjectAlertRow extends StatelessWidget {
  const _ProjectAlertRow({required this.alert});

  final ProjectAlert alert;

  @override
  Widget build(BuildContext context) {
    final critical = alert.severity == 'critical';
    final color = critical
        ? Theme.of(context).colorScheme.error
        : Colors.orange;
    final label = alert.kind == 'security' ? '安全隐患' : '重要 Bug';
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border(left: BorderSide(color: color, width: 3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label：',
              style: TextStyle(color: color, fontWeight: FontWeight.w700),
            ),
            TextSpan(text: alert.text),
          ],
        ),
      ),
    );
  }
}

class _CapabilityGrid extends StatelessWidget {
  const _CapabilityGrid({
    required this.capabilities,
    required this.enabled,
    required this.onRun,
  });

  final List<Capability> capabilities;
  final bool enabled;
  final ValueChanged<Capability> onRun;

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.02,
    ),
    itemCount: capabilities.length,
    itemBuilder: (context, index) {
      final capability = capabilities[index];
      return Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? () => onRun(capability) : null,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(_iconFor(capability.category)),
                const Spacer(),
                Text(
                  capability.title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 5),
                Text(
                  capability.description,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      );
    },
  );

  IconData _iconFor(String category) => switch (category) {
    'security' => Icons.security,
    'testing' => Icons.science_outlined,
    'refactor' => Icons.auto_fix_high,
    'quality' => Icons.bug_report_outlined,
    _ => Icons.manage_search,
  };
}
