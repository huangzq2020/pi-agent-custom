import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import '../models.dart';

class GitHubScreen extends ConsumerStatefulWidget {
  const GitHubScreen({super.key});

  @override
  ConsumerState<GitHubScreen> createState() => _GitHubScreenState();
}

class _GitHubScreenState extends ConsumerState<GitHubScreen> {
  final queryController = TextEditingController();
  List<GitHubRepository> repositories = const [];
  bool searching = false;
  bool cloning = false;
  String? targetRoot;
  String? error;

  @override
  void dispose() {
    queryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    final roots = state.device?.roots ?? const <String>[];
    if (!state.connected) {
      return const Center(child: Text('绑定电脑后可以搜索并克隆 GitHub 项目'));
    }
    targetRoot ??= roots.isEmpty ? null : roots.first;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              TextField(
                controller: queryController,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  labelText: '搜索 GitHub 仓库',
                  hintText: '例如：flutter agent',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    onPressed: searching ? null : _search,
                    icon: const Icon(Icons.search),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: targetRoot,
                decoration: const InputDecoration(
                  labelText: '克隆到电脑目录',
                  border: OutlineInputBorder(),
                ),
                items: roots
                    .map(
                      (root) => DropdownMenuItem(
                        value: root,
                        child: Text(root, overflow: TextOverflow.ellipsis),
                      ),
                    )
                    .toList(),
                onChanged: cloning
                    ? null
                    : (value) => setState(() => targetRoot = value),
              ),
              if (searching || cloning) ...[
                const SizedBox(height: 10),
                LinearProgressIndicator(),
                const SizedBox(height: 4),
                Text(cloning ? '正在电脑上执行 git clone…' : '正在搜索 GitHub…'),
              ],
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            itemCount: repositories.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final repository = repositories[index];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        repository.fullName,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if (repository.description != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          repository.description!,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          Chip(
                            avatar: const Icon(Icons.star_outline, size: 16),
                            label: Text('${repository.stars}'),
                          ),
                          if (repository.language != null)
                            Chip(label: Text(repository.language!)),
                        ],
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.tonalIcon(
                          onPressed: cloning || targetRoot == null
                              ? null
                              : () => _clone(repository),
                          icon: const Icon(Icons.download),
                          label: const Text('克隆到电脑'),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _search() async {
    if (queryController.text.trim().isEmpty) return;
    setState(() {
      searching = true;
      error = null;
    });
    try {
      final result = await ref
          .read(mobileControllerProvider.notifier)
          .searchGitHub(queryController.text.trim());
      if (mounted) setState(() => repositories = result);
    } catch (exception) {
      if (mounted) setState(() => error = '$exception');
    } finally {
      if (mounted) setState(() => searching = false);
    }
  }

  Future<void> _clone(GitHubRepository repository) async {
    setState(() {
      cloning = true;
      error = null;
    });
    final project = await ref
        .read(mobileControllerProvider.notifier)
        .cloneRepository(repository, targetRoot!);
    if (!mounted) return;
    setState(() => cloning = false);
    if (project == null) {
      setState(() => error = ref.read(mobileControllerProvider).error);
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${project.name} 已克隆并完成初步分析，请切换到“项目”页面')),
    );
  }
}
