<!-- cspell:disable -->

# 05: Link semantics for exit and enter (resolver)

Status: research and a proposal. Nothing here changes `spec.md` yet. Scope: what the resolver computes once moves can EXIT a host (R-4, exists today) and ENTER a host through a live link. Storage-agnostic where possible; the places that depend on layers vs segments (08-storage.md) are marked **[storage]**.

Sources: spec.md (R-1..R-13, D-5, D-7, D-12, D-16, §8.11, §9, §6.1), `packages/core/src/timeline/resolver.ts`, `types.ts`, `index.ts`, ADR 0001, and 01/03/04 in this folder.

## 0. Summary

1. **Intent path.** Every (transition H, slot i) has an intent path `I(H,i,b)`. Its origin is the founder's actual origin (when the slot is founded) or else a stored **absolute** ghost origin. Its destination is the slot's destination: placed, shape, or linked.
2. **Link.** A link is stored on a feeder slot (T, i) as "(H, i′)". The link beat is **not stored**: `j ≡ T.end_beat`. Its value is `I(H, i′, j)`. A link is _effective_ only if a structural rule holds (§2.3). An ineffective link falls back to the slot's stored x,y and raises a diagnostic. The resolver never cycles and never throws on user data.
3. **Rails.** A non-founding span is evaluated **on the rails**, `I(H,i,b)`, exactly when its previous span is an effectively linked feeder that ran to its natural end. Otherwise it rebases as in today's R-5. For direct motion the two formulas are mathematically identical (§1.4), so rails only changes the answer for arcs. It still makes continuity provable by structure.
4. **Acyclicity.** Link chains can't loop, because end beats strictly increase along a chain. The only new back-edge is "link reads a founder's origin". It is safe under the rule **L-ACYCLIC**: a founder-derived intent origin read through a link chain must have `H.start ≤ T.start`. With that rule, the §9.3 timestamp proof extends unchanged (§2.4).
5. **Ghosts follow the group in the write path, not in the resolver.** Ghost origins are stored absolute (D-5 kept). A gesture that applies a transform X to all of H's founders' start positions applies the same X to H's ghost origins, in the same edit. Relative storage would add cross-marcher edges, break the clean proof and contradict D-5 (§3).
6. **Failures.** Write procedures **freeze** a link (convert it to placed at its last resolved value) whenever an edit breaks it, then notify. Undo restores the link. The DB refuses a delete or restyle that skips the freeze. The resolver's fallback is only a safety net (§4).
7. **D-12.** It becomes "entries ride the rails; unlinked joins and resumes rebase". Rebase survives for legacy and converted data, explicit unlinks, frozen or broken links, and FTL (§5).

## 1. Definitions

### 1.1 Intent origin `G(H,i)`

Evaluate in this order:

1. **Founder.** If slot i of H has a founding span f (R-3: `f.start = H.start`), then `G = origin(f)` (R-4). This is derived, not stored.
2. **Ghost.** Otherwise, if a ghost row `(H, i, x, y)` exists, then `G = (x, y)`. It is absolute and bounded by I-D2.
3. **Undefined.** Otherwise, `G` is undefined. No ghost start is drawn, no rails, and links into this slot are ineffective.

- Founder wins over ghost. A ghost row on a founded slot is stale: it is ignored and raises `D-GHOST-IGNORED` (info). The app deletes stale rows when it can. No trigger deletes them (U-1).
- A row that starts at H.start but is overridden there (QA-FL-03, spec.md:555) is not founding. It needs a ghost. **[storage]** Under segments this case doesn't arise.
- **Seed.** When a member stops being a founder ("founder to joiner"), the write procedure stores `G = origin(f)`, read from the resolver _before_ the edit. That is where the marcher stood (confirmed decision).

### 1.2 Intent destination `D(H,i)`

`D(H,i)` follows R-13 (spec.md:666-681), with a third per-slot source for shapeless transitions:

- **placed:** today's `slot_destinations` point;
- **shape:** today's R-13 sample. Shape slots can't be linked (D-16 forbids mixing, Q-14);
- **linked (new):** `L(H,i)` from §2.1 when effective, otherwise the row's stored x,y (the freeze or fallback value).

### 1.3 Intent path `I(H,i,b)` for b in [H.start, H.end]

Let `u = (b − H.start)/(H.end − H.start)`, clamped to [0, 1].

| Style            | `I(H,i,b)`                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| direct           | `lerp(G, D, u)`                                                                   |
| arc              | `arcPoint(G, D, bulge, u)` (R-8, spec.md:592-606)                                 |
| FTL, founder     | R-10 hypothetical: `trail(lerp(startDist[q], endDist[q], u))`, `target` at u = 1  |
| FTL, non-founder | **undefined.** R-9 non-member targets queue at the tail; there is no path to ride |

What the path means for each kind of member:

- **Founders:** `I` equals the actual founding evaluation while the founder owns the slot, because of D-7 (spec.md:118, 576). After an exit, `I` continues as the **ghost remainder**, and `I(H,i,H.end)` is the ghost end dot. No new data is needed: R-7, R-8 and R-10 are evaluated past the span's end.
- **Joiners:** the path starts at the ghost origin. The actual path coincides with it from j onward when on rails (§1.4).
- **Exiting members:** this includes a joiner that later exits. For b past the exit, the ghost is `I`. The exit origin is the actual position at k (R-4), which equals `I` if the marcher was on rails.

### 1.4 "On the rails"

A non-hold, non-founding span s in host H on slot i is **on rails** iff all of the following hold:

1. H is direct or arc;
2. the previous span p is non-hold, in transition T on slot k, and `p.end = T.end` (ran to its natural end; spans abut, so this is also `s.start`);
3. `D(T,k)` is an **effective** link to `(H, i)`.

If s is on rails, `eval(s,b) = I(H,i,b)`, ignoring `origin(s)`. Otherwise R-5/R-7/R-8 apply as today (rebase).

Continuity (P-1) holds bit for bit. `origin(s) = eval(p, T.end) = D(T,k)`, because lerp and arcPoint are endpoint-exact (§8.10). And `D(T,k) = I(H,i,j)`, computed by the same function `eval(s, j)` uses.

**Direct: rails equals rebase.** With `u_j = (j−S)/(E−S)` and `p′ = (b−j)/(E−j)`, rebase gives `X_j + p′(D − X_j)` with `X_j = G + u_j(D−G)`. Since `p′(1−u_j) = (b−j)/(E−S)`, that simplifies to `G + u_b(D−G)`, which is `I(b)`.

**Arc: they differ.** Rebase draws a new arc on the chord `X_j→D` with the full bulge. The remainder of the host arc has bulge k′, where `atan(2k′) = (1−u_j)·atan(2k)`. So rails is a behaviour change for arcs only. Recommendation: evaluate `I` explicitly for both styles (clearer, one code path), rather than patching the bulge.

## 2. Links, resolution order and acyclicity

### 2.1 Link value

A link is stored on a shapeless feeder slot (T, k) as `→ (H, i)`. Then `j = T.end` and `L(T,k) = I(H, i, j)`.

The link is **effective** iff all of these hold:

- **L-1:** H exists, and `i < H.slot_count`.
- **L-2:** `H.start < j < H.end`. This is strict at both ends; see §4, row "link beat on host start or end".
- **L-3:** H is not FTL.
- **L-4:** `G(H,i)` is defined.
- **L-5:** `D(H,i)` resolves, possibly through its own link (a chain).
- **L-ACYCLIC:** for every host Hₙ in the chain whose intent origin is founder-derived, `Hₙ.start ≤ T.start`.

An ineffective link uses the row's stored x,y and raises `D-LINK-BROKEN` with a reason (`range`, `ftl`, `no-intent`, `cycle`, `slot`).

**Chain.** `D(H,i)` may itself be linked to `(K,i″)` at `H.end`. L-2 gives `T.end < H.end < K.end`, so the chain visits strictly increasing end beats. It is finite (at most one hop per transition), and **A→B→A link chains are impossible**: they would need `A.end < B.end < A.end`. The chain is evaluated inline as one node (§2.4).

### 2.2 Direction of reads

- **Origins look back** (R-4): `origin(sₖ)` reads `eval(sₖ₋₁)`.
- **Linked destinations look forward:** `L(T,k)` reads H, which ends later.
- **The one new back-edge:** a founder-derived `G(H,i)` reads `origin(f)` at `H.start`, which may be earlier than T's spans (Scenario 3) or not.

### 2.3 Every cycle risk, checked

| Risk                                                                                                                    | Cycle?                                              | Rule that stops it                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Feeder → host → feeder (chain A→B→A)                                                                                    | No                                                  | Strictly increasing ends (L-2)                                                     |
| Exit then re-enter the same host slot (Scenario 3: pink links to green, whose slot is founded by the same marcher at 0) | No                                                  | `green.start (0) ≤ pink.start`. The founder origin is earlier than every pink span |
| Link into a host that is itself entered by a link                                                                       | No                                                  | Inline chain, increasing ends                                                      |
| Link into a founded slot whose founder starts **after** the feeder starts                                               | **Yes**, see below                                  | L-ACYCLIC makes it ineffective                                                     |
| Ghost origin defined relative to founders, and a founder's chain passes through the feeder                              | Possible                                            | Avoided by storing ghosts absolute (§3)                                            |
| Link at `j = H.start` into a slot founded by the same marcher                                                           | **Yes:** `D(T) = origin(f) = eval(T, T.end) = D(T)` | L-2 (strict lower bound)                                                           |
| FTL host: the non-member target depends on members' origins                                                             | Not needed                                          | L-3                                                                                |

**The real cycle, with data the DB accepts under layers.**

- T `[0,12)` holds m's row at L0. T's destination is linked to H's slot at `j = 12`.
- H `[8,20)` holds m's row at L1, so m **founds** H at 8.
- m's T span is `[0,8)`, so `origin(m,8) = lerp(o₀, D(T), 8/12)`.
- `D(T) = I(H,i,12) = lerp(origin(m,8), D_H, 4/12)`.

That is an algebraic loop. It also means nothing: m can't be "entering H at 12" while already founding it at 8. L-ACYCLIC catches it, since `H.start = 8 > T.start = 0`. The link is treated as ineffective with `D-LINK-CYCLE`.

### 2.4 Acyclicity proof (extends §9.3, spec.md:807-830)

**Nodes.** `origin(s)`, `ftlEntry(T)`, and a new cascading node `linkedDest(T,k)`. `linkedDest` holds the inline chain value. Its dependencies are the founder origins `origin(fₙ)` it reads for founder-derived `G(Hₙ)`. All other inputs are stored data.

**Timestamps.**

- `origin(s)`: `(s.start, 0)`, as today.
- `ftlEntry(T)`: `(T.start, 1)`, as today.
- `linkedDest(T,k)`: `(τ, 0.5)`, where τ is the largest `Hₙ.start` over the founder-derived hosts in the chain. If there are none, τ = −∞ and the node only reads stored data.

**Edges.**

- **New, `origin(fₙ) → linkedDest`:** `(Hₙ.start, 0) ≤ (τ, 0) < (τ, 0.5)`. ✓
- **New, `linkedDest(T,k) → origin(next(s))`** for each span s of T on slot k: `next(s).start > s.start ≥ T.start ≥ τ`, by I-A1 and L-ACYCLIC. So `(τ, 0.5) < (next.start, 0)`. ✓
- **New, rails span s in H reads `linkedDest(H,i)` and founder-derived `G(H,i)`:** the dependent is `origin(next(s))` at `next.start > s.start ≥ j > H.start ≥ τ_H`. ✓
- **Existing edges:** unchanged.

Every edge goes strictly forward, so the graph stays a DAG.

**The checking split.** L-ACYCLIC is checked **structurally** inside a new local cache `linkPlan(T,k)`, from spans, ranges, styles and ghost rows only, never from positions. So deciding _whether_ a link is effective needs no positions. That keeps `ensure`'s cycle throw (resolver.ts:441-445) reserved for internal errors, as §9.3 says.

## 3. "Ghost starts follow the group"

### 3.1 Recommendation: absolute storage, transform in the write path

- **Storage:** `G(H,i)` is stored as an absolute (x, y), exactly like a placed destination (D-5).
- **Rule GF-1.** If one edit moves the start positions of **all** founders of group H by one transform X (translate, rotate or scale about the gesture's pivot), the same edit applies X to every ghost origin of H. "Start positions" means the founders' previous moves' destinations, because founders' origins are derived (R-4).
- **What doesn't move ghosts:** an edit that moves a **subset** of founders, or moves them by different amounts, leaves ghosts alone.
- **Where it lives:** the app (`timelineMoves` procedures), not the resolver. Under UI-9, "group H" is a _timeline_ holding N one-slot transitions (01 §1), and R-1 (spec.md:511-513) forbids the resolver from reading timelines. So the group concept can only live in the app anyway. **[storage]** With N-slot transitions or segments, the founders are "the founding slots of the move". The rule is the same.
- **Which X:** the gesture's own transform, never a least-squares fit. That avoids hypothesis A's heuristic (03 §3).
- **Edge case:** a founder whose start isn't simply its previous destination (its previous span was clipped, or it holds from earlier) moves by whatever R-4 gives. GF-1 still applies X to the ghosts, because the gesture intended X.

### 3.2 0 or 1 founders

- **0 founders:** "the group's start" is the ghosts alone. Dragging them is the gesture. GF-1 is vacuous.
- **1 founder:** X is the gesture's transform. A drag is a translation, and a rotate tool rotates about its pivot. Nothing is underdetermined, because X is never inferred.

### 3.3 Why not relative storage

Example of relative storage: `ghost = Fit(founders' origins at H.start) · local_i`.

- It contradicts D-5 (spec.md:116): "no shape or path is positioned relative to upstream geometry".
- It adds an edge from every founder origin at H.start to `G(H,i)`, and so to every feeder linked into H. In the overrun case (yellow `[8,24)` enters blue `[16,32)`), `blue.start > yellow.start`. L-ACYCLIC would then have to forbid it, or be replaced by a per-marcher proof that I couldn't close cleanly.
- It needs a fit, which is ill-posed for 0 or 1 founders and non-rigid for real drill.
- Its upside, ghosts following _any_ upstream edit (including one made in another timeline's context), is exactly what GF-1 gives when the edit moves all founders uniformly. That covers the "edit green's destination with all six selected, ghosts included" case below.

## 4. Failure modes and policy

Principle: **every edit that would break a link freezes it in the same procedure.** Freezing means an UPDATE to `source='placed'` with x,y set to the value the resolver held before the edit, plus a toast naming the marchers.

- **Undo:** undo replays the UPDATE and restores the link (U-2: no direction checks).
- **Database backstop:** triggers and FKs **refuse** (never rewrite, U-1) any edit that skips the freeze.
- **Resolver backstop:** at resolve time an ineffective link falls back to stored x,y with a diagnostic, so legacy or missed paths never cycle or throw.

| Case                                                                                                        | Policy                                                                                                                                                                                                                                 | Enforcement                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Host shortened past j** (`H.end ≤ j`)                                                                     | **Freeze.** Refusing would block ordinary timing edits, and clamping silently changes meaning.                                                                                                                                         | Range procedure (R-E1 family). Commit-time `E-L2` row in `commit_violations`, because ripple and R-E1 pass through intermediate ranges (U-3 allows commit-time checks for invariants that can only be judged at the end). |
| **Host range moved** (clip shift, ripple)                                                                   | j stays the feeder's absolute end. If j is still strictly inside, the link stays live and re-reads at the new u, so the merge point slides along H. If not, freeze. Ripple that moves both keeps j inside.                             | Same as the row above.                                                                                                                                                                                                    |
| **Host deleted**                                                                                            | Freeze all incoming links, delete ghost rows (child-first, C-1), then delete.                                                                                                                                                          | FK `RESTRICT` from link column to transition (ADR 0001 C-1), so a delete without the freeze is refused.                                                                                                                   |
| **Slot removed** (`slot_count` shrinks below i)                                                             | Freeze incoming links and delete that slot's ghost rows, then shrink.                                                                                                                                                                  | Triggers on both sides (U-3): on link and ghost insert/update, and on `transitions.slot_count` update, like I-A2.                                                                                                         |
| **Marcher removed from host, or slot re-assigned**                                                          | Freeze the feeder link of that marcher. A slot's intent stays defined (the ghost is stored), so the resolver keeps the link but raises `D-LINK-SLOT` (info) when the slot's occupant differs from the feeder's, or the slot is vacant. | App procedure, plus the diagnostic.                                                                                                                                                                                       |
| **Link beat on host start** (`j = H.start`)                                                                 | **Refuse at creation.** That is founding: assign from the start with no link (R-4 gives continuity).                                                                                                                                   | `E-L2` (commit-time), and L-2 at resolve time.                                                                                                                                                                            |
| **Link beat on host end** (`j = H.end`)                                                                     | **Refuse** for v1. It is "meet at the destination", acyclic but not an enter. See the open questions.                                                                                                                                  | Same as the row above.                                                                                                                                                                                                    |
| **Host restyled to FTL** (R-11)                                                                             | Freeze incoming links. Keep ghost rows (they are ignored for FTL, and restored as data if restyled back; the links are not restored). Restyle to arc keeps links live, now on arc rails.                                               | Trigger: a `path_style` update to FTL with incoming links is refused, and a link insert into an FTL host is refused (both sides, U-3).                                                                                    |
| **Feeder range edited**                                                                                     | j moves with `T.end`; that is the "drag rejoin beat" gesture. The UI clamps drags to `(H.start, H.end)`. Other paths freeze.                                                                                                           | `E-L2`.                                                                                                                                                                                                                   |
| **Feeder gets a shape** (D-16 switch)                                                                       | Its `slot_destinations` rows are deleted, so its links go too. Undo restores them.                                                                                                                                                     | Existing I-T6 procedure.                                                                                                                                                                                                  |
| **Edit makes L-ACYCLIC fail** (for example, the marcher becomes founder of H at H.start while still linked) | Refuse when the creating gesture can see it, using `spanInfos` before the first write. Otherwise diagnose `D-LINK-CYCLE` and offer **Unlink**.                                                                                         | App pre-check, plus the resolver. A DB check isn't possible, because it needs flattening.                                                                                                                                 |
| **Stale ghost on a now-founded slot**                                                                       | Ignore it (founder wins), raise `D-GHOST-IGNORED`, and let the app delete it on the next edit of that slot.                                                                                                                            | Resolver.                                                                                                                                                                                                                 |

The stored x,y on a linked row is a **seed and fallback**. The app writes it when it creates or freezes the link. It is never refreshed live, which avoids history noise. The resolver doesn't read it while the link is effective. Export comes from the resolver (§11), so a stale x,y never leaks.

## 5. What replaces D-12

**D-12′ (replaces D-12, spec.md:123): entries ride the rails; unlinked joins and resumes rebase.**

- A non-founding direct or arc span is on rails (§1.4) when its arrival is an effective link that ran to its end. Otherwise it rebases as today, with `D-REBASE` (info).
- A rebasing span on a slot that has a ghost or founder intent also raises `D-OFFPATH` (info), so the gray ghost explains the gap.
- FTL non-founding spans keep R-11's direct fallback and `D-FTL-NONFOUNDING`.

**Where rebase survives:**

1. Legacy and converted data, which has no links. Converted page shows are all founding (04 §8), so they are unaffected.
2. An explicit **Unlink**, or a frozen link.
3. An implicit resume after a steal with no return move. **[storage]** Layers only; the app no longer creates these by default.
4. FTL joins and resumes.

**App default.** The app stops creating unlinked joins:

- A window ending strictly inside the host becomes an exit plus a linked return.
- An overrun becomes an exit plus an enter into the next host.
- A join becomes a linked feeder plus a ghost.

G5 (spec.md:1167), G3's resumes and G12 stay valid as rebase vectors.

## 6. Worked examples

Set-up: direct, beats as given, field units, `u = (b − S)/(E − S)`.

**Scenario 1, steal-out.** Green `[0,16)`, six founders at x = 0, 2, 4, 6, 8, 10 on y = 0, with destinations (x, 16). The outer four (x = 0, 2, 8, 10) exit at 8 into yellow `[8,24)`.

- Yellow's origin is green at 8, which is (x, 8), by R-4. No link is involved.
- The ghost remainder is `I = (x, b)` for b in [8,16], and the ghost end dot is (x, 16).
- Edit green's destination for x = 0 to (0, 20): yellow's origin becomes `lerp((0,0),(0,20),0.5) = (0,10)`. This is today's behaviour; nothing changes.

**Scenario 2, join at 6.** Green `[0,16)`. The founders are x = 4 and 6. The joiners J₀, J₂, J₈ and J₁₀ have ghosts (x, 0) and destinations (x, 16). J₀'s feeder Y is `[0,6)` from home (−10, 0), linked to (green, J₀).

- `L(Y) = I(green, J₀, 6) = lerp((0,0),(0,16), 6/16) = (0,6)`.
- At 11, J₀ is on rails at (0, 11).
- **Group-start drag by (0, −4)** (GF-1: the founders' previous destinations and the ghosts move together): the ghost becomes (0, −4), so `L(Y) = lerp((0,−4),(0,16), .375) = (0, 3.5)`. Y re-aims live.
- **Then green's destination to (0, 20):** `L(Y) = (0, 5)`.
- **Today's behaviour, for comparison:** Y lands on its absolute (0, 6) whatever the edit, then cuts a chord.
- **Arc green, bulge ½:** rails keeps J₀ on green's arc after 6. Rebase would bow away from the ghost (§1.4).

**Scenario 3, exit at 4 and return at 12.** Green `[0,16)`, m goes (4,0) → (4,16). Yellow `[4,8)` is placed to (10, 6). Pink `[8,12)` is linked to (green, m).

- Yellow's origin is green at 4: (4, 4).
- Pink's origin is (10, 6). `L(pink) = I(green, m, 12) = (4, 12)`. Its intent origin is founder-derived, at `green.start = 0 ≤ pink.start = 8`, so L-ACYCLIC holds.
- Green resumes on rails at 12, and is at (4, 14) at 14.
- **Edit green's destination to (8, 16):** the exit point becomes (5, 4) and yellow's origin follows. The rejoin point becomes `lerp((4,0),(8,16),.75) = (7,12)` and pink re-aims. There is no snap back.
- **Today's behaviour (implicit resume):** a yellow `[4,12)` steal resumes from its end toward (8, 16) over 4 beats.

**Overrun, green into blue.** Green `[0,16)`, blue `[16,32)`. Marcher x = 0 exits green at 8 into yellow `[8,24)`, linked to (blue, slot) at `j = 24`.

- The blue ghost is seeded at (0, 16): where the marcher stood as a founder of blue before the change.
- With blue's destination at (−8, 32): `L = lerp((0,16),(−8,32), .5) = (−4,24)`.
- The ghost is a stored leaf, so `blue.start = 16 > yellow.start = 8` is allowed.
- **Edit green's destination with all six selected** (ghost end dots included) by Δ: blue's founders' starts move by Δ, so GF-1 moves blue's ghosts by Δ, and yellow re-aims. That matches "acts as if all six still go there".

**Chain example.** J's Y `[0,6)` links to (green, J) at 6. Green's destination for J links to (blue2 `[8,24)`, J) at 16.

- `L(Y)` reads `D(green,J) = I(blue2, J, 16)`.
- The ends increase, 6 < 16 < 24, so the chain is finite.
- Editing blue2's ghost for J moves both of J's landing points.

## 7. Caches and invalidation (§9 changes)

**New caches.**

| Cache        | Tier          | Key    | Value                                                                              | Depends on                                                                                                                           |
| ------------ | ------------- | ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `linkPlan`   | local         | (T, k) | chain `[(Hₙ, iₙ)]`, effective or reason, founder spans read, ghost and leaf points | link columns and ranges/styles/slot_count of T and each Hₙ, ghost rows, the founding status of each chain slot (`spansByTransition`) |
| `linksInto`  | local         | H      | the feeders (T, k) whose chain passes through H                                    | `linkPlan`                                                                                                                           |
| `linkedDest` | **cascading** | (T, k) | xy                                                                                 | `linkPlan` and the founder origins it lists                                                                                          |

`destinations[T]` stays local for placed and shape slots. `evalSpan` (resolver.ts:494-515) reads a slot's destination through `dest(T, slot)`, which pulls `linkedDest` for linked slots. Today it reads `dests.get(t.id)` directly at line 511.

**Dependency lists.** `depsOfOrigin` (resolver.ts:376-385) adds:

- `linkedDest(Tprev, slot)` when the previous span's slot is linked;
- for a rails span, the founder origin and `linkedDest(H, i)` its intent reads.

**Walk rules.**

- **W-5:** dirtying `origin(f)` for a founding span f in H dirties `linkedDest(T,k)` for every (T, k) in `linksInto[H]` whose plan reads f.
- **W-6:** dirtying `linkedDest(T,k)` dirties `origin(next(s))` for each span s of T on slot k, and the next origins of rails spans that read it.
- **W-3 extension:** seeding H (a destination, ghost, style, range or link change on H) re-plans and seeds every transitive feeder in `linksInto[H]`.
- **§9.4 step 3 extension:** a marcher rebuild that changes the founding status of a slot in H re-plans `linksInto[H]`. That is a cross-marcher effect, like 3.4's FTL targets.

**Change log.** It logs the ghost table under the transition id, like `slot_destinations` (§10.2). The `ChangeBatch.table` union gains one name.

**Complexity.** Cold compile adds O(Σ chain length). Chains are bounded by the number of transitions and are short in practice.

**P-12 (causality, spec.md:1276) must be amended.** Editing H now moves positions _before_ `H.start` on feeders linked into H (yellow from 8 depends on blue at 16). The new wording: "…changes no position before T.start, except on spans whose `linkPlan` passes through T."

## 8. Required spec changes

**Rules.**

- **R-1:** inputs add ghost origins and link columns.
- **R-3:** add a rails or rebase mode for non-founding spans (§1.4). Kinds are unchanged.
- **R-4:** unchanged in its formula. Add a note that a rails span's origin equals `I(H,i,j)` by construction.
- **R-5:** rebase applies only when the span is not on rails. Replace "the same formula rebases" (spec.md:578).
- **R-7/R-8:** evaluate rails spans by `I`.
- **R-11:** links into FTL are ineffective, and FTL joins keep the fallback.
- **R-13:** add the linked source and its fallback.
- **New R-14** (intent path), **R-15** (links, effectiveness, L-ACYCLIC, chains) and **R-16** (rails).

**Decisions.**

- **D-5:** a destination may be _linked_ to a later host's intent path (live). Ghost origins are absolute, and nothing is relative to _upstream_ geometry. Restate the promise: an upstream edit can't invalidate. A _downstream_ host edit can now move a feeder's landing, by design.
- **D-12:** replace with D-12′.
- **D-16:** add linked as a per-slot source of shapeless transitions.
- **New D-18:** live links, with j ≡ T.end.
- **New D-19:** stored absolute ghosts that follow the group via the write path (GF-1).

**Invariants (§6).**

- **I-L1:** the link host exists (FK RESTRICT).
- **I-L2:** `i < slot_count`, checked from both sides.
- **I-L3:** the host is not FTL, checked from both sides.
- **I-L4:** `H.start < T.end < H.end`, checked at commit.
- **I-G1:** ghost bounds and slot range.
- The storage of the link (columns vs table) belongs to 08-storage.md.

**Diagnostics (§8.9).**

| Code              | Level                  |
| ----------------- | ---------------------- |
| `D-LINK-BROKEN`   | warning, with a reason |
| `D-LINK-CYCLE`    | warning                |
| `D-LINK-SLOT`     | info                   |
| `D-OFFPATH`       | info                   |
| `D-GHOST-IGNORED` | info                   |

**§8.11 derived range: needs a re-proof.** Linked targets are _derived_, not authored. For an arc onto a derived B, `|Q|² ≤ |P|² + |B|²` sums over branches of the DAG, not along one path. The bound `β·√(1+a)` no longer follows directly. Directs and FTL stay max-bounded. Options:

- prove a bound with `a` counted over the unfolded dependency tree, which is finite but can be exponential in link nesting;
- or restrict arc hosts' founder-derived intents.

Extend P-13 and add an adversarial linked-arc fuzz either way.

**§9.2-9.4:** §7 above. **§10.1/10.2:** §9 below.

**QA to add.**

- **Golden vectors:**
  - G14: Scenario 2 join on rails, before and after the start drag.
  - G15: Scenario 3 exit and linked return, plus the green destination edit.
  - G16: arc host, rails vs rebase (the failure signature is a bow off the ghost).
  - G17: overrun green to blue.
  - G18: link chain T→H→K.
  - G19: the §2.3 cycle fixture. Expect `D-LINK-CYCLE`, the fallback x,y, and no throw.
  - G20: host shortened at resolve time (fallback).
- **Properties:**
  - P-14: rails adherence, `eval = I` on rails spans.
  - P-15: link landing, where a linked feeder that runs to its end equals `I(H,i,j)` bit for bit.
  - P-16: random link graphs never throw, and every ineffective link is reported.
  - P-12 amended.
- **QA-INV:**
  - a host destination or ghost edit dirties feeder origins;
  - a founder origin change at H.start dirties another marcher's feeder (W-5);
  - a chain edit at K reaches T.
- **QA-DB:** I-L1..I-L4 and I-G1, from both sides.
- **QA-UNDO:** round trips for delete-host-with-freeze, restyle to FTL with freeze, a GF-1 group-start drag, and a range shrink with freeze. Add to the QA-UNDO-9 fuzz.
- **QA-SC-16..18:** the owner's three scenarios, judged by a person.

The oracle (`oracle.ts`, `ref/oracle.mjs`) and `ref/resolver.mjs` must implement R-14..R-16 first (§8 is normative).

## 9. Core public API additions (ADR 0001 §4 amendment)

Additive, in the style of the `spanInfos` amendment (ADR 0001 lines 234-242):

```ts
type IntentOriginSource = "founder" | "ghost" | null;
type DestSource = "placed" | "shape" | "linked" | "linked-fallback";
interface LinkInfo {
  hostTransitionId: number;
  hostSlot: number;
  beat: Beat; // beat = feeder end
  effective: boolean;
  reason?: "range" | "ftl" | "no-intent" | "cycle" | "slot";
  chain: Array<{ transitionId: number; slot: number }>;
}
interface IntentInfo {
  transitionId: number;
  slot: number;
  origin: XY | null;
  originSource: IntentOriginSource;
  dest: XY;
  destSource: DestSource;
  link?: LinkInfo;
}
interface Resolver {
  intentAt(transitionId: number, slot: number, beat: Beat): XY | null; // ghost paths and dots
  intentInfo(transitionId: number, slot: number): IntentInfo;
  linksInto(
    transitionId: number,
  ): Array<{ transitionId: number; slot: number }>;
}
// SpanInfo gains  mode: "rails" | "rebase" | null   (null for hold and founding)
// DiagnosticCode gains the five codes in section 8
// ChangeBatch.table gains the ghost table's logical name
// TimelineSnapshot gains ghost origins and per-slot link fields
```

Why these belong in the API:

- `intentAt` replaces the throwaway-resolver trick (01 §2) for ghosts.
- It works for arc and FTL founders. Today that would need the internal `arcPoint` or the trail, which `index.ts` deliberately doesn't export.
- The ghost-rendering doc (07) depends on it.

Adding `mode` to `SpanInfo` doesn't change the `SpanKind` union, so existing exhaustive switches don't break.

## 10. Open questions for the owner

1. Should moving **some** founders at a group's start move the ghosts? Proposed: no; only a uniform edit of all founders does (GF-1).
2. Should GF-1 also apply when the founders' start is edited from the _previous_ timeline's context, such as dragging page 1's end? Proposed: yes, whenever all of H's founders move by one transform.
3. When a host clip is moved alone, should the linked feeders' ends move with it (anchoring the rejoin beat to the host), or stay put and freeze if they fall outside? Proposed: stay put.
4. "Meet the group at its destination" (`j = H.end`): is it wanted? It is acyclic and cheap, but it isn't an enter.
5. Is freeze-and-notify (instead of refusal) right for deleting or shortening a host that has incoming links?
6. No links into FTL hosts in v1 (joiners still rebase to a tail point): acceptable?

## Critical files for implementation

- `docs/timeline/spec.md` (R-1..R-13, D-5, D-12, D-16, §8.9, §8.11, §9.2-9.4, §10, §12)
- `packages/core/src/timeline/resolver.ts` (`depsOfOrigin` 376-385, `ensure` 413-459, `evalSpan` 494-515, `dirtyWalk`/`seed` 594-629, `notify` 633+, diagnostics 783-846)
- `packages/core/src/timeline/oracle.ts` (the normative reference must gain R-14..R-16 first)
- `packages/core/src/timeline/types.ts` (SpanInfo, DiagnosticCode, ChangeBatch, TimelineSnapshot)
- `docs/adr/0001-timeline-motion-model.md` (§2 schema, §3 C-1, §4 API amendment)
