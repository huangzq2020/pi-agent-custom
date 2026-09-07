import { createHash } from "node:crypto";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityEngine } from "./capability-engine.ts";
import { MobileGateway } from "./gateway.ts";
import { GitHubService } from "./github-service.ts";
import { MarketplaceRegistry } from "./marketplace/registry.ts";
import { ProjectPathPolicy } from "./path-policy.ts";
import { ProjectAnalyzer } from "./project-analyzer.ts";
import { ProjectCatalog } from "./project-catalog.ts";
import { updateProjectInsights } from "./project-insight-updater.ts";
import { RemoteFileService } from "./remote-files.ts";
import { createMobileContextExtension, RuntimeExtensionHost } from "./runtime/extensions.ts";
import { PiAgentRuntimeAdapter } from "./runtime/pi-agent-adapter.ts";
import { TaskHistoryStore } from "./task-history-store.ts";
import { TaskManager } from "./task-manager.ts";
import { buildChangeGraph } from "./visualization/change-graph.ts";
import { WorkflowExecutor, type WorkflowTool } from "./workflow/executor.ts";
import { WorkflowRegistry } from "./workflow/registry.ts";

export interface CreateMobileOsOptions {
	host?: string;
	port?: number;
	token?: string;
	projectRoots?: string[];
	workflowDirectory?: string;
	marketplaceRoot?: string;
	allowedOrigins?: string[];
	concurrency?: number;
	dataDirectory?: string;
	githubToken?: string;
}

export async function createMobileOs(options: CreateMobileOsOptions = {}): Promise<MobileGateway> {
	const analyzer = new ProjectAnalyzer();
	const projects = new ProjectCatalog();
	const pathPolicy = new ProjectPathPolicy(options.projectRoots ?? [process.cwd()]);
	const workflows = new WorkflowRegistry();
	await workflows.loadDirectory(options.workflowDirectory ?? fileURLToPath(new URL("../workflows", import.meta.url)));
	const runtime = new PiAgentRuntimeAdapter();
	const extensions = new RuntimeExtensionHost();
	extensions.register(createMobileContextExtension());
	const tools = new Map<string, WorkflowTool>([
		["project_profile", async (_input, context) => context.project],
		[
			"repo_summary",
			async (_input, context) => ({
				name: context.project.name,
				summary: context.project.summary,
				languages: context.project.languages,
				frameworks: context.project.frameworks,
				manifests: context.project.manifests,
				fileCount: context.project.fileCount,
			}),
		],
		["git_change_graph", async (_input, context) => buildChangeGraph(context.project.root)],
	]);
	const executor = new WorkflowExecutor({ runtime, extensions, tools });
	const history = await TaskHistoryStore.open(
		join(options.dataDirectory ?? join(homedir(), ".pi", "mobile-os"), "tasks.json"),
	);
	const tasks = new TaskManager({
		runtime,
		extensions,
		executor,
		workflows,
		buildChangeGraph,
		updateProjectInsights,
		concurrency: options.concurrency,
		history,
	});
	const deviceName = hostname();
	return new MobileGateway({
		host: options.host ?? "127.0.0.1",
		port: options.port ?? 8787,
		token: options.token,
		allowedOrigins: options.allowedOrigins,
		marketplaceRoot: options.marketplaceRoot,
		pathPolicy,
		projects,
		analyzer,
		capabilities: new CapabilityEngine(),
		workflows,
		marketplace: new MarketplaceRegistry(workflows),
		tasks,
		device: {
			id: createHash("sha256")
				.update(`${deviceName}\0${pathPolicy.roots.join("\0")}`)
				.digest("hex")
				.slice(0, 16),
			name: deviceName,
			platform: process.platform,
			version: "0.1.0",
			roots: pathPolicy.roots,
		},
		files: new RemoteFileService(pathPolicy),
		github: new GitHubService(pathPolicy, options.githubToken),
	});
}
