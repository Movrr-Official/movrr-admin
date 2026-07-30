# MOVRR Admin — Documentation

Canonical knowledge base for the **MOVRR Admin** Operations Control Centre.

Perspectives are separated so product, engineering, and operations can find the right depth without reverse-engineering the codebase.

> Pattern aligned with MOVRR Mobile (`product` / `architecture` / `implementation` / `operations`). Exemplar: **Employee Authorization**.

---

## How to navigate

| I need to… | Go to |
|------------|--------|
| Understand **why** a feature exists and how operators experience it | [`product/`](./product/README.md) |
| Understand **system boundaries** and invariants | [`architecture/`](./architecture/README.md) |
| Understand **how it is built** in this repo | [`implementation/`](./implementation/README.md) |
| **Operate**, monitor, or recover it | [`operations/`](./operations/README.md) |
| See **why we decided X** | [`adr/`](./adr/README.md) |
| Security audits / verification | [`security/`](./security/) |
| Platform parity / capability inventory | [`platform/`](./platform/) |
| Working specs / plans | [`superpowers/`](./superpowers/) |

---

## Feature index

| Feature | Product | Architecture | Implementation | Operations |
|---------|---------|--------------|----------------|------------|
| Employee Authorization | [✓](./product/employee-authorization.md) | [✓](./architecture/employee-authorization.md) | [✓](./implementation/employee-authorization.md) | [✓](./operations/employee-authorization.md) |

**ADR:** [ADR-0001 Capability-first employee authorization](./adr/ADR-0001-capability-first-employee-authorization.md)

---

## Rules for new major features

1. Same **slug** across `product/`, `architecture/`, `implementation/`, and `operations/` when ops-relevant.
2. One concern per document — do not mix product intent into architecture.
3. Always fill **Related documents** with cross-links.
4. Link audits and plans; do not paste them wholesale into production docs.
5. Status values: `Draft` · `Active` · `Shipped` · `Deprecated` · `Planned`

---

## Related security artefacts (Employee Authorization)

- [Authorization Implementation Verification Report](./security/Authorization%20Implementation%20Verification%20Report.md)
- [Authorization Post-Implementation Re-Audit](./security/Authorization%20Post-Implementation%20Re-Audit.md)
