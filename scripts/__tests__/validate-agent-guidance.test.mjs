import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateAgentGuidance } from "../validate-agent-guidance.mjs";

const fixtures = [];
after(async () => {
    await Promise.all(fixtures.map((root) => rm(root, { recursive: true })));
});

async function createFixture(files) {
    const root = await mkdtemp(path.join(tmpdir(), "agent-guidance-test-"));
    fixtures.push(root);
    for (const [name, content] of Object.entries(files)) {
        const target = path.join(root, name);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
    }
    return root;
}

const instructionPairs = [
    { agents: "AGENTS.md", claude: "CLAUDE.md", maxAgentLines: 120 },
];

test("accepts a valid root instruction pair", async () => {
    const root = await createFixture({
        "AGENTS.md":
            "# Agent notes\n\nSee [routing](docs/conventions/routing.md).\n",
        "CLAUDE.md": "@AGENTS.md\n",
        "docs/conventions/routing.md": "# Routing\n",
        "package.json": JSON.stringify({
            scripts: { "check:quick": "echo ok" },
        }),
    });
    const errors = await validateAgentGuidance(root, {
        instructionPairs,
        requiredScripts: [{ package: "package.json", names: ["check:quick"] }],
        runtimeFiles: ["AGENTS.md"],
        linkFiles: ["AGENTS.md"],
        attributionRoots: [".github"],
    });
    assert.deepEqual(errors, []);
});

test("reports a missing Claude adapter", async () => {
    const root = await createFixture({ "AGENTS.md": "# Notes\n" });
    const errors = await validateAgentGuidance(root, { instructionPairs });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /CLAUDE\.md.*missing/i);
});

test("requires a standalone Claude import", async () => {
    const root = await createFixture({
        "AGENTS.md": "# Notes\n",
        "CLAUDE.md": "Read @AGENTS.md first.\n",
    });
    const errors = await validateAgentGuidance(root, { instructionPairs });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /CLAUDE\.md.*standalone.*@AGENTS\.md/);
});

test("checks both instruction line limits after normalizing CRLF", async () => {
    const root = await createFixture({
        "AGENTS.md": "# Notes\r\nFirst\r\nSecond\r\n",
        "CLAUDE.md": "@AGENTS.md\r\nExtra\r\n",
    });
    const errors = await validateAgentGuidance(root, {
        instructionPairs: [
            { ...instructionPairs[0], maxAgentLines: 2, maxClaudeLines: 1 },
        ],
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /AGENTS\.md.*3 lines.*2/);
    assert.match(errors[1], /CLAUDE\.md.*2 lines.*1/);
});

test("accepts an instruction exactly at its line limit", async () => {
    const root = await createFixture({
        "AGENTS.md": "# Notes\r\n",
        "CLAUDE.md": "@AGENTS.md\r\n",
    });
    assert.deepEqual(
        await validateAgentGuidance(root, {
            instructionPairs: [
                { ...instructionPairs[0], maxAgentLines: 1, maxClaudeLines: 1 },
            ],
        }),
        [],
    );
});

test("reports missing required package scripts", async () => {
    const root = await createFixture({ "package.json": '{"scripts":{}}' });
    const errors = await validateAgentGuidance(root, {
        requiredScripts: [{ package: "package.json", names: ["check:quick"] }],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /package\.json.*missing.*check:quick/i);
});

for (const runtime of ["Node 22", "Node.js 22"]) {
    test(`rejects stale ${runtime} runtime guidance`, async () => {
        const root = await createFixture({ "README.md": `Use ${runtime}.\n` });
        const errors = await validateAgentGuidance(root, {
            runtimeFiles: ["README.md"],
        });
        assert.equal(errors.length, 1);
        assert.match(errors[0], /README\.md.*Node.*22/);
    });
}

test("reports missing required files while skipping absent optional roots", async () => {
    const root = await createFixture({});
    const errors = await validateAgentGuidance(root, {
        runtimeFiles: ["README.md"],
        requiredScripts: [{ package: "package.json", names: ["check:quick"] }],
        linkRoots: ["docs/conventions"],
        attributionRoots: [".github"],
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /README\.md.*missing/i);
    assert.match(errors[1], /package\.json.*missing/i);
});

test("reports broken relative Markdown links", async () => {
    const root = await createFixture({
        "AGENTS.md": "See [routing](docs/missing.md#route).\n",
    });
    const errors = await validateAgentGuidance(root, {
        linkFiles: ["AGENTS.md"],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /AGENTS\.md.*missing.*docs\/missing\.md/i);
});

test("walks Markdown link roots and resolves links relative to each file", async () => {
    const root = await createFixture({
        "docs/conventions/routing.md":
            "[local](../target.md#section) [web](https://example.com) [http](http://example.com) [email](mailto:test@example.com) [anchor](#section)\n",
        "docs/target.md": "# Target\n",
        "docs/conventions/nested/broken.md": "[missing](absent.md)\n",
    });
    const errors = await validateAgentGuidance(root, {
        linkRoots: ["docs/conventions"],
    });
    assert.equal(errors.length, 1);
    assert.match(
        errors[0],
        /docs\/conventions\/nested\/broken\.md.*absent\.md/,
    );
});

for (const attribution of [
    "Made with ChatGPT",
    "made WITH codex",
    "Made with Claude",
    "Co-Authored-By: Claude <bot@example.com>",
]) {
    test(`rejects attribution: ${attribution}`, async () => {
        const root = await createFixture({
            ".github/templates/pull_request.md": `${attribution}\n`,
        });
        const errors = await validateAgentGuidance(root, {
            attributionRoots: [".github"],
        });
        assert.equal(errors.length, 1);
        assert.match(
            errors[0],
            /\.github\/templates\/pull_request\.md.*attribution/i,
        );
    });
}

test("allows ordinary human co-authors", async () => {
    const root = await createFixture({
        ".github/pull_request.md":
            "Co-Authored-By: Jane Doe <jane@example.com>\n",
    });
    assert.deepEqual(
        await validateAgentGuidance(root, { attributionRoots: [".github"] }),
        [],
    );
});

test("rejects paths outside the repository", async () => {
    const root = await createFixture({});
    const errors = await validateAgentGuidance(root, {
        runtimeFiles: ["../outside.md"],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /outside.*repository/i);
});

test("loads default configuration and exposes success and failure through the CLI", async () => {
    const root = await createFixture({
        "scripts/agent-guidance.config.json": JSON.stringify({
            runtimeFiles: ["README.md"],
        }),
        "README.md": "Use Node 24.\n",
    });
    assert.deepEqual(await validateAgentGuidance(root), []);
    const cli = fileURLToPath(
        new URL("../validate-agent-guidance.mjs", import.meta.url),
    );
    const run = promisify(execFile);
    const success = await run(process.execPath, [cli], { cwd: root });
    assert.equal(success.stdout, "Agent guidance is valid.\n");
    assert.equal(success.stderr, "");
    await writeFile(path.join(root, "README.md"), "Use Node 22.\n");
    await assert.rejects(
        run(process.execPath, [cli], { cwd: root }),
        (error) => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /README\.md.*Node.*22/);
            assert.equal(error.stdout, "");
            return true;
        },
    );
});
