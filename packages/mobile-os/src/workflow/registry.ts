import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { WorkflowDefinition } from "../types.ts";
import { parseWorkflow } from "./parser.ts";

export class WorkflowRegistry {
	readonly #workflows = new Map<string, WorkflowDefinition>();

	register(workflow: WorkflowDefinition): void {
		if (this.#workflows.has(workflow.id)) throw new Error(`Workflow already registered: ${workflow.id}`);
		this.#workflows.set(workflow.id, workflow);
	}

	replace(workflow: WorkflowDefinition): void {
		this.#workflows.set(workflow.id, workflow);
	}

	get(id: string): WorkflowDefinition | undefined {
		return this.#workflows.get(id);
	}

	list(): WorkflowDefinition[] {
		return [...this.#workflows.values()].sort((left, right) => left.name.localeCompare(right.name));
	}

	async loadDirectory(directory: string): Promise<void> {
		const files = (await readdir(directory)).filter((file) => [".yaml", ".yml"].includes(extname(file))).sort();
		for (const file of files) {
			const path = join(directory, file);
			this.register(parseWorkflow(await readFile(path, "utf8"), path));
		}
	}
}
