class GatewayDevice {
  const GatewayDevice({
    required this.id,
    required this.name,
    required this.platform,
    required this.version,
    required this.roots,
  });

  factory GatewayDevice.fromJson(Map<String, Object?> json) => GatewayDevice(
    id: json['id']! as String,
    name: json['name']! as String,
    platform: json['platform']! as String,
    version: json['version']! as String,
    roots: stringList(json['roots']),
  );

  final String id;
  final String name;
  final String platform;
  final String version;
  final List<String> roots;
}

class ProjectProfile {
  const ProjectProfile({
    required this.id,
    required this.name,
    required this.root,
    required this.summary,
    required this.languages,
    required this.frameworks,
    required this.featureHighlights,
    required this.alerts,
  });

  factory ProjectProfile.fromJson(Map<String, Object?> json) => ProjectProfile(
    id: json['id']! as String,
    name: json['name']! as String,
    root: json['root']! as String,
    summary: json['summary'] as String? ?? '暂无项目说明。',
    languages: stringList(json['languages']),
    frameworks: stringList(json['frameworks']),
    featureHighlights: stringList(json['featureHighlights']),
    alerts: objectList(json['alerts']).map(ProjectAlert.fromJson).toList(),
  );

  final String id;
  final String name;
  final String root;
  final String summary;
  final List<String> languages;
  final List<String> frameworks;
  final List<String> featureHighlights;
  final List<ProjectAlert> alerts;

  String get displaySummary => chineseProjectSummary(
    name: name,
    summary: summary,
    languages: languages,
    frameworks: frameworks,
  );
}

class ProjectAlert {
  const ProjectAlert({
    required this.kind,
    required this.severity,
    required this.text,
  });

  factory ProjectAlert.fromJson(Map<String, Object?> json) => ProjectAlert(
    kind: json['kind']! as String,
    severity: json['severity']! as String,
    text: json['text']! as String,
  );

  final String kind;
  final String severity;
  final String text;
}

class Capability {
  const Capability({
    required this.id,
    required this.title,
    required this.description,
    required this.workflowId,
    required this.category,
    required this.destructive,
  });

  factory Capability.fromJson(Map<String, Object?> json) => Capability(
    id: json['id']! as String,
    title: json['title']! as String,
    description: json['description']! as String,
    workflowId: json['workflowId']! as String,
    category: json['category']! as String,
    destructive: json['destructive']! as bool,
  );

  final String id;
  final String title;
  final String description;
  final String workflowId;
  final String category;
  final bool destructive;
}

class RemoteFileEntry {
  const RemoteFileEntry({
    required this.name,
    required this.path,
    required this.type,
    this.size,
    this.modifiedAt,
  });

  factory RemoteFileEntry.fromJson(Map<String, Object?> json) =>
      RemoteFileEntry(
        name: json['name']! as String,
        path: json['path']! as String,
        type: json['type']! as String,
        size: json['size'] as int?,
        modifiedAt: json['modifiedAt'] as String?,
      );

  final String name;
  final String path;
  final String type;
  final int? size;
  final String? modifiedAt;

  bool get isDirectory => type == 'directory';
}

class RemoteDirectory {
  const RemoteDirectory({required this.entries, this.path, this.parent});

  factory RemoteDirectory.fromJson(Map<String, Object?> json) =>
      RemoteDirectory(
        path: json['path'] as String?,
        parent: json['parent'] as String?,
        entries: objectList(
          json['entries'],
        ).map(RemoteFileEntry.fromJson).toList(),
      );

  final String? path;
  final String? parent;
  final List<RemoteFileEntry> entries;
}

class GitHubRepository {
  const GitHubRepository({
    required this.fullName,
    required this.cloneUrl,
    required this.htmlUrl,
    required this.stars,
    this.description,
    this.language,
  });

  factory GitHubRepository.fromJson(Map<String, Object?> json) =>
      GitHubRepository(
        fullName: json['fullName']! as String,
        cloneUrl: json['cloneUrl']! as String,
        htmlUrl: json['htmlUrl']! as String,
        stars: json['stars']! as int,
        description: json['description'] as String?,
        language: json['language'] as String?,
      );

  final String fullName;
  final String cloneUrl;
  final String htmlUrl;
  final int stars;
  final String? description;
  final String? language;
}

class ChangeNode {
  const ChangeNode({
    required this.id,
    required this.label,
    required this.change,
    required this.additions,
    required this.deletions,
  });

  factory ChangeNode.fromJson(Map<String, Object?> json) => ChangeNode(
    id: json['id']! as String,
    label: json['label']! as String,
    change: json['change'] as String? ?? 'modified',
    additions: json['additions'] as int? ?? 0,
    deletions: json['deletions'] as int? ?? 0,
  );

  final String id;
  final String label;
  final String change;
  final int additions;
  final int deletions;
}

class ChangeEdge {
  const ChangeEdge({required this.from, required this.to});

  factory ChangeEdge.fromJson(Map<String, Object?> json) =>
      ChangeEdge(from: json['from']! as String, to: json['to']! as String);

  final String from;
  final String to;
}

class ChangeGraph {
  const ChangeGraph({required this.nodes, required this.edges});

  factory ChangeGraph.fromJson(Map<String, Object?> json) => ChangeGraph(
    nodes: objectList(json['nodes']).map(ChangeNode.fromJson).toList(),
    edges: objectList(json['edges']).map(ChangeEdge.fromJson).toList(),
  );

  final List<ChangeNode> nodes;
  final List<ChangeEdge> edges;
}

class TaskSnapshot {
  const TaskSnapshot({
    required this.id,
    required this.projectId,
    required this.projectName,
    required this.title,
    required this.kind,
    required this.status,
    required this.progress,
    required this.createdAt,
    this.prompt,
    this.workflowId,
    this.currentStep,
    this.result,
    this.error,
    this.changeGraph,
  });

  factory TaskSnapshot.fromJson(Map<String, Object?> json) => TaskSnapshot(
    id: json['id']! as String,
    projectId: json['projectId']! as String,
    projectName: json['projectName'] as String? ?? '未知项目',
    title:
        json['title'] as String? ?? json['workflowId'] as String? ?? 'Agent 对话',
    kind: json['kind']! as String,
    status: json['status']! as String,
    progress: (json['progress']! as num).toDouble(),
    createdAt: DateTime.parse(json['createdAt']! as String).toLocal(),
    prompt: json['prompt'] as String?,
    workflowId: json['workflowId'] as String?,
    currentStep: json['currentStep'] as String?,
    result: json['result'],
    error: json['error'] as String?,
    changeGraph: json['changeGraph'] is Map<String, Object?>
        ? ChangeGraph.fromJson(json['changeGraph']! as Map<String, Object?>)
        : null,
  );

  final String id;
  final String projectId;
  final String projectName;
  final String title;
  final String kind;
  final String status;
  final double progress;
  final DateTime createdAt;
  final String? prompt;
  final String? workflowId;
  final String? currentStep;
  final Object? result;
  final String? error;
  final ChangeGraph? changeGraph;

  bool get isDone => const {'SUCCESS', 'FAILED', 'CANCELLED'}.contains(status);
}

List<String> stringList(Object? value) => (value as List<Object?>? ?? const [])
    .map((item) => item! as String)
    .toList();

List<Map<String, Object?>> objectList(Object? value) =>
    (value as List<Object?>? ?? const [])
        .map((item) => item! as Map<String, Object?>)
        .toList();

String chineseProjectSummary({
  required String name,
  required String summary,
  required List<String> languages,
  required List<String> frameworks,
}) {
  if (RegExp(r'[\u3400-\u9fff]').hasMatch(summary)) return summary;
  final technologies = [...frameworks, ...languages].take(5).join('、');
  if (technologies.isEmpty) return '「$name」是一个软件项目，详细用途可通过项目分析进一步了解。';
  return '「$name」是一个主要使用 $technologies 构建的软件项目。';
}
