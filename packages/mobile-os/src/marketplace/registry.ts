import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { WorkflowDefinition, WorkflowPackageManifest } from "../types.ts";
import { parseWorkflow } from "../workflow/parser.ts";
import type { WorkflowRegistry } from "../workflow/registry.ts";

export interface InstalledWorkflowPackage {
	manifest: WorkflowPackageManifest;
	installedAt: string;
}

export class MarketplaceRegistry {
	readonly #installed = new Map<string, InstalledWorkflowPackage>();
	private readonly workflows: WorkflowRegistry;

	constructor(workflows: WorkflowRegistry) {
		this.workflows = workflows;
	}

	list(): InstalledWorkflowPackage[] {
		return [...this.#installed.values()].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
	}

	async installLocal(manifestPath: string, allowedRoot: string): Promise<InstalledWorkflowPackage> {
		const absoluteManifest = await realpath(resolve(manifestPath));
		const packageRoot = dirname(absoluteManifest);
		if (!isWithin(await realpath(resolve(allowedRoot)), packageRoot)) {
			throw new Error("Workflow package is outside the configured marketplace root");
		}
		const manifest = parseManifest(JSON.parse(await readFile(absoluteManifest, "utf8")), absoluteManifest);
		const workflowPath = await realpath(resolve(packageRoot, manifest.workflow));
		if (!isWithin(packageRoot, workflowPath)) {
			throw new Error("Workflow path escapes the package directory");
		}
		const workflow = parseWorkflow(await readFile(workflowPath, "utf8"), workflowPath);
		this.install(manifest, workflow);
		const installed = { manifest, installedAt: new Date().toISOString() };
		this.#installed.set(manifest.id, installed);
		return installed;
	}

	private install(manifest: WorkflowPackageManifest, workflow: WorkflowDefinition): void {
		if (manifest.id !== workflow.id) throw new Error("Manifest id must match workflow id");
		this.workflows.replace(workflow);
	}
}

function isWithin(root: string, candidate: string): boolean {
	const child = relative(root, candidate);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function parseManifest(value: unknown, origin: string): WorkflowPackageManifest {
	if (!isRecord(value)) throw new Error(`${origin}: manifest must be an object`);
	return {
		id: stringField(value, "id", origin),
		name: stringField(value, "name", origin),
		version: stringField(value, "version", origin),
		author: stringField(value, "author", origin),
		description: stringField(value, "description", origin),
		workflow: stringField(value, "workflow", origin),
	};
}

function stringField(value: Record<string, unknown>, field: string, origin: string): string {
	const result = value[field];
	if (typeof result !== "string" || result.trim() === "") throw new Error(`${origin}: ${field} is required`);
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
