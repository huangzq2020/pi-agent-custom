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
});
