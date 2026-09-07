import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app_state.dart';
import 'connection_screen.dart';
import 'file_browser_screen.dart';
import 'github_screen.dart';
import 'history_screen.dart';
import 'project_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int index = 0;

  static const pages = [
    ProjectScreen(),
    FileBrowserScreen(),
    GitHubScreen(),
    HistoryScreen(),
  ];
  static const titles = ['项目', '文件', 'GitHub', '记录'];

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(mobileControllerProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(index == 0 ? 'Pi-Agent Mobile OS' : titles[index]),
        actions: [
          TextButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const ConnectionScreen()),
            ),
            icon: Icon(
              Icons.circle,
              size: 10,
              color: state.connected ? Colors.greenAccent : Colors.redAccent,
            ),
            label: Text(
              state.device?.name ?? (state.connecting ? '连接中' : '绑定电脑'),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: '项目',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder),
            label: '文件',
          ),
          NavigationDestination(
            icon: Icon(Icons.travel_explore),
            label: 'GitHub',
          ),
          NavigationDestination(icon: Icon(Icons.history), label: '记录'),
        ],
      ),
    );
  }
}
