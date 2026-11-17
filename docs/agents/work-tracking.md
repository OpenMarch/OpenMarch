# Work tracking on the fork

**Fork only.** This applies to work tracked on `AlexDumo/OpenMarch-timeline`. Don't use any of it on upstream `OpenMarch/OpenMarch`: no board items, milestones, `epic` or `area:` labels, or `scripts/om-claim` there.

The board answers four questions for everyone working on the fork, people and agents alike: who is working on what, where the work is, when it started, and what's left for each version.

## The pieces

| Question | Where it lives |
| --- | --- |
| Board | GitHub Project [OpenMarch Async Coordination](https://github.com/users/AlexDumo/projects/5) (project 5 under AlexDumo) |
| Epic | A parent issue labelled `epic`. Its tasks are GitHub sub-issues. |
| Task | An ordinary issue, attached as a sub-issue of its epic when one fits |
| Area | Exactly one `area:` label per issue (`area:shapes`, `area:pathways`, `area:3d-view`, …) |
| Who | The issue's assignee. Contributors who can't be assigned are shown by their linked PR. |
| When | The board's **Started** date, set when someone claims the issue |
| Where | The board's **Branch** field, plus PRs linked with `Closes #n` |
| State | The board's **Status**: Todo → Ready → In progress → In review → Done |
| Version | A milestone: `0.2.0`, `0.2.x`, `0.3` or `Later` |

Triage labels (`needs-triage`, `ready-for-agent`, …) still say whether an issue is specified. They don't say who has it.

Shapes and paths are separate areas. Shapes are the formations marchers stand in (box, line, arc, scaling, grouping, the shape editor) and live under the Shapes epic. Paths are how marchers travel between sets (Pathways, follow the leader, routes) and live under the Pathways epic.

## What the board does on its own

- New issues and PRs on the fork are added to the board. Set their Status (Todo or Ready) when you first touch them.
- Closing an issue or merging a PR moves the item to Done.
- A sub-issue attached to an epic on the board is added too.

## Working on an issue

1. **Before you start**, check the issue isn't assigned or In progress on someone else's branch. If it is, talk to that person first.
2. **Claim it**: `scripts/om-claim <n> --branch <branch>`. That assigns you, sets Status to In progress, sets Started to today and records the branch. Without the script, do the same by hand on the issue and the board.
3. **Open the PR** with `Closes #n` in the body. When it's ready for review: `scripts/om-claim <n> --status "In review"`.
4. **Stopping without finishing**: `scripts/om-claim --release <n>` puts it back to Ready, unassigned, with Started and Branch cleared. Say why in a comment on the issue.
5. **Finishing**: merging the PR closes the issue and moves it to Done.

Work on an integration branch (`pathways/host`, `tablet/host`): each sub-PR's issue gets the sub-PR's branch. The epic gets the host branch and stays In progress while any child is.

## Filing issues

- Give it one `area:` label and attach it to its epic if one fits:
  `gh api --method POST repos/AlexDumo/OpenMarch-timeline/issues/<epic>/sub_issues -F sub_issue_id=<child id>`, where `<child id>` is `gh api repos/AlexDumo/OpenMarch-timeline/issues/<n> --jq .id` (the database id, not the number).
- Leave the milestone empty unless Alex has said which version it belongs to. Keep `needs-triage` until then.
- A new theme with several issues becomes an epic: an issue labelled `epic` and its `area:` label, with a short scope paragraph.

## Handy queries

- What's left for a version: `gh issue list -R AlexDumo/OpenMarch-timeline -m 0.2.0 -s open`
- What's in flight: the board's **Now** view, or `gh project item-list 5 --owner AlexDumo`
- An area's backlog: `gh issue list -R AlexDumo/OpenMarch-timeline -l area:shapes -s open`

## `scripts/om-claim`

```
scripts/om-claim <issue> [--branch <name>] [--user <login>] [--status <Todo|Ready|In progress|In review|Done>]
scripts/om-claim --release <issue> [--user <login>]
```

It needs `gh` logged in with the `project` scope (`gh auth refresh -s project`), `python3`, and write access to the board. It refuses any repo other than the fork. Someone who can't be assigned on the repo can still set Status, Started and Branch; the script prints a note and leaves the assignees alone.
