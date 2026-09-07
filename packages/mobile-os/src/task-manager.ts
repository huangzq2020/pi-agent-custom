import { randomUUID } from "node:crypto";
import type { RuntimeExtensionHost } from "./runtime/extensions.ts";
import type { TaskHistoryStore } from "./task-history-store.ts";
import type {
	AgentRuntime,
	CreateTaskRequest,
	ProjectProfile,
	RuntimeEvent,
	TaskEvent,
	TaskSnapshot,
	WorkflowStep,
	WorkflowStepResult,
} from "./types.ts";
import type { WorkflowExecutor } from "./workflow/executor.ts";
import type { WorkflowRegistry } from "./workflow/registry.ts";

export interface TaskManagerOptions {
	runtime: AgentRuntime;
	extensions: RuntimeExtensionHost;
	executor: WorkflowExecutor;
	workflows: WorkflowRegistry;
	buildChangeGraph(root: string): Promise<TaskSnapshot["changeGraph"]>;
	updateProjectInsights?(project: ProjectProfile, task: TaskSnapshot, result: unknown): void;
	concurrency?: number;
	history?: TaskHistoryStore;
}

interface QueuedTask {
	snapshot: TaskSnapshot;
	project: ProjectProfile;
	controller: AbortController;
}

type TaskListener = (event: TaskEvent) => void;

export class TaskManager {
	readonly #tasks = new Map<string, QueuedTask>();
	readonly #listeners = new Map<string, Set<TaskListener>>();
	readonly #events = new Map<string, TaskEvent[]>();
	readonly #queue: string[] = [];
	readonly #concurrency: number;
	private readonly options: TaskManagerOptions;
	#active = 0;

	constructor(options: TaskManagerOptions) {
		this.options = options;
		this.#concurrency = Math.max(1, options.concurrency ?? 2);
	}

	create(request: CreateTaskRequest, project: ProjectProfile): TaskSnapshot {
		validateTaskRequest(request);
		const now = new Date().toISOString();
		const snapshot: TaskSnapshot = {
			id: randomUUID(),
			projectId: project.id,
			projectName: project.name,
			title: taskTitle(request, this.options.workflows),
			kind: request.kind,
			status: "CREATED",
			createdAt: now,
			updatedAt: now,
			prompt: request.prompt,
			workflowId: request.workflowId,
			progress: 0,
		};
		this.#tasks.set(snapshot.id, { snapshot, project, controller: new AbortController() });
		this.#events.set(snapshot.id, []);
		this.options.history?.save(snapshot);
		this.emit(snapshot.id, "snapshot", clone(snapshot));
		this.#queue.push(snapshot.id);
		queueMicrotask(() => this.pump());
		return clone(snapshot);
	}

	get(id: string): TaskSnapshot | undefined {
		const task = this.#tasks.get(id);
		return task ? clone(task.snapshot) : this.options.history?.get(id);
	}

	list(projectId?: string): TaskSnapshot[] {
		if (this.options.history) return this.options.history.list(projectId);
		return [...this.#tasks.values()]
			.map(({ snapshot }) => snapshot)
			.filter((snapshot) => projectId === undefined || snapshot.projectId === projectId)
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.map(clone);
	}

	async close(): Promise<void> {
		await this.options.history?.flush();
	}

	events(id: string, afterSequence = 0): TaskEvent[] {
		return (this.#events.get(id) ?? []).filter((event) => event.sequence > afterSequence).map(clone);
	}

	subscribe(id: string, listener: TaskListener): () => void {
		if (!this.#tasks.has(id)) throw new Error(`Task not found: ${id}`);
		const listeners = this.#listeners.get(id) ?? new Set<TaskListener>();
		listeners.add(listener);
		this.#listeners.set(id, listeners);
		return () => listeners.delete(listener);
	}

	cancel(id: string): TaskSnapshot {
		const task = this.#tasks.get(id);
		if (!task) throw new Error(`Task not found: ${id}`);
		if (["SUCCESS", "FAILED", "CANCELLED"].includes(task.snapshot.status)) return clone(task.snapshot);
		task.controller.abort(new Error("Task cancelled"));
		if (task.snapshot.status === "CREATED") this.setStatus(task.snapshot, "CANCELLED");
		return clone(task.snapshot);
	}

	private pump(): void {
		while (this.#active < this.#concurrency && this.#queue.length > 0) {
			const id = this.#queue.shift();
			if (!id) return;
			const task = this.#tasks.get(id);
			if (!task || task.snapshot.status !== "CREATED") continue;
			this.#active++;
			void this.run(task).finally(() => {
				this.#active--;
				this.pump();
			});
		}
	}

	private async run(queued: QueuedTask): Promise<void> {
		const { snapshot, project, controller } = queued;
		this.setStatus(snapshot, "RUNNING");
		const runtimeContext = { task: snapshot, project };
		try {
			await this.options.extensions.beforeTask(runtimeContext);
			let result: unknown;
			if (snapshot.kind === "chat") {
				const prompt = await this.options.extensions.transformPrompt(snapshot.prompt ?? "", runtimeContext);
				result = await this.options.runtime.run(
					{ cwd: project.root, prompt, readOnly: false, signal: controller.signal },
					(event) => this.onRuntimeEvent(snapshot, runtimeContext, event),
				);
			} else {
				const workflow = this.options.workflows.get(snapshot.workflowId ?? "");
				if (!workflow) throw new Error(`Workflow not found: ${snapshot.workflowId}`);
				result = await this.options.executor.execute(workflow, project, snapshot, controller.signal, {
					onStepStart: (step, completed, total) => this.onStepStart(snapshot, step, completed, total),
					onStepEnd: (step, stepResult, completed, total) =>
						this.onStepEnd(snapshot, step, stepResult, completed, total),
					onRuntimeEvent: (event) => this.onRuntimeEvent(snapshot, runtimeContext, event),
				});
			}
			snapshot.result = result;
			this.options.updateProjectInsights?.(project, snapshot, result);
			snapshot.changeGraph = await this.options.buildChangeGraph(project.root);
			snapshot.progress = 1;
			snapshot.currentStep = undefined;
			await this.options.extensions.afterTask(runtimeContext, result);
			this.setStatus(snapshot, "SUCCESS");
			this.emit(snapshot.id, "result", { result, changeGraph: snapshot.changeGraph });
		} catch (error) {
			if (controller.signal.aborted) {
				this.setStatus(snapshot, "CANCELLED");
				return;
			}
			snapshot.error = error instanceof Error ? error.message : String(error);
			this.setStatus(snapshot, "FAILED");
			this.emit(snapshot.id, "error", { message: snapshot.error });
		}
	}

	private onStepStart(snapshot: TaskSnapshot, step: WorkflowStep, completed: number, total: number): void {
		snapshot.currentStep = step.title;
		snapshot.progress = completed / total;
		snapshot.updatedAt = new Date().toISOString();
		this.options.history?.save(snapshot);
		this.emit(snapshot.id, "progress", {
			progress: snapshot.progress,
			stepId: step.id,
			title: step.title,
			phase: "started",
		});
	}

	private onStepEnd(
		snapshot: TaskSnapshot,
		step: WorkflowStep,
		result: WorkflowStepResult,
		completed: number,
		total: number,
	): void {
		snapshot.progress = completed / total;
		snapshot.updatedAt = new Date().toISOString();
		this.options.history?.save(snapshot);
		this.emit(snapshot.id, "progress", {
			progress: snapshot.progress,
			stepId: step.id,
			title: step.title,
			phase: "completed",
			output: result.output,
		});
	}

	private onRuntimeEvent(
		snapshot: TaskSnapshot,
		context: { task: TaskSnapshot; project: ProjectProfile },
		event: RuntimeEvent,
	): void {
		if (event.type === "text_delta") this.emit(snapshot.id, "agent_delta", { text: event.text });
		else this.emit(snapshot.id, "tool", event);
		void this.options.extensions.onRuntimeEvent(event, context);
	}

	private setStatus(snapshot: TaskSnapshot, status: TaskSnapshot["status"]): void {
		snapshot.status = status;
		snapshot.updatedAt = new Date().toISOString();
		this.options.history?.save(snapshot);
		this.emit(snapshot.id, "status", { status, snapshot: clone(snapshot) });
	}

	private emit(id: string, type: TaskEvent["type"], data: unknown): void {
		const history = this.#events.get(id) ?? [];
		const event: TaskEvent = {
			taskId: id,
			sequence: (history.at(-1)?.sequence ?? 0) + 1,
			timestamp: new Date().toISOString(),
			type,
			data,
		};
		history.push(event);
		if (history.length > 2_000) history.shift();
		this.#events.set(id, history);
		for (const listener of this.#listeners.get(id) ?? []) listener(clone(event));
	}
}

function taskTitle(request: CreateTaskRequest, workflows: WorkflowRegistry): string {
	if (request.kind === "workflow")
		return workflows.get(request.workflowId ?? "")?.name ?? request.workflowId ?? "Workflow";
	const prompt = request.prompt?.replace(/\s+/g, " ").trim() ?? "Agent 对话";
	return prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
}

function validateTaskRequest(request: CreateTaskRequest): void {
	if (request.kind === "chat" && (!request.prompt || request.prompt.trim() === "")) {
		throw new Error("Chat tasks require a prompt");
	}
	if (request.kind === "workflow" && (!request.workflowId || request.workflowId.trim() === "")) {
		throw new Error("Workflow tasks require a workflowId");
	}
}

function clone<T>(value: T): T {
	return structuredClone(value);
}
