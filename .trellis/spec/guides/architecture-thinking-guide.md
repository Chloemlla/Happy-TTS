# Architecture Thinking Guide

> **Purpose**: catch architecture erosion *before* it lands, and keep the context-first atomic 4+2 design honest.
> Companion to [Code Reuse](./code-reuse-thinking-guide.md) and [Cross-Layer](./cross-layer-thinking-guide.md) guides.

---

## Why this guide

Most architecture decay isn't one bad decision — it's many small "I'll just import this here" moments. This guide gives you the questions to ask before each one, so the codebase stays **clear, maintainable, high-cohesion, low-coupling**.

The backing rules are normative in `../backend/directory-structure.md` (the context-first atomic 4+2 layering) and `../backend/quality-guidelines.md` (invariants + the smell list). This guide is the *mindset* behind them.

---

## How to work here (collaboration style)

When proposing or reviewing a design:

1. **Offer options, not edicts** — for a non-trivial choice, sketch 2–3 approaches with trade-offs (cost, maintainability, risk, fit), then recommend one *with reasons*.
2. **Explain the principle**, not just the rule — say *why* I/O belongs in adapters, not only that it does.
3. **Watch the seven smells proactively** — the moment one appears, name it and propose the fix; don't wait to be asked.
4. **Right-size the solution** — match the tool to the problem; a greenfield personal app doesn't need a sledgehammer.

---

## The 7 code smells — questions to ask

For each, ask the question *before* writing the code:

| Smell | Ask yourself | If "yes" → |
|---|---|---|
| **Rigidity** | "Will a likely future change force edits in many places?" | Put the volatile part behind a `contracts/ports` interface |
| **Redundancy** | "Have I written this logic somewhere already?" | Search first; sink to a same-context service/workflow, pure `atom/`, or stable `_shared/` helper |
| **Circular dependency** | "Do these two modules need each other?" | Extract the shared part to the correct owner: atom, same-context service, port, or event |
| **Fragility** | "Could editing this break something unrelated?" | Find the hidden coupling; add a test at the seam |
| **Obscurity** | "Would a new reader understand the intent in 30s?" | Rename to intent; split; add a one-line *why* |
| **Data clump** | "Do these params always travel together?" | Make them a `contracts/dto` type |
| **Needless complexity** | "Am I building for a requirement that exists?" | Delete the speculative generality |

> Rule of thumb: **30 minutes of this thinking saves 3 hours of debugging.**

---

## How the atomic 4+2 architecture pre-empts the smells

The layering isn't bureaucracy — each rule kills a specific smell:

- **One-way deps (`api→context usecases/workflows/services→atoms`)** → prevents *circular dependency* and *rigidity*.
- **I/O only in `adapters/`** → prevents *fragility* (vendor changes stay at the edge) and keeps decision logic pure & testable.
- **Ports in `contracts/`** → decouples policy from infrastructure (kills *rigidity*).
- **Context-private workflows/services** → prevents giant public usecases without leaking private APIs across contexts.
- **Pure, small atoms** → fights *obscurity* and *needless complexity*.
- **Deliberate add-or-refactor rule** → contains *fragility* while still allowing cleanup when existing ownership is wrong.
- **No cross-context private helper imports** → keeps bounded contexts honest and prevents hidden coupling.

When a rule feels inconvenient, pause and identify the owner. The answer may be "push it down to an atom", "make it a same-context service/workflow", or "expose a real port/event". Do not use `_shared` as a pressure valve for unclear ownership.

---

## Pre-design questions (before a new feature)

- [ ] Which layer(s) does this touch? (Use the decision flow in `directory-structure.md` §5.)
- [ ] Which bounded context owns this behavior?
- [ ] What's the **port** boundary for any external capability?
- [ ] Can the core logic be a **pure atom** (so it's trivially testable)?
- [ ] Am I adding new behavior, or refactoring existing internals to remove a real smell?
- [ ] Did I consider 2–3 options for the non-obvious part and pick with reasons?
- [ ] Any of the 7 smells lurking? Name and address them now.

---

**Core principle**: clear boundaries are cheaper than clever code. Keep I/O at the edges, keep decisions pure, and make the next change easy.
