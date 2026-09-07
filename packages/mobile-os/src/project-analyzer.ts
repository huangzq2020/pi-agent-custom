import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { ProjectProfile } from "./types.ts";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".dart_tool", "vendor", "target"]);
const languageByExtension: Record<string, string> = {
	".c": "C",
	".cpp": "C++",
	".cs": "C#",
	".dart": "Dart",
	".go": "Go",
	".java": "Java",
	".js": "JavaScript",
	".kt": "Kotlin",
	".php": "PHP",
	".py": "Python",
	".rb": "Ruby",
	".rs": "Rust",
	".swift": "Swift",
	".ts": "TypeScript",
	".tsx": "TypeScript",
};

export class ProjectAnalyzer {
	private readonly maxFiles: number;
	private readonly maxDepth: number;

	constructor(maxFiles = 20_000, maxDepth = 10) {
		this.maxFiles = maxFiles;
		this.maxDepth = maxDepth;
	}

	async analyze(root: string): Promise<ProjectProfile> {
		const files = await this.scan(root);
		const paths = new Set(files);
		const manifests = files.filter((file) => isManifest(file));
		const languages = new Set<string>();
		for (const file of files) {
			const dot = file.lastIndexOf(".");
			const language = dot >= 0 ? languageByExtension[file.slice(dot).toLowerCase()] : undefined;
			if (language) languages.add(language);
		}

		const frameworks = new Set<string>();
		const databases = new Set<string>();
		const caches = new Set<string>();
		const packageManagers = new Set<string>();
		if (paths.has("package.json")) {
			packageManagers.add(paths.has("pnpm-lock.yaml") ? "pnpm" : paths.has("yarn.lock") ? "Yarn" : "npm");
			await this.analyzeNodeManifest(root, frameworks, databases, caches);
		}
		if (paths.has("pubspec.yaml")) {
			packageManagers.add("pub");
			frameworks.add("Flutter");
		}
		if (paths.has("pom.xml") || paths.has("build.gradle") || paths.has("build.gradle.kts")) {
			packageManagers.add(paths.has("pom.xml") ? "Maven" : "Gradle");
			const javaManifest = paths.has("pom.xml")
				? "pom.xml"
				: paths.has("build.gradle.kts")
					? "build.gradle.kts"
					: "build.gradle";
			const content = await readFile(join(root, javaManifest), "utf8");
			if (/spring-boot/i.test(content)) frameworks.add("Spring Boot");
			if (/mysql/i.test(content)) databases.add("MySQL");
			if (/postgres/i.test(content)) databases.add("PostgreSQL");
			if (/redis/i.test(content)) caches.add("Redis");
		}
		if (paths.has("requirements.txt") || paths.has("pyproject.toml")) packageManagers.add("pip");

		return {
			id: createHash("sha256").update(root).digest("hex").slice(0, 16),
			root,
			name: basename(root),
			summary: await this.buildSummary(root, paths, frameworks, languages),
			languages: [...languages].sort(),
			frameworks: [...frameworks].sort(),
			databases: [...databases].sort(),
			caches: [...caches].sort(),
			packageManagers: [...packageManagers].sort(),
			manifests,
			hasGit: paths.has(".git") || (await directoryExists(join(root, ".git"))),
			fileCount: files.length,
			analyzedAt: new Date().toISOString(),
			featureHighlights: [],
			alerts: [],
		};
	}

	private async buildSummary(
		root: string,
		paths: Set<string>,
		frameworks: Set<string>,
		languages: Set<string>,
	): Promise<string> {
		if (paths.has("package.json")) {
			const value: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
			if (
				isRecord(value) &&
				typeof value.description === "string" &&
				value.description.trim() &&
				containsChinese(value.description)
			) {
				return value.description.trim();
			}
		}
		for (const readme of ["README.md", "README.MD", "readme.md"]) {
			if (!paths.has(readme)) continue;
			const paragraphs = (await readFile(join(root, readme), "utf8"))
				.split(/\r?\n\r?\n/)
				.map((paragraph) =>
					paragraph
						.replace(/^#+\s*/gm, "")
						.replace(/\s+/g, " ")
						.trim(),
				)
				.filter((paragraph) => paragraph && !paragraph.startsWith("[") && !paragraph.startsWith("<"));
			const chineseParagraph = paragraphs.find(containsChinese);
			if (chineseParagraph) return chineseParagraph.slice(0, 280);
		}
		const technology = [...frameworks, ...languages].slice(0, 5).join("、");
		const kind = projectKind(paths, frameworks, languages);
		return technology
			? `「${basename(root)}」是一个${kind}，主要使用 ${technology} 构建。`
			: `「${basename(root)}」是一个${kind}，暂未从常见项目清单中识别出主要技术栈。`;
	}

	private async scan(root: string): Promise<string[]> {
		const files: string[] = [];
		const visit = async (directory: string, depth: number): Promise<void> => {
			if (depth > this.maxDepth || files.length >= this.maxFiles) return;
			const entries = await readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				if (files.length >= this.maxFiles) return;
				const path = join(directory, entry.name);
				if (entry.isDirectory()) {
					if (entry.name === ".git") files.push(relative(root, path).replaceAll("\\", "/"));
					if (!ignoredDirectories.has(entry.name)) await visit(path, depth + 1);
				} else if (entry.isFile()) {
					files.push(relative(root, path).replaceAll("\\", "/"));
				}
			}
		};
		await visit(root, 0);
		return files;
	}

	private async analyzeNodeManifest(
		root: string,
		frameworks: Set<string>,
		databases: Set<string>,
		caches: Set<string>,
	): Promise<void> {
		const raw: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		const dependencies = isRecord(raw)
			? { ...stringRecord(raw.dependencies), ...stringRecord(raw.devDependencies) }
			: {};
		const checks: Array<[string, Set<string>, string]> = [
			["next", frameworks, "Next.js"],
			["react", frameworks, "React"],
			["vue", frameworks, "Vue"],
			["@angular/core", frameworks, "Angular"],
			["fastify", frameworks, "Fastify"],
			["express", frameworks, "Express"],
			["pg", databases, "PostgreSQL"],
			["mysql2", databases, "MySQL"],
			["mongodb", databases, "MongoDB"],
			["redis", caches, "Redis"],
			["ioredis", caches, "Redis"],
		];
		for (const [dependency, target, label] of checks) {
			if (dependency in dependencies) target.add(label);
		}
	}
}

function isManifest(path: string): boolean {
	const name = path.split("/").at(-1) ?? path;
	return [
		"package.json",
		"pom.xml",
		"requirements.txt",
		"pyproject.toml",
		"Dockerfile",
		"pubspec.yaml",
		"Cargo.toml",
		"go.mod",
	].includes(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		await readdir(path);
		return true;
	} catch {
		return false;
	}
}

function containsChinese(value: string): boolean {
	return /[\u3400-\u9fff]/u.test(value);
}

function projectKind(paths: Set<string>, frameworks: Set<string>, languages: Set<string>): string {
	if (paths.has("pubspec.yaml") || frameworks.has("Flutter")) return "移动端应用项目";
	if (["React", "Vue", "Angular", "Next.js"].some((framework) => frameworks.has(framework))) {
		return "Web 应用项目";
	}
	if (["Fastify", "Express", "Spring Boot"].some((framework) => frameworks.has(framework))) {
		return "后端服务项目";
	}
	return languages.size >= 3 ? "多语言软件项目" : "软件项目";
}
