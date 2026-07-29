# Partner Operations & Organisations — Product Intent & Responsibility Specification

**Audience:** product managers, designers, engineers, operations, support, QA, and future team members  
**Scope:** product intent, responsibility boundaries, and operator mental models for two MOVRR Admin surfaces under Fulfilment  
**Not in scope:** UI redesign, wireframes, implementation plans, API contracts, or database schema changes  
**Status:** Canonical product contract  
**Preserves:** existing domain model — Organisation is the tenancy root; Reward Partner is a typed Organisation with a partner profile  
**Related:** `docs/product/reward-fulfilment-engine.md` · Partner Operations vs Organisations audit (July 2026)

This document is the single source of truth for every future design, implementation, and operational decision relating to **Partner Operations** and **Organisations** in MOVRR Admin.

It does not redefine the backend. It expresses product responsibilities so the correct domain model is visible and enforceable in the product experience.

---

## How to use this document

| Role | Use this document to… |
|------|------------------------|
| Product | Decide what belongs on which page; prevent IA drift when adding org types or partner capabilities |
| Design | Know what each page must communicate, what questions it answers, and what it must never become |
| Engineering | Know which capabilities belong where before building features; refuse duplicate workflows unless justified here |
| Operations | Understand which Admin surface to use for tenancy vs fulfilment-partner readiness |

**Authority rule:** If a future design or implementation proposal conflicts with this specification, the proposal must be revised or this document must be explicitly updated first. Silent divergence is not allowed.

---

## Section 1 — Product Vision

### Why Organisations exist

MOVRR is a multi-party platform. Riders, reward partners, advertisers, public-sector bodies, and MOVRR itself all participate with different rights and responsibilities.

**Organisation** is the platform’s answer to a foundational question:

> *Which institutional entity is this person, catalog item, fulfilment, or capability acting on behalf of?*

Organisations exist so MOVRR can:

- give every external and internal institution a durable platform identity,
- attach people (membership) and capabilities (roles / permission bundles) to that identity,
- extend the same tenancy model to new institution types without inventing a new identity system each time,
- keep fulfilment, rewards, campaigns, and future products aligned on one notion of “who the tenant is.”

Organisation is **platform identity and tenancy**. It is not a fulfilment queue, not a campaign manager, and not a partner shop.

### Why Reward Partners exist

A Reward Partner is the institution that participates in **delivering rewards after redemption** — especially where real-world collection, validation, inventory, or partner-facing confirmation is required.

Reward Partners exist so MOVRR can:

- protect partner inventory and prevent duplicate fulfilment,
- give partner staff a Business Workspace to validate and confirm collection,
- connect catalog-facing partner identity (name, branding, contact) to the same tenancy that holds membership,
- let Admin operators provision and maintain the partners that fulfilment depends on.

A Reward Partner is **always an Organisation** of type reward partner, composed with a partner (catalog / business) profile. The partner profile is not a second tenancy model; it is the fulfilment- and catalog-facing face of that Organisation.

### Why the platform separates tenancy from operational fulfilment

| Concern | Owned by | Why separate |
|---------|----------|--------------|
| Who the institution is | Organisation (tenancy) | Stable across products; not tied to one operational workflow |
| Who may act for them | Membership / RBAC on Organisation | Same access model for all org types |
| Whether they can fulfil rewards | Partner Operations (readiness) + Fulfilment engine | Operational and inventory-sensitive |
| What happens to a specific redemption | Fulfilment Queue / Timeline / engine | Case-level ops, not directory management |

Separating tenancy from fulfilment ops prevents two failure modes:

1. **Treating every institution as a reward partner** — advertisers, government bodies, and internal MOVRR orgs would be forced into fulfilment vocabulary.
2. **Treating partner ops as the only place institutions exist** — platform identity would be trapped inside one product surface and could not grow cleanly.

### How this supports future growth

The Organisation model is the expansion joint of the platform:

- New institution types (corporate partners, education, marketplace sellers, municipalities, enterprise tenants) attach as Organisation types or profiles **without replacing Organisation**.
- Partner Operations remains the specialised fulfilment operating surface for reward partners.
- Organisations remains the directory and tenancy administration surface for all types.
- Fulfilment, Rewards, Campaigns, and future modules **consume** Organisation identity; they do not each invent their own tenant registry.

**Vision in one line:** Organisation is who they are on the platform; Partner Operations is whether a reward partner is ready to fulfil.

---

## Section 2 — Product Responsibility

### 2.1 Partner Operations

#### Purpose

Partner Operations is the **fulfilment operating console for Reward Partners** in MOVRR Admin.

It exists so operators can ensure the right partners are provisioned, staffed, contactable, and in a state where collection and validation can succeed.

#### Mission

Make every Reward Partner **fulfilment-ready** — and keep them that way — without turning Admin into a second partner workspace or a generic tenancy browser.

#### Primary users

| User | Why they use Partner Operations |
|------|----------------------------------|
| Fulfilment / rewards operators | Onboard partners, check readiness, suspend unsafe partners, manage partner-facing contacts |
| Partner success / ops leads | Confirm staff access exists before go-live; maintain operational contact points |
| Support (escalation) | Identify which partner org owns a venue/collection problem; verify staff membership |

Not the primary home for platform architects managing non-partner org types.

#### Primary business problems solved

1. “We need a new reward partner live for collection / validation.”
2. “Is this partner able to operate (active, staffed, profile linked)?”
3. “Who at the partner can validate or confirm?”
4. “This partner must be paused without deleting platform history.”
5. “Catalog / Business Workspace identity must stay aligned with the partner’s Organisation.”

#### Primary workflows

1. Onboard a new Reward Partner (create partner Organisation + linked partner profile).
2. Review partner readiness (status, profile completeness, staff presence).
3. Invite and adjust partner staff membership and roles.
4. Update partner-facing contact and catalog profile fields.
5. Activate, deactivate, or suspend a partner for fulfilment safety.
6. Jump from fulfilment overview context into a specific partner’s readiness record.

#### Primary responsibilities

- Reward Partner lifecycle for fulfilment participation.
- Partner readiness and validation / collection readiness signals (product-level, not engine internals).
- Partner catalog / business profile fields used for fulfilment and partner recognition.
- Staffing of reward partner Organisations for Business Workspace access.
- Operator-facing view of partners as **capacity in the fulfilment system**.

#### Primary KPIs

| KPI | Meaning |
|-----|---------|
| Partners active and staffed | Count / share of reward partners that can operate |
| Time to partner go-live | From create → first capable staff member |
| Partners suspended / inactive for cause | Safety and quality control |
| Profile completeness | Contact / branding fields present where required for ops |
| Validation / collection readiness | Partners with required access and active status for live rewards |

Partner Operations may **surface** fulfilment health that is owned elsewhere (queue aging, pool exhaustion) as consumed context; it does not own those metrics as system of record.

#### Primary operational outcomes

- New partners can be brought online without inventing local tenancy.
- Unsafe or non-performing partners can be suspended from participation.
- Staff access for the Business Workspace is correctly established before riders redeem partner-gated rewards.
- Operators can answer “can this partner fulfil?” from one surface.

#### Information it owns (product ownership)

- Reward Partner readiness posture (as an ops concept).
- Partner catalog / business profile presentation fields (name as shown to ops/catalog, website, logo, contact email, partner profile status).
- Partner-oriented interpretation of Organisation status for fulfilment (active vs suspended for participation).
- Partner staff roster **as used for fulfilment access** (same membership records; Partner Operations owns the fulfilment-facing workflow).

#### Actions it owns

- Create Reward Partner.
- Edit partner profile fields.
- Change partner participation status (active / inactive / suspended) in a fulfilment context.
- Invite partner staff; change partner staff roles for Business Workspace capability.
- Open partner readiness detail from fulfilment operational context.

#### Information it consumes

- Organisation identity (id, canonical name, type, timestamps).
- Membership and role / bundle data from the Organisation tenancy model.
- Optionally: fulfilment health signals from Queue, Resource Pools, Analytics (read-only context).
- Catalog linkage awareness (that a partner profile exists / is linked).

#### Information it should never own

- Legal entity registry fields beyond what product later defines as partner profile (tax IDs, contracts) unless explicitly added as partner-profile concerns.
- Non–reward-partner Organisation types as first-class list citizens.
- Case-level fulfilment state machine decisions (cancel, refund, token rules).
- Resource pool inventory truth (owned by Resource Pools / fulfilment resources).
- The global Organisation directory and multi-type create flows.
- Advertiser campaign configuration, government programme configuration, or internal MOVRR HR/org charts.

#### Success criteria (Partner Operations)

- An operator opening the page immediately understands it is about **reward partner fulfilment readiness**, not all institutions.
- Creating a partner is the natural primary create action.
- Staff and profile workflows feel like enabling a venue/partner to operate.
- The page never becomes the place to browse advertisers, government bodies, or unrelated tenants.
- Duplicate “same as Organisations” feeling is unacceptable once product expression is correct.

---

### 2.2 Organisations

#### Purpose

Organisations is the **platform tenancy directory and identity administration surface** in MOVRR Admin.

It exists so administrators can see, create (where allowed), and administer Organisations of every type, and manage the membership model that all products share.

#### Mission

Provide a clear, trustworthy **directory of platform institutions** — who they are, what type they are, whether the tenant is active, and who belongs to them — without becoming a fulfilment operations console.

#### Primary users

| User | Why they use Organisations |
|------|----------------------------|
| Platform / Admin administrators | Browse and administer tenants across types |
| Identity / access admins | Membership and role administration at tenancy level |
| Product / ops leads expanding beyond partners | Provision or inspect advertiser, government, MOVRR, and future types |
| Support (tenancy questions) | “What Organisation is this user a member of?” across types |

Fulfilment operators may use it when the question is tenancy-wide, not partner-readiness-specific.

#### Primary business problems solved

1. “What Organisations exist on the platform?”
2. “What type is this institution?”
3. “Is this tenant active, inactive, or suspended at the platform level?”
4. “Who are the members of this Organisation, regardless of product?”
5. “How do we administer non–reward-partner institutions without misusing Partner Operations?”

#### Primary workflows

1. Browse and find Organisations across types.
2. Inspect Organisation identity and type.
3. Administer Organisation status at the tenancy level.
4. Manage membership and roles as **platform access**, not only partner go-live.
5. Create Organisations of supported types (including non-partner types as product enables them).
6. Navigate from an Organisation to type-specific operating surfaces when they exist (e.g. Partner Operations for reward partners).

#### Primary responsibilities

- Organisation directory across types.
- Organisation identity (canonical name, type, platform status, identifiers).
- Membership administration as tenancy capability.
- Clear separation of type labels and future type-specific entry points.
- Guarding the model so new org types attach here first.

#### Primary KPIs

| KPI | Meaning |
|-----|---------|
| Organisations by type | Coverage and mix of tenants |
| Active vs suspended tenants | Platform hygiene |
| Membership coverage | Orgs with at least one active member where required |
| Time to provision a non-partner org | When those create flows exist |
| Directory findability | Operators can locate a tenant without using Partner Operations |

#### Primary operational outcomes

- Platform identity is visible and administrable in one directory.
- Non-partner org types have a home that is not Partner Operations.
- Membership can be managed as a platform concern.
- Drift toward “Organisations = another partners list” is prevented.

#### Information it owns (product ownership)

- Organisation directory listing and identity fields.
- Organisation type classification.
- Organisation platform status.
- Membership records as tenancy administration (invite, role change, revoke) for all types.
- Cross-type search / filter concepts (product-level; not a UI design).

#### Actions it owns

- Create Organisation (any supported type, including reward partner when creating from tenancy context — see matrix for intentional dual entry).
- Edit Organisation identity and platform status.
- Administer membership for any Organisation type.
- Classify / present Organisation type.
- Provide navigation intent toward type-specific consoles (product principle; not a wireframe).

#### Information it consumes

- Type-specific profile summaries when useful for identification (e.g. that a reward partner profile is linked) — as **supporting** identity context, not as fulfilment ops.
- Audit or activity summaries if later attached to tenancy (consumed or linked; case ops remain elsewhere).

#### Information it should never own

- Partner validation / collection readiness as an operating concept.
- Fulfilment queue health, stuck orders, or token validation tooling.
- Resource pool stock levels and imports.
- Partner catalog merchandising beyond identity linkage.
- Campaign performance, advertiser creative ops, or other product-specific operating consoles.
- Becoming a dashboard of fulfilment KPIs.

#### Success criteria (Organisations)

- An administrator opening the page immediately understands it is the **institution directory**, not the partner ops console.
- Reward partners appear here as one type among others, not as the only story.
- Creating a non-partner Organisation has a natural path when product supports that type.
- Membership administration is clearly tenancy administration.
- The page never becomes a clone of Partner Operations with a different title.

---

## Section 3 — Domain Relationships

Product language (not implementation):

### Organisation

The **platform institution**. Every participating business, public body, or internal MOVRR tenant is an Organisation.

Organisation answers: *Who is the tenant?*

### Reward Partner

A **kind of Organisation** that participates in reward fulfilment.

Composition:

- **Is-a:** Organisation (type: reward partner)
- **Has-a:** partner business / catalog profile (branding, contact, partner-facing status)

Reward Partner answers: *Which tenant fulfils rewards, and how do we recognise them in catalog and ops?*

### Advertiser

A **kind of Organisation** (type: advertiser) for campaign / media tenancy.

Advertiser operating tools (campaigns, creatives, billing UX) may live in dedicated Admin product areas. Those areas **consume** Organisation identity; they do not replace Organisations as the tenancy directory.

**Boundary:** Legacy or parallel “advertiser profile” product surfaces must eventually reconcile to Organisation tenancy in product language: one institutional identity, specialised operating consoles.

### Government

A **kind of Organisation** (type: government) for public-sector tenancy (e.g. municipalities, agencies).

Government-specific programmes and compliance workflows belong in specialised surfaces when built. Organisations remains the directory home.

### MOVRR Internal

A **kind of Organisation** (type: movrr) representing internal MOVRR tenancy where membership and capabilities must be organisation-scoped rather than only individual admin accounts.

### Future organisation types

Examples: corporate partners, educational institutions, marketplace participants, enterprise customers.

**Rule:** Every future type is still an Organisation. It may gain a type-specific profile and a type-specific operating console. It must not invent a second tenancy root.

### Relationship diagram (product)

```text
                    Organisation  (tenancy / platform identity)
                           |
       +-------------------+-------------------+------------------+
       |                   |                   |                  |
 Reward Partner      Advertiser          Government           MOVRR / …
 (fulfilment)        (campaigns)         (public sector)      (internal)
       |
       +-- partner profile (catalog / business face)
       |
       +-- staff membership → Business Workspace capabilities
```

**Inheritance (product sense):** types specialise Organisation; they do not replace it.  
**Composition (product sense):** profiles and operating consoles attach to Organisation; they are not alternate identity systems.  
**Responsibility boundary:** Organisations owns the trunk; Partner Operations owns the reward-partner fulfilment branch.

---

## Section 4 — Responsibility Matrix

Legend:

| Value | Meaning |
|-------|---------|
| **Partner Operations** | Primary product owner of this capability in Admin |
| **Organisations** | Primary product owner |
| **Both** | Intentional dual ownership or dual entry — must stay consistent with domain |
| **Neither** | Belongs to another Admin / product surface |

| Capability | Owner | Why |
|------------|-------|-----|
| Create organisation (generic / any type) | **Organisations** | Tenancy provisioning is directory responsibility |
| Create reward partner | **Partner Operations** (primary); **Organisations** may offer type-specific create as secondary | Fulfilment onboarding is the primary business moment; tenancy create of type reward partner remains valid from directory |
| Organisation identity (id, canonical name, type) | **Organisations** | Platform identity system of record |
| Legal identity (contracts, tax, registered address) | **Neither** (future specialised compliance / legal surface) unless explicitly added | Not fulfilment ops; not implied by current partner profile |
| Organisation platform status | **Organisations** (primary); Partner Operations may change status for reward partners in readiness workflow | Status is tenancy truth; partner ops applies it for participation safety |
| Partner readiness | **Partner Operations** | Core mission of the page |
| Staff management (reward partner go-live / ops) | **Partner Operations** | Fulfilment access outcome |
| Membership administration (all types) | **Organisations** | Tenancy RBAC home |
| RBAC model (roles, bundles, capabilities) | **Organisations** (model ownership); Partner Operations **consumes** for partner roles | Model is platform-wide |
| Contact information (partner profile) | **Partner Operations** | Partner-facing ops contact |
| Contact information (generic org) | **Organisations** (when generic contacts exist) | Not all org types use partner profile |
| Operational health (queue, failures, aging) | **Neither** — Fulfilment Queue / Analytics | Case and system health |
| Fulfilment capacity (pools, stock) | **Neither** — Resource Pools | Inventory truth |
| Reward catalogue partner profile | **Partner Operations** | Profile is partner composition |
| Validation readiness | **Partner Operations** | Partner ops outcome |
| Collection readiness | **Partner Operations** | Partner ops outcome |
| Resource pools | **Neither** — Resource Pools | Separate fulfilment concern |
| Operational alerts (stuck fulfilments, pool low) | **Neither** (may be **consumed** by Partner Operations as context) | Alerts owned by fulfilment monitoring surfaces |
| Organisation settings (tenancy) | **Organisations** | Directory / identity settings |
| Partner settings (workspace / fulfilment participation) | **Partner Operations** | Partner ops concern; partner app settings remain partner-facing |
| Analytics (fulfilment / partner performance) | **Neither** — Fulfilment Analytics (Admin) / partner analytics (Business Workspace) | Partner Operations may link or summarise later; not system of record |
| Timeline (per fulfilment) | **Neither** — Fulfilment Timeline | Case investigation |
| Audit history (security-sensitive actions) | **Neither** — Audit (platform); both pages may link | Audit is cross-cutting |
| Advertiser-specific capabilities | **Neither** — Advertiser / campaigns product areas; **Organisations** for tenancy only | Prevent Partner Operations creep |
| Government-specific capabilities | **Neither** — future government console; **Organisations** for tenancy only | Same |
| Future organisation-specific capabilities | Type-specific console; **Organisations** for identity; **never** dump into Partner Operations unless the type is a reward partner | Protects Partner Operations focus |

### Intentional “Both” rules

When **Both** appears:

1. The **same underlying Organisation** is involved.
2. Each page expresses a **different job**: tenancy vs partner readiness.
3. Duplicate *workflows* are allowed only when the entry context differs (directory admin vs fulfilment onboarding) and the outcome is the same domain truth.
4. If two pages expose the same action with the same framing and no contextual difference, that is **drift**, not intentional Both.

---

## Section 5 — Product Boundaries

### What Partner Operations is NOT

| Not this | Example of incorrect use |
|----------|---------------------------|
| Not the global Organisation directory | Browsing advertisers or government orgs as primary content |
| Not the fulfilment case desk | Cancelling a single redemption, inspecting token history as core job |
| Not Resource Pools | Importing voucher codes as a Partner Operations primary workflow |
| Not the Business Workspace | Partner staff validating QR codes day-to-day (that is movrr-app) |
| Not legal / CRM system of record | Full contract lifecycle, invoice history |
| Not a second Organisations page with a filter chip | Same directory UX with only a type filter and identical framing |

**Boundary example:** If an operator needs “all suspended tenants across types,” that belongs in Organisations. If they need “which reward partners are unsafe to keep live for collection,” that belongs in Partner Operations.

### What Organisations is NOT

| Not this | Example of incorrect use |
|----------|---------------------------|
| Not the fulfilment partner ops console | Leading with validation readiness, collection capacity, partner go-live as the page mission |
| Not a duplicate Create Partner wizard with tenancy wording only | Primary CTA that only creates reward partners while claiming to be a multi-type directory |
| Not Queue / Timeline / Analytics | Stuck fulfilments as the main Organisations story |
| Not the place to hide type-specific operating tools forever | Refusing to send users to Partner Operations for partner readiness work |
| Not an operational dashboard | KPI walls of fulfilment throughput as Organisations’ primary purpose |

**Boundary example:** If an administrator needs to provision a government Organisation and assign members, that belongs in Organisations. If they need to get a cafe ready to validate rider rewards tomorrow, that belongs in Partner Operations.

### Boundary principles that prevent future overlap

1. **One primary responsibility per page** (see Section 9).
2. **Type-specific operating consoles never replace the Organisation directory.**
3. **The Organisation directory never absorbs type-specific operating missions.**
4. **Partner Operations may list only reward partners** as its primary population.
5. **Organisations must be able to show non-partner types** without forcing partner vocabulary.
6. **Shared components are allowed; shared product meaning is not.** Reuse is an engineering concern; identical operator jobs on two pages are a product defect unless listed as intentional Both.

---

## Section 6 — User Mental Models

### Partner Operations — operator mental model

**When I open this page, I am managing fulfilment partners.**

#### Questions I should be answering

- Which reward partners can participate in fulfilment right now?
- Is this partner staffed for validation / confirmation?
- Is their profile / contact information usable?
- Do I need to onboard, pause, or restore a partner?
- Is this partner ready for a reward that requires collection?

#### Decisions I should be making

- Create / do not create a new partner for a commercial or ops need.
- Activate, deactivate, or suspend participation.
- Grant or adjust staff access for Business Workspace work.
- Update partner contact / profile details that ops and catalog rely on.

#### Outcomes I should achieve

- Partners required for live rewards are ready.
- Unsafe partners are not left active.
- Staff can operate in the Business Workspace with correct roles.
- Fulfilment operators are not blocked by missing partner tenancy or access.

### Organisations — administrator mental model

**When I open this page, I am administering platform institutions.**

#### Questions I should be answering

- What Organisations exist, and of which types?
- What is this institution’s platform identity and status?
- Who are its members?
- Where should I go for type-specific operations (e.g. partner readiness)?
- Are we missing a tenant that another product depends on?

#### Decisions I should be making

- Create or classify an Organisation of the correct type.
- Change platform status of a tenant.
- Administer membership independently of a single product console.
- Choose the correct specialised surface for deeper operational work.

#### Outcomes I should achieve

- Tenancy is complete, correct, and findable.
- Non-partner types are not forced through Partner Operations.
- Membership and identity remain coherent across the platform.
- The directory remains the authoritative map of institutions.

---

## Section 7 — Information Architecture Principles

No layouts or wireframes — conceptual IA only.

### Partner Operations

| Layer | Principle |
|-------|-----------|
| **Primary focus** | Reward Partner readiness for fulfilment |
| **Secondary information** | Staff access, partner profile / contact, participation status |
| **Supporting information** | Organisation id/name linkage, optional consumed health signals from Queue / Pools |
| **Progressive disclosure** | List = who/readiness posture → detail = profile + staff + status actions → deep links to Queue/Pools when investigating incidents |
| **Navigation philosophy** | Lives under Fulfilment because its job is fulfilment capacity; peers with Queue, Pools, Collections — not a generic admin settings area |
| **Relationship to Fulfilment module** | The people/institutions side of fulfilment readiness; Queue is cases; Pools is inventory; Analytics is performance |

### Organisations

| Layer | Principle |
|-------|-----------|
| **Primary focus** | Multi-type Organisation directory and identity |
| **Secondary information** | Type, platform status, membership |
| **Supporting information** | Type-specific profile presence (e.g. linked partner profile) as identification only |
| **Progressive disclosure** | Directory → Organisation identity & members → navigate to type-specific console when the job becomes operational |
| **Navigation philosophy** | Placed for Admin discoverability with Fulfilment today because fulfilment delivered the first org type; conceptually it is **platform tenancy**, not a fulfilment case tool |
| **Relationship to Fulfilment module** | Supplies tenant identity that fulfilment references; must not be framed as another fulfilment ops queue |

### Conceptual difference (must remain true)

| | Partner Operations | Organisations |
|--|--------------------|---------------|
| Population | Reward partners | All Organisation types |
| Job | Readiness to fulfil | Identity and membership |
| Success feeling | “Partners can operate” | “Tenants are correct and findable” |
| Verb | Enable / staff / suspend partner | Find / classify / administer tenant |

---

## Section 8 — Future Evolution

### Near-term product evolution

- Partner Operations deepens as a **readiness console** (staffing, status, profile, readiness signals) while still not owning Queue or Pools.
- Organisations deepens as a **true multi-type directory** (filters by type, create paths per type, membership admin) while still not owning partner go-live as its mission.

### Additional organisation types

When adding a type (education, corporate, marketplace, municipality-as-government, enterprise):

1. Extend Organisation type vocabulary in the **domain** (already designed for extension).
2. Appear in **Organisations** directory immediately.
3. Add a **type-specific operating console** only when that type has an operational mission.
4. Do **not** overload Partner Operations unless the type is genuinely a Reward Partner (fulfilment participant).

### Dedicated organisation experiences

| Type | Directory home | Operating console (when needed) |
|------|----------------|----------------------------------|
| Reward Partner | Organisations | Partner Operations (+ Business Workspace for partner staff) |
| Advertiser | Organisations | Advertiser / campaigns Admin |
| Government | Organisations | Future government programmes console |
| MOVRR | Organisations | Internal admin / capability surfaces |
| Future types | Organisations | New console named for that mission |

### Partner operational maturity

Partner Operations may later express maturity stages (provisioned → staffed → validating → healthy) as **product concepts**. Those stages still consume Organisation + membership + fulfilment signals; they do not move tenancy ownership out of Organisations.

### Enterprise tenancy & government / corporate / education / marketplace

Enterprise and institutional growth hangs off Organisation:

- Parent/child tenancy, if introduced, hangs off Organisation relationships — not off Partner Operations lists.
- Marketplace sellers are Organisations (possibly with commerce profiles), not “partners” unless they also fulfil rewards.
- Educational or corporate reward sponsors may be Organisations that are **not** Reward Partners until they participate in fulfilment.

### Invariant through evolution

> Partner Operations stays focused on fulfilment participation.  
> Organisations stays focused on platform institutions.  
> The Organisation model does not need redesign to add types — product surfaces specialise around it.

---

## Section 9 — Product Principles

Future implementations and designs **must** follow these principles:

1. **Organisation is the platform identity.**  
   All institutional participation starts from Organisation.

2. **Partner Operations is the fulfilment operating console for Reward Partners.**  
   Its north star is partner readiness for collection and validation.

3. **Organisations is the tenancy directory.**  
   Its north star is correct, findable institutions and membership.

4. **Partner Operations consumes Organisation data; it does not redefine Organisation.**  
   Canonical identity remains Organisation-owned.

5. **Organisations never becomes an operational fulfilment dashboard.**  
   No queue, pool exhaustion, or token tooling as primary purpose.

6. **Partner Operations never becomes the tenancy directory.**  
   No multi-type institution browser as primary purpose.

7. **A Reward Partner is always an Organisation.**  
   Never invent a parallel partner-only identity that bypasses Organisation.

8. **Future organisation types must not require redesigning the Organisation model.**  
   Add type + profile + console; keep the trunk.

9. **Every page has one primary responsibility.**  
   Secondary jobs require explicit justification in this document.

10. **Avoid duplicate workflows unless intentional and explicitly justified.**  
    Shared domain objects are expected; identical operator jobs on two pages are not.

11. **Type-specific vocabulary stays on type-specific surfaces.**  
    Partner words on Partner Operations; neutral tenancy words on Organisations.

12. **Business Workspace remains partner-facing.**  
    Admin Partner Operations enables partners; it does not replace their daily validate/confirm work.

13. **Fulfilment case tools remain Fulfilment case tools.**  
    Queue, Timeline, Resource Pools, and Analytics keep their missions.

14. **This specification wins conflicts until explicitly revised.**  
    Drift requires a documented change to this contract.

---

## Product Decision Framework

Use this framework whenever a new Admin or related product capability is proposed. Answer the questions **in order**. Stop at the first clear yes.

| # | Question | If yes → |
|---|----------|----------|
| 1 | Is this about institutional identity or tenancy? | **Organisations** |
| 2 | Is this about reward partner fulfilment readiness? | **Partner Operations** |
| 3 | Is this about an individual redemption or fulfilment case? | **Fulfilment Queue / Timeline** |
| 4 | Is this about inventory, stock, or voucher resources? | **Resource Pools** |
| 5 | Is this about campaign management or advertisers? | **Advertiser product surfaces** |
| 6 | Is this about day-to-day work performed by partner staff? | **Business Workspace** |

### If none of the above clearly apply

1. **Stop** implementation of the capability on an existing page by default.
2. **Update** this Product Intent & Responsibility Specification before introducing the functionality.
3. Only then place the capability on an existing surface or define a new one under the revised contract.

### How to apply the framework

- Apply it in product review, design critique, and engineering ticket intake — not after build.
- A capability may **consume** data from another surface; that does not move ownership. Ownership follows the first matching question.
- If two questions seem to apply, prefer the earlier question for **system of record / primary responsibility**, and treat the later surface as consumer or deep-link context unless this specification already defines intentional dual ownership.
- The framework exists to prevent Information Architecture drift by giving teams a repeatable placement decision before work starts.

---

## Section 10 — Success Criteria (for this specification)

This specification is complete and usable when all of the following are true:

| Criterion | Met when… |
|-----------|-----------|
| Distinction is immediately understandable | A new teammate can explain both pages in one sentence each after reading Sections 1–2 |
| Responsibilities are unambiguous | The matrix in Section 4 answers ownership without debate for listed capabilities |
| Designers know what to communicate | Sections 6–7 define questions, decisions, outcomes, and IA principles without prescribing pixels |
| Engineers know where capabilities belong | Section 4 + boundaries in Section 5 decide placement before tickets are written |
| PMs can expand org types | Section 3 + 8 give a repeatable expansion pattern |
| IA drift is protected against | Section 5, 9, and the authority rule at the top block silent convergence |

### One-sentence contracts (memorise these)

- **Organisations:** *Who is the institution on MOVRR?*
- **Partner Operations:** *Is this reward partner ready to fulfil?*

### Relationship contract (memorise this)

```text
Organisation  →  platform tenancy & identity
Reward Partner  →  Organisation specialised for fulfilment + partner profile
Organisations (page)  →  administer the Organisation set
Partner Operations (page)  →  operate Reward Partner readiness
```

---

## Appendix A — Glossary

| Term | Meaning in this specification |
|------|-------------------------------|
| Organisation | Platform tenant / institutional identity |
| Reward Partner | Organisation type that participates in reward fulfilment; includes partner profile |
| Partner profile | Catalog / business-facing attributes of a Reward Partner |
| Partner Operations | Admin fulfilment operating console for Reward Partners |
| Organisations (page) | Admin tenancy directory for all Organisation types |
| Business Workspace | Partner-facing app experience (movrr-app) for validate / confirm / partner work |
| Membership | Link between a user and an Organisation with a role / capability bundle |
| Readiness | Product concept: partner can participate safely in fulfilment |
| Tenancy | Product concept: institutional home for identity, members, and capabilities |

## Appendix B — Non-goals of this document

- UI mockups, component inventories, or interaction specs  
- API routes, permission string lists, or migration plans  
- Deciding whether nav labels or module placement should change (IA *principles* only)  
- Merging or splitting code modules  

Those may follow later **under the authority of this product contract**.

---

## Appendix C — Product Invariants

These are product-level truths that must **always** remain true unless this specification is formally revised. They are long-term guardrails for MOVRR’s product architecture.

1. **Every Reward Partner is an Organisation.**
2. **An Organisation may exist without being a Reward Partner.**
3. **Organisation is always the platform identity.**
4. **Partner Operations never becomes the Organisation directory.**
5. **Organisations never becomes the fulfilment operating console.**
6. **Fulfilment execution never owns Organisation identity.**
7. **Resource Pools never become Partner Operations.**
8. **Business Workspace never replaces Admin.**
9. **Every page has exactly one primary responsibility.**
10. **Every new Organisation type begins life as an Organisation before receiving specialised operational experiences.**
11. **Shared components are acceptable. Shared product responsibilities are not** — unless explicitly defined by this specification.
12. **Any future capability that violates these invariants requires this specification to be updated before implementation begins.**

Invariants do not add new product responsibilities. They protect the responsibilities already approved in this contract.

---

## Document control

| Field | Value |
|-------|-------|
| Title | Partner Operations & Organisations — Product Intent & Responsibility Specification |
| Location | `docs/product/partner-operations-and-organisations.md` |
| Depends on domain model | Organisation ⊃ Reward Partner (profile composition) |
| Supersedes | Informal dual-page ambiguity identified in the July 2026 Admin audit |
| Next authorised step | UI/UX expression and implementation planning that **conform** to this contract |
