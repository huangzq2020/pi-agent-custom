import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubService } from "../src/github-service.ts";
import { ProjectPathPolicy } from "../src/path-policy.ts";

describe("GitHubService", () => {
	let root: string | undefined;

	afterEach(async () => {
		vi.unstubAllGlobals();
		if (root) await rm(root, { recursive: true, force: true });
		root = undefined;
	});

	it("requests repository results ordered by descending stars", async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-github-"));
		const fetchMock = vi.fn(async (_input: string | URL | Request) => Response.json({ total_count: 0, items: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await new GitHubService(new ProjectPathPolicy([root])).search("mobile agent", 1, "stars-desc");

		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(requestUrl.searchParams.get("q")).toBe("mobile agent");
		expect(requestUrl.searchParams.get("sort")).toBe("stars");
		expect(requestUrl.searchParams.get("order")).toBe("desc");
	});

	it("reads a UTF-8 repository file at a requested ref", async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-github-file-"));
		const content = "export const answer = 42;\n";
		const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
			Response.json({
				type: "file",
				path: "src/answer file.ts",
				sha: "abc123",
				size: Buffer.byteLength(content),
				html_url: "https://github.com/owner/repository/blob/feature/test/src/answer%20file.ts",
				encoding: "base64",
				content: Buffer.from(content).toString("base64"),
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const file = await new GitHubService(new ProjectPathPolicy([root]), "github-token").readFile(
			"owner",
			"repository",
			"src/answer file.ts",
			"feature/test",
		);

		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(requestUrl.pathname).toBe("/repos/owner/repository/contents/src/answer%20file.ts");
		expect(requestUrl.searchParams.get("ref")).toBe("feature/test");
		expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer github-token" });
		expect(file).toMatchObject({
			repository: "owner/repository",
			path: "src/answer file.ts",
			ref: "feature/test",
			content,
		});
	});
});
