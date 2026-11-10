# Releasing a beta

How to ship a new public beta of OpenMarch (0.2 betas today). Development happens on the fork, `AlexDumo/OpenMarch-timeline`: issues, pull requests, lab tests and nightlies. A beta is built by the signed release workflow on the main repository, `OpenMarch/OpenMarch`, from the branch `prerelease/0.2`.

`prerelease/0.2` only ever holds commits from fork `main`. Nothing is committed to it directly, so each beta is a commit on fork main.

## Where each build lives

| Build        | Comes from                                         | Who gets it                                                               |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Nightly      | every push to fork `main` (unsigned)               | anyone who downloads it; installs as "OpenMarch Nightly"                  |
| Beta         | a `v0.2.0-beta.N` tag on `prerelease/0.2`          | Discord testers; beta installs update to newer betas on their own         |
| Release      | a `v0.2.0` tag on the main repository's `main`     | everyone; 0.1.7 installs update to it                                     |
| Preview site | `prerelease/0.2`, built by Cloudflare on each push | preview.openmarch.com: website, guide and web editor for the current beta |

## Version numbers and tags

- **Format:** `0.2.0-beta.N`, with N counting up from 1 (`beta.1`, `beta.2`, … `beta.10`). The version in `apps/desktop/package.json` and the tag must match exactly: version `0.2.0-beta.3` is tag `v0.2.0-beta.3`. The release build names the release from the version, and the preview site links its downloads to `v<version>`.
- **Only `beta`.** Don't switch to `rc`, `pre` or anything else partway through. The auto-updater moves a beta install to a newer `alpha` or `beta` version only, so a `-rc.1` would never reach testers.
- **Never reuse or move a number.** Once a tag is pushed, that number is spent, even if the build failed or the release was never published. Fix it and ship the next number.
- **The final release drops the suffix:** `0.2.0`. Beta installs update to it on their own.
- **The next version starts over:** `0.3.0-beta.1` on a new `prerelease/0.3` branch. See [The next version's betas](#the-next-versions-betas).

## Shipping a beta

You need org-admin rights on `OpenMarch/OpenMarch` (the landing push bypasses its rules) and `gh` logged in. Steps 3 and 4 are done by `scripts/release-beta.sh`.

### 1. Bump the version on fork main

Open a pull request on the fork that changes `apps/desktop/package.json` to the next beta (`0.2.0-beta.2`) and merge it into `main` like any other. You can include it in another pull request, but a separate one makes the beta commit easy to find.

Everything on fork main at that point goes into the beta. If main has work you don't want testers to have yet, either wait or ship an older main commit that already has the bump.

### 2. Open the sync pull request

Point a fork branch at the exact commit you're shipping, then open a pull request from it into `prerelease/0.2`:

```bash
git fetch timeline main
git push timeline timeline/main:refs/heads/release/0.2.0-beta.2
gh pr create -R OpenMarch/OpenMarch --base prerelease/0.2 --head AlexDumo:release/0.2.0-beta.2 \
  --title "0.2.0-beta.2" --body "Syncs fork main into prerelease/0.2 for the 0.2.0-beta.2 build."
```

Use a branch made for this, not a feature branch and not `main` itself. That keeps the pull request on the commit you chose while main keeps moving.

Wait for every check to pass. This is a public build, so there are no exceptions. Checks run on `prerelease/**` because `pr-checks.yaml` and `codeql.yaml` include it, and the main repository's "Branch Protections" ruleset requires `all-checks-passed` and CodeQL there.

### 3 and 4. Land it and tag it

```bash
scripts/release-beta.sh 0.2.0-beta.2
```

Run it from any OpenMarch checkout with remotes for both repositories (it finds them by URL). The commit defaults to the tip of fork main; pass a second argument to ship a different main commit. It stops unless:

- the version at that commit is `0.2.0-beta.2`
- `prerelease/0.2` can fast-forward to it
- an open pull request into `prerelease/0.2` has that commit as its head, and every check on it passed
- the tag doesn't already exist on a different commit

Then it asks before each of two pushes:

1. **Fast-forward `prerelease/0.2`** to the commit. GitHub marks the sync pull request as merged.
2. **Tag `v0.2.0-beta.2`** and push the tag. That starts `desktop-release.yaml`.

It skips steps that are already done, so if it stops partway you can run it again.

**Why a fast-forward and not the merge button:** the main repository only allows squash merges. A squash creates a new commit that isn't on fork main, so the next sync would conflict with it. Pushing the pull request's own commit keeps `prerelease/0.2` equal to a fork main commit every time.

### 5. Wait for the build

`desktop-release.yaml` builds, signs and notarizes macOS (Apple Silicon and Intel), Windows and Linux (x64 and arm64), and uploads them to a **draft** release. It usually takes 20 to 40 minutes. The Linux snap goes to the Snap Store's `edge` channel.

The push to `prerelease/0.2` also rebuilds preview.openmarch.com; its badge shows the new version within a few minutes.

### 6. Publish it as a pre-release

First check that there's only one draft for the tag and that it has every platform: macOS (Apple Silicon and Intel), Windows and Linux (x64 and arm64), each with its `latest-*.yml` file. See [When something goes wrong](#when-something-goes-wrong) if not.

On the [releases page](https://github.com/OpenMarch/OpenMarch/releases), edit the draft:

- Write the notes: what changed since the last beta, what to test, known problems.
- Tick **Set as a pre-release**. Leave **Set as the latest release** off.
- Publish.

The draft starts as a normal release. **If it's published without the pre-release box ticked, every 0.1.7 install updates to the beta.** If that happens, edit the release and tick the box straight away; installs that already updated stay on the beta.

### 7. Check it and tell testers

- Install it on macOS and Windows: it opens without a signing warning.
- A beta install from the previous beta offers the update.
- A 0.1.7 install doesn't.
- Post the notes in #beta-testers on Discord.

## When something goes wrong

- **A build job failed on a flaky step:** rerun the failed jobs from the Actions page. To rebuild some platforms of an existing tag, run `desktop-release.yaml` by hand ("Run workflow") with the tag and only those platforms ticked.
- **macOS fails with "HTTP status code: 403. A required agreement is missing or has expired":** Apple published a new developer agreement. Signing still works, but notarization is refused until the account holder accepts it at developer.apple.com (or App Store Connect, under Business). Then rebuild just the two macOS platforms by hand, as above. The Intel job is usually cancelled rather than failed when Apple Silicon fails, so tick both.
- **The release is split across two drafts:** the build jobs run at the same time, and two of them can each create a draft for the same tag. Before publishing, check the releases page for a second draft with that tag. Move its files into the main draft (download them, then upload them to the main draft) and delete the empty one. Every platform needs its installer and its `latest-*.yml` update file on the one published release, or that platform's installs won't find the update.
- **The build is broken, or the beta has a bad bug:** fix it on fork main and ship the next beta number. Don't move or delete the tag. Delete the draft if it was never published. A published beta stays up: installs can't move back to an older version, so the fix has to be a newer one.
- **The script says `prerelease/0.2` can't fast-forward:** the commit doesn't contain the branch's current commit. Usually a sync pull request's branch was a feature branch that was later squash-merged into fork main, so the commit on `prerelease/0.2` isn't on main. Ship from a main commit that contains it, or ask before force-pushing the branch.
- **You need a fix in testers' hands without the rest of main:** there's no hotfix branch. Either hold the other work off main until after the beta, or wait until main is ready. If this keeps happening, it's time for a real release branch on the fork.
- **The Cloudflare check `openmarch-editor-nightly` fails on the sync:** that Worker also builds non-production branches. The failure only affects a test upload, not editor-nightly.openmarch.com. Turn off its non-production builds in Cloudflare to silence it.

## Who gets updates

The desktop app checks GitHub releases with electron-updater:

- **A release install (0.1.7)** only looks at the newest full release. Pre-releases are invisible to it, which is why step 6 matters.
- **A beta install** looks at the newest release in the feed, beta or full, and updates if it's newer. It only looks at the single newest one, though. If a `0.1.x` patch is published after the latest beta, beta installs see `0.1.8`, which is older than they are, and stop finding updates until the next beta is published.
- **Nightlies** never auto-update.
- **The web editor** at editor.openmarch.com only takes full releases (`web-editor.yaml` skips pre-releases). Testers use the editor on preview.openmarch.com instead.

## The next version's betas

For 0.3:

1. Create `prerelease/0.3` on the main repository from its `main`, after 0.2.0 has shipped there.
2. Ship `0.3.0-beta.1` the same way.
3. The preview site's Cloudflare build follows a single branch: change its production branch to `prerelease/0.3`.

## Ending the beta: releasing 0.2.0

1. Bump to `0.2.0` on fork main.
2. Open a pull request from the fork into the main repository's `main`. It's fully gated.
3. Tag `v0.2.0` on the merged commit and publish it as a normal, latest release. 0.1.7 installs update to it, and so do beta installs.
4. `web-editor.yaml` deploys editor.openmarch.com. Promote the snap from `edge` to `stable` by hand.
5. openmarch.com should switch to the 0.2 guide at the same time (fork issue #746).
