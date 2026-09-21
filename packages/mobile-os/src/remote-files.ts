import { mkdir, readdir, readFile, rename as renamePath, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ProjectPathPolicy } from "./path-policy.ts";
import type { RemoteDirectory, RemoteFileEntry } from "./types.ts";

const maxPreviewBytes = 512 * 1024;

export class RemoteFileService {
	private readonly pathPolicy: ProjectPathPolicy;

	constructor(pathPolicy: ProjectPathPolicy) {
		this.pathPolicy = pathPolicy;
	}

	async list(path?: string): Promise<RemoteDirectory> {
		if (!path) {
			return {
				entries: this.pathPolicy.roots.map((root) => ({ name: root, path: root, type: "directory" })),
			};
		}
		const directory = await this.pathPolicy.resolveDirectory(path);
		const entries = await Promise.all(
			(await readdir(directory, { withFileTypes: true })).map(
				async (entry): Promise<RemoteFileEntry | undefined> => {
					if (!entry.isDirectory() && !entry.isFile() && !entry.isSymbolicLink()) return undefined;
					const child = await this.pathPolicy.resolveProjectRoot(join(directory, entry.name));
					const metadata = await stat(child);
					return {
						name: entry.name,
						path: child,
						type: metadata.isDirectory() ? "directory" : "file",
						size: metadata.isFile() ? metadata.size : undefined,
						modifiedAt: metadata.mtime.toISOString(),
					};
				},
			),
		);
		const parentCandidate = dirname(directory);
		const parent = this.pathPolicy.roots.includes(directory)
			? undefined
			: await this.pathPolicy.resolveDirectory(parentCandidate);
		return {
			path: directory,
			parent,
			entries: entries
				.filter((entry): entry is RemoteFileEntry => entry !== undefined)
				.sort((left, right) => {
					if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
					return left.name.localeCompare(right.name);
				}),
		};
	}

	async preview(path: string): Promise<{ path: string; content: string; truncated: boolean }> {
		const file = await this.pathPolicy.resolveFile(path);
		const metadata = await stat(file);
		const buffer = await readFile(file);
		const sample = buffer.subarray(0, maxPreviewBytes);
		if (sample.includes(0)) throw new Error("Binary files cannot be previewed as text");
		return { path: file, content: sample.toString("utf8"), truncated: metadata.size > maxPreviewBytes };
	}

	async createDirectory(parent: string, name: string): Promise<{ path: string }> {
		const directory = await this.pathPolicy.resolveDirectory(parent);
		const destination = join(directory, validName(name));
		await mkdir(destination);
		return { path: await this.pathPolicy.resolveDirectory(destination) };
	}

	async rename(path: string, name: string): Promise<{ path: string }> {
		const source = await this.pathPolicy.resolveProjectRoot(path);
		this.requireMutablePath(source);
		const destination = join(dirname(source), validName(name));
		try {
			await stat(destination);
			throw new Error(`Destination already exists: ${destination}`);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		}
		await renamePath(source, destination);
		return { path: await this.pathPolicy.resolveProjectRoot(destination) };
	}

	async deleteDirectory(path: string): Promise<void> {
		const directory = await this.pathPolicy.resolveDirectory(path);
		this.requireMutablePath(directory);
		await rm(directory, { recursive: true });
	}

	private requireMutablePath(path: string): void {
		if (this.pathPolicy.roots.includes(path))
			throw new Error("Authorized root directories cannot be renamed or deleted");
	}
}

function validName(value: string): string {
	const name = value.trim();
	if (!name || name === "." || name === ".." || basename(name) !== name) {
		throw new Error("File or directory name is invalid");
	}
	return name;
}
