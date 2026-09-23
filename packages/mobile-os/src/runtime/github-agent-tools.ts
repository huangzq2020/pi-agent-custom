import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	defineTool,
	type ToolDefinition,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GitHubSearchSort, GitHubService } from "../github-service.ts";

export const githubSearchRepositoriesToolName = "github_search_repositories";
export const githubReadFileToolName = "github_read_file";

const githubSearchRepositoriesToolParameters = Type.Object({
	query: Type.String({
		minLength: 1,
		maxLength: 256,
		description:
			"GitHub repository search query, including optional qualifiers such as language:typescript or topic:agent",
	}),
	sort: Type.Optional(
		Type.Union([Type.Literal("best-match"), Type.Literal("stars-asc"), Type.Literal("stars-desc")], {
			description: "Result ordering: GitHub relevance, fewest stars first, or most stars first",
		}),
	),
	page: Type.Optional(
		Type.Integer({ minimum: 1, maximum: 50, description: "Result page; each page contains up to 20 repositories" }),
	),
});

const githubReadFileToolParameters = Type.Object({
	owner: Type.String({
		minLength: 1,
		maxLength: 39,
		description: "GitHub user or organization that owns the repository",
	}),
	repo: Type.String({
		minLength: 1,
		maxLength: 100,
		description: "Repository name without the owner",
	}),
	path: Type.String({
		minLength: 1,
		maxLength: 1024,
		description: "Repository-relative path of the text file to read",
	}),
	ref: Type.Optional(
		Type.String({
			minLength: 1,
			maxLength: 255,
			description: "Optional branch, tag, or commit SHA; defaults to the repository default branch",
		}),
	),
	offset: Type.Optional(
		Type.Integer({
			minimum: 1,
			description: "First line to return, using one-based line numbers",
		}),
	),
	limit: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: DEFAULT_MAX_LINES,
			description: `Maximum lines to return; defaults to ${DEFAULT_MAX_LINES}`,
		}),
	),
});

export function createGitHubAgentTools(github: GitHubService): ToolDefinition[] {
	return [
		defineTool({
			name: githubSearchRepositoriesToolName,
			label: "GitHub repository search",
			description:
				"Search public GitHub repositories without modifying GitHub or the local filesystem. Supports GitHub search qualifiers, pagination, and ordering by star count.",
			promptSnippet: "Search public GitHub repositories and sort results by relevance or star count",
			promptGuidelines: [
				"Use github_search_repositories when repository metadata from GitHub is needed; this tool does not clone repositories.",
			],
			parameters: githubSearchRepositoriesToolParameters,
			executionMode: "parallel",
			async execute(_toolCallId, params, signal) {
				const sort: GitHubSearchSort = params.sort ?? "best-match";
				const result = await github.search(params.query, params.page ?? 1, sort, signal);
				return {
					content: [{ type: "text", text: JSON.stringify(result, undefined, 2) }],
					details: result,
				};
			},
		}),
		defineTool({
			name: githubReadFileToolName,
			label: "GitHub file reader",
			description:
				"Read a UTF-8 text file from a GitHub repository without cloning the repository or modifying GitHub or the local filesystem. Supports branches, tags, commit SHAs, and line ranges.",
			promptSnippet: "Read text files from GitHub repositories by repository, path, and optional ref",
			promptGuidelines: [
				"Use github_read_file to inspect a known text file in a GitHub repository without cloning it; use offset to continue when a result is truncated.",
			],
			parameters: githubReadFileToolParameters,
			executionMode: "parallel",
			async execute(_toolCallId, params, signal) {
				const file = await github.readFile(params.owner, params.repo, params.path, params.ref, signal);
				const lines = splitLines(file.content);
				const offset = params.offset ?? 1;
				if (lines.length > 0 && offset > lines.length) {
					throw new Error(`GitHub file has ${lines.length} lines; offset ${offset} is out of range`);
				}
				const selected = lines.slice(offset - 1, offset - 1 + (params.limit ?? DEFAULT_MAX_LINES)).join("\n");
				const truncated = truncateHead(selected, {
					maxLines: params.limit ?? DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				if (truncated.firstLineExceedsLimit) {
					throw new Error(`GitHub file line ${offset} exceeds the ${DEFAULT_MAX_BYTES / 1024}KB output limit`);
				}
				const endLine = truncated.outputLines === 0 ? 0 : offset + truncated.outputLines - 1;
				const hasMore = endLine < lines.length;
				const result = {
					repository: file.repository,
					path: file.path,
					ref: file.ref,
					sha: file.sha,
					size: file.size,
					htmlUrl: file.htmlUrl,
					startLine: lines.length === 0 ? 0 : offset,
					endLine,
					totalLines: lines.length,
					truncated: truncated.truncated || hasMore,
					nextOffset: hasMore ? endLine + 1 : undefined,
					content: truncated.content,
				};
				return {
					content: [{ type: "text", text: JSON.stringify(result, undefined, 2) }],
					details: result,
				};
			},
		}),
	];
}

function splitLines(content: string): string[] {
	if (content.length === 0) return [];
	const lines = content.split("\n");
	if (content.endsWith("\n")) lines.pop();
	return lines;
}
