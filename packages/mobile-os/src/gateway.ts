import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { CapabilityEngine } from "./capability-engine.ts";
import type { GitHubService } from "./github-service.ts";
import type { MarketplaceRegistry } from "./marketplace/registry.ts";
import type { ProjectPathPolicy } from "./path-policy.ts";
import type { ProjectAnalyzer } from "./project-analyzer.ts";
import type { ProjectCatalog } from "./project-catalog.ts";
import type { RemoteFileService } from "./remote-files.ts";
import type { TaskManager } from "./task-manager.ts";
import type { CreateTaskRequest, GatewayDevice, ProjectProfile } from "./types.ts";
import type { WorkflowRegistry } from "./workflow/registry.ts";

export interface MobileGatewayOptions {
	host: string;
	port: number;
	token?: string;
	allowedOrigins?: string[];
	marketplaceRoot?: string;
	pathPolicy: ProjectPathPolicy;
	projects: ProjectCatalog;
	analyzer: ProjectAnalyzer;
	capabilities: CapabilityEngine;
	workflows: WorkflowRegistry;
	marketplace: MarketplaceRegistry;
	tasks: TaskManager;
	device: GatewayDevice;
	files: RemoteFileService;
	github: GitHubService;
}

export class MobileGateway {
	readonly #server: Server;
	readonly #webSockets = new WebSocketServer({ noServer: true });
	private readonly options: MobileGatewayOptions;

	constructor(options: MobileGatewayOptions) {
		this.options = options;
		this.#server = createServer((request, response) => {
			void this.handleRequest(request, response);
		});
		this.#server.on("upgrade", (request, socket, head) => {
			const url = new URL(request.url ?? "/", "http://localhost");
			const match = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/events$/);
			if (!match || !this.authorized(request, url.searchParams.get("token") ?? undefined)) {
				socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			const taskId = decodeURIComponent(match[1]);
			if (!this.options.tasks.get(taskId)) {
				socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			this.#webSockets.handleUpgrade(request, socket, head, (webSocket) => {
				const after = Number.parseInt(url.searchParams.get("after") ?? "0", 10) || 0;
				for (const event of this.options.tasks.events(taskId, after)) webSocket.send(JSON.stringify(event));
				const unsubscribe = this.options.tasks.subscribe(taskId, (event) => {
					if (webSocket.readyState === webSocket.OPEN) webSocket.send(JSON.stringify(event));
				});
				webSocket.on("close", unsubscribe);
			});
		});
	}

	async start(): Promise<{ host: string; port: number }> {
		await new Promise<void>((resolve, reject) => {
			this.#server.once("error", reject);
			this.#server.listen(this.options.port, this.options.host, () => {
				this.#server.off("error", reject);
				resolve();
			});
		});
		const address = this.#server.address() as AddressInfo;
		return { host: this.options.host, port: address.port };
	}

	async stop(): Promise<void> {
		for (const client of this.#webSockets.clients) client.close(1001, "Server stopping");
		this.#webSockets.close();
		await new Promise<void>((resolve, reject) => {
			this.#server.close((error) => (error ? reject(error) : resolve()));
		});
		await this.options.tasks.close();
	}

	private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
		this.applyCors(request, response);
		if (request.method === "OPTIONS") {
			response.writeHead(204).end();
			return;
		}
		const url = new URL(request.url ?? "/", "http://localhost");
		if (request.method === "GET" && url.pathname === "/v1/health") {
			this.json(response, 200, { status: "ok", service: "pi-agent-mobile-os" });
			return;
		}
		if (!this.authorized(request)) {
			this.json(response, 401, { error: "Unauthorized" });
			return;
		}
		try {
			await this.route(request, response, url);
		} catch (error) {
			this.json(response, error instanceof NotFoundError ? 404 : 400, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
		if (request.method === "GET" && url.pathname === "/v1/device") {
			this.json(response, 200, { device: this.options.device });
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/files") {
			this.json(response, 200, await this.options.files.list(url.searchParams.get("path") ?? undefined));
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/files/content") {
			this.json(response, 200, await this.options.files.preview(requiredQuery(url, "path")));
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/github/search") {
			const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
			this.json(response, 200, await this.options.github.search(requiredQuery(url, "q"), page));
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/github/clone") {
			const body = await readJsonBody(request);
			const root = await this.options.github.clone(
				requiredString(body, "cloneUrl"),
				requiredString(body, "targetRoot"),
				optionalString(body.directoryName),
			);
			const profile = await this.options.analyzer.analyze(root);
			this.options.projects.set(profile);
			this.json(response, 201, {
				project: profile,
				ui: this.options.capabilities.recommend(profile),
			});
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/projects") {
			this.json(response, 200, { projects: this.options.projects.list() });
			return;
		}
		const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)$/);
		if (request.method === "GET" && projectMatch) {
			this.json(response, 200, { project: this.requireProject(decodeURIComponent(projectMatch[1])) });
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/projects/analyze") {
			const body = await readJsonBody(request);
			const root = await this.options.pathPolicy.resolveProjectRoot(requiredString(body, "root"));
			const profile = await this.options.analyzer.analyze(root);
			this.options.projects.set(profile);
			this.json(response, 200, { project: profile, ui: this.options.capabilities.recommend(profile) });
			return;
		}
		const capabilitiesMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/capabilities$/);
		if (request.method === "GET" && capabilitiesMatch) {
			const project = this.requireProject(decodeURIComponent(capabilitiesMatch[1]));
			this.json(response, 200, this.options.capabilities.recommend(project));
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/capabilities") {
			this.json(response, 200, this.options.capabilities.recommend());
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/workflows") {
			this.json(response, 200, { workflows: this.options.workflows.list() });
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/marketplace/workflows") {
			this.json(response, 200, { packages: this.options.marketplace.list() });
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/marketplace/install") {
			if (!this.options.marketplaceRoot) throw new Error("Local marketplace installation is disabled");
			const body = await readJsonBody(request);
			const installed = await this.options.marketplace.installLocal(
				requiredString(body, "manifestPath"),
				this.options.marketplaceRoot,
			);
			this.json(response, 201, installed);
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/tasks") {
			const body = await readJsonBody(request);
			const taskRequest = parseTaskRequest(body);
			const project = this.requireProject(taskRequest.projectId);
			const task = this.options.tasks.create(taskRequest, project);
			this.json(response, 202, { task });
			return;
		}
		if (request.method === "GET" && url.pathname === "/v1/tasks") {
			this.json(response, 200, { tasks: this.options.tasks.list(url.searchParams.get("projectId") ?? undefined) });
			return;
		}
		const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/);
		if (request.method === "GET" && taskMatch) {
			const task = this.options.tasks.get(decodeURIComponent(taskMatch[1]));
			if (!task) throw new NotFoundError("Task not found");
			this.json(response, 200, { task });
			return;
		}
		const eventsMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/events$/);
		if (request.method === "GET" && eventsMatch) {
			const taskId = decodeURIComponent(eventsMatch[1]);
			if (!this.options.tasks.get(taskId)) throw new NotFoundError("Task not found");
			const after = Number.parseInt(url.searchParams.get("after") ?? "0", 10) || 0;
			this.json(response, 200, { events: this.options.tasks.events(taskId, after) });
			return;
		}
		const cancelMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/cancel$/);
		if (request.method === "POST" && cancelMatch) {
			this.json(response, 200, { task: this.options.tasks.cancel(decodeURIComponent(cancelMatch[1])) });
			return;
		}
		throw new NotFoundError("Route not found");
	}

	private requireProject(id: string): ProjectProfile {
		const project = this.options.projects.get(id);
		if (!project) throw new NotFoundError("Project not found");
		return project;
	}

	private authorized(request: IncomingMessage, queryToken?: string): boolean {
		if (!this.options.token) return true;
		const header = request.headers.authorization;
		const supplied = queryToken ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
		if (!supplied) return false;
		const expectedBuffer = Buffer.from(this.options.token);
		const suppliedBuffer = Buffer.from(supplied);
		return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
	}

	private applyCors(request: IncomingMessage, response: ServerResponse): void {
		const origin = request.headers.origin;
		if (origin && this.options.allowedOrigins?.includes(origin)) {
			response.setHeader("Access-Control-Allow-Origin", origin);
			response.setHeader("Vary", "Origin");
		}
		response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
		response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	}

	private json(response: ServerResponse, status: number, body: unknown): void {
		response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
		response.end(JSON.stringify(body));
	}
}

function requiredQuery(url: URL, key: string): string {
	const value = url.searchParams.get(key)?.trim();
	if (!value) throw new Error(`${key} is required`);
	return value;
}

class NotFoundError extends Error {}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > 1024 * 1024) throw new Error("Request body exceeds 1 MiB");
		chunks.push(buffer);
	}
	if (chunks.length === 0) return {};
	const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (!isRecord(value)) throw new Error("JSON body must be an object");
	return value;
}

function parseTaskRequest(body: Record<string, unknown>): CreateTaskRequest {
	const kind = body.kind;
	if (kind !== "chat" && kind !== "workflow") throw new Error("kind must be chat or workflow");
	return {
		projectId: requiredString(body, "projectId"),
		kind,
		prompt: optionalString(body.prompt),
		workflowId: optionalString(body.workflowId),
	};
}

function requiredString(body: Record<string, unknown>, key: string): string {
	const value = optionalString(body[key]);
	if (!value) throw new Error(`${key} is required`);
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
