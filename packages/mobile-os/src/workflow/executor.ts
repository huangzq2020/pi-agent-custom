import type { RuntimeExtensionHost } from "../runtime/extensions.ts";
import type {
	AgentRuntime,
	ProjectProfile,
	RuntimeEvent,
	TaskSnapshot,
	WorkflowDefinition,
	WorkflowResult,
	WorkflowStep,
	WorkflowStepResult,
} from "../types.ts";

export type WorkflowTool = (input: Record<string, unknown>, context: WorkflowExecutionContext) => Promise<unknown>;

export interface WorkflowExecutionContext {
	project: ProjectProfile;
	task: TaskSnapshot;
	signal: AbortSignal;
	results: ReadonlyMap<string, WorkflowStepResult>;
}

export interface WorkflowExecutorOptions {
	runtime: AgentRuntime;
	extensions: RuntimeExtensionHost;
	tools: ReadonlyMap<string, WorkflowTool>;
}

export interface WorkflowCallbacks {
	onStepStart(step: WorkflowStep, completed: number, total: number): void;
	onStepEnd(step: WorkflowStep, result: WorkflowStepResult, completed: number, total: number): void;
	onRuntimeEvent(event: RuntimeEvent): void;
}

export class WorkflowExecutor {
	private readonly options: WorkflowExecutorOptions;

	constructor(options: WorkflowExecutorOptions) {
		this.options = options;
	}

	async execute(
		workflow: WorkflowDefinition,
		project: ProjectProfile,
		task: TaskSnapshot,
		signal: AbortSignal,
		callbacks: WorkflowCallbacks,
	): Promise<WorkflowResult> {
		const pending = new Map(workflow.steps.map((step) => [step.id, step]));
		const results = new Map<string, WorkflowStepResult>();
		while (pending.size > 0) {
			if (signal.aborted) throw signal.reason;
			const ready = [...pending.values()].filter((step) => step.needs.every((need) => results.has(need)));
			if (ready.length === 0) throw new Error(`Workflow ${workflow.id} cannot make progress`);
			const completedBefore = results.size;
			const batch = await Promise.all(
				ready.map(async (step, index) => {
					callbacks.onStepStart(step, completedBefore + index, workflow.steps.length);
					const startedAt = new Date().toISOString();
					const context: WorkflowExecutionContext = { project, task, signal, results };
					const output = await this.executeStep(step, context, callbacks);
					return {
						step,
						result: { stepId: step.id, startedAt, completedAt: new Date().toISOString(), output },
					};
				}),
			);
			for (const { step, result } of batch) {
				results.set(step.id, result);
				pending.delete(step.id);
				callbacks.onStepEnd(step, result, results.size, workflow.steps.length);
			}
		}
		const ordered = workflow.steps.map((step) => results.get(step.id)).filter((value) => value !== undefined);
		return {
			workflowId: workflow.id,
			steps: ordered,
			output: ordered.at(-1)?.output,
		};
	}

	private async executeStep(
		step: WorkflowStep,
		context: WorkflowExecutionContext,
		callbacks: WorkflowCallbacks,
	): Promise<unknown> {
		if (step.type === "tool") {
			const tool = this.options.tools.get(step.tool);
			if (!tool) throw new Error(`Unknown workflow tool: ${step.tool}`);
			return tool(step.input, context);
		}
		const runtimeContext = { task: context.task, project: context.project };
		const prompt = await this.options.extensions.transformPrompt(
			interpolatePrompt(step.prompt, context.results),
			runtimeContext,
		);
		const result = await this.options.runtime.run(
			{ cwd: context.project.root, prompt, readOnly: step.readOnly, signal: context.signal },
			(event) => callbacks.onRuntimeEvent(event),
		);
		return result.text;
	}
}

function interpolatePrompt(prompt: string, results: ReadonlyMap<string, WorkflowStepResult>): string {
	return prompt.replace(/\{\{steps\.([a-zA-Z0-9_-]+)\}\}/g, (_match, stepId: string) => {
		const output = results.get(stepId)?.output;
		return output === undefined ? "" : typeof output === "string" ? output : JSON.stringify(output, undefined, 2);
	});
}
