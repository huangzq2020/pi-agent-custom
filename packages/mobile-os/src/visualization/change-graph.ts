import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import type { ChangeGraph, GraphEdge, GraphNode } from "../types.ts";

const execFileAsync = promisify(execFile);

export async function buildChangeGraph(root: string): Promise<ChangeGraph> {
	let stdout: string;
	let statusOutput: string;
	try {
		[stdout, statusOutput] = await Promise.all([
			gitOutput(root, ["diff", "--numstat", "HEAD", "--", "."]),
			gitOutput(root, ["diff", "--name-status", "HEAD", "--", "."]),
		]);
	} catch {
		try {
			[stdout, statusOutput] = await Promise.all([
				gitOutput(root, ["diff", "--numstat", "--", "."]),
				gitOutput(root, ["diff", "--name-status", "--", "."]),
			]);
		} catch {
			return { nodes: [], edges: [] };
		}
	}
	const changes = parseChangeStatuses(statusOutput);
	const nodes: GraphNode[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (!line) continue;
		const [addedRaw, deletedRaw, path] = line.split("\t");
		if (!path) continue;
		nodes.push({
			id: normalizeGraphId(path),
			label: path,
			kind: "file",
			change: changes.get(normalizeGraphId(path)) ?? "modified",
			additions: addedRaw === "-" ? undefined : Number.parseInt(addedRaw, 10),
			deletions: deletedRaw === "-" ? undefined : Number.parseInt(deletedRaw, 10),
		});
	}
	try {
		const untracked = (await gitOutput(root, ["ls-files", "--others", "--exclude-standard"]))
			.split(/\r?\n/)
			.filter(Boolean);
		const known = new Set(nodes.map((node) => node.id));
		for (const path of untracked) {
			const id = normalizeGraphId(path);
			if (!known.has(id)) nodes.push({ id, label: path, kind: "file", change: "added" });
		}
	} catch {
		// A valid diff is still useful if listing untracked files fails.
	}
	const changedIds = new Set(nodes.map((node) => node.id));
	const edges: GraphEdge[] = [];
	for (const node of nodes) {
		if (![".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname(node.label))) continue;
		let content: string;
		try {
			content = await readFile(join(root, node.label), "utf8");
		} catch {
			continue;
		}
		for (const specifier of extractImports(content)) {
			if (!specifier.startsWith(".")) continue;
			const base = normalizeGraphId(normalize(join(node.label, "..", specifier)));
			const target = [...changedIds].find(
				(candidate) =>
					candidate === base || candidate.startsWith(`${base}.`) || candidate.startsWith(`${base}/index.`),
			);
			if (target) edges.push({ from: node.id, to: target, kind: "imports" });
		}
	}
	return { nodes, edges: dedupeEdges(edges) };
}

async function gitOutput(root: string, args: string[]): Promise<string> {
	const result = await execFileAsync("git", args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return result.stdout;
}

function parseChangeStatuses(output: string): Map<string, GraphNode["change"]> {
	const changes = new Map<string, GraphNode["change"]>();
	for (const line of output.split(/\r?\n/)) {
		const [status, ...paths] = line.split("\t");
		const path = paths.at(-1);
		if (!status || !path) continue;
		changes.set(
			normalizeGraphId(path),
			status.startsWith("A") ? "added" : status.startsWith("D") ? "deleted" : "modified",
		);
	}
	return changes;
}

function extractImports(source: string): string[] {
	const imports: string[] = [];
	const pattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g;
	for (const match of source.matchAll(pattern)) imports.push(match[1] ?? match[2]);
	return imports;
}

function normalizeGraphId(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
	const seen = new Set<string>();
	return edges.filter((edge) => {
		const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
