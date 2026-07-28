# Design System Alignment Implementation Plan (movrr-admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `movrr-admin` visual language to match `movrr-app` / `movrr-website-new` brand tokens, Manrope, hybrid forest/signal greens, quiet surfaces — then remap maps/charts — without changing business logic.

**Architecture:** Token-first cascade. Prefer copying verified blocks from `movrr-app/app/globals.css` (already aligned). Remap shadcn semantics, swap Inter→Manrope, delete glass/dead utilities, restyle primitives → shell → components → screens → maps/charts. Presentational classes only.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui (new-york), framer-motion, next-themes, recharts, maplibre, Redux UI shell, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-07-28-design-system-alignment-design.md`  
**Parity reference (read-only):** `C:\Users\ghyor\OneDrive\Desktop\Projects\movrr-app\app\globals.css`, `app/layout.tsx`, `app/auth/layout.tsx`, shell components.

## Global Constraints

- Marketing/`movrr-app` hybrid model: deep forest brand chrome; signal green `oklch(0.7123 0.1953 149.53)` as `--primary`
- Keep dark mode; rebuild on MOVRR ink/forest
- Manrope sans/display; JetBrains Mono mono only
- Quiet surfaces: no glass as default product chrome
- Do NOT change auth/MFA flows, routing, APIs, Query, Redux semantics, role gates, form validation
- Do NOT touch emails, `movrr-mobile`, or extract shared npm package
- Maps/charts hex remaps only AFTER shell + glass sweep (Task 6)
- Verify: `npm run typecheck` (or `tsc --noEmit`), `npm run lint`, banned-pattern greps; run `npm run build` at end

---

## File structure (units of change)

| File / area | Responsibility |
|-------------|----------------|
| `app/globals.css` | Tokens, `@theme`, base type, `page-canvas`, `.auth-shell`, reduced-motion |
| `app/layout.tsx` | Manrope + JetBrains; font CSS vars |
| `components/ui/*` | Token-aligned primitives |
| `components/layout/*` | Sidebar, Navbar, Footer, Breadcrumb |
| `components/theme/*` | ThemeToggle quiet |
| `components/stats/StatsCard.tsx` | Quiet stats |
| `components/auth/*`, `components/forms/*`, `app/auth/*` | Auth/MFA chrome |
| `components/**` drawers + `app/**` pages | glass/gradient sweep |
| Maps + charts | Task 6 only |

---

### Task 1: Foundation — Manrope + tokens + quiet CSS

**Files:** `app/layout.tsx`, `app/globals.css`  
**Reference:** copy verified token/`@theme`/base/auth-shell/`page-canvas` blocks from movrr-app globals + Manrope layout wiring.

- [ ] **Step 1:** Swap Inter → Manrope in `app/layout.tsx` (`--font-manrope`, keep JetBrains `--font-jetbrains-mono`)
- [ ] **Step 2:** Replace `app/globals.css` brand+semantic+theme+base with movrr-app-aligned content; remove glass/gradient/accent-alt/dead marketing utilities; add `@utility page-canvas` and `.auth-shell`; product heading scale; reduced-motion media query
- [ ] **Step 3:** Verify `rg -n "Inter|glass-card|gradient-bg|accent-alt" app/globals.css app/layout.tsx` → no glass/gradient defs; no Inter
- [ ] **Step 4:** Commit `feat(design): adopt Manrope and MOVRR hybrid tokens`

---

### Task 2: UI primitives

**Files:** `components/ui/card.tsx`, `badge.tsx`, `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `alert.tsx`, others with palette hardcodes

- [ ] **Step 1:** Card: `rounded-xl border border-border bg-card` + `shadow-none` (or xs max)
- [ ] **Step 2:** Badge success/destructive use semantic tokens; kill emerald/blue/purple variants that hardcode Tailwind palettes
- [ ] **Step 3:** Inputs/selects: ring via `--ring`; no hardcoded focus colors
- [ ] **Step 4:** Grep `components/ui` for `emerald-|blue-|purple-|glass`
- [ ] **Step 5:** Commit `refactor(ui): quiet token-aligned primitives`

---

### Task 3: Shell chrome

**Files:** `components/layout/Sidebar.tsx`, `Navbar.tsx`, `Footer.tsx`, `Breadcrumb.tsx`, `components/theme/ThemeToggle.tsx`, PageHeader if present

- [ ] **Step 1:** Sidebar logo well deep forest (`bg-movrr-bg-primary`); active nav signal; logout destructive semantic; `border-r border-border`; focus rings
- [ ] **Step 2:** Navbar quiet hairline; no glass
- [ ] **Step 3:** Footer strip social / Made with ♥; match height discipline with sidebar footer if any
- [ ] **Step 4:** ThemeToggle token-only
- [ ] **Step 5:** Commit `refactor(shell): quiet admin chrome with MOVRR brand accents`

---

### Task 4: Product components + auth/MFA

**Files:** `components/stats/StatsCard.tsx`, `app/auth/layout.tsx`, auth pages, `components/forms/signin-form.tsx`, MFA forms, add `components/motion/ReducedMotionProvider.tsx` if missing, wire in root layout

- [ ] **Step 1:** StatsCard quiet; remove gradient variant / rainbow color maps; `rounded-[14px]` wells; semantic trend colors
- [ ] **Step 2:** Auth layout: `auth-shell`, left `bg-movrr-bg-primary`, right soft canvas, form wrapper `shadow-none` + hairline border
- [ ] **Step 3:** Signin/MFA/reset cards: no elevated shadow; product heading scale
- [ ] **Step 4:** ReducedMotionProvider (`MotionConfig reducedMotion="user"`)
- [ ] **Step 5:** Commit `refactor(auth): deep-forest panel and quiet MFA canvases`

---

### Task 5: Screen sweep — glass / gradient / palette

**Files:** all hits of `glass-card` (~175), `gradient-bg` (~24), plus high-visibility `emerald-|text-blue-|bg-purple-` on pages/drawers (exclude maps until Task 6)

- [ ] **Step 1:** Bulk replace page wrappers: `gradient-bg` → `page-canvas` (avoid double padding)
- [ ] **Step 2:** Replace `glass-card` with `border-border` (or rely on Card defaults); drop backdrop blur classes
- [ ] **Step 3:** Replace remaining palette hardcodes on non-map UI with semantic tokens
- [ ] **Step 4:** Verify `rg -n "glass-card|gradient-bg" app components` → 0 (or only comments)
- [ ] **Step 5:** Commit `refactor(screens): remove glass and gradient product chrome`

---

### Task 6: Maps + charts token remaps

**Files:** AdminMap + panels, RouteLocationsMap, DashboardOverview charts, any Recharts wrappers, Workboard status colors if still hardcoded

- [ ] **Step 1:** Chart series → `hsl(var(--chart-N))` or `var(--chart-N)` / Tailwind `fill-chart-*` as appropriate for Recharts
- [ ] **Step 2:** Map layer colors → CSS variables or semantic hex derived from tokens (document chosen mapping in commit body)
- [ ] **Step 3:** Workboard/status chips → success/warning/destructive/muted
- [ ] **Step 4:** Grep maps/charts for leftover `#4F7CFF|#22c55e|emerald-|purple-`
- [ ] **Step 5:** Commit `refactor(maps-charts): align series and layers to chart tokens`

---

### Task 7: Polish & verify

- [ ] **Step 1:** Add/verify focus rings on sidebar/breadcrumb interactive items
- [ ] **Step 2:** Run typecheck + lint; fix regressions from class renames only
- [ ] **Step 3:** Banned greps: `glass-card|gradient-bg|Inter` (app/components, exclude emails/node_modules); `#23b245` only in emails OK
- [ ] **Step 4:** `npm run build`
- [ ] **Step 5:** Commit `chore(design): verify admin design-system alignment`

---

## Done when

Spec success criteria checked; website ↔ app ↔ admin feel continuous; maps/charts on tokens; auth/MFA behaviour unchanged.
