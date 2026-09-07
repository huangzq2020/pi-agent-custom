export type TaskStatus = "CREATED" | "RUNNING" | "WAITING_CONFIRM" | "SUCCESS" | "FAILED" | "CANCELLED";

export type TaskKind = "chat" | "workflow";

export interface ProjectProfile {
	id: string;
	root: string;
	name: string;
	summary: string;
	languages: string[];
	frameworks: string[];
	databases: string[];
	caches: string[];
	packageManagers: string[];
	manifests: string[];
	hasGit: boolean;
	fileCount: number;
	analyzedAt: string;
	featureHighlights?: string[];
	alerts?: ProjectAlert[];
	insightsUpdatedAt?: string;
}

export interface ProjectAlert {
	kind: "bug" | "security";
	severity: "critical" | "warning";
	text: string;
}

export interface Capability {
	id: string;
	title: string;
	description: string;
	workflowId: string;
	category: "analysis" | "quality" | "security" | "refactor" | "testing" | "project";
	destructive: boolean;
}

export interface DynamicUi {
	projectId?: string;
	buttons: Capability[];
}

export interface WorkflowToolStep {
	id: string;
	title: string;
	needs: string[];
	type: "tool";
	tool: string;
	input: Record<string, unknown>;
}

export interface WorkflowAgentStep {
	id: string;
	title: string;
	needs: string[];
	type: "agent";
	prompt: string;
	readOnly: boolean;
}

export type WorkflowStep = WorkflowToolStep | WorkflowAgentStep;

export interface WorkflowDefinition {
	id: string;
	name: string;
	description: string;
	version: string;
	steps: WorkflowStep[];
}

export interface WorkflowStepResult {
	stepId: string;
	startedAt: string;
	completedAt: string;
	output: unknown;
}

export interface WorkflowResult {
	workflowId: string;
	steps: WorkflowStepResult[];
	output: unknown;
}

export interface GraphNode {
	id: string;
	label: string;
	kind: "file" | "dependency";
	change?: "added" | "modified" | "deleted";
	additions?: number;
	deletions?: number;
}

export interface GraphEdge {
	from: string;
	to: string;
	kind: "imports" | "changed-with";
}

export interface ChangeGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface CreateTaskRequest {
	projectId: string;
	kind: TaskKind;
	prompt?: string;
	workflowId?: string;
}

export interface TaskSnapshot {
	id: string;
	projectId: string;
	projectName: string;
	title: string;
	kind: TaskKind;
	status: TaskStatus;
	createdAt: string;
	updatedAt: string;
	prompt?: string;
	workflowId?: string;
	progress: number;
	currentStep?: string;
	result?: unknown;
	changeGraph?: ChangeGraph;
	error?: string;
}

export interface GatewayDevice {
	id: string;
	name: string;
	platform: string;
	version: string;
	roots: string[];
}

export interface RemoteFileEntry {
	name: string;
	path: string;
	type: "directory" | "file";
	size?: number;
	modifiedAt?: string;
}

export interface RemoteDirectory {
	path?: string;
	parent?: string;
	entries: RemoteFileEntry[];
}

export interface GitHubRepository {
	id: number;
	fullName: string;
	description?: string;
	htmlUrl: string;
	cloneUrl: string;
	language?: string;
	stars: number;
	updatedAt: string;
}

export interface TaskEvent {
	taskId: string;
	sequence: number;
	timestamp: string;
	type: "snapshot" | "status" | "progress" | "agent_delta" | "tool" | "result" | "error";
	data: unknown;
}

export interface RuntimeRequest {
	cwd: string;
	prompt: string;
	readOnly: boolean;
	signal: AbortSignal;
}

export type RuntimeEvent =
	| { type: "text_delta"; text: string }
	| { type: "tool_start"; toolName: string; toolCallId: string }
	| { type: "tool_end"; toolName: string; toolCallId: string; isError: boolean };

export interface RuntimeResult {
	text: string;
}

export interface AgentRuntime {
	run(request: RuntimeRequest, onEvent: (event: RuntimeEvent) => void): Promise<RuntimeResult>;
}

export interface RuntimeTaskContext {
	task: TaskSnapshot;
	project: ProjectProfile;
}

export interface MobileRuntimeExtension {
	id: string;
	beforeTask?(context: RuntimeTaskContext): Promise<void> | void;
	transformPrompt?(prompt: string, context: RuntimeTaskContext): Promise<string> | string;
	onRuntimeEvent?(event: RuntimeEvent, context: RuntimeTaskContext): Promise<void> | void;
	afterTask?(context: RuntimeTaskContext, result: unknown): Promise<void> | void;
}

export interface WorkflowPackageManifest {
	id: string;
	name: string;
	version: string;
	author: string;
	description: string;
	workflow: string;
}
