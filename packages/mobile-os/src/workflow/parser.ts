import { parse as parseYaml } from "yaml";
import type { WorkflowDefinition, WorkflowStep } from "../types.ts";

export function parseWorkflow(source: string, origin = "workflow.yaml"): WorkflowDefinition {
	let value: unknown;
	try {
		value = parseYaml(source);
	} catch (error) {
		throw new Error(`${origin}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isRecord(value)) throw new Error(`${origin}: workflow must be an object`);
	const id = requiredString(value, "id", origin);
	const name = requiredString(value, "name", origin);
	const description = requiredString(value, "description", origin);
	const version = requiredString(value, "version", origin);
	if (!Array.isArray(value.steps) || value.steps.length === 0) {
		throw new Error(`${origin}: steps must be a non-empty array`);
	}
	const steps = value.steps.map((step, index) => parseStep(step, `${origin}: steps[${index}]`));
	const ids = new Set<string>();
	for (const step of steps) {
		if (ids.has(step.id)) throw new Error(`${origin}: duplicate step id ${step.id}`);
		ids.add(step.id);
	}
	for (const step of steps) {
		for (const need of step.needs) {
			if (!ids.has(need)) throw new Error(`${origin}: step ${step.id} needs unknown step ${need}`);
			if (need === step.id) throw new Error(`${origin}: step ${step.id} cannot depend on itself`);
		}
	}
	assertAcyclic(steps, origin);
	return { id, name, description, version, steps };
}

function parseStep(value: unknown, origin: string): WorkflowStep {
	if (!isRecord(value)) throw new Error(`${origin} must be an object`);
	const id = requiredString(value, "id", origin);
	const title = optionalString(value.title) ?? id;
	const needs = optionalStringArray(value.needs, `${origin}.needs`);
	const hasTool = typeof value.tool === "string";
	const hasAgent = typeof value.agent === "string";
	if (hasTool === hasAgent) throw new Error(`${origin} must define exactly one of tool or agent`);
	if (hasTool) {
		return {
			id,
			title,
			needs,
			type: "tool",
			tool: value.tool as string,
			input: isRecord(value.input) ? value.input : {},
		};
	}
	return {
		id,
		title,
		needs,
		type: "agent",
		prompt: value.agent as string,
		readOnly: value.readOnly !== false,
	};
}

function assertAcyclic(steps: WorkflowStep[], origin: string): void {
	const byId = new Map(steps.map((step) => [step.id, step]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) throw new Error(`${origin}: dependency cycle contains ${id}`);
		if (visited.has(id)) return;
		visiting.add(id);
		for (const need of byId.get(id)?.needs ?? []) visit(need);
		visiting.delete(id);
		visited.add(id);
	};
	for (const step of steps) visit(step.id);
}

function requiredString(value: Record<string, unknown>, key: string, origin: string): string {
	const result = optionalString(value[key]);
	if (!result) throw new Error(`${origin}: ${key} must be a non-empty string`);
	return result;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function optionalStringArray(value: unknown, origin: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
		throw new Error(`${origin} must be an array of non-empty strings`);
	}
	return value.map((item) => String(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
