# Contributing to OpenMarch

Start with the [project overview](README.md). For repository guidance, change
ownership, and scoped checks, read the [repository conventions](docs/conventions/README.md).
These guides apply to human and agent-assisted contributions alike.

## Set up the repository

Use Node 24 and pnpm 10.11.0, as pinned by the root `package.json`. Install the
workspace with `pnpm install`.

Create each change on its own branch in an isolated checkout. Before editing,
confirm that the checkout contains no unrelated work and read the nearest
scoped guidance for the files you will change.

## Verify the change

Use the `check:quick` script during normal iteration. Then run the checks for
the changed area from the [verification matrix](docs/conventions/verification.md). Run
`check:full` before handoff when the change affects multiple packages or shared
behavior.

Record every check that ran and anything left for CI or a maintainer. Keep a
pull request to one reviewable change, and separate unrelated cleanup.

Before writing commit or pull-request text, follow the repository communication
policy in `AGENTS.md`, including its no-AI-attribution rule.
