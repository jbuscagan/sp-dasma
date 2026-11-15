# Style guide (UI consistency)

## Framework: Tailwind CSS (already in use)
The whole interface is built with **Tailwind CSS**. We do not mix in Bootstrap: using two CSS frameworks makes pages look inconsistent and the site slower.
Tailwind was chosen because:
- it works naturally with Next.js/React components,
- it ships only the styles actually used, so pages load fast,
- dark mode and phone layouts are built in (`dark:` and `sm:` / `lg:` prefixes).

## One source of truth
| What | Where | Rule |
|---|---|---|
| Colours (navy, gold, surfaces, text) | `src/app/globals.css` (CSS variables) + `tailwind.config.ts` | Use `brand-*`, `gold`, `ink`, `muted`, `line`, `panel`, `surface`. Never hard-code a colour in a page. |
| Buttons, fields, modals, badges, tabs, alerts | `src/components/ui/index.tsx` | Always use `<Button>`, `<Field>`, `<Modal>`, `<Badge>`, `<Tabs>`, `<Alert>`, `<PageHeader>`. |
| Inputs, cards, tables | `.input`, `.card`, `.table-base` in `globals.css` | Same look everywhere. |
| Type-ahead | `src/components/ui/Combobox.tsx` | For organizations, barangays and names. |
| Row ordering | `src/hooks/useReorder.ts` + `src/components/ui/PositionCell.tsx` | Drag ⋮⋮ or type a number. |

## Patterns
- **Page:** `PageHeader` (title, one-line help, actions on the right) → filter card → content card.
- **Primary action:** one blue button per area. The gold button is used only for the weekly **Publish**.
- **Destructive actions:** red ghost button, always with a confirmation.
- **Status badges:** gray = draft, blue = submitted, green = published / received, amber = needs attention, red = problem.
- **Responsive:** wide tables scroll inside their card (`min-w-0` on the parent); the page itself never scrolls sideways.
