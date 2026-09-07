import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { ProjectPathPolicy } from "./path-policy.ts";
import type { GitHubRepository } from "./types.ts";

export class GitHubService {
	private readonly pathPolicy: ProjectPathPolicy;
	private readonly token?: string;

	constructor(pathPolicy: ProjectPathPolicy, token?: string) {
		this.pathPolicy = pathPolicy;
		this.token = token;
	}

	async search(query: string, page = 1): Promise<{ total: number; repositories: GitHubRepository[] }> {
		const cleanQuery = query.trim();
		if (!cleanQuery) throw new Error("GitHub search query is required");
		if (cleanQuery.length > 256) throw new Error("GitHub search query is too long");
		const url = new URL("https://api.github.com/search/repositories");
		url.searchParams.set("q", cleanQuery);
		url.searchParams.set("page", String(Math.min(Math.max(page, 1), 100)));
		url.searchParams.set("per_page", "20");
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"User-Agent": "pi-agent-mobile-os",
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (this.token) headers.Authorization = `Bearer ${this.token}`;
		const response = await fetch(url, { headers });
		const body: unknown = await response.json();
		if (!response.ok) throw new Error(githubError(body, response.status));
		if (!isRecord(body) || !Array.isArray(body.items)) throw new Error("GitHub returned an invalid response");
		return {
			total: typeof body.total_count === "number" ? body.total_count : 0,
			repositories: body.items.map(parseRepository),
		};
	}

	async clone(cloneUrl: string, targetRoot: string, directoryName?: string): Promise<string> {
		if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(cloneUrl)) {
			throw new Error("Only HTTPS GitHub repository URLs can be cloned");
		}
		const repositoryName = basename(new URL(cloneUrl).pathname).replace(/\.git$/, "");
		const destination = await this.pathPolicy.resolveCloneDestination(targetRoot, directoryName ?? repositoryName);
		try {
			await stat(destination);
			throw new Error(`Clone destination already exists: ${destination}`);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		}
		await runGit(["clone", "--depth", "1", "--single-branch", cloneUrl, destination]);
		return destination;
	}
}

function runGit(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const process = spawn("git", args, { shell: false, windowsHide: true });
		let errorOutput = "";
		process.stderr.setEncoding("utf8");
		process.stderr.on("data", (chunk: string) => {
			errorOutput = `${errorOutput}${chunk}`.slice(-8_000);
		});
		process.once("error", reject);
		process.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(errorOutput.trim() || `git clone exited with code ${code}`));
		});
	});
}

function parseRepository(value: unknown): GitHubRepository {
	if (!isRecord(value)) throw new Error("GitHub repository item is invalid");
	return {
		id: requiredNumber(value.id, "id"),
		fullName: requiredString(value.full_name, "full_name"),
		description: typeof value.description === "string" ? value.description : undefined,
		htmlUrl: requiredString(value.html_url, "html_url"),
		cloneUrl: requiredString(value.clone_url, "clone_url"),
		language: typeof value.language === "string" ? value.language : undefined,
		stars: requiredNumber(value.stargazers_count, "stargazers_count"),
		updatedAt: requiredString(value.updated_at, "updated_at"),
	};
}

function githubError(value: unknown, status: number): string {
	return isRecord(value) && typeof value.message === "string"
		? `GitHub request failed (${status}): ${value.message}`
		: `GitHub request failed (${status})`;
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`GitHub response is missing ${field}`);
	return value;
}

function requiredNumber(value: unknown, field: string): number {
	if (typeof value !== "number") throw new Error(`GitHub response is missing ${field}`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
