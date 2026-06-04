# Meander — Brand & Design Brief

Hand this to any design tool (or designer) to keep new branding consistent with
the live app. Values are the source of truth from `client/src/styles/global.css`.

**Personality:** outdoorsy, premium, calm, editorial. Nature-forward (deep
forest green) with warm energy (amber). "Slow scenic ride," not "sporty GPS" —
confident but unhurried. The name is a winding river bend; the product plans
winding scenic loops.

---

## Color

### Dark / forest — the default app surface
| Role | HSL (source of truth) | ~Hex |
|---|---|---|
| Canvas (deepest) | `hsl(150 28% 9%)` | `#111D17` |
| Panel / sheet | `hsl(150 24% 13%)` | `#192921` |
| Elevated / hover | `hsl(150 20% 18%)` | `#25372E` |
| Border (hairline) | `hsl(148 18% 24%)` | `#324A3E` |
| Sage (gradient mid) | `hsl(96 22% 38%)` | `#5D764C` |
| Text (warm cream) | `hsl(60 30% 96%)` | `#F8F8F2` |
| Muted text | `hsl(120 8% 68%)` | `#A6B0A6` |

### Light / cream — map + light-mode surface
| Role | HSL | ~Hex |
|---|---|---|
| Paper canvas | `hsl(45 40% 96%)` | `#F9F7F1` |
| Card (white) | `hsl(0 0% 100%)` | `#FFFFFF` |
| Ink text | `hsl(150 18% 12%)` | `#19241E` |

### Accents
| Role | HSL | ~Hex |
|---|---|---|
| **Amber** — primary energy (route line, CTAs, badges) | `hsl(36 92% 56%)` | `#F6A328` |
| Ink on amber | `hsl(30 40% 10%)` | `#231A0F` |
| **Lime** — secondary (progress, "good to go") | `hsl(78 70% 58%)` | `#B2DE49` |
| Warning | `hsl(8 78% 62%)` | `#E8654B` |

**Usage ratio:** forest green dominates (~70%); cream for content surfaces;
**amber is the single hero accent — use sparingly**; lime is a supporting /
positive accent.

---

## Typography

- **Display / headlines:** **Bricolage Grotesque** — weights 700–800, tight
  tracking (~ -0.025em), line-height ~0.98. Bold, slightly condensed, full of
  personality.
- **Body / UI:** **Familjen Grotesk** — 400–700.
- **Data / mono:** **Space Mono** — stats, coordinates, micro-labels.
- **Eyebrows (micro-labels):** uppercase, letter-spacing 0.14em, ~0.7rem, muted.

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Familjen+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap
```

---

## Shape, depth & motion

- **Radii:** small 10px · default 14px · large (cards/sheets) 22px ·
  **pills 999px** (buttons, inputs, chips). Lean rounded.
- **Surfaces:** translucent **glass** panels over the map —
  `backdrop-filter: blur(16px)`, hairline borders, soft shadow
  `0 8px 30px hsl(150 40% 4% / .45)`.
- **Gradients:** subtle sage→forest radial for hero backgrounds; sage→forest
  vertical for top bars.
- **Motion:** smooth, eased (`cubic-bezier(.22, 1, .36, 1)`), ~0.3s — drawer
  slides, gentle reveals. Nothing snappy or aggressive. Honors reduced-motion.
- **Iconography:** Material Design Icons (MDI), line style, inherit
  `currentColor`.
- **Imagery:** photography-forward — motion-blurred riders, lakes, tree-lined
  roads, golden hour.

---

## Logo / wordmark direction

- Wordmark in **Bricolage Grotesque** (700–800), tight tracking; cream on forest.
- Mark idea: a **meandering line / route ribbon** (an amber winding path) that
  can double as an "M," a stylized river bend, or a contour line — ties directly
  to the product (scenic loops) and the name (a river meander). End it with a
  single **amber** dot/pin.
- Keep it monochrome-friendly: must read as cream-on-forest and forest-on-cream.

---

## Quick reference (CSS custom properties in the app)

```css
--forest-900: hsl(150 28% 9%);   /* canvas */
--forest-800: hsl(150 24% 13%);  /* panel/sheet */
--forest-700: hsl(150 20% 18%);  /* elevated */
--olive-500:  hsl(96 22% 38%);   /* sage gradient */
--cream-100:  hsl(45 40% 96%);   /* paper */
--amber-500:  hsl(36 92% 56%);   /* primary accent */
--lime-400:   hsl(78 70% 58%);   /* secondary accent */
--radius-lg: 22px; --radius-pill: 999px;
--font-display: "Bricolage Grotesque";
--font-sans: "Familjen Grotesk";
--font-mono: "Space Mono";
```
