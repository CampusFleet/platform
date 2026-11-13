# Components

Grouped by portal: `portal/` (student), `conductor/`, `driver/`, `teacher/`, `transport-admin/`,
`transport-manager/`, `admin/`, plus `common/` (header, bottom nav, settings), `maps/`, `scanner/`, `chat/`, `ui/`.

Layout shells: `common/UnifiedAppHeader.tsx` (all portals, `ROLE_PORTALS` list), `common/MobileBottomNav.tsx`
(per-role fallback menus in `getRoleNavItems`), `src/app/portal/ClientPortalLayout.tsx` (student guards).

## Rules
- There is no shared primitive library yet (Phase 1 adds `ui/`). Until then, copy the existing look:
  `rounded-2xl` cards, `rounded-xl` buttons/inputs, `blue-600` primary, pure-black dark mode, Inter font.
- Mobile first (360 px): give flex children `min-w-0` + `truncate`, avoid `min-w-[Npx]`/`w-80` without `max-w-[calc(100vw-2rem)]`,
  use `dvh` not `vh`, keep floating buttons above the bottom nav.
- These classes do nothing in the current Tailwind config: `animate-in`, `fade-in`, `zoom-in-*`, `slide-in-*`, `h-13`, `w-4.5`, `h-4.5`, `shadow-xs`, `backdrop-blur-xs`.
- Never render placeholder values as real data (no fake ID, name, fee, department).
- Students must never see `tripCode` / trip ids.
