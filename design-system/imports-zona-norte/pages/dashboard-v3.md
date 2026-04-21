# Dashboard V3 Page Overrides

> **PROJECT:** Imports Zona Norte
> **Generated:** 2026-04-21 01:11:11
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero headline, 2. Short description, 3. Benefit bullets (3 max), 4. CTA, 5. Footer

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Minimalist: Brand + white #FFFFFF + accent. Buttons: High contrast 7:1+. Text: Black/Dark grey

### Component Overrides

- Avoid: Desktop-first causing mobile issues
- Avoid: Large blocking CSS files
- Avoid: Default keyboard for all inputs

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Improved shadows (softer than flat, clearer than neumorphism), modern (200-300ms), focus visible, WCAG AA/AAA
- Responsive: Start with mobile styles then add breakpoints
- Performance: Inline critical CSS defer non-critical
- Forms: Use inputmode attribute
- CTA Placement: Center, large CTA button
