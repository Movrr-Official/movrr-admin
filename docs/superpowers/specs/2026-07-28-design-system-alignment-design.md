# Design System Alignment — movrr-admin ↔ movrr-website-new

**Date:** 2026-07-28  
**Status:** Approved  
**Scope:** Visual / design-language migration of `movrr-admin` to inherit the canonical brand language of `movrr-website-new` (parity with completed `movrr-app` alignment)  
**Type:** Design language migration (not a redesign, not visual cloning)

---

## 1. Intent

An operator moving between `movrr-website-new`, `movrr-app`, and `movrr-admin` must feel they remain inside one product ecosystem.

The marketing site is the **canonical brand expression**. The admin dashboard is the **ops continuation** of that brand: same visual language, design tokens, typography, motion principles, and premium restraint — applied at dense ops/admin density, not storytelling layout.

### Decisions locked (identical to movrr-app)

| Decision | Choice |
|----------|--------|
| Colour mapping | **Hybrid (C):** deep forest for brand chrome; bright signal green for CTAs/actions; muted neutrals elsewhere |
| Dark mode | **Keep (A):** full light/dark/system; dark rebuilt on MOVRR ink/forest surfaces |
| Typography | **Manrope everywhere (A):** JetBrains Mono retained for IDs, codes, dense data |
| Surfaces | **Quiet (A):** drop glassmorphism; hairline borders; subtle elevation only where interactive |
| Approach | **Token-first cascade:** port `--movrr-*`, remap shadcn semantics, then sweep components/screens |
| Maps/charts hex | **Deferred after shell/token pass**, then remapped onto `--chart-*` / status tokens |

### Parity reference

Canonical product implementation already landed in `movrr-app` (`app/globals.css`, Manrope wiring, `.auth-shell`, `@utility page-canvas`, quiet shell). Prefer copying verified token/CSS blocks from `movrr-app` over re-deriving from marketing when values already match.

---

## 2. Canonical language (source of truth)

Source: `movrr-website-new/app/globals.css` + verified product remaps in `movrr-app/app/globals.css`. Motion easing `[0.22, 1, 0.36, 1]`.

### Brand philosophy (inherit)

1. Forest-green authority — near-black greens with one vivid signal green  
2. One face (Manrope), hierarchy via weight + opacity + tracking  
3. Restraint over chrome — hairline borders and opacity, not heavy shadows or glass  
4. Motion as polish — shared easing, reduced-motion respected  
5. Soft canvas + deep brand accents — not full-bleed photo heroes on auth/ops chrome

### What not to inherit

- Marketing section rhythm / clamp hero type  
- Full-bleed photography as product chrome  
- Marketing card radius (`1.75rem`) as default admin card  
- Editorial whitespace that hurts ops density  
- Marketing footer / social theatre inside the admin shell  

---

## 3. Token architecture

### 3.1 Port `--movrr-*` brand layer

Copy the verified `--movrr-*` OKLCH set from `movrr-app` into `movrr-admin/app/globals.css`. Expose via `@theme inline` (`bg-movrr-*`, `text-movrr-*`, `border-movrr-*`).

### 3.2 Hybrid shadcn semantic remapping

Same mapping as movrr-app:

- `--primary` = signal green (`--movrr-green-text` ≈ `#10c259`) for CTAs  
- Brand chrome (auth left panel, logo wells) uses `--movrr-bg-primary` / deep forest directly  
- Dark mode on `--movrr-bg-ink` / card-dark; kill cool blue-gray `… 240` neutrals  
- Charts: greens + restrained neutrals/amber (`--chart-1`…`--chart-5`)

### 3.3 Remove / replace

- `--glass-*`, `.glass-card`  
- `.gradient-bg` page wash → flat `page-canvas` / `bg-background`  
- Dead marketing utilities (`.cta-primary`, `.hero-section`, `.testimonial-card`, `.urgency-banner`, etc.)  
- `--accent-alt*` brand leftovers; prefer status tokens  

### 3.4 Radius & elevation

- Keep `--radius: 0.75rem`  
- Cards: `rounded-xl`, hairline borders; `shadow-none` or `shadow-xs` at most on resting cards  
- Floating chrome (menus, drawers) may use `shadow-sm`

---

## 4. Typography

- Manrope via `next/font` as `--font-manrope`; wire `@theme` sans/display  
- JetBrains Mono for mono roles  
- Replace marketing-scale global headings with product scale (page title `text-2xl md:text-3xl font-semibold`)

---

## 5. Shell & components

### 5.1 Shell

- **Sidebar:** Deep forest brand mark; quiet nav; active = signal green; logout = destructive semantic  
- **Navbar:** Quiet hairline; breadcrumb + theme + user; no glass  
- **Footer:** Strip social / “Made with ♥”; minimal product chrome  
- **PageHeader:** Product density, consistent padding  

### 5.2 Primitives

Token-only Button, Card, Badge, Input, etc. Signal focus rings. No emerald/blue/purple hardcodes in primitives.

### 5.3 Product components

- **StatsCard:** Quiet; semantic accents; `rounded-[14px]` icon wells; no rainbow hardcodes / gradient variant  
- **Auth:** Deep forest left panel; quiet form card (`shadow-none`); `.auth-shell` forces light brand tokens under system dark  
- MFA setup/challenge: same quiet card language as signin  
- Empties / errors / skeletons: calm Manrope, muted surfaces  

### 5.4 Motion

- 200–400ms product UI; easing `[0.22, 1, 0.36, 1]`  
- `prefers-reduced-motion` CSS + `MotionConfig reducedMotion="user"` if Framer is used  

---

## 6. Screen sweep (phase A)

Presentational-only across:

- `/auth/*` (signin, reset-password, MFA setup/challenge)  
- Overview pages, workboard, users, riders, advertisers, campaigns, rewards, routes, ride-sessions, notifications, settings, etc.  
- Drawers/cards using `glass-card`  

Replace: `glass-card`, `gradient-bg`, high-visibility palette hardcodes (`emerald-*`, `text-blue-*`, `bg-purple-*`, raw `red-600` logout, etc.).

---

## 7. Maps & charts (phase B — after shell/tokens)

After foundation + shell + glass sweep:

- Remap Recharts / dashboard series to `--chart-*`  
- Remap AdminMap / RouteLocationsMap / related panel hardcodes to semantic/status tokens (or CSS variables readable at runtime)  
- Do **not** invent a second palette — consume hybrid tokens only  

Email HTML templates (`#23b245`) are **out of scope** for this pass (transactional email clients ≠ product UI).

---

## 8. Accessibility & non-regression

- Contrast for signal green on white and forest + inverse text  
- Visible focus rings  
- Do **not** change: auth/MFA flows, routing, Supabase/API, TanStack Query, Redux UI state semantics, role gates, form validation, optimize APIs  

---

## 9. Phased delivery

1. **Foundation** — tokens, fonts, dark remaps, delete glass/dead CSS, `page-canvas`, `.auth-shell`  
2. **Primitives** — `components/ui/*`  
3. **Shell** — Sidebar, Navbar, Footer, Breadcrumb, ThemeToggle, PageHeader  
4. **Product components + auth** — StatsCard, auth layout/forms/MFA, ReducedMotionProvider  
5. **Screen sweep** — all `glass-card` / `gradient-bg` / palette hardcodes on pages & drawers  
6. **Maps + charts** — token remaps  
7. **Polish & verify** — greps, typecheck/lint/build, cohesion  

---

## 10. Success criteria

- [ ] Website → app → admin feels continuous (Manrope, forest/signal, quiet borders)  
- [ ] No default glassmorphism product chrome  
- [ ] No high-visibility Tailwind palette hardcodes on product UI  
- [ ] Maps/charts use chart/status tokens (not rainbow SaaS hex)  
- [ ] Dark mode = MOVRR ink/forest  
- [ ] Ops density preserved  
- [ ] Auth/MFA/API behaviour unchanged  

---

## 11. Explicit non-goals

- Rebuilding admin into marketing storytelling layouts  
- Shared `@movrr/design-tokens` package in this pass  
- Changing `movrr-mobile` or `movrr-app`  
- New admin features  
- Email template redesign  

---

## 12. Audit snapshot (pre-migration)

### Critical

- Primary still `#23b245`-family vs marketing deep/signal system  
- Inter vs Manrope  
- No `--movrr-*` layer  
- ~175 `glass-card` + ~24 `gradient-bg`  

### Important

- StatsCard / Sidebar / Auth hardcodes  
- Cool blue-gray dark mode  
- Marketing-scale global headings + dead CTA/hero utilities  
- Footer social theatre  
- MFA forms inherit old card chrome  

### Deferred then required

- AdminMap / RouteLocationsMap / dashboard chart hexes  

---

## 13. Out of scope follow-ups

- Shared design-tokens package across website + app + admin  
- Align `movrr-mobile`  
- Email template brand sync  
