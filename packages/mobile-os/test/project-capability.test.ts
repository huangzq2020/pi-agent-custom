import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CapabilityEngine } from "../src/capability-engine.ts";
import { ProjectAnalyzer } from "../src/project-analyzer.ts";

describe("project-aware capabilities", () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-project-"));
		await mkdir(join(root, "src"));
		await writeFile(
			join(root, "package.json"),
			JSON.stringify({
				description: "An English-only backend service description.",
				dependencies: { fastify: "5.0.0", redis: "5.0.0" },
			}),
		);
		await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n");
		await writeFile(join(root, "Dockerfile"), "FROM node:24\n");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("detects technologies and recommends matching workflows", async () => {
		const profile = await new ProjectAnalyzer().analyze(root);
		const ui = new CapabilityEngine().recommend(profile);

		expect(profile.languages).toContain("TypeScript");
		expect(profile.frameworks).toContain("Fastify");
		expect(profile.summary).toContain("TypeScript");
		expect(profile.summary).toContain("后端服务项目");
		expect(profile.summary).not.toContain("English-only");
		expect(profile.caches).toContain("Redis");
		expect(ui.buttons.map((button) => button.workflowId)).toEqual(
			expect.arrayContaining(["redis_check", "docker_review", "bug_scan", "detailed_analysis"]),
		);
	});

	it("offers only project analysis before a profile exists", () => {
		expect(new CapabilityEngine().recommend().buttons.map((button) => button.workflowId)).toEqual([
			"project_analysis",
		]);
	});
});
