# Canopy Design System

A design system for a calm, white-dominant website inspired by trees, forests, and natural growth. Nature is expressed through color, shape, and spacing, never through literal illustration. The result is airy, refined, and trustworthy.

**Version:** 1.0
**Principles:** White first. Generous space. Quiet confidence. Natural, not decorative.

---

## Table of Contents

1. Design Principles
2. Color
3. Typography
4. Layout and Spacing
5. Elevation, Borders, and Radius
6. Components
7. Visual Style
8. Motion
9. Accessibility
10. Responsive Behavior
11. Do and Don't
12. Tokens: CSS Variables
13. Tokens: Tailwind Config

---

## 1. Design Principles

| Principle | Meaning in practice |
|---|---|
| White is the canvas | At least 85 percent of any screen is white, soft white, or light mist. Color is an accent, not a fill. |
| Growth over decoration | Nature shows up as a green-led palette, soft organic radii, slow easing, and steady vertical rhythm. No leaf clip art. |
| Space is the luxury | When in doubt, add space. Sections breathe. Content is allowed to be sparse. |
| Quiet hierarchy | One clear focal point per section. Contrast comes from size, weight, and space before it comes from color. |
| Honest and trustworthy | Plain language, legible type, predictable components, visible focus. |

**Copy rule:** No emojis anywhere, including UI copy, headings, buttons, alerts, and examples. Use line icons only (see Section 7).

---

## 2. Color

### 2.1 Backgrounds (white-dominant)

| Token | Name | Hex | Usage rule |
|---|---|---|---|
| `--color-white` | Pure White | `#FFFFFF` | Default page background, cards, modals, inputs. The dominant color of the system. |
| `--color-soft-white` | Soft White | `#FAFBF9` | Alternate section background, footer top area, table headers. Barely distinguishable from white. |
| `--color-mist` | Light Mist | `#F3F6F2` | Secondary section bands, code blocks, neutral badges, disabled surfaces. |
| `--color-leaf-tint` | Leaf Tint | `#EAF1EA` | Very light green tint for subtle section backgrounds, hover states, selected rows, and brand badges. |

### 2.2 Brand and accents

| Token | Name | Hex | Usage rule |
|---|---|---|---|
| `--color-forest` | Deep Forest | `#1F4D3A` | Primary brand color. Primary buttons, links, active navigation, key accents, headings on tinted backgrounds. |
| `--color-forest-deep` | Forest Deep | `#163A2B` | Hover and pressed state for Deep Forest, dark CTA band, dark footer variant. |
| `--color-canopy` | Mid Green (Canopy) | `#3F7D58` | Secondary accent. Focus rings, icons, eyebrow labels on white, progress indicators, link hover. |
| `--color-sage` | Sage Green | `#9DB8A0` | Decorative accent only: dividers, motifs, chart fills, illustration strokes. Never used for text. |
| `--color-sage-light` | Sage Light | `#D3E0D5` | Strong dividers, selected borders, secondary chart fills, tag borders. |

### 2.3 Text and neutrals

| Token | Name | Hex | Usage rule |
|---|---|---|---|
| `--color-charcoal` | Warm Charcoal | `#2B2A27` | Primary body text and headings on light surfaces. |
| `--color-bark` | Bark Brown | `#5C4636` | Secondary headings, pull quotes, editorial accents, captions with warmth. Use sparingly. |
| `--color-stone` | Stone | `#6B6A64` | Muted text: helper text, placeholders, metadata, captions. |
| `--color-lichen` | Lichen | `#86968A` | Input and control borders (meets 3:1 for UI boundaries). Not for text. |
| `--color-line` | Line | `#E3E8E1` | Default 1px borders and dividers. |
| `--color-line-strong` | Line Strong | `#CBD5C8` | Hovered card borders, table outer borders, emphasized dividers. |

### 2.4 Semantic colors

Each semantic color has a text/icon tone, a fill tone for surfaces, and a border tone. They are muted to harmonize with the green palette.

| Role | Text and icon | Surface | Border | Notes |
|---|---|---|---|---|
| Success | `#2E7D4A` | `#E6F3EA` | `#BFDCC9` | Leaning green; always pair with a check icon and a label so it is not confused with the brand. |
| Warning | `#8A5A00` | `#FBF3E1` | `#EBD39B` | Warm ochre. Decorative fill or icon tone: `#C98A1B`. |
| Error | `#B3402F` | `#FBEBE8` | `#EDBFB7` | Clay red. Always pair with an alert icon and descriptive text. |
| Info | `#2D6A8A` | `#E7F1F6` | `#BCD8E5` | Slate blue-teal. Cool counterpoint to the greens. |

### 2.5 Contrast guidance (WCAG AA minimum)

Targets: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold) and for UI component boundaries and meaningful icons. Ratios below are calculated against the stated background; re-verify if any token changes.

| Foreground | Background | Ratio | Result | Use |
|---|---|---|---|---|
| Warm Charcoal `#2B2A27` | White `#FFFFFF` | 14.3:1 | AAA | Body text |
| Warm Charcoal | Soft White `#FAFBF9` | 13.8:1 | AAA | Body text |
| Warm Charcoal | Light Mist `#F3F6F2` | 13.2:1 | AAA | Body text |
| Warm Charcoal | Leaf Tint `#EAF1EA` | 12.5:1 | AAA | Body text |
| Deep Forest `#1F4D3A` | White | 9.6:1 | AAA | Links, headings, buttons |
| Deep Forest | Light Mist | 8.8:1 | AAA | Links on mist |
| Deep Forest | Leaf Tint | 8.4:1 | AAA | Badge text, selected rows |
| White | Deep Forest | 9.6:1 | AAA | Primary button label |
| White | Forest Deep `#163A2B` | 12.5:1 | AAA | Dark band text |
| Bark Brown `#5C4636` | White | 8.8:1 | AAA | Secondary headings |
| Stone `#6B6A64` | White | 5.4:1 | AA | Muted text |
| Stone | Light Mist | 5.0:1 | AA | Muted text on mist |
| Mid Green `#3F7D58` | White | 4.9:1 | AA | Eyebrows, icons, focus ring |
| Mid Green | Leaf Tint | 4.3:1 | Fails for small text | Large text and icons only on tint |
| Lichen `#86968A` | White | 3.1:1 | AA (UI) | Input borders only |
| Sage `#9DB8A0` | White | 2.1:1 | Decorative only | Never for text or required UI boundaries |
| Success text `#2E7D4A` | White | 5.1:1 | AA | Alerts, validation |
| Warning text `#8A5A00` | White | 5.9:1 | AA | Alerts, validation |
| Error text `#B3402F` | White | 5.7:1 | AA | Alerts, validation |
| Info text `#2D6A8A` | White | 5.9:1 | AA | Alerts, notes |

**Rules**
- Never place Mid Green text smaller than 24px on Leaf Tint. Use Deep Forest instead.
- Never rely on color alone to convey state. Always add an icon, label, or underline.
- Text over photography must reach 4.5:1 after the overlay is applied, or sit on a solid panel.

### 2.6 Brand color limit

A single screen may use at most **three brand colors** drawn from: Deep Forest, Mid Green, Sage, and Bark Brown. White, off-white, neutrals, and semantic colors (used only for status) do not count toward the limit. A typical page uses Deep Forest as the lead, Mid Green as a minor accent, and Sage in decorative details only.

### 2.7 Dark mode (optional)

Dark mode preserves the forest feel by using deep green-black surfaces, never neutral gray or pure black. White remains the text color of record.

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#0F1F18` | Page background (night forest) |
| `--color-surface` | `#16291F` | Cards, modals, nav |
| `--color-surface-raised` | `#1D3528` | Hover surfaces, table headers |
| `--color-border` | `#2C4538` | Borders and dividers |
| `--color-text` | `#E8EFE9` | Primary text (14.5:1 on bg) |
| `--color-text-muted` | `#A9BCAF` | Secondary text (8.5:1 on bg) |
| `--color-accent` | `#8CC5A2` | Links, primary buttons, focus ring (8.6:1 on bg) |
| `--color-accent-contrast` | `#0F1F18` | Text on accent buttons |

Dark mode activates via `[data-theme="dark"]` or `prefers-color-scheme: dark` when the user has not chosen a theme. The default experience is light.

---

## 3. Typography

### 3.1 Font families

| Role | Font | Google Fonts name | Fallback stack |
|---|---|---|---|
| Body and UI | Inter | `Inter` (weights 400, 500, 600) | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Headings (display, H1 to H3) | Newsreader | `Newsreader` (weights 400, 500; optical size axis on) | `Georgia, "Times New Roman", serif` |

Headings may alternatively use Inter alone for a fully sans-serif variant. Do not mix more than these two families.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
```

### 3.2 Type scale

Sizes use fluid `clamp()` between mobile and desktop. Desktop values shown first.

| Style | Family | Size (desktop / mobile) | Weight | Line height | Letter spacing | Notes |
|---|---|---|---|---|---|---|
| Display | Newsreader | 72px / 44px | 400 | 1.05 | -0.03em | Hero headline only, one per page |
| H1 | Newsreader | 56px / 36px | 400 | 1.10 | -0.02em | Page title |
| H2 | Newsreader | 40px / 30px | 500 | 1.15 | -0.015em | Section title |
| H3 | Newsreader | 30px / 24px | 500 | 1.25 | -0.01em | Subsection, card feature title |
| H4 | Inter | 22px / 20px | 600 | 1.35 | -0.01em | Card and panel titles |
| H5 | Inter | 18px / 17px | 600 | 1.40 | 0 | Minor titles |
| H6 (overline) | Inter | 13px / 13px | 600 | 1.40 | 0.08em | Uppercase, Mid Green; eyebrow labels |
| Body large | Inter | 18px / 17px | 400 | 1.70 | 0 | Lead paragraphs, hero subtext |
| Body | Inter | 16px / 16px | 400 | 1.65 | 0 | Default text |
| Small | Inter | 14px / 14px | 400 | 1.55 | 0 | Helper text, table cells, nav links |
| Caption | Inter | 12px / 12px | 400 | 1.50 | 0.01em | Image captions, metadata, legal |
| Button | Inter | 15px / 15px | 500 | 1.00 | 0.005em | All button labels |

### 3.3 Text rules

- **Color:** Headings and body use Warm Charcoal. Links and key accents use Deep Forest. Muted metadata uses Stone. Bark Brown is reserved for editorial elements such as pull quotes. Never use Sage for text.
- **Line length:** 60 to 72 characters for body copy (`max-width: 68ch`). Display and H1 should not exceed 20 characters per line; use `text-wrap: balance`.
- **Alignment:** Left-align body text. Center only short headings and hero copy (under 3 lines).
- **Hierarchy:** One H1 per page. Never skip heading levels. Pair each H2 with at most one eyebrow (H6) and one lead paragraph.
- **Links in body text:** Deep Forest, 1px underline with 3px offset, underline thickness grows to 2px on hover. Underline is never removed in running text.
- **Numerals:** Use `font-variant-numeric: tabular-nums` in tables and data.
- **Paragraph spacing:** 1.25em between paragraphs; 2em above H2, 1.5em above H3.

---

## 4. Layout and Spacing

### 4.1 Spacing scale (4px base unit)

| Token | Value | Typical use |
|---|---|---|
| `space-1` | 4px | Icon-to-label gap |
| `space-2` | 8px | Tight inline spacing |
| `space-3` | 12px | Input padding (vertical), badge gap |
| `space-4` | 16px | Default component gap |
| `space-5` | 20px | Mobile page margin |
| `space-6` | 24px | Card padding, grid gutter |
| `space-8` | 32px | Card padding (large), page margin tablet |
| `space-10` | 40px | Stack gap between related blocks |
| `space-12` | 48px | Page margin desktop |
| `space-16` | 64px | Section padding (mobile) |
| `space-20` | 80px | Large block separation |
| `space-24` | 96px | Section padding (tablet) |
| `space-32` | 128px | Section padding (desktop) |
| `space-40` | 160px | Hero padding (desktop) |

### 4.2 Grid and containers

| Token | Width | Use |
|---|---|---|
| `container-text` | 680px | Long-form reading column |
| `container-md` | 880px | Forms, narrow sections |
| `container-lg` | 1120px | Default content container |
| `container-xl` | 1280px | Wide layouts, navigation inner width |
| `container-full` | 100% | Full-bleed imagery only |

- **Grid:** 12 columns on desktop, 8 on tablet, 4 on mobile.
- **Gutters:** 24px desktop and tablet, 16px mobile.
- **Page margins:** 20px mobile, 32px tablet, 48px desktop.
- **Alignment:** Content is centered in its container. Prefer asymmetric splits (5/7 or 4/8 columns) over equal splits for editorial layouts.

### 4.3 Breakpoints

| Name | Min width | Target |
|---|---|---|
| `sm` | 640px | Large phones, landscape |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large desktops |

Design mobile first; layer enhancements with `min-width` queries.

### 4.4 Section padding

| Context | Mobile (below 768) | Tablet (768 to 1023) | Desktop (1024 and above) |
|---|---|---|---|
| Standard section | 64px top and bottom | 96px | 128px |
| Hero | 80px top, 64px bottom | 120px / 96px | 160px / 128px |
| Compact band (logos, stats) | 40px | 56px | 72px |
| Footer | 56px top, 32px bottom | 72px / 40px | 96px / 48px |

Rules:
- Alternate section backgrounds sparingly: white, then soft white or light mist, then white. Never stack three tinted sections.
- Vertical gap between a section heading block and its content: 48px desktop, 32px mobile.
- Leave at least 25 percent of a section's width empty on desktop when text-led.

---

## 5. Elevation, Borders, and Radius

### 5.1 Radius

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 6px | Badges, small tags, checkboxes |
| `radius-md` | 10px | Buttons, inputs, alerts |
| `radius-lg` | 16px | Cards, images, tables |
| `radius-xl` | 24px | Modals, hero imagery, large panels |
| `radius-full` | 9999px | Pills, avatars, toggles |

### 5.2 Borders

| Token | Value | Use |
|---|---|---|
| `border-default` | `1px solid #E3E8E1` | Cards, dividers, table rows |
| `border-strong` | `1px solid #CBD5C8` | Hovered cards, table outline |
| `border-control` | `1px solid #86968A` | Inputs, selects, checkboxes (3:1) |
| `border-brand` | `1px solid #1F4D3A` | Secondary buttons, selected state |

Borders are always 1px. Use 2px only for focus indicators and active-navigation underlines.

### 5.3 Shadows

Shadows are soft, low-opacity, and tinted with Deep Forest so they feel natural rather than gray.

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(31, 77, 58, 0.05)` | Inputs, subtle lift |
| `shadow-sm` | `0 2px 8px rgba(31, 77, 58, 0.06)` | Hovered cards, dropdowns |
| `shadow-md` | `0 8px 24px rgba(31, 77, 58, 0.08)` | Sticky nav on scroll, popovers |
| `shadow-lg` | `0 16px 48px rgba(31, 77, 58, 0.12)` | Modals |

Cards at rest use a border, not a shadow. Never stack a shadow and a strong border on the same element.

---

## 6. Components

All interactive components share these global rules:
- **Focus:** `outline: 2px solid #3F7D58; outline-offset: 2px;` (white outline on dark surfaces). Visible only on `:focus-visible`.
- **Transition:** `background-color, border-color, color, box-shadow, transform` at 200ms with `--ease-natural`.
- **Touch target:** minimum 44 by 44px.
- **Disabled:** background `#EEF1EC`, text `#8E9489`, border `#E3E8E1`, `cursor: not-allowed`, no hover effects, `aria-disabled="true"` or the `disabled` attribute.

### 6.1 Buttons

**Sizes**

| Size | Height | Horizontal padding | Font size | Icon size |
|---|---|---|---|---|
| Small | 36px | 16px | 14px | 16px |
| Medium (default) | 44px | 24px | 15px | 20px |
| Large | 52px | 32px | 16px | 20px |

Radius `radius-md` (10px). Icon-to-label gap 8px. Labels are sentence case, verb-led ("Get started", "View projects").

**Variants and states**

| State | Primary | Secondary | Ghost |
|---|---|---|---|
| Default | bg `#1F4D3A`, text `#FFFFFF`, no border | bg `#FFFFFF`, text `#1F4D3A`, border `1px #1F4D3A` | bg transparent, text `#1F4D3A`, no border |
| Hover | bg `#163A2B` | bg `#EAF1EA` | bg `#EAF1EA` |
| Focus | Default + 2px `#3F7D58` outline, 2px offset | Same | Same |
| Active | bg `#163A2B`, `translateY(1px)` | bg `#D3E0D5` | bg `#D3E0D5` |
| Disabled | bg `#EEF1EC`, text `#8E9489` | bg `#FFFFFF`, text `#8E9489`, border `#E3E8E1` | text `#8E9489` |

Usage: one primary button per view region. Pair with a secondary or ghost button for the alternate action. Primary buttons never use gradients.

### 6.2 Navigation bar

- **Height:** 72px desktop, 64px mobile. Background white. Bottom border `1px #E3E8E1` appears once the page scrolls (with `shadow-md` optional at deep scroll).
- **Layout:** Logo left, links centered or right, primary button far right. Inner width `container-xl`.
- **Links:** 14px, weight 500, Warm Charcoal. Gap 32px.
- **Link states:** Hover text Deep Forest. Focus per global rule. Active (current page) text Deep Forest with a 2px Deep Forest underline, 8px below the text, plus `aria-current="page"`.
- **Sticky:** Position sticky at top, background `rgba(255,255,255,0.92)` with `backdrop-filter: blur(8px)`. Fall back to solid white where unsupported.
- **Mobile:** Menu icon (Lucide `menu`) opens a full-width white panel sliding down 8px with fade, 250ms. Links are 18px with 56px row height. Button has `aria-expanded` and `aria-controls`. Close with Escape and trap focus while open.

### 6.3 Footer

- Background Soft White `#FAFBF9`, top border `1px #E3E8E1`. An optional dark variant uses Forest Deep with white text; use at most once per site.
- Layout: logo and short statement in a wide left column (4 of 12), three link columns on the right. Column headings use H6 style in Stone. Links 14px Warm Charcoal, 12px vertical gap, hover Deep Forest with underline.
- Legal row: separated by a 1px line, 24px above, caption size, Stone text.
- Mobile: columns stack, with link groups in 2-column grid.

### 6.4 Hero section

- Background white. Optionally a single soft Leaf Tint band behind the image area, never a full-bleed gradient.
- **Layout (desktop):** 12-column grid. Text in columns 1 to 6, image in columns 7 to 12 with `radius-xl`. Vertically centered. Minimum height 640px.
- **Content order:** Eyebrow (H6, Mid Green), Display heading (max 3 lines), Body-large paragraph (max 52ch, Stone or Charcoal), buttons (primary plus secondary, 16px gap).
- **Mobile:** Text first, image below at 4:3, 40px gap.
- **Variants:** Centered text-only hero uses `container-md`, with a sage branch divider (Section 7.2) above the eyebrow.
- **Motion:** Content fades in and rises 8px over 300ms, staggered by 80ms.
- Example copy: "Grow with what lasts." / "Thoughtful work, built patiently, designed to stand for decades." / "Start a project" / "See our approach".

### 6.5 Cards

| Property | Value |
|---|---|
| Background | White |
| Border | `1px solid #E3E8E1` |
| Radius | `radius-lg` (16px) |
| Padding | 24px (compact), 32px (default) |
| Shadow | None at rest |
| Title | H4, Warm Charcoal |
| Body | Small or Body, Stone or Charcoal |

States:
- **Hover (interactive cards only):** border `#CBD5C8`, `shadow-sm`, `translateY(-2px)`, 200ms.
- **Focus:** Global outline on the card link; the whole card is the click target via a stretched link.
- **Active:** `translateY(0)`, shadow removed.
- **Selected:** border `1px #1F4D3A`, background `#EAF1EA`.
- **Disabled:** Mist background, muted text.

Image card variant: image on top, 3:2 ratio, top corners match radius, 24px padding below. Feature card variant: Lucide icon (24px, Mid Green) in a 48px `radius-md` Leaf Tint tile above the title.

### 6.6 Forms and inputs

| Property | Value |
|---|---|
| Height | 44px (inputs, selects), min-height 120px (textarea) |
| Padding | 12px 16px |
| Background | White |
| Border | `1px solid #86968A` |
| Radius | `radius-md` (10px) |
| Text | 16px Warm Charcoal (16px prevents mobile zoom) |
| Placeholder | Stone `#6B6A64` |
| Label | 14px, weight 500, Warm Charcoal, 8px above field |
| Helper text | 13px Stone, 8px below field |

| State | Style |
|---|---|
| Default | Border `#86968A` |
| Hover | Border `#1F4D3A` |
| Focus | Border `#1F4D3A`, `box-shadow: 0 0 0 3px rgba(63,125,88,0.25)` |
| Filled | Same as default |
| Error | Border `#B3402F`, error icon and message below in `#B3402F`; field has `aria-invalid="true"` and `aria-describedby` |
| Success | Border `#2E7D4A`, check icon at right |
| Disabled | Background `#EEF1EC`, border `#E3E8E1`, text `#8E9489` |

Checkboxes and radios: 20px, `radius-sm` (checkbox) or full (radio), border `#86968A`; checked fill Deep Forest with white mark. Toggle: 44 by 24px pill; off track `#CBD5C8`, on track Deep Forest. Fields stack with 24px vertical gap; form max width 480px (single column) or `container-md` (two columns on desktop).

### 6.7 Badges and tags

| Property | Value |
|---|---|
| Height | 24px (badge), 32px (removable tag) |
| Padding | 4px 10px |
| Typography | 12px, weight 500, letter spacing 0.01em |
| Radius | `radius-full` (pill) or `radius-sm` for compact data badges |

| Variant | Background | Text | Border |
|---|---|---|---|
| Neutral | `#F3F6F2` | `#2B2A27` | `#E3E8E1` |
| Brand | `#EAF1EA` | `#1F4D3A` | `#D3E0D5` |
| Success | `#E6F3EA` | `#2E7D4A` | `#BFDCC9` |
| Warning | `#FBF3E1` | `#8A5A00` | `#EBD39B` |
| Error | `#FBEBE8` | `#B3402F` | `#EDBFB7` |
| Info | `#E7F1F6` | `#2D6A8A` | `#BCD8E5` |

Interactive tags: hover background steps one tone darker, focus per global rule. Removable tags include a 16px Lucide `x` button with `aria-label="Remove [tag name]"`.

### 6.8 Modals

- **Overlay:** `rgba(22, 58, 43, 0.40)`, fade in 200ms. Optional `backdrop-filter: blur(4px)`.
- **Panel:** White, `radius-xl` (24px), `shadow-lg`, padding 32px (24px mobile). Max width 560px (confirmations 440px). Maximum height 85vh with internal scroll.
- **Structure:** H3 title, optional body in Body style, footer with buttons right-aligned (secondary left of primary). Close button is a ghost icon button (Lucide `x`, 20px) at the top right with `aria-label="Close dialog"`.
- **Motion:** Panel fades in and slides up 12px over 250ms. Closing reverses at 150ms.
- **Behavior:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title. Trap focus, close on Escape, restore focus to the trigger, lock background scroll.
- **Mobile:** Becomes a bottom sheet, full width, top corners 24px, max height 90vh.

### 6.9 Alerts

| Property | Value |
|---|---|
| Layout | Icon (20px) left, title and message, optional dismiss at right |
| Padding | 16px 20px |
| Radius | `radius-md` (10px) |
| Border | `1px` in the semantic border tone |
| Background | Semantic surface tone |
| Title | 15px, weight 600, semantic text tone |
| Message | 14px Warm Charcoal |

Icons (Lucide): `check-circle-2` (success), `alert-triangle` (warning), `alert-circle` (error), `info` (info). Use `role="status"` for non-urgent and `role="alert"` for errors. Banner alerts span the container width and use no shadow. Toasts are 360px wide, `shadow-md`, appear from the top right with a 200ms fade and 8px slide, and auto-dismiss only for non-critical messages after 6 seconds (pausable on hover and focus).

Example copy: "Your changes have been saved." / "We could not send your message. Check your connection and try again."

### 6.10 Tables and lists

**Tables**
- Wrapper: `radius-lg`, `border-default`, overflow hidden on desktop; horizontal scroll container on small screens with `tabindex="0"` and an accessible label.
- Header row: Soft White background, 13px weight 600 Warm Charcoal, bottom border `#CBD5C8`, left-aligned (numeric columns right-aligned).
- Cells: 14px, padding 16px 20px, bottom border `#E3E8E1`, vertical alignment middle.
- Row hover: Leaf Tint background (`#EAF1EA`). Selected row: Leaf Tint plus 2px Deep Forest left edge.
- No zebra striping. Numerals use tabular figures. Sortable headers use a Lucide `chevrons-up-down` icon (16px) and `aria-sort`.
- Mobile alternative: stack each row as a card with label and value pairs.

**Lists**
- Unordered: 6px circular marker in Mid Green, 8px gap between marker and text, 12px between items.
- Ordered: numerals in Mid Green, weight 600.
- Divided list: items separated by `1px #E3E8E1`, 16px vertical padding; hover on interactive rows uses Leaf Tint.
- Description list: term in 14px weight 500 Stone; definition in 16px Warm Charcoal.
- Check list: Lucide `check` icon (20px, Mid Green) as marker.

---

## 7. Visual Style

### 7.1 Imagery

- **Subject:** High-quality photography of trees, forests, canopy light, bark texture, leaves in soft focus, mist, and long natural shadows. Prefer wide, quiet compositions with a clear area of calm space.
- **Treatment:** Slightly desaturated (`saturate(0.85)`) with a faint green tint. Keep highlights soft; avoid high-contrast HDR looks and oversaturated greens.
- **Overlay (when text sits on imagery):** a single linear scrim of Forest Deep from 0.45 to 0 opacity, never more than two stops and never above 0.5 opacity. Verify 4.5:1 after the overlay. Prefer placing text beside the image instead.
- **Cropping and ratios:** 16:9 (banners), 3:2 (cards), 4:3 (hero secondary), 1:1 (avatars, thumbnails), 3:4 (portrait feature). Set `object-fit: cover` and choose `object-position` to keep the main subject (trunk, canopy edge) within the central 60 percent.
- **Shape:** Images use `radius-lg` or `radius-xl`. Do not mix sharp and rounded images on one page.
- **Quality:** Provide AVIF or WebP with a JPEG fallback, `srcset` for 1x, 2x, and explicit width and height to avoid layout shift. Lazy-load below the fold.
- **Alt text:** Describe content and purpose. Use `alt=""` for purely decorative imagery.
- **Avoid:** Stock clichés (handshakes, hands holding seedlings), heavy filters, text baked into images, and busy compositions.

### 7.2 Organic motifs (optional, sparing)

Thin branch or leaf line patterns may appear as section dividers or as a very low-contrast background accent. Use at most one motif per page section and no more than three per page.

- Stroke: 1.5px, Sage `#9DB8A0`, round caps, no fills.
- Background pattern opacity: 4 to 8 percent maximum; never behind body text.
- Mark all decorative SVGs `aria-hidden="true"`.

Branch divider (160 by 24):

```html
<svg width="160" height="24" viewBox="0 0 160 24" fill="none" stroke="#9DB8A0"
     stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
  <path d="M0 12H68"/>
  <path d="M92 12H160"/>
  <path d="M72 12C76 4 84 4 88 12C84 20 76 20 72 12Z"/>
</svg>
```

### 7.3 Icons

- **Library:** Lucide (preferred) or Heroicons Outline. One library per project.
- **Style:** Line only, 1.5px stroke (set `stroke-width="1.5"` on Lucide icons, whose default is 2), round caps and joins, no fills, no duotone.
- **Sizes:** 16px (inline, badges), 20px (buttons, inputs), 24px (feature tiles, nav), 32px (empty states).
- **Color:** Inherit text color by default. Use Mid Green for feature icons, and semantic text tones for status icons.
- **Accessibility:** Decorative icons are `aria-hidden="true"`. Icon-only buttons require an `aria-label`.
- **Suggested set:** `leaf`, `trees`, `sprout`, `sun`, `droplet`, `mountain`, `arrow-right`, `check`, `x`, `menu`, `search`, `chevron-down`, `info`.

### 7.4 Gradients

Gradients are functional only: image scrims and soft tint fades between Soft White and White. Never use decorative multi-color or saturated green gradients on buttons, headings, or backgrounds.

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Hover, focus, color changes, toggles |
| `--duration-base` | 200ms | Cards, buttons, dropdowns |
| `--duration-slow` | 300ms | Modals, hero entrance, page sections |
| `--ease-natural` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Default, gentle ease-out |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.25, 1)` | Large element movement |

Rules:
- Permitted effects: opacity fades and short translate slides (4 to 12px). No bounce, spin, parallax, or scale beyond 1.02.
- Durations stay between 150ms and 300ms. Stagger sequences by 60 to 100ms.
- Scroll reveals trigger once, are subtle (fade plus 8px rise), and never hide content from users with scripts disabled.
- Respect `prefers-reduced-motion` (see Section 9).

---

## 9. Accessibility

**Keyboard and focus**
- All interactive elements are reachable and operable by keyboard in a logical order matching the visual order.
- Focus style: `outline: 2px solid #3F7D58; outline-offset: 2px;` on `:focus-visible`. On dark surfaces use `#FFFFFF` (or `#8CC5A2` in dark mode). Never remove outlines without a replacement of equal or greater visibility.
- Include a "Skip to main content" link as the first focusable element, visible on focus.

**Semantics and ARIA**
- Use landmarks: `header`, `nav` (with `aria-label`), `main`, `footer`, `aside`.
- Current page link: `aria-current="page"`. Menu toggles: `aria-expanded`, `aria-controls`.
- Form fields have visible `<label>` elements; errors use `aria-invalid` and `aria-describedby`; required fields use `required` plus a visible indicator.
- Dialogs: `role="dialog"`, `aria-modal`, labelled title, focus trap, Escape to close.
- Live regions: `role="status"` (polite) and `role="alert"` (assertive) for alerts and toasts.
- Tables use `<th scope>`; sortable columns use `aria-sort`.

**Perception**
- Minimum contrast per Section 2.5; do not convey information by color alone.
- Support 200 percent zoom and 400 percent reflow without horizontal scrolling (except data tables).
- Minimum body text 16px; touch targets 44 by 44px; link text is descriptive ("Read the forest report", not "Click here").

**Reduced motion and other preferences**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (forced-colors: active) {
  :focus-visible { outline: 2px solid Highlight; }
}
```

---

## 10. Responsive Behavior

| Element | Mobile (below 768) | Tablet (768 to 1023) | Desktop (1024 and above) |
|---|---|---|---|
| Grid | 4 columns, 16px gutter | 8 columns, 24px gutter | 12 columns, 24px gutter |
| Page margin | 20px | 32px | 48px |
| Navigation | Menu button and slide-down panel | Menu button or condensed links | Full inline links and CTA |
| Hero | Stacked, text then image (4:3) | Stacked or 6/6 split | 6/6 or 5/7 split, min height 640px |
| Cards | 1 column | 2 columns | 3 or 4 columns |
| Section padding | 64px | 96px | 128px |
| Type | Fluid scale, Display 44px | Fluid scale | Full scale, Display 72px |
| Tables | Stacked cards or scroll | Scroll if needed | Full table |
| Modals | Bottom sheet | Centered, 560px | Centered, 560px |
| Buttons | Full width in stacked groups | Auto width | Auto width |

Principles: design mobile first, preserve generous whitespace at every size (reduce, never eliminate), keep one column of reading text under 68ch, and test at 320px, 768px, 1024px, and 1440px.

---

## 11. Do and Don't

**Do**
- Do keep white and near-white as the dominant surface on every page.
- Do use Deep Forest for primary actions and links, and let it appear sparingly.
- Do use generous whitespace and align content to the spacing scale.
- Do use thin line icons with a single 1.5px stroke.
- Do keep shadows soft and borders thin and light.
- Do use slow, gentle fades and slides between 150ms and 300ms.
- Do check contrast for every text and background pairing.
- Do pair color with an icon or label for status.
- Do use photography with a soft, slightly desaturated green treatment.
- Do write plain, calm, sentence-case copy.

**Don't**
- Do not use emojis anywhere: not in the UI, copy, headings, buttons, alerts, alt text, or documentation.
- Do not use heavy gradients or saturated multi-color backgrounds.
- Do not use more than three brand colors on one screen.
- Do not clutter layouts; if a section has more than one focal point, split it.
- Do not use Sage Green for text or as the only boundary of a control.
- Do not use literal clip-art leaves, trees, or cartoon illustrations.
- Do not combine heavy borders with shadows, or use shadows above `shadow-lg`.
- Do not mix icon libraries or stroke weights.
- Do not animate with bounces, spins, parallax, or durations over 300ms.
- Do not use pure black (`#000000`) for text; use Warm Charcoal.
- Do not place text directly on busy photography without a verified overlay or panel.

---

## 12. Tokens: CSS Variables

```css
:root {
  /* Backgrounds */
  --color-white: #FFFFFF;
  --color-soft-white: #FAFBF9;
  --color-mist: #F3F6F2;
  --color-leaf-tint: #EAF1EA;

  /* Brand and accents */
  --color-forest: #1F4D3A;
  --color-forest-deep: #163A2B;
  --color-canopy: #3F7D58;
  --color-sage: #9DB8A0;
  --color-sage-light: #D3E0D5;

  /* Text and neutrals */
  --color-charcoal: #2B2A27;
  --color-bark: #5C4636;
  --color-stone: #6B6A64;
  --color-lichen: #86968A;
  --color-line: #E3E8E1;
  --color-line-strong: #CBD5C8;
  --color-disabled-bg: #EEF1EC;
  --color-disabled-text: #8E9489;

  /* Semantic */
  --color-success: #2E7D4A;
  --color-success-bg: #E6F3EA;
  --color-success-border: #BFDCC9;
  --color-warning: #8A5A00;
  --color-warning-accent: #C98A1B;
  --color-warning-bg: #FBF3E1;
  --color-warning-border: #EBD39B;
  --color-error: #B3402F;
  --color-error-bg: #FBEBE8;
  --color-error-border: #EDBFB7;
  --color-info: #2D6A8A;
  --color-info-bg: #E7F1F6;
  --color-info-border: #BCD8E5;

  /* Semantic aliases */
  --bg-page: var(--color-white);
  --bg-alt: var(--color-soft-white);
  --bg-band: var(--color-mist);
  --bg-hover: var(--color-leaf-tint);
  --text-primary: var(--color-charcoal);
  --text-muted: var(--color-stone);
  --text-brand: var(--color-forest);
  --border-default-color: var(--color-line);
  --focus-ring: var(--color-canopy);

  /* Typography */
  --font-body: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-heading: "Newsreader", Georgia, "Times New Roman", serif;

  --text-display: clamp(2.75rem, 1.5rem + 5vw, 4.5rem);
  --text-h1: clamp(2.25rem, 1.25rem + 3.5vw, 3.5rem);
  --text-h2: clamp(1.875rem, 1.25rem + 2.2vw, 2.5rem);
  --text-h3: clamp(1.5rem, 1.1rem + 1.4vw, 1.875rem);
  --text-h4: clamp(1.25rem, 1.1rem + 0.5vw, 1.375rem);
  --text-h5: 1.125rem;
  --text-h6: 0.8125rem;
  --text-body-lg: 1.125rem;
  --text-body: 1rem;
  --text-small: 0.875rem;
  --text-caption: 0.75rem;

  --leading-display: 1.05;
  --leading-h1: 1.1;
  --leading-h2: 1.15;
  --leading-h3: 1.25;
  --leading-h4: 1.35;
  --leading-body: 1.65;
  --leading-body-lg: 1.7;
  --leading-small: 1.55;

  --tracking-display: -0.03em;
  --tracking-h1: -0.02em;
  --tracking-h2: -0.015em;
  --tracking-h3: -0.01em;
  --tracking-overline: 0.08em;

  --measure: 68ch;

  /* Spacing (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;
  --space-32: 8rem;
  --space-40: 10rem;

  --section-padding: 4rem;      /* mobile */
  --page-margin: 1.25rem;
  --gutter: 1rem;

  /* Containers */
  --container-text: 680px;
  --container-md: 880px;
  --container-lg: 1120px;
  --container-xl: 1280px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Borders */
  --border-default: 1px solid var(--color-line);
  --border-strong: 1px solid var(--color-line-strong);
  --border-control: 1px solid var(--color-lichen);
  --border-brand: 1px solid var(--color-forest);

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(31, 77, 58, 0.05);
  --shadow-sm: 0 2px 8px rgba(31, 77, 58, 0.06);
  --shadow-md: 0 8px 24px rgba(31, 77, 58, 0.08);
  --shadow-lg: 0 16px 48px rgba(31, 77, 58, 0.12);
  --shadow-focus: 0 0 0 3px rgba(63, 125, 88, 0.25);

  /* Overlays */
  --overlay-modal: rgba(22, 58, 43, 0.40);
  --scrim-image: linear-gradient(to top, rgba(22, 58, 43, 0.45), rgba(22, 58, 43, 0));

  /* Motion */
  --duration-fast: 150ms;
  --duration-base: 200ms;
  --duration-slow: 300ms;
  --ease-natural: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-in-out: cubic-bezier(0.45, 0, 0.25, 1);

  /* Layers */
  --z-nav: 100;
  --z-dropdown: 200;
  --z-modal: 300;
  --z-toast: 400;
}

@media (min-width: 768px) {
  :root {
    --section-padding: 6rem;
    --page-margin: 2rem;
    --gutter: 1.5rem;
  }
}

@media (min-width: 1024px) {
  :root {
    --section-padding: 8rem;
    --page-margin: 3rem;
  }
}

/* Dark mode: deep forest surfaces, white text */
[data-theme="dark"] {
  --bg-page: #0F1F18;
  --bg-alt: #16291F;
  --bg-band: #1D3528;
  --bg-hover: #1D3528;
  --text-primary: #E8EFE9;
  --text-muted: #A9BCAF;
  --text-brand: #8CC5A2;
  --border-default-color: #2C4538;
  --focus-ring: #8CC5A2;
  --color-accent: #8CC5A2;
  --color-accent-contrast: #0F1F18;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.30);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.45);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-page: #0F1F18;
    --bg-alt: #16291F;
    --bg-band: #1D3528;
    --bg-hover: #1D3528;
    --text-primary: #E8EFE9;
    --text-muted: #A9BCAF;
    --text-brand: #8CC5A2;
    --border-default-color: #2C4538;
    --focus-ring: #8CC5A2;
    --color-accent: #8CC5A2;
    --color-accent-contrast: #0F1F18;
  }
}

/* Base */
html { font-family: var(--font-body); color: var(--text-primary); background: var(--bg-page); }
body { font-size: var(--text-body); line-height: var(--leading-body); -webkit-font-smoothing: antialiased; }
h1, h2, h3 { font-family: var(--font-heading); text-wrap: balance; }
p { max-width: var(--measure); }

:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* Primary button example */
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  height: 44px; padding: 0 var(--space-6);
  font: 500 0.9375rem/1 var(--font-body); letter-spacing: 0.005em;
  color: var(--color-white); background: var(--color-forest);
  border: 0; border-radius: var(--radius-md); cursor: pointer;
  transition: background-color var(--duration-base) var(--ease-natural),
              transform var(--duration-fast) var(--ease-natural);
}
.btn-primary:hover { background: var(--color-forest-deep); }
.btn-primary:active { transform: translateY(1px); }
.btn-primary:disabled { background: var(--color-disabled-bg); color: var(--color-disabled-text); cursor: not-allowed; }
```

---

## 13. Tokens: Tailwind Config

Compatible with Tailwind CSS v3. For v4, move the values into an `@theme` block using the same names.

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,jsx,ts,tsx,vue,svelte}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        white: "#FFFFFF",
        "soft-white": "#FAFBF9",
        mist: "#F3F6F2",
        "leaf-tint": "#EAF1EA",
        forest: {
          DEFAULT: "#1F4D3A",
          deep: "#163A2B",
        },
        canopy: "#3F7D58",
        sage: {
          DEFAULT: "#9DB8A0",
          light: "#D3E0D5",
        },
        charcoal: "#2B2A27",
        bark: "#5C4636",
        stone: "#6B6A64",
        lichen: "#86968A",
        line: {
          DEFAULT: "#E3E8E1",
          strong: "#CBD5C8",
        },
        disabled: {
          bg: "#EEF1EC",
          text: "#8E9489",
        },
        success: { DEFAULT: "#2E7D4A", bg: "#E6F3EA", border: "#BFDCC9" },
        warning: { DEFAULT: "#8A5A00", accent: "#C98A1B", bg: "#FBF3E1", border: "#EBD39B" },
        error: { DEFAULT: "#B3402F", bg: "#FBEBE8", border: "#EDBFB7" },
        info: { DEFAULT: "#2D6A8A", bg: "#E7F1F6", border: "#BCD8E5" },
        night: {
          bg: "#0F1F18",
          surface: "#16291F",
          raised: "#1D3528",
          border: "#2C4538",
          text: "#E8EFE9",
          muted: "#A9BCAF",
          accent: "#8CC5A2",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        serif: ['"Newsreader"', "Georgia", '"Times New Roman"', "serif"],
      },
      fontSize: {
        display: ["clamp(2.75rem, 1.5rem + 5vw, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "400" }],
        h1: ["clamp(2.25rem, 1.25rem + 3.5vw, 3.5rem)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "400" }],
        h2: ["clamp(1.875rem, 1.25rem + 2.2vw, 2.5rem)", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "500" }],
        h3: ["clamp(1.5rem, 1.1rem + 1.4vw, 1.875rem)", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "500" }],
        h4: ["clamp(1.25rem, 1.1rem + 0.5vw, 1.375rem)", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        h5: ["1.125rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        h6: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.7" }],
        body: ["1rem", { lineHeight: "1.65" }],
        small: ["0.875rem", { lineHeight: "1.55" }],
        caption: ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.01em" }],
        button: ["0.9375rem", { lineHeight: "1", letterSpacing: "0.005em", fontWeight: "500" }],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
        section: "var(--section-padding)",
        gutter: "var(--gutter)",
        margin: "var(--page-margin)",
      },
      maxWidth: {
        measure: "68ch",
        text: "680px",
        "container-md": "880px",
        "container-lg": "1120px",
        "container-xl": "1280px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
        full: "9999px",
      },
      borderColor: {
        DEFAULT: "#E3E8E1",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(31, 77, 58, 0.05)",
        sm: "0 2px 8px rgba(31, 77, 58, 0.06)",
        md: "0 8px 24px rgba(31, 77, 58, 0.08)",
        lg: "0 16px 48px rgba(31, 77, 58, 0.12)",
        focus: "0 0 0 3px rgba(63, 125, 88, 0.25)",
      },
      backgroundImage: {
        scrim: "linear-gradient(to top, rgba(22, 58, 43, 0.45), rgba(22, 58, 43, 0))",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        natural: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        "in-out-soft": "cubic-bezier(0.45, 0, 0.25, 1)",
      },
      zIndex: {
        nav: "100",
        dropdown: "200",
        modal: "300",
        toast: "400",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        "fade-in": "fade-in 200ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
```

**Usage examples (Tailwind)**

```html
<!-- Primary button -->
<button class="h-11 px-6 rounded-md bg-forest text-white text-button
               transition-colors duration-base ease-natural
               hover:bg-forest-deep active:translate-y-px
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canopy
               disabled:bg-disabled-bg disabled:text-disabled-text disabled:cursor-not-allowed">
  Get started
</button>

<!-- Card -->
<article class="rounded-lg border border-line bg-white p-8
                transition duration-base ease-natural
                hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm">
  <h3 class="font-sans text-h4 text-charcoal">Long-term stewardship</h3>
  <p class="mt-3 text-small text-stone">Plans built to mature slowly and stay resilient.</p>
</article>

<!-- Input -->
<input class="h-11 w-full rounded-md border border-lichen bg-white px-4 text-body text-charcoal
              placeholder:text-stone hover:border-forest
              focus:border-forest focus:outline-none focus:shadow-focus" />
```

---

*End of design system. Keep this file as the single source of truth; update tokens here first, then propagate to code.*
