# Design Refactor Guide

## Goal

Unify the MVP UI into a minimal, modern visual system.

Do not change feature logic, state management, API behavior, or data flow while applying this guide. Limit changes to style, markup structure, and design tokens.

Use only open-license materials. Do not use external brand assets, logos, proprietary icon sets, or copied design-system components.

## Stack

- Vue 3
- Tailwind CSS
- Components: shadcn-vue/Reka UI only when a component is actually needed
- Icons: one lucide Vue icon package only; do not mix icon libraries
- Font: Pretendard globally

## Design Tokens

- Background: `#FFFFFF`
- Sub background: `#F9FAFB`
- Body text: `#191F28`
- Secondary text: `#8B95A1`
- Border/divider: `#E5E8EB`
- Accent: `#16A34A`
- Danger: `#F04452`
- Safe: `#1B64DA`

Avoid pure black `#000`.

## Typography

- Global font: `Pretendard, sans-serif`
- Page title: 24-28px, weight 700
- Section title: weight 600
- Body: 15-16px, weight 400-500, line-height at least 1.5
- Keep default letter spacing. Avoid heavy tracking.

## Layout

- Use generous spacing between sections and controls.
- Use 12px border radius for buttons, cards, and inputs. Stay within 8-16px.
- Use only subtle shadows, close to `shadow-sm`.
- Keep the visual hierarchy clear. One primary action per view.
- Limit content width and center core content where appropriate.

## Components

- Primary button: filled accent color, about 48px high, 12px radius.
- Secondary button: gray or outline.
- Card: white background with light border or subtle shadow.
- Input: light border, accent focus ring, consistent radius.
- List: light dividers, comfortable row height.

## Banned

- External brand logos, brand design-system components, or copied icon systems
- Flashy gradients
- Heavy shadows
- Multiple competing accent colors
- Feature logic changes during design-only work

## Work Order

1. Apply Tailwind, Pretendard, and design tokens globally.
2. Normalize common Button/Card/Input styles first.
3. Apply page-level styling after common primitives are stable.
4. Verify each step does not change behavior.
