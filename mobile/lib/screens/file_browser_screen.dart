import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../app_state.dart';
import '../models.dart';

class FileBrowserScreen extends StatelessWidget {
  const FileBrowserScreen({super.key});

  @override
  Widget build(BuildContext context) => const DefaultTabController(
    length: 2,
    child: Column(
      children: [
        TabBar(
          tabs: [
            Tab(icon: Icon(Icons.computer), text: '电脑文件'),
            Tab(icon: Icon(Icons.smartphone), text: '手机文件'),
          ],
        ),
        Expanded(child: TabBarView(children: [_RemoteFiles(), _LocalFiles()])),
      ],
    ),
  );
}

class _RemoteFiles extends ConsumerStatefulWidget {
  const _RemoteFiles();

  @override
  ConsumerState<_RemoteFiles> createState() => _RemoteFilesState();
}

class _RemoteFilesState extends ConsumerState<_RemoteFiles> {
  RemoteDirectory? directory;
  bool loading = false;
  String? error;
  String? loadedDeviceId;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    if (!state.connected) return const Center(child: Text('绑定电脑后可以浏览远程目录'));
    if (loadedDeviceId != state.device?.id && !loading) {
      loadedDeviceId = state.device?.id;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surfaceContainer,
          child: Row(
            children: [
              IconButton(
                tooltip: '上一级',
                onPressed: loading || directory == null
                    ? null
                    : () => _load(directory!.parent),
                icon: const Icon(Icons.arrow_upward),
              ),
              Expanded(
                child: Text(
                  directory?.path ?? '电脑授权目录',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (directory?.path != null)
                IconButton(
                  tooltip: '作为项目分析',
                  onPressed: loading
                      ? null
                      : () async {
                          await ref
                              .read(mobileControllerProvider.notifier)
                              .analyze(directory!.path!);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('项目已载入，请切换到“项目”页面')),
                            );
                          }
                        },
                  icon: const Icon(Icons.analytics_outlined),
                ),
              IconButton(
                tooltip: '刷新',
                onPressed: loading ? null : () => _load(directory?.path),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (loading) const LinearProgressIndicator(),
        if (error != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        Expanded(
          child: ListView.builder(
            itemCount: directory?.entries.length ?? 0,
            itemBuilder: (context, index) {
              final entry = directory!.entries[index];
              return ListTile(
                leading: Icon(
                  entry.isDirectory ? Icons.folder : Icons.description_outlined,
                ),
                title: Text(
                  entry.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: entry.isDirectory ? null : Text(_size(entry.size)),
                trailing: entry.isDirectory
                    ? const Icon(Icons.chevron_right)
                    : null,
                onTap: () =>
                    entry.isDirectory ? _load(entry.path) : _preview(entry),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _load([String? path]) async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await ref
          .read(mobileControllerProvider.notifier)
          .listRemoteFiles(path);
      if (mounted) setState(() => directory = result);
    } catch (exception) {
      if (mounted) setState(() => error = '$exception');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _preview(RemoteFileEntry entry) async {
    try {
      final RemoteFileContent file = await ref
          .read(mobileControllerProvider.notifier)
          .previewRemoteFile(entry.path);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(entry.name),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: SelectableText(
                '${file.content}${file.truncated ? '\n\n[仅显示前 512 KiB]' : ''}',
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('关闭'),
            ),
          ],
        ),
      );
    } catch (exception) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$exception')));
      }
    }
  }

  String _size(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KiB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MiB';
  }
}

class _LocalFiles extends StatefulWidget {
  const _LocalFiles();

  @override
  State<_LocalFiles> createState() => _LocalFilesState();
}

class _LocalFilesState extends State<_LocalFiles> {
  List<PlatformFile> files = const [];
  String? directory;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Card(
        child: ListTile(
          leading: Icon(Icons.security_outlined),
          title: Text('手机本地文件'),
          subtitle: Text('通过 Android 系统文件管理器选择；App 只访问你明确授权的文件或文件夹。'),
        ),
      ),
      const SizedBox(height: 12),
      FilledButton.icon(
        onPressed: () async {
          final selected = await FilePicker.pickFiles();
          if (mounted) setState(() => files = selected);
        },
        icon: const Icon(Icons.file_open),
        label: const Text('浏览并选择手机文件'),
      ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: () async {
          final selected = await FilePicker.getDirectoryPath();
          if (mounted && selected != null) setState(() => directory = selected);
        },
        icon: const Icon(Icons.create_new_folder_outlined),
        label: const Text('选择手机文件夹'),
      ),
      if (directory != null) ...[
        const SizedBox(height: 16),
        ListTile(
          leading: const Icon(Icons.folder),
          title: Text(directory!),
          subtitle: const Text('已授权的手机文件夹'),
        ),
      ],
      if (files.isNotEmpty) ...[
        const SizedBox(height: 16),
        Text('最近选择', style: Theme.of(context).textTheme.titleMedium),
        ...files.map(
          (file) => ListTile(
            leading: const Icon(Icons.insert_drive_file_outlined),
            title: Text(file.name),
            subtitle: Text(file.path ?? 'Android 安全文档'),
          ),
        ),
      ],
    ],
  );
}
