import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubService } from "../src/github-service.ts";
import { ProjectPathPolicy } from "../src/path-policy.ts";
import { createGitHubAgentTools, githubReadFileToolName } from "../src/runtime/github-agent-tools.ts";

describe("GitHub Agent tools", () => {
	let root: string | undefined;

	afterEach(async () => {
		vi.unstubAllGlobals();
		if (root) await rm(root, { recursive: true, force: true });
		root = undefined;
	});

	it("searches repositories with star ordering and returns model-readable metadata", async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-github-tool-"));
		const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
			Response.json({
				total_count: 1,
				items: [
					{
						id: 7,
						full_name: "owner/repository",
						description: "Example repository",
						html_url: "https://github.com/owner/repository",
						clone_url: "https://github.com/owner/repository.git",
						language: "TypeScript",
						stargazers_count: 42,
						updated_at: "2026-09-22T00:00:00Z",
					},
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const [tool] = createGitHubAgentTools(new GitHubService(new ProjectPathPolicy([root])));

		const result = await tool.execute(
			"call-id",
			{ query: "mobile agent", sort: "stars-desc", page: 2 },
			undefined,
			undefined,
			undefined as never,
		);

		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(requestUrl.searchParams.get("sort")).toBe("stars");
		expect(requestUrl.searchParams.get("order")).toBe("desc");
		expect(requestUrl.searchParams.get("page")).toBe("2");
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(result.details).toMatchObject({
			total: 1,
			repositories: [{ fullName: "owner/repository", stars: 42 }],
		});
	});

	it("reads a selected line range from a GitHub text file", async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-github-read-tool-"));
		const content = "first line\nsecond line\nthird line\n";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({
					type: "file",
					path: "src/example.ts",
					sha: "abc123",
					size: Buffer.byteLength(content),
					html_url: "https://github.com/owner/repository/blob/main/src/example.ts",
					encoding: "base64",
					content: Buffer.from(content).toString("base64"),
				}),
			),
		);
		const tool = createGitHubAgentTools(new GitHubService(new ProjectPathPolicy([root]))).find(
			(candidate) => candidate.name === githubReadFileToolName,
		);
		if (!tool) throw new Error("GitHub file reader tool was not registered");

		const result = await tool.execute(
			"call-id",
			{ owner: "owner", repo: "repository", path: "src/example.ts", ref: "main", offset: 2, limit: 1 },
			undefined,
			undefined,
			undefined as never,
		);

		expect(result.details).toMatchObject({
			repository: "owner/repository",
			path: "src/example.ts",
			startLine: 2,
			endLine: 2,
			totalLines: 3,
			truncated: true,
			nextOffset: 3,
			content: "second line",
		});
	});
});
