import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function validateAgentGuidance(
    rootDir = process.cwd(),
    config = undefined,
) {
    const root = await realpath(rootDir);
    const errors = new Set();
    const isBeneathRoot = (target) => {
        const relative = path.relative(root, target);
        return (
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
        );
    };

    async function inspect(name, optional = false) {
        const target = path.resolve(root, name);
        if (!isBeneathRoot(target)) {
            errors.add(`${name}: path is outside the repository.`);
            return undefined;
        }
        try {
            if (!isBeneathRoot(await realpath(target))) {
                errors.add(`${name}: path is outside the repository.`);
                return undefined;
            }
            return { target, info: await stat(target) };
        } catch (error) {
            if (error.code === "ENOENT") {
                if (!optional) errors.add(`${name}: missing file.`);
            } else {
                errors.add(`${name}: cannot inspect file (${error.code}).`);
            }
            return undefined;
        }
    }

    async function read(name) {
        const entry = await inspect(name);
        if (!entry) return undefined;
        if (!entry.info.isFile()) {
            errors.add(`${name}: expected a file.`);
            return undefined;
        }
        try {
            return (await readFile(entry.target, "utf8")).replace(
                /\r\n/g,
                "\n",
            );
        } catch (error) {
            errors.add(`${name}: cannot read file (${error.code}).`);
            return undefined;
        }
    }

    async function readJson(name) {
        const content = await read(name);
        if (content === undefined) return undefined;
        try {
            return JSON.parse(content);
        } catch {
            errors.add(`${name}: invalid JSON.`);
            return undefined;
        }
    }

    async function walk(name, visited = new Set()) {
        const entry = await inspect(name, true);
        if (!entry) return [];
        if (entry.info.isFile()) return [name];
        if (!entry.info.isDirectory()) return [];
        const canonical = await realpath(entry.target);
        if (visited.has(canonical)) return [];
        visited.add(canonical);
        const files = [];
        for (const child of (await readdir(entry.target)).sort()) {
            files.push(...(await walk(path.join(name, child), visited)));
        }
        return files;
    }

    if (config === undefined) {
        config = await readJson("scripts/agent-guidance.config.json");
        if (config === undefined) return [...errors].sort();
    }

    for (const pair of config.instructionPairs ?? []) {
        for (const [name, limit] of [
            [pair.agents, pair.maxAgentLines],
            [pair.claude, pair.maxClaudeLines],
        ]) {
            const content = await read(name);
            if (content === undefined) continue;
            const lines =
                content === ""
                    ? 0
                    : content.replace(/\n$/, "").split("\n").length;
            if (limit !== undefined && lines > limit) {
                errors.add(
                    `${name}: ${lines} lines exceeds the limit of ${limit}.`,
                );
            }
            if (
                name === pair.claude &&
                !content.split("\n").includes("@AGENTS.md")
            ) {
                errors.add(
                    `${name}: must contain a standalone @AGENTS.md import.`,
                );
            }
        }
    }

    for (const required of config.requiredScripts ?? []) {
        const manifest = await readJson(required.package);
        if (manifest === undefined) continue;
        for (const name of required.names) {
            if (
                typeof manifest?.scripts?.[name] !== "string" ||
                !manifest.scripts[name].trim()
            ) {
                errors.add(
                    `${required.package}: missing required script ${name}.`,
                );
            }
        }
    }

    for (const name of config.runtimeFiles ?? []) {
        const content = await read(name);
        if (content !== undefined && /\bNode(?:\.js)?\s+22\b/i.test(content)) {
            errors.add(`${name}: stale Node 22 runtime guidance; use Node 24.`);
        }
    }

    const linkFiles = new Set(config.linkFiles ?? []);
    for (const name of config.linkRoots ?? []) {
        for (const file of await walk(name)) {
            if (/\.mdx?$/i.test(file)) linkFiles.add(file);
        }
    }
    for (const name of linkFiles) {
        const content = await read(name);
        if (content === undefined) continue;
        for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
            const link = match[1];
            if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
            const target = link.split("#", 1)[0];
            const relative = path.join(path.dirname(name), target);
            if (!(await inspect(relative, true))) {
                errors.add(`${name}: missing relative link target ${target}.`);
            }
        }
    }

    for (const name of config.attributionRoots ?? []) {
        for (const file of await walk(name)) {
            const content = await read(file);
            if (content === undefined) continue;
            if (
                /made with (chatgpt|codex|claude)/i.test(content) ||
                /^\s*Co-Authored-By:.*\b(chatgpt|codex|claude|copilot|openai|anthropic)\b/im.test(
                    content,
                )
            ) {
                errors.add(`${file}: AI attribution is not allowed.`);
            }
        }
    }

    return [...errors].sort();
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
    const errors = await validateAgentGuidance();
    if (errors.length) {
        for (const error of errors) console.error(error);
        process.exitCode = 1;
    } else {
        console.log("Agent guidance is valid.");
    }
}
