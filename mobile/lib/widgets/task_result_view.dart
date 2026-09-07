import 'dart:convert';

import 'package:flutter/material.dart';

import '../models.dart';

class TaskResultView extends StatelessWidget {
  const TaskResultView({super.key, required this.result});

  final Object result;

  @override
  Widget build(BuildContext context) {
    final report = _primaryText(result);
    final profile = _findProjectProfile(result);
    final steps = _workflowSteps(result);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (profile != null) ...[
          _ProjectProfileCard(profile: profile),
          const SizedBox(height: 16),
        ],
        Row(
          children: [
            Icon(
              Icons.article_outlined,
              size: 20,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Text('分析报告', style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
        const SizedBox(height: 8),
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: report == null || report.trim().isEmpty
                ? const Text('任务已完成，但没有可显示的文本报告。')
                : _MarkdownDocument(source: _normalizeAgentText(report)),
          ),
        ),
        if (steps.isNotEmpty) ...[
          const SizedBox(height: 12),
          Card(
            margin: EdgeInsets.zero,
            child: ExpansionTile(
              leading: const Icon(Icons.checklist_outlined),
              title: const Text('执行过程'),
              subtitle: Text('${steps.length} 个步骤已完成'),
              children: [
                for (final step in steps) _StepRow(step: step),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        Card(
          margin: EdgeInsets.zero,
          child: ExpansionTile(
            leading: const Icon(Icons.data_object_outlined),
            title: const Text('原始数据'),
            subtitle: const Text('仅供调试，通常无需查看'),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: SelectableText(
                  const JsonEncoder.withIndent('  ').convert(result),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProjectProfileCard extends StatelessWidget {
  const _ProjectProfileCard({required this.profile});

  final Map<String, Object?> profile;

  @override
  Widget build(BuildContext context) {
    final name = profile['name'] as String? ?? '项目画像';
    final summary = profile['summary'] as String?;
    final languages = _stringValues(profile['languages']);
    final frameworks = _stringValues(profile['frameworks']);
    final manifests = _stringValues(profile['manifests']);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.account_tree_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    name,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            if (summary != null && summary.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                chineseProjectSummary(
                  name: name,
                  summary: _plainSummary(summary),
                  languages: languages,
                  frameworks: frameworks,
                ),
              ),
            ],
            if (languages.isNotEmpty || frameworks.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final language in languages.take(8))
                    Chip(
                      visualDensity: VisualDensity.compact,
                      avatar: const Icon(Icons.code, size: 16),
                      label: Text(language),
                    ),
                  for (final framework in frameworks.take(6))
                    Chip(
                      visualDensity: VisualDensity.compact,
                      avatar: const Icon(Icons.extension_outlined, size: 16),
                      label: Text(framework),
                    ),
                ],
              ),
            ],
            if (manifests.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                '${manifests.length} 个项目配置文件已识别',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step});

  final Map<String, Object?> step;

  @override
  Widget build(BuildContext context) {
    final startedAt = DateTime.tryParse(step['startedAt'] as String? ?? '');
    final completedAt = DateTime.tryParse(step['completedAt'] as String? ?? '');
    final duration = startedAt == null || completedAt == null
        ? null
        : completedAt.difference(startedAt);
    return ListTile(
      dense: true,
      leading: const Icon(Icons.check_circle, color: Colors.green, size: 20),
      title: Text(_stepLabel(step['stepId'] as String? ?? 'analysis')),
      trailing: duration == null
          ? null
          : Text(
              _durationLabel(duration),
              style: Theme.of(context).textTheme.bodySmall,
            ),
    );
  }
}

class _MarkdownDocument extends StatelessWidget {
  const _MarkdownDocument({required this.source});

  final String source;

  @override
  Widget build(BuildContext context) {
    final lines = source.split('\n');
    final blocks = <Widget>[];
    var index = 0;
    while (index < lines.length) {
      final line = lines[index].trimRight();
      if (line.trim().isEmpty) {
        index++;
        continue;
      }
      if (line.trimLeft().startsWith('```')) {
        final code = <String>[];
        index++;
        while (index < lines.length &&
            !lines[index].trimLeft().startsWith('```')) {
          code.add(lines[index]);
          index++;
        }
        if (index < lines.length) index++;
        blocks.add(_CodeBlock(source: code.join('\n')));
        continue;
      }
      if (_isTableRow(line) &&
          index + 1 < lines.length &&
          _isTableDivider(lines[index + 1])) {
        final rows = <List<String>>[_tableCells(line)];
        index += 2;
        while (index < lines.length && _isTableRow(lines[index])) {
          rows.add(_tableCells(lines[index]));
          index++;
        }
        blocks.add(_MarkdownTable(rows: rows));
        continue;
      }
      final heading = RegExp(r'^(#{1,4})\s+(.+)$').firstMatch(line.trimLeft());
      if (heading != null) {
        blocks.add(
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 4),
            child: _InlineText(
              source: heading.group(2)!,
              style: _headingStyle(context, heading.group(1)!.length),
            ),
          ),
        );
        index++;
        continue;
      }
      final bullet = RegExp(r'^[-*+]\s+(.+)$').firstMatch(line.trimLeft());
      final numbered = RegExp(
        r'^(\d+)[.)]\s+(.+)$',
      ).firstMatch(line.trimLeft());
      if (bullet != null || numbered != null) {
        blocks.add(
          _ListLine(
            marker: numbered?.group(1) == null ? '•' : '${numbered!.group(1)}.',
            source: bullet?.group(1) ?? numbered!.group(2)!,
          ),
        );
        index++;
        continue;
      }
      if (RegExp(r'^(-{3,}|_{3,}|\*{3,})$').hasMatch(line.trim())) {
        blocks.add(const Divider(height: 24));
        index++;
        continue;
      }
      final paragraph = <String>[line.replaceFirst(RegExp(r'^>\s?'), '')];
      index++;
      while (index < lines.length &&
          lines[index].trim().isNotEmpty &&
          !_startsBlock(lines, index)) {
        paragraph.add(lines[index].trim());
        index++;
      }
      blocks.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _InlineText(source: paragraph.join(' ')),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < blocks.length; index++) ...[
          blocks[index],
          if (index < blocks.length - 1) const SizedBox(height: 2),
        ],
      ],
    );
  }

  bool _startsBlock(List<String> lines, int index) {
    final line = lines[index].trimLeft();
    return line.startsWith('```') ||
        RegExp(r'^(#{1,4})\s+').hasMatch(line) ||
        RegExp(r'^[-*+]\s+').hasMatch(line) ||
        RegExp(r'^\d+[.)]\s+').hasMatch(line) ||
        (_isTableRow(line) &&
            index + 1 < lines.length &&
            _isTableDivider(lines[index + 1]));
  }

  TextStyle? _headingStyle(BuildContext context, int level) => switch (level) {
    1 => Theme.of(context).textTheme.headlineSmall,
    2 => Theme.of(context).textTheme.titleLarge,
    _ => Theme.of(context).textTheme.titleMedium,
  };
}

class _InlineText extends StatelessWidget {
  const _InlineText({required this.source, this.style});

  final String source;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => SelectableText.rich(
    TextSpan(
      style: style ?? Theme.of(context).textTheme.bodyMedium,
      children: _inlineSpans(source),
    ),
  );

  List<InlineSpan> _inlineSpans(String value) {
    final spans = <InlineSpan>[];
    final pattern = RegExp(r'(\*\*[^*]+\*\*|`[^`]+`)');
    var cursor = 0;
    for (final match in pattern.allMatches(value)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: value.substring(cursor, match.start)));
      }
      final token = match.group(0)!;
      if (token.startsWith('**')) {
        spans.add(
          TextSpan(
            text: token.substring(2, token.length - 2),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        );
      } else {
        spans.add(
          TextSpan(
            text: token.substring(1, token.length - 1),
            style: const TextStyle(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w600,
            ),
          ),
        );
      }
      cursor = match.end;
    }
    if (cursor < value.length) {
      spans.add(TextSpan(text: value.substring(cursor)));
    }
    return spans;
  }
}

class _ListLine extends StatelessWidget {
  const _ListLine({required this.marker, required this.source});

  final String marker;
  final String source;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 28, child: Text(marker, textAlign: TextAlign.right)),
        const SizedBox(width: 10),
        Expanded(child: _InlineText(source: source)),
      ],
    ),
  );
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({required this.source});

  final String source;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.symmetric(vertical: 8),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(10),
    ),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SelectableText(
        source,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 12,
          height: 1.5,
        ),
      ),
    ),
  );
}

class _MarkdownTable extends StatelessWidget {
  const _MarkdownTable({required this.rows});

  final List<List<String>> rows;

  @override
  Widget build(BuildContext context) {
    final columnCount = rows.fold<int>(
      0,
      (count, row) => row.length > count ? row.length : count,
    );
    if (rows.length < 2 || columnCount == 0) {
      return const SizedBox.shrink();
    }
    String cell(List<String> row, int index) =>
        index < row.length ? row[index] : '';
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 44,
        dataRowMinHeight: 42,
        dataRowMaxHeight: 72,
        columns: [
          for (var index = 0; index < columnCount; index++)
            DataColumn(label: Text(cell(rows.first, index))),
        ],
        rows: [
          for (final row in rows.skip(1))
            DataRow(
              cells: [
                for (var index = 0; index < columnCount; index++)
                  DataCell(SizedBox(width: 150, child: Text(cell(row, index)))),
              ],
            ),
        ],
      ),
    );
  }
}

String? _primaryText(Object? value) {
  if (value is String) return value;
  final map = _asMap(value);
  if (map == null) return null;
  final text = map['text'];
  if (text is String) return text;
  final outputText = _primaryText(map['output']);
  if (outputText != null) return outputText;
  final steps = _workflowSteps(map);
  for (final step in steps.reversed) {
    final stepText = _primaryText(step['output']);
    if (stepText != null) return stepText;
  }
  return null;
}

Map<String, Object?>? _findProjectProfile(Object? value) {
  final map = _asMap(value);
  if (map == null) return null;
  if (map['name'] is String && map['languages'] is List<Object?>) return map;
  for (final step in _workflowSteps(map)) {
    final output = _asMap(step['output']);
    if (output != null &&
        output['name'] is String &&
        output['languages'] is List<Object?>) {
      return output;
    }
  }
  return null;
}

List<Map<String, Object?>> _workflowSteps(Object? value) {
  final map = _asMap(value);
  final raw = map?['steps'];
  if (raw is! List<Object?>) return const [];
  return raw.map(_asMap).whereType<Map<String, Object?>>().toList();
}

Map<String, Object?>? _asMap(Object? value) =>
    value is Map<String, Object?> ? value : null;

List<String> _stringValues(Object? value) =>
    value is List<Object?> ? value.whereType<String>().toList() : const [];

String _normalizeAgentText(String value) {
  final normalized = value.replaceAll('\r\n', '\n');
  if (normalized.contains('\n') || !normalized.contains(r'\n')) {
    return normalized;
  }
  return normalized.replaceAll(r'\n', '\n').replaceAll(r'\"', '"');
}

String _plainSummary(String value) => value
    .replaceFirst(RegExp(r'^>\s*'), '')
    .replaceAllMapped(
      RegExp(r'\[([^\]]+)\]\([^)]+\)'),
      (match) => match.group(1)!,
    )
    .trim();

String _stepLabel(String id) => switch (id) {
  'repository' => '收集项目画像',
  'profile' => '识别技术栈',
  'summary' => '汇总仓库结构',
  'analysis' => '生成详细分析',
  'graph' => '分析代码影响',
  _ => id.replaceAll('_', ' '),
};

String _durationLabel(Duration duration) {
  if (duration.inSeconds < 1) return '<1 秒';
  if (duration.inMinutes < 1) return '${duration.inSeconds} 秒';
  return '${duration.inMinutes} 分 ${duration.inSeconds.remainder(60)} 秒';
}

bool _isTableRow(String line) =>
    line.trim().startsWith('|') && line.trim().endsWith('|');

bool _isTableDivider(String line) {
  if (!_isTableRow(line)) return false;
  return _tableCells(
    line,
  ).every((cell) => RegExp(r'^:?-{3,}:?$').hasMatch(cell));
}

List<String> _tableCells(String line) => line
    .trim()
    .substring(1, line.trim().length - 1)
    .split('|')
    .map((cell) => cell.trim())
    .toList();
