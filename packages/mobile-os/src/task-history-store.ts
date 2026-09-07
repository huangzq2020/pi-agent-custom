import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TaskSnapshot } from "./types.ts";

export class TaskHistoryStore {
	readonly #snapshots = new Map<string, TaskSnapshot>();
	readonly #path: string;
	#writeChain: Promise<void> = Promise.resolve();

	private constructor(path: string) {
		this.#path = path;
	}

	static async open(path: string): Promise<TaskHistoryStore> {
		const store = new TaskHistoryStore(path);
		try {
			const value: unknown = JSON.parse(await readFile(path, "utf8"));
			if (Array.isArray(value)) {
				for (const item of value) {
					if (!isTaskSnapshot(item)) continue;
					const snapshot = structuredClone(item);
					if (snapshot.status === "CREATED" || snapshot.status === "RUNNING") {
						snapshot.status = "FAILED";
						snapshot.error = "Gateway restarted before this task completed";
						snapshot.updatedAt = new Date().toISOString();
					}
					store.#snapshots.set(snapshot.id, snapshot);
				}
			}
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		}
		return store;
	}

	get(id: string): TaskSnapshot | undefined {
		const snapshot = this.#snapshots.get(id);
		return snapshot ? structuredClone(snapshot) : undefined;
	}

	list(projectId?: string): TaskSnapshot[] {
		return [...this.#snapshots.values()]
			.filter((snapshot) => projectId === undefined || snapshot.projectId === projectId)
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.map((snapshot) => structuredClone(snapshot));
	}

	save(snapshot: TaskSnapshot): void {
		this.#snapshots.set(snapshot.id, structuredClone(snapshot));
		this.#writeChain = this.#writeChain.then(() => this.persist());
	}

	async flush(): Promise<void> {
		await this.#writeChain;
	}

	private async persist(): Promise<void> {
		await mkdir(dirname(this.#path), { recursive: true });
		const temporary = `${this.#path}.tmp`;
		await writeFile(temporary, JSON.stringify(this.list(), undefined, 2), "utf8");
		await rename(temporary, this.#path);
	}
}

function isTaskSnapshot(value: unknown): value is TaskSnapshot {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return typeof record.id === "string" && typeof record.projectId === "string" && typeof record.status === "string";
}
