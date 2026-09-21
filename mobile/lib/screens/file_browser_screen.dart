import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';

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

class RemoteDirectoryPickerScreen extends StatelessWidget {
  const RemoteDirectoryPickerScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('选择电脑项目目录')),
    body: _RemoteFiles(
      onDirectorySelected: (path) => Navigator.of(context).pop(path),
    ),
  );
}

class _RemoteFiles extends ConsumerStatefulWidget {
  const _RemoteFiles({this.onDirectorySelected});

  final ValueChanged<String>? onDirectorySelected;

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
          child: Column(
            children: [
              Row(
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
                  IconButton(
                    tooltip: '刷新',
                    onPressed: loading ? null : () => _load(directory?.path),
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              if (directory?.path != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: loading
                        ? null
                        : () => _selectAsProject(directory!.path!),
                    icon: const Icon(Icons.drive_file_move_outline),
                    label: Text(
                      widget.onDirectorySelected == null
                          ? '将当前目录设为项目'
                          : '选择当前目录',
                    ),
                  ),
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
                onLongPress: loading ? null : () => _showEntryActions(entry),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _selectAsProject(String path) async {
    final callback = widget.onDirectorySelected;
    if (callback != null) {
      callback(path);
      return;
    }
    await ref.read(mobileControllerProvider.notifier).analyze(path);
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('项目已载入，请切换到“项目”页面')));
    }
  }

  Future<void> _showEntryActions(RemoteFileEntry entry) async {
    final roots = ref.read(mobileControllerProvider).device?.roots ?? const [];
    final isRoot = roots.contains(entry.path);
    final action = await showModalBottomSheet<_RemoteFileAction>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.copy),
              title: const Text('复制路径'),
              onTap: () => Navigator.pop(context, _RemoteFileAction.copyPath),
            ),
            if (entry.isDirectory)
              ListTile(
                leading: const Icon(Icons.create_new_folder_outlined),
                title: const Text('在此文件夹中新建文件夹'),
                onTap: () =>
                    Navigator.pop(context, _RemoteFileAction.createDirectory),
              ),
            if (entry.isDirectory)
              ListTile(
                leading: const Icon(Icons.drive_file_move_outline),
                title: Text(
                  widget.onDirectorySelected == null ? '设为项目目录' : '选择此目录',
                ),
                onTap: () =>
                    Navigator.pop(context, _RemoteFileAction.selectProject),
              ),
            if (!isRoot)
              ListTile(
                leading: const Icon(Icons.drive_file_rename_outline),
                title: const Text('重命名'),
                onTap: () => Navigator.pop(context, _RemoteFileAction.rename),
              ),
            if (entry.isDirectory && !isRoot)
              ListTile(
                leading: Icon(
                  Icons.delete_outline,
                  color: Theme.of(context).colorScheme.error,
                ),
                title: Text(
                  '删除文件夹',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                onTap: () =>
                    Navigator.pop(context, _RemoteFileAction.deleteDirectory),
              ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;

    switch (action) {
      case _RemoteFileAction.copyPath:
        await Clipboard.setData(ClipboardData(text: entry.path));
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('路径已复制')));
        }
        return;
      case _RemoteFileAction.createDirectory:
        await _createDirectory(entry.path);
        return;
      case _RemoteFileAction.selectProject:
        await _selectAsProject(entry.path);
        return;
      case _RemoteFileAction.rename:
        await _rename(entry);
        return;
      case _RemoteFileAction.deleteDirectory:
        await _deleteDirectory(entry);
        return;
    }
  }

  Future<void> _createDirectory(String parent) async {
    final name = await _askForName(title: '创建文件夹', label: '文件夹名称');
    if (name == null) return;
    try {
      await ref
          .read(mobileControllerProvider.notifier)
          .createRemoteDirectory(parent, name);
      await _load(parent);
    } catch (exception) {
      _showError(exception);
    }
  }

  Future<void> _rename(RemoteFileEntry entry) async {
    final name = await _askForName(
      title: '重命名',
      label: '新名称',
      initialValue: entry.name,
    );
    if (name == null || name == entry.name) return;
    try {
      await ref
          .read(mobileControllerProvider.notifier)
          .renameRemoteEntry(entry.path, name);
      await _load(directory?.path);
    } catch (exception) {
      _showError(exception);
    }
  }

  Future<void> _deleteDirectory(RemoteFileEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('删除“${entry.name}”？'),
        content: const Text('该文件夹及其全部内容将被永久删除。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref
          .read(mobileControllerProvider.notifier)
          .deleteRemoteDirectory(entry.path);
      await _load(directory?.path);
    } catch (exception) {
      _showError(exception);
    }
  }

  Future<String?> _askForName({
    required String title,
    required String label,
    String initialValue = '',
  }) async {
    final controller = TextEditingController(text: initialValue);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: label),
          onSubmitted: (value) {
            if (value.trim().isNotEmpty) Navigator.pop(context, value.trim());
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.isNotEmpty) Navigator.pop(context, value);
            },
            child: const Text('确定'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  void _showError(Object exception) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$exception')));
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

enum _RemoteFileAction {
  copyPath,
  createDirectory,
  selectProject,
  rename,
  deleteDirectory,
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
