import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoMap } from "../../../.pi/extensions/repo-map.ts";
import { toolsForMode } from "../../../.pi/extensions/skill-profile.ts";
import { assessToolCall } from "../../../.pi/extensions/tool-guard.ts";
import { loadExtensions } from "../src/core/extensions/loader.ts";

const fixtures: string[] = [];

afterEach(async () => {
	await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("enhancement extensions", () => {
	it("loads all three extensions through the production loader", async () => {
		const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
		const paths = ["repo-map.ts", "skill-profile.ts", "tool-guard.ts"].map((name) =>
			join(repositoryRoot, ".pi", "extensions", name),
		);

		const result = await loadExtensions(paths, repositoryRoot);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(3);
		expect(result.extensions.flatMap((extension) => [...extension.tools.keys()])).toContain("repo_map");
		expect(result.extensions.flatMap((extension) => [...extension.commands.keys()])).toContain("mode");
		expect(result.extensions.flatMap((extension) => [...extension.handlers.keys()])).toContain("tool_call");
	});

	it("builds a bounded repository map from project files and manifests", async () => {
		const root = join(tmpdir(), `pi-repo-map-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fixtures.push(root);
		await mkdir(join(root, "src", "auth"), { recursive: true });
		await mkdir(join(root, "packages", "core", "src"), { recursive: true });
		await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
		await writeFile(join(root, "src", "main.ts"), "export {};\n");
		await writeFile(join(root, "src", "auth", "index.ts"), "export {};\n");
		await writeFile(join(root, "packages", "core", "src", "index.ts"), "export {};\n");
		await writeFile(join(root, "vitest.config.ts"), "export default {};\n");
		await writeFile(join(root, "node_modules", "ignored", "index.js"), "ignored\n");
		await writeFile(
			join(root, "package.json"),
			JSON.stringify({
				scripts: { build: "tsc", test: "vitest" },
				dependencies: { react: "1.0.0" },
				devDependencies: { typescript: "1.0.0", vitest: "1.0.0" },
			}),
		);

		const map = await buildRepoMap(root);

		expect(map.technology).toEqual(expect.arrayContaining(["React", "TypeScript"]));
		expect(map.entryPoints).toEqual(expect.arrayContaining(["src/main.ts", "packages/core/src/index.ts"]));
		expect(map.modules).toContain("src/auth");
		expect(map.testFrameworks).toContain("Vitest");
		expect(map.buildCommands).toEqual(expect.arrayContaining(["npm run build", "npm run test"]));
		expect(map.structure).not.toContain("node_modules/ignored/index.js");
	});

	it("restricts review mode to read-only analysis tools", () => {
		const allTools = ["read", "grep", "find", "ls", "edit", "write", "bash", "repo_map"];
		expect(toolsForMode("review", allTools)).toEqual(["read", "grep", "find", "ls", "repo_map"]);
		expect(toolsForMode("bugfix", allTools)).toEqual(allTools);
	});

	it("classifies representative low, medium, and high risk calls", () => {
		expect(assessToolCall("bash", { command: "git status --short" }).level).toBe("low");
		expect(assessToolCall("bash", { command: "npm install" }).level).toBe("medium");
		expect(assessToolCall("bash", { command: "git reset --hard HEAD~1" }).level).toBe("high");
		expect(assessToolCall("bash", { command: "rm -rf build" }).level).toBe("high");
	});
});
