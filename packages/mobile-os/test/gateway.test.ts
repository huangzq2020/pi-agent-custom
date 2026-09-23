import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { CapabilityEngine } from "../src/capability-engine.ts";
import { MobileGateway } from "../src/gateway.ts";
import { GitHubService } from "../src/github-service.ts";
import { MarketplaceRegistry } from "../src/marketplace/registry.ts";
import { ProjectPathPolicy } from "../src/path-policy.ts";
import { ProjectAnalyzer } from "../src/project-analyzer.ts";
import { ProjectCatalog } from "../src/project-catalog.ts";
import { RemoteFileService } from "../src/remote-files.ts";
import { RuntimeExtensionHost } from "../src/runtime/extensions.ts";
import { TaskManager } from "../src/task-manager.ts";
import type { AgentRuntime } from "../src/types.ts";
import { WorkflowExecutor } from "../src/workflow/executor.ts";
import { parseWorkflow } from "../src/workflow/parser.ts";
import { WorkflowRegistry } from "../src/workflow/registry.ts";

describe("mobile gateway", () => {
	let root: string;
	let gateway: MobileGateway;
	let baseUrl: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "pi-mobile-gateway-"));
		await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
		const runtime: AgentRuntime = {
			async run(_request, onEvent) {
				onEvent({ type: "text_delta", text: "ok" });
				return { text: "ok" };
			},
		};
		const extensions = new RuntimeExtensionHost();
		const workflows = new WorkflowRegistry();
		workflows.register(
			parseWorkflow(`
id: explain
name: Explain
description: Explain
version: 1.0.0
steps:
  - id: explain
    readOnly: true
    agent: Explain the project
`),
		);
		const tasks = new TaskManager({
			runtime,
			extensions,
			executor: new WorkflowExecutor({ runtime, extensions, tools: new Map() }),
			workflows,
			buildChangeGraph: async () => ({ nodes: [], edges: [] }),
		});
		const projects = new ProjectCatalog();
		const pathPolicy = new ProjectPathPolicy([root]);
		gateway = new MobileGateway({
			host: "127.0.0.1",
			port: 0,
			token: "secret",
			pathPolicy,
			projects,
			analyzer: new ProjectAnalyzer(),
			capabilities: new CapabilityEngine(),
			workflows,
			marketplace: new MarketplaceRegistry(workflows),
			tasks,
			device: { id: "device", name: "test-computer", platform: "test", version: "1", roots: [root] },
			files: new RemoteFileService(pathPolicy),
			github: new GitHubService(pathPolicy),
		});
		const address = await gateway.start();
		baseUrl = `http://${address.host}:${address.port}`;
	});

	afterEach(async () => {
		await gateway.stop();
		await rm(root, { recursive: true, force: true });
	});

	it("authenticates, analyzes a project, and streams task events", async () => {
		const unauthorized = await fetch(`${baseUrl}/v1/projects`);
		expect(unauthorized.status).toBe(401);

		const analysisResponse = await apiFetch("/v1/projects/analyze", {
			method: "POST",
			body: JSON.stringify({ root }),
		});
		expect(analysisResponse.status).toBe(200);
		const analysis = asRecord(await analysisResponse.json());
		const project = asRecord(analysis.project);

		const taskResponse = await apiFetch("/v1/tasks", {
			method: "POST",
			body: JSON.stringify({ projectId: project.id, kind: "chat", prompt: "hello" }),
		});
		const created = asRecord(asRecord(await taskResponse.json()).task);
		const taskId = created.id as string;
		const websocketUrl = `${baseUrl.replace("http://", "ws://")}/v1/tasks/${taskId}/events?token=secret`;
		const events = await collectUntilSuccess(websocketUrl);

		expect(events.map((event) => event.type)).toContain("agent_delta");
		expect(events.some((event) => asRecord(event.data).status === "SUCCESS")).toBe(true);

		const continuationResponse = await apiFetch(`/v1/tasks/${taskId}/messages`, {
			method: "POST",
			body: JSON.stringify({ prompt: "follow up" }),
		});
		expect(continuationResponse.status).toBe(202);
		const continuation = asRecord(await continuationResponse.json());
		const eventCursor = continuation.eventCursor as number;
		const followUpEvents = await collectUntilSuccess(`${websocketUrl}&after=${eventCursor}`);
		expect(followUpEvents.map((event) => event.type)).toContain("agent_delta");

		const task = asRecord(asRecord(await (await apiFetch(`/v1/tasks/${taskId}`)).json()).task);
		const messages = task.messages as Array<Record<string, unknown>>;
		expect(messages.map(({ role, text }) => ({ role, text }))).toEqual([
			{ role: "user", text: "hello" },
			{ role: "assistant", text: "ok" },
			{ role: "user", text: "follow up" },
			{ role: "assistant", text: "ok" },
		]);
	});

	it("returns the bound computer and browses authorized files", async () => {
		const deviceResponse = await apiFetch("/v1/device");
		const device = asRecord(asRecord(await deviceResponse.json()).device);
		expect(device.name).toBe("test-computer");

		const filesResponse = await apiFetch(`/v1/files?path=${encodeURIComponent(root)}`);
		const directory = asRecord(await filesResponse.json());
		expect((directory.entries as Array<Record<string, unknown>>).map((entry) => entry.name)).toContain(
			"package.json",
		);

		const previewResponse = await apiFetch(
			`/v1/files/content?path=${encodeURIComponent(join(root, "package.json"))}`,
		);
		expect(asRecord(await previewResponse.json()).content).toContain("fixture");

		const createResponse = await apiFetch("/v1/files/directories", {
			method: "POST",
			body: JSON.stringify({ parent: root, name: "created" }),
		});
		expect(createResponse.status).toBe(201);
		const escapedCreateResponse = await apiFetch("/v1/files/directories", {
			method: "POST",
			body: JSON.stringify({ parent: root, name: "../escaped" }),
		});
		expect(escapedCreateResponse.status).toBe(400);

		const renameDirectoryResponse = await apiFetch("/v1/files/rename", {
			method: "POST",
			body: JSON.stringify({ path: join(root, "created"), name: "renamed" }),
		});
		expect(asRecord(await renameDirectoryResponse.json()).path).toBe(join(root, "renamed"));

		await writeFile(join(root, "renamed", "before.txt"), "renamed content");
		const renameFileResponse = await apiFetch("/v1/files/rename", {
			method: "POST",
			body: JSON.stringify({ path: join(root, "renamed", "before.txt"), name: "after.txt" }),
		});
		expect(asRecord(await renameFileResponse.json()).path).toBe(join(root, "renamed", "after.txt"));

		const deleteRootResponse = await apiFetch("/v1/files/delete-directory", {
			method: "POST",
			body: JSON.stringify({ path: root }),
		});
		expect(deleteRootResponse.status).toBe(400);

		const deleteResponse = await apiFetch("/v1/files/delete-directory", {
			method: "POST",
			body: JSON.stringify({ path: join(root, "renamed") }),
		});
		expect(deleteResponse.status).toBe(200);
		const refreshedFiles = asRecord(await (await apiFetch(`/v1/files?path=${encodeURIComponent(root)}`)).json());
		expect((refreshedFiles.entries as Array<Record<string, unknown>>).map((entry) => entry.name)).not.toContain(
			"renamed",
		);
	});

	function apiFetch(path: string, init?: RequestInit): Promise<Response> {
		return fetch(`${baseUrl}${path}`, {
			...init,
			headers: { Authorization: "Bearer secret", "Content-Type": "application/json", ...init?.headers },
		});
	}
});

async function collectUntilSuccess(url: string): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		const events: Record<string, unknown>[] = [];
		const socket = new WebSocket(url);
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error("Timed out waiting for task completion"));
		}, 5_000);
		socket.on("message", (data) => {
			const event = asRecord(JSON.parse(data.toString()));
			events.push(event);
			if (event.type !== "status" || asRecord(event.data).status !== "SUCCESS") return;
			clearTimeout(timeout);
			socket.close();
			resolve(events);
		});
		socket.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}

function asRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected object");
	return value as Record<string, unknown>;
}
