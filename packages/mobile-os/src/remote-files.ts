import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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
}
