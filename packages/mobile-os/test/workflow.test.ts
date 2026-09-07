import { describe, expect, it } from "vitest";
import { RuntimeExtensionHost } from "../src/runtime/extensions.ts";
import type { AgentRuntime, ProjectProfile, RuntimeEvent, TaskSnapshot } from "../src/types.ts";
import { WorkflowExecutor } from "../src/workflow/executor.ts";
import { parseWorkflow } from "../src/workflow/parser.ts";

const profile: ProjectProfile = {
	id: "project-1",
	root: process.cwd(),
	name: "project",
	summary: "Test project",
	languages: ["TypeScript"],
	frameworks: [],
	databases: [],
	caches: [],
	packageManagers: ["npm"],
	manifests: ["package.json"],
	hasGit: true,
	fileCount: 10,
	analyzedAt: "2026-01-01T00:00:00.000Z",
};

const task: TaskSnapshot = {
	id: "task-1",
	projectId: profile.id,
	projectName: profile.name,
	title: "Review",
	kind: "workflow",
	status: "RUNNING",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	workflowId: "review",
	progress: 0,
};

describe("workflow parser and executor", () => {
	it("executes a DAG and interpolates prerequisite outputs", async () => {
		const workflow = parseWorkflow(`
id: review
name: Review
description: Review a project
version: 1.0.0
steps:
  - id: profile
    tool: inspect
  - id: report
    needs: [profile]
    readOnly: true
    agent: "Summarize {{steps.profile}}"
`);
		const prompts: string[] = [];
		const runtime: AgentRuntime = {
			async run(request, onEvent) {
				prompts.push(request.prompt);
				onEvent({ type: "text_delta", text: "done" });
				return { text: "report" };
			},
		};
		const runtimeEvents: RuntimeEvent[] = [];
		const executor = new WorkflowExecutor({
			runtime,
			extensions: new RuntimeExtensionHost(),
			tools: new Map([["inspect", async () => ({ language: "TypeScript" })]]),
		});
		const result = await executor.execute(workflow, profile, task, new AbortController().signal, {
			onStepStart: () => {},
			onStepEnd: () => {},
			onRuntimeEvent: (event) => runtimeEvents.push(event),
		});

		expect(result.output).toBe("report");
		expect(prompts[0]).toContain('"language": "TypeScript"');
		expect(runtimeEvents).toEqual([{ type: "text_delta", text: "done" }]);
	});

	it("rejects dependency cycles", () => {
		expect(() =>
			parseWorkflow(`
id: cycle
name: Cycle
description: Invalid
version: 1.0.0
steps:
  - id: first
    needs: [second]
    tool: inspect
  - id: second
    needs: [first]
    tool: inspect
`),
		).toThrow("dependency cycle");
	});
});
