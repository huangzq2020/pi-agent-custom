import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'models.dart';

class AnalysisResult {
  const AnalysisResult({required this.project, required this.capabilities});

  final ProjectProfile project;
  final List<Capability> capabilities;
}

class RemoteFileContent {
  const RemoteFileContent({
    required this.path,
    required this.content,
    required this.truncated,
  });

  final String path;
  final String content;
  final bool truncated;
}

class MobileApiClient {
  MobileApiClient({required String baseUrl, this.token})
    : baseUrl = baseUrl,
      _baseUri = Uri.parse(baseUrl),
      _http = http.Client();

  final String baseUrl;
  final Uri _baseUri;
  final String? token;
  final http.Client _http;

  Future<GatewayDevice> getDevice() async {
    final body = await _request('GET', '/v1/device');
    return GatewayDevice.fromJson(body['device']! as Map<String, Object?>);
  }

  Future<AnalysisResult> analyzeProject(String root) async {
    final body = await _request('POST', '/v1/projects/analyze', {'root': root});
    return _analysis(body);
  }

  Future<ProjectProfile> getProject(String projectId) async {
    final body = await _request('GET', '/v1/projects/$projectId');
    return ProjectProfile.fromJson(body['project']! as Map<String, Object?>);
  }

  Future<AnalysisResult> cloneRepository(
    String cloneUrl,
    String targetRoot,
  ) async {
    final body = await _request('POST', '/v1/github/clone', {
      'cloneUrl': cloneUrl,
      'targetRoot': targetRoot,
    });
    return _analysis(body);
  }

  Future<List<GitHubRepository>> searchGitHub(String query) async {
    final body = await _request('GET', '/v1/github/search', null, {'q': query});
    return objectList(
      body['repositories'],
    ).map(GitHubRepository.fromJson).toList();
  }

  Future<RemoteDirectory> listRemoteFiles([String? path]) async {
    final body = await _request(
      'GET',
      '/v1/files',
      null,
      path == null ? null : {'path': path},
    );
    return RemoteDirectory.fromJson(body);
  }

  Future<RemoteFileContent> previewRemoteFile(String path) async {
    final body = await _request('GET', '/v1/files/content', null, {
      'path': path,
    });
    return RemoteFileContent(
      path: body['path']! as String,
      content: body['content']! as String,
      truncated: body['truncated']! as bool,
    );
  }

  Future<List<TaskSnapshot>> listTasks() async {
    final body = await _request('GET', '/v1/tasks');
    return objectList(body['tasks']).map(TaskSnapshot.fromJson).toList();
  }

  Future<TaskSnapshot> createWorkflowTask(
    String projectId,
    String workflowId,
  ) => _createTask({
    'projectId': projectId,
    'kind': 'workflow',
    'workflowId': workflowId,
  });

  Future<TaskSnapshot> createChatTask(String projectId, String prompt) =>
      _createTask({'projectId': projectId, 'kind': 'chat', 'prompt': prompt});

  Future<TaskSnapshot> getTask(String taskId) async {
    final body = await _request('GET', '/v1/tasks/$taskId');
    return TaskSnapshot.fromJson(body['task']! as Map<String, Object?>);
  }

  Future<TaskSnapshot> cancelTask(String taskId) async {
    final body = await _request('POST', '/v1/tasks/$taskId/cancel');
    return TaskSnapshot.fromJson(body['task']! as Map<String, Object?>);
  }

  Stream<Map<String, Object?>> taskEvents(String taskId, {int after = 0}) {
    final query = <String, String>{'after': '$after'};
    if (token != null && token!.isNotEmpty) query['token'] = token!;
    final websocketUri = _baseUri.replace(
      scheme: _baseUri.scheme == 'https' ? 'wss' : 'ws',
      path: '/v1/tasks/$taskId/events',
      queryParameters: query,
    );
    final channel = WebSocketChannel.connect(websocketUri);
    return channel.stream
        .map((message) {
          final decoded = jsonDecode(message as String);
          if (decoded is! Map<String, Object?>) {
            throw const FormatException('Invalid task event');
          }
          return decoded;
        })
        .transform(
          StreamTransformer.fromHandlers(
            handleDone: (sink) {
              channel.sink.close();
              sink.close();
            },
          ),
        );
  }

  void close() => _http.close();

  AnalysisResult _analysis(Map<String, Object?> body) {
    final ui = body['ui']! as Map<String, Object?>;
    return AnalysisResult(
      project: ProjectProfile.fromJson(
        body['project']! as Map<String, Object?>,
      ),
      capabilities: objectList(ui['buttons']).map(Capability.fromJson).toList(),
    );
  }

  Future<TaskSnapshot> _createTask(Map<String, Object?> request) async {
    final body = await _request('POST', '/v1/tasks', request);
    return TaskSnapshot.fromJson(body['task']! as Map<String, Object?>);
  }

  Future<Map<String, Object?>> _request(
    String method,
    String path, [
    Map<String, Object?>? requestBody,
    Map<String, String>? query,
  ]) async {
    final uri = _baseUri.replace(path: path, queryParameters: query);
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null && token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    final response = await _http.send(
      http.Request(method, uri)
        ..headers.addAll(headers)
        ..body = requestBody == null ? '' : jsonEncode(requestBody),
    );
    final text = await response.stream.bytesToString();
    final decoded = text.isEmpty ? <String, Object?>{} : jsonDecode(text);
    if (decoded is! Map<String, Object?>) {
      throw const FormatException('Invalid gateway response');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        decoded['error'] ?? 'Gateway request failed (${response.statusCode})',
      );
    }
    return decoded;
  }
}
