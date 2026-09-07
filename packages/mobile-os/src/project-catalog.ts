import type { ProjectProfile } from "./types.ts";

export class ProjectCatalog {
	readonly #projects = new Map<string, ProjectProfile>();

	set(profile: ProjectProfile): void {
		this.#projects.set(profile.id, profile);
	}

	get(id: string): ProjectProfile | undefined {
		return this.#projects.get(id);
	}

	list(): ProjectProfile[] {
		return [...this.#projects.values()].sort((left, right) => left.name.localeCompare(right.name));
	}
}
