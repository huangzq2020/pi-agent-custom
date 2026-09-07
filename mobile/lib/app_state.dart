import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'connection_store.dart';
import 'models.dart';

const defaultGatewayUrl = String.fromEnvironment(
  'GATEWAY_URL',
  defaultValue: 'http://10.0.2.2:8787',
);
const defaultGatewayToken = String.fromEnvironment('GATEWAY_TOKEN');

final mobileControllerProvider =
    NotifierProvider<MobileController, MobileState>(MobileController.new);

class GatewaySettings {
  const GatewaySettings({required this.url, required this.token});

  final String url;
  final String token;
}

class MobileState {
  const MobileState({
    required this.settings,
    this.device,
    this.connected = false,
    this.connecting = false,
    this.project,
    this.capabilities = const [],
    this.task,
    this.history = const [],
    this.liveText = '',
    this.busy = false,
    this.error,
  });

  final GatewaySettings settings;
  final GatewayDevice? device;
  final bool connected;
  final bool connecting;
  final ProjectProfile? project;
  final List<Capability> capabilities;
  final TaskSnapshot? task;
  final List<TaskSnapshot> history;
  final String liveText;
  final bool busy;
  final String? error;

  MobileState copyWith({
    GatewaySettings? settings,
    GatewayDevice? device,
    bool? connected,
    bool? connecting,
    ProjectProfile? project,
    List<Capability>? capabilities,
    TaskSnapshot? task,
    List<TaskSnapshot>? history,
    String? liveText,
    bool? busy,
    String? error,
    bool clearError = false,
    bool clearProject = false,
  }) => MobileState(
    settings: settings ?? this.settings,
    device: device ?? this.device,
    connected: connected ?? this.connected,
    connecting: connecting ?? this.connecting,
    project: clearProject ? null : project ?? this.project,
    capabilities: clearProject ? const [] : capabilities ?? this.capabilities,
    task: task ?? this.task,
    history: history ?? this.history,
    liveText: liveText ?? this.liveText,
    busy: busy ?? this.busy,
    error: clearError ? null : error ?? this.error,
  );
}

class MobileController extends Notifier<MobileState> {
  final ConnectionStore _connectionStore = ConnectionStore();
  StreamSubscription<Map<String, Object?>>? _events;
  Timer? _poller;
  late MobileApiClient _api;

  @override
  MobileState build() {
    const settings = GatewaySettings(
      url: defaultGatewayUrl,
      token: defaultGatewayToken,
    );
    _api = MobileApiClient(baseUrl: settings.url, token: settings.token);
    ref.onDispose(() {
      _events?.cancel();
      _poller?.cancel();
      _api.close();
    });
    scheduleMicrotask(_initialize);
    return const MobileState(settings: settings, connecting: true);
  }

  Future<void> _initialize() async {
    GatewaySettings settings = state.settings;
    try {
      final stored = await _connectionStore.read();
      if (stored != null) {
        settings = GatewaySettings(url: stored.url, token: stored.token);
      }
    } catch (_) {
      // Platform storage is unavailable in widget tests; startup parameters remain valid.
    }
    await connect(settings.url, settings.token, persist: false);
  }

  Future<bool> connect(String url, String token, {bool persist = true}) async {
    final normalized = url.trim().replaceFirst(RegExp(r'/+$'), '');
    if (!normalized.startsWith('http://') &&
        !normalized.startsWith('https://')) {
      state = state.copyWith(
        connecting: false,
        connected: false,
        error: 'Gateway 地址必须以 http:// 或 https:// 开头',
      );
      return false;
    }
    state = state.copyWith(connecting: true, clearError: true);
    final candidate = MobileApiClient(baseUrl: normalized, token: token.trim());
    try {
      final device = await candidate.getDevice().timeout(
        const Duration(seconds: 8),
      );
      _api.close();
      _api = candidate;
      final settings = GatewaySettings(url: normalized, token: token.trim());
      state = state.copyWith(
        settings: settings,
        device: device,
        connected: true,
        connecting: false,
        clearProject: true,
        clearError: true,
      );
      if (persist) {
        await _connectionStore.write(
          StoredConnection(url: normalized, token: token.trim()),
        );
      }
      await loadHistory();
      return true;
    } catch (error) {
      candidate.close();
      state = state.copyWith(
        connecting: false,
        connected: false,
        error: '连接失败：$error',
      );
      return false;
    }
  }

  Future<void> analyze(String root) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      _applyAnalysis(await _api.analyzeProject(root));
    } catch (error) {
      state = state.copyWith(busy: false, error: '$error');
    }
  }

  Future<ProjectProfile?> cloneRepository(
    GitHubRepository repository,
    String targetRoot,
  ) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final analysis = await _api.cloneRepository(
        repository.cloneUrl,
        targetRoot,
      );
      _applyAnalysis(analysis);
      return analysis.project;
    } catch (error) {
      state = state.copyWith(busy: false, error: '$error');
      return null;
    }
  }

  Future<TaskSnapshot?> runWorkflow(Capability capability) async {
    final project = state.project;
    if (project == null) return null;
    return _start(
      () => _api.createWorkflowTask(project.id, capability.workflowId),
    );
  }

  Future<TaskSnapshot?> sendPrompt(String prompt) async {
    final project = state.project;
    if (project == null || prompt.trim().isEmpty) return null;
    return _start(() => _api.createChatTask(project.id, prompt.trim()));
  }

  Future<void> openTask(String taskId) async {
    await _events?.cancel();
    _poller?.cancel();
    state = state.copyWith(
      task: await _api.getTask(taskId),
      liveText: '',
      clearError: true,
    );
    if (!state.task!.isDone) _subscribe(state.task!);
  }

  Future<void> cancelTask() async {
    final task = state.task;
    if (task == null || task.isDone) return;
    try {
      state = state.copyWith(task: await _api.cancelTask(task.id));
      await loadHistory();
    } catch (error) {
      state = state.copyWith(error: '$error');
    }
  }

  Future<void> loadHistory() async {
    if (!state.connected) return;
    try {
      state = state.copyWith(history: await _api.listTasks());
    } catch (error) {
      state = state.copyWith(error: '$error');
    }
  }

  Future<RemoteDirectory> listRemoteFiles([String? path]) =>
      _api.listRemoteFiles(path);

  Future<RemoteFileContent> previewRemoteFile(String path) =>
      _api.previewRemoteFile(path);

  Future<List<GitHubRepository>> searchGitHub(String query) =>
      _api.searchGitHub(query);

  void _applyAnalysis(AnalysisResult analysis) {
    state = state.copyWith(
      project: analysis.project,
      capabilities: analysis.capabilities,
      busy: false,
      clearError: true,
    );
  }

  Future<TaskSnapshot?> _start(Future<TaskSnapshot> Function() create) async {
    await _events?.cancel();
    _poller?.cancel();
    state = state.copyWith(busy: true, liveText: '', clearError: true);
    try {
      final task = await create();
      state = state.copyWith(task: task, busy: false);
      _subscribe(task);
      await loadHistory();
      return task;
    } catch (error) {
      state = state.copyWith(busy: false, error: '$error');
      return null;
    }
  }

  void _subscribe(TaskSnapshot task) {
    _events = _api
        .taskEvents(task.id)
        .listen(
          _onEvent,
          onError: (_) => _startPolling(task.id),
          onDone: () => _startPolling(task.id),
        );
    _startPolling(task.id);
  }

  void _startPolling(String taskId) {
    _poller?.cancel();
    _poller = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _refresh(taskId),
    );
  }

  void _onEvent(Map<String, Object?> event) {
    final type = event['type']! as String;
    final data = event['data']! as Map<String, Object?>;
    if (type == 'agent_delta') {
      state = state.copyWith(
        liveText: '${state.liveText}${data['text']! as String}',
      );
    } else if (type == 'status') {
      final task = TaskSnapshot.fromJson(
        data['snapshot']! as Map<String, Object?>,
      );
      state = state.copyWith(task: task);
      if (task.isDone) {
        _poller?.cancel();
        unawaited(_refreshProject(task.projectId));
        loadHistory();
      }
    } else if (type == 'progress' || type == 'result' || type == 'error') {
      final task = state.task;
      if (task != null) _refresh(task.id);
    }
  }

  Future<void> _refresh(String taskId) async {
    try {
      final task = await _api.getTask(taskId);
      state = state.copyWith(task: task);
      if (task.isDone) {
        _poller?.cancel();
        await _refreshProject(task.projectId);
        await loadHistory();
      }
    } catch (error) {
      state = state.copyWith(error: '$error');
    }
  }

  Future<void> _refreshProject(String projectId) async {
    if (state.project?.id != projectId) return;
    try {
      state = state.copyWith(project: await _api.getProject(projectId));
    } catch (error) {
      state = state.copyWith(error: '$error');
    }
  }
}
