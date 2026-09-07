import { realpathSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export class ProjectPathPolicy {
	readonly #roots: string[];

	constructor(roots: string[]) {
		if (roots.length === 0) throw new Error("At least one project root is required");
		this.#roots = roots.map((root) => realpathSync(resolve(root)));
	}

	get roots(): string[] {
		return [...this.#roots];
	}

	async resolveProjectRoot(candidate: string): Promise<string> {
		if (candidate.trim() === "") throw new Error("Project root is required");
		const resolved = await realpath(isAbsolute(candidate) ? candidate : resolve(candidate));
		if (!this.#roots.some((root) => isWithin(root, resolved))) {
			throw new Error(`Project root is outside the configured roots: ${resolved}`);
		}
		return resolved;
	}

	async resolveDirectory(candidate: string): Promise<string> {
		const resolved = await this.resolveProjectRoot(candidate);
		if (!(await stat(resolved)).isDirectory()) throw new Error(`Path is not a directory: ${resolved}`);
		return resolved;
	}

	async resolveFile(candidate: string): Promise<string> {
		const resolved = await this.resolveProjectRoot(candidate);
		if (!(await stat(resolved)).isFile()) throw new Error(`Path is not a file: ${resolved}`);
		return resolved;
	}

	async resolveCloneDestination(parent: string, directoryName: string): Promise<string> {
		const resolvedParent = await this.resolveDirectory(parent);
		const cleanName = directoryName.trim();
		if (!cleanName || cleanName === "." || cleanName === ".." || basename(cleanName) !== cleanName) {
			throw new Error("Clone directory name is invalid");
		}
		const destination = join(resolvedParent, cleanName);
		if (!isWithin(resolvedParent, destination)) throw new Error("Clone destination escapes its parent directory");
		return destination;
	}
}

function isWithin(root: string, candidate: string): boolean {
	const child = relative(root, candidate);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}
