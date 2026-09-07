import { describe, expect, it } from "vitest";
import { RuntimeExtensionHost } from "../src/runtime/extensions.ts";
import { TaskManager } from "../src/task-manager.ts";
import type { AgentRuntime, ProjectProfile, TaskSnapshot } from "../src/types.ts";
import { WorkflowExecutor } from "../src/workflow/executor.ts";
import { parseWorkflow } from "../src/workflow/parser.ts";
import { WorkflowRegistry } from "../src/workflow/registry.ts";

const project: ProjectProfile = {
	id: "project",
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
	fileCount: 1,
	analyzedAt: "2026-01-01T00:00:00.000Z",
};

describe("task manager", () => {
	it("queues a chat task and streams runtime events", async () => {
		const runtime: AgentRuntime = {
			async run(_request, onEvent) {
				onEvent({ type: "text_delta", text: "hello" });
				return { text: "hello" };
			},
		};
		const manager = createManager(runtime);
		const created = manager.create({ projectId: project.id, kind: "chat", prompt: "say hello" }, project);
		const completed = await waitForCompletion(manager, created.id);

		expect(completed.status).toBe("SUCCESS");
		expect(completed.result).toEqual({ text: "hello" });
		expect(manager.events(created.id).some((event) => event.type === "agent_delta")).toBe(true);
	});

	it("cancels a running task", async () => {
		const runtime: AgentRuntime = {
			run(request) {
				return new Promise((_resolve, reject) => {
					request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
				});
			},
		};
		const manager = createManager(runtime);
		const created = manager.create({ projectId: project.id, kind: "chat", prompt: "wait" }, project);
		await waitForStatus(manager, created.id, "RUNNING");
		manager.cancel(created.id);
		const completed = await waitForCompletion(manager, created.id);
		expect(completed.status).toBe("CANCELLED");
	});
});

function createManager(runtime: AgentRuntime): TaskManager {
	const extensions = new RuntimeExtensionHost();
	const workflows = new WorkflowRegistry();
	workflows.register(
		parseWorkflow(`
id: noop
name: Noop
description: Noop
version: 1.0.0
steps:
  - id: inspect
    tool: inspect
`),
	);
	return new TaskManager({
		runtime,
		extensions,
		executor: new WorkflowExecutor({
			runtime,
			extensions,
			tools: new Map([["inspect", async () => ({ ok: true })]]),
		}),
		workflows,
		buildChangeGraph: async () => ({ nodes: [], edges: [] }),
	});
}

async function waitForStatus(manager: TaskManager, id: string, status: TaskSnapshot["status"]): Promise<TaskSnapshot> {
	const current = manager.get(id);
	if (current?.status === status) return current;
	return new Promise((resolve) => {
		const unsubscribe = manager.subscribe(id, () => {
			const snapshot = manager.get(id);
			if (snapshot?.status !== status) return;
			unsubscribe();
			resolve(snapshot);
		});
	});
}

async function waitForCompletion(manager: TaskManager, id: string): Promise<TaskSnapshot> {
	const current = manager.get(id);
	if (current && ["SUCCESS", "FAILED", "CANCELLED"].includes(current.status)) return current;
	return new Promise((resolve) => {
		const unsubscribe = manager.subscribe(id, () => {
			const snapshot = manager.get(id);
			if (!snapshot || !["SUCCESS", "FAILED", "CANCELLED"].includes(snapshot.status)) return;
			unsubscribe();
			resolve(snapshot);
		});
	});
}
