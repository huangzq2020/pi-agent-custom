import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskHistoryStore } from "../src/task-history-store.ts";
import type { TaskSnapshot } from "../src/types.ts";

describe("task history store", () => {
	let directory: string | undefined;

	afterEach(async () => {
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	it("persists completed conversations across gateway restarts", async () => {
		directory = await mkdtemp(join(tmpdir(), "pi-mobile-history-"));
		const path = join(directory, "tasks.json");
		const store = await TaskHistoryStore.open(path);
		const task: TaskSnapshot = {
			id: "task",
			projectId: "project",
			projectName: "Project",
			title: "解释项目",
			kind: "chat",
			status: "SUCCESS",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:01:00.000Z",
			progress: 1,
			result: { text: "done" },
		};
		store.save(task);
		await store.flush();

		const reopened = await TaskHistoryStore.open(path);
		expect(reopened.get("task")).toEqual(task);
	});
});
