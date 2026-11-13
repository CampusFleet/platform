# Components

Grouped by portal: `portal/` (student), `conductor/`, `driver/`, `teacher/`, `transport-admin/`,
`transport-manager/`, `admin/`, plus `common/` (header, bottom nav, settings), `maps/`, `scanner/`, `chat/`, `ui/`.

Layout shells: `common/UnifiedAppHeader.tsx` (all portals, `ROLE_PORTALS` list), `common/MobileBottomNav.tsx`
(per-role fallback menus in `getRoleNavItems`), `src/app/portal/ClientPortalLayout.tsx` (student guards).

## Rules
- Use `@/components/ui` (Button, Card, Badge, Stat, Field/Input/Select, Sheet, EmptyState, Segmented, `cn`) for new and rebuilt screens. Where you must hand-write Tailwind, keep the look:
  `rounded-2xl` cards, `rounded-xl` buttons/inputs, `blue-600` primary, pure-black dark mode, Inter font.
- Mobile first (360 px): give flex children `min-w-0` + `truncate`, avoid `min-w-[Npx]`/`w-80` without `max-w-[calc(100vw-2rem)]`,
  use `dvh` not `vh`, keep floating buttons above the bottom nav.
- Safe-area: fixed bottom elements use `bottom-[calc(env(safe-area-inset-bottom)+…)]`; floating buttons sit at `+5rem` on mobile so they clear the bottom nav.
- `html, body` have `overflow-x: clip` as a safety net only; still fix the overflowing element.
- Never render placeholder values as real data (no fake ID, name, fee, department).
- Students must never see `tripCode` / trip ids.
