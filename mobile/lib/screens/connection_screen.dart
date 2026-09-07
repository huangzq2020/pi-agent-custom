import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';

class ConnectionScreen extends ConsumerStatefulWidget {
  const ConnectionScreen({super.key});

  @override
  ConsumerState<ConnectionScreen> createState() => _ConnectionScreenState();
}

class _ConnectionScreenState extends ConsumerState<ConnectionScreen> {
  late final TextEditingController urlController;
  late final TextEditingController tokenController;

  @override
  void initState() {
    super.initState();
    final settings = ref.read(mobileControllerProvider).settings;
    urlController = TextEditingController(text: settings.url);
    tokenController = TextEditingController(text: settings.token);
  }

  @override
  void dispose() {
    urlController.dispose();
    tokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('绑定电脑')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: urlController,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Gateway 地址',
              hintText: 'http://192.168.1.10:8787',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: tokenController,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: '绑定令牌',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: state.connecting
                ? null
                : () async {
                    final connected = await ref
                        .read(mobileControllerProvider.notifier)
                        .connect(urlController.text, tokenController.text);
                    if (connected && context.mounted) Navigator.pop(context);
                  },
            icon: const Icon(Icons.link),
            label: Text(state.connecting ? '正在验证' : '验证并绑定'),
          ),
          if (state.device != null && state.connected) ...[
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.device!.name,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${state.device!.platform} · Gateway ${state.device!.version}',
                    ),
                    const SizedBox(height: 12),
                    const Text('允许访问的电脑目录'),
                    ...state.device!.roots.map(
                      (root) => ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.folder_outlined),
                        title: Text(root),
                      ),
                    ),
                  ],
                ),
              ),
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
}
