# Frontend Component Guidelines

> Component conventions for `apps/web/`. Status: greenfield — conventions to follow.

---

## 1. Building blocks

- Use **shadcn/ui + Radix** primitives (accessible by default) and style with **Tailwind**; wrap them in `components/` rather than scattering raw Radix across features.
- Function components only; no class components.

## 2. Component structure

```tsx
type Props = { sessionId: string; onPause: () => void }   // explicit, typed

export function ActivityStream({ sessionId, onPause }: Props) {
  // 1. hooks (data, state)   2. derived values   3. handlers   4. JSX
}
```

## 3. Props conventions

- Define an explicit `Props` type; **no `any`**. Reuse cross-cutting shapes from `packages/shared`.
- Keep components presentational where possible; push data fetching into hooks (see `hook-guidelines.md`) and orchestration into the feature.
- Prefer composition over boolean-flag explosions (a row of `isX` booleans is a smell → split the component).

## 4. Styling

- Tailwind utility classes; extract repeated class sets into a component, not a copy-paste (redundancy smell).
- **Theme tokens only — never ad-hoc hex or literal Tailwind palette colors.** The token system (`src/styles.css`) is the single source of truth: `:root` holds HSL channel triplets, `@theme inline` maps them onto Tailwind utilities. Use `bg-card`, `text-muted-foreground`, `border-border-accent`, `bg-info-soft`, etc. — not `#xxxxxx`, not `bg-cyan-500`/`text-slate-400`/`bg-emerald-500`. Literal palette families (`slate`/`amber`/`emerald`/`cyan`/`sky`/`blue`) drift from the accent and break the single-accent discipline. The only acceptable hex is an xterm/CodeMirror fallback behind `??` that resolves from a token at runtime.

### Radius scale (use the semantic class, not a pixel guess)

| Class | px | Use on |
|-------|----|--------|
| `rounded-xs` | 6 | chips · badges · icon squares (e.g. 9×9 icon tile) · inline `<code>` · tooltip-tail |
| `rounded-sm` | 8 | buttons · inputs · textareas · select-triggers · pill list rows · 7×7 icon buttons |
| `rounded-md` | 12 | cards · dialogs · menus · popovers · sheets · section containers · code blocks · tabs lists |
| `rounded-lg` | 16 | workspace shell · full-width app frame · top nav bar |
| `rounded-full` | ∞ | status dots · avatars · progress bars · pills |

Forbidden: bare `rounded` (4px default), `rounded-xl`/`rounded-2xl`/`rounded-3xl` (untokenized defaults), `rounded-[var(--radius)]` (use the semantic class instead). The old `tailwind.config` `borderRadius` extension that mapped `rounded-md/lg` to ~22/24px is gone — `rounded-{sm,md,lg}` now resolve to 8/12/16 via `@theme inline`.

### Nested-radius rule — inner = outer − padding

When a rounded container holds a rounded child, the inner radius must equal the outer radius minus the padding between them, or the corners look uncoordinated. Concretely:
- Card `rounded-md` (12) + `p-3` (12px) → inner element `rounded-full` or flush. With `p-2` (8px) → inner `rounded-sm` (≈4–8).
- `ModeToggle` container `rounded-md` (12) + `p-0.5` (2px) → inner buttons `rounded-sm` (8) ≈ 12−2−2.
- A 9×9 icon tile is a chip, not a card → `rounded-xs`, never `rounded-lg` (the old code put 16px on a 36px square — inner bigger than outer).

### Motion — tiered, not killed

`prefers-reduced-motion` is handled centrally in `styles.css`, tiered: transform/scale animations and infinite loops are disabled, but opacity/color transitions are kept at ~150ms so reduced-motion users still see gentle state changes (not a 0.01ms full-kill). Do not duplicate this per-component. For interactive elements, add `transition-colors duration-150` on hover-highlighted rows and `active:scale-[0.98]`-style press feedback where appropriate. Defined keyframes (`fade-in-up`, `route-fade`, `panel-in`, `live-pulse`, `collapsible-*`) live once in `styles.css` — never redefine a keyframe in `tailwind.config.ts` (the old `fade-in-up` duplicate caused a name collision).

### Theme-ready token architecture

`@theme inline` (not bare `@theme`) maps `:root` runtime variables onto Tailwind utilities, so a future `.dark` / `[data-theme]` override of the `:root` variables flows through every utility. Don't reintroduce a static `@theme` block with literal HSL values — that creates a dual-track system where `@theme` and `:root` drift apart. To add a token: declare the HSL triplet in `:root`, then map it under `@theme inline`.

## 5. User-facing copy

- UI copy must describe the product capability or user workflow directly. Do not show internal roadmap labels, task names, implementation phases, or temporary project shorthand in visible text.
- The same rule applies to aria labels, tooltips, empty states, and status text: use language a user can act on, not planning terminology.

## 6. Accessibility

- Lean on Radix's a11y; preserve labels, focus order, and keyboard handling. Don't strip ARIA that primitives provide.

## 7. Real-time surfaces

The activity stream / run panel update live. Keep render cost bounded: virtualize long streams, memoize list rows, and derive from server state (TanStack Query / WS) rather than duplicating it into local state.

## 8. Common mistakes to avoid

- Putting fetch calls directly in components (use hooks).
- Duplicating server state into `useState` (causes drift — see `state-management.md`).
- Letting roadmap shorthand leak into UI strings, component labels, or placeholder text.
- **Computing a right-edge drag width as `window.innerWidth - pointerX`.** This assumes the dragged panel's right edge is flush with the viewport — it almost never is (app padding, borders, a left sidebar all inset it). The handle lags the pointer and the panel snaps to max width early. Instead, capture the container's `getBoundingClientRect().right` at drag start (via the handle's `parentElement`) into a ref, and compute `railRightRef.current - pointerX` on move. See `useResizableRail`.
