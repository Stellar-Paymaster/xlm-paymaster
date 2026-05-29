# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Fluid project.

## What is an ADR?

An ADR is a short document capturing an important architectural decision made for this project, including the context that motivated it, the decision itself, and its consequences.

## Format

Fluid ADRs follow the [MADR (Markdown Architectural Decision Records)](https://adr.github.io/madr/) format. Each record contains:

- **Title** — a short noun phrase describing the decision
- **Status** — `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-XXX`
- **Context** — the forces at play that made a decision necessary
- **Decision** — the change that was decided upon
- **Consequences** — the resulting context after applying the decision (pros and cons)

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](001-chain-agnostic-fee-sponsor.md) | Chain-Agnostic Fee Sponsor Interface | Accepted |
| [002](002-rust-signing-engine.md) | Rust for the Signing Engine | Accepted |
| [003](003-grpc-node-rust-communication.md) | gRPC for Internal Node-to-Rust Communication | Accepted |
| [004](004-prisma-over-raw-sql.md) | Prisma ORM over Raw SQL for the Node API | Accepted |

## Creating a New ADR

1. Copy `template.md` to a new file named `NNN-short-title.md` where `NNN` is the next sequential number.
2. Fill in each section.
3. Add a row to the index table above.
4. Open a pull request for review.

For guidance on writing good ADRs see the [MADR project](https://adr.github.io/madr/).
