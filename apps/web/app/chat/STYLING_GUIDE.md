# `/chat` Styling Guide

This guide captures the current visual system used by the `/chat` workspace so it can be reproduced inside an extension without depending on the route's React implementation.

It is based on the live styling patterns in:

- `apps/web/app/chat/page.tsx`
- `apps/web/app/chat/_features/**/*`
- `apps/web/app/globals.css`
- `apps/web/lib/ui/markdown.ts`

## Design Intent

`/chat` is a dark, restrained workspace with a "black glass" feel:

- Matte black canvas
- Thin translucent white borders
- Mostly monochrome surfaces and typography
- Soft blur and deep shadows on interactive shells
- Accent colors reserved for status, links, and validation states

The UI should feel focused, premium, and quiet rather than colorful or playful.

## Foundation

### Typography

- Primary font stack:
  `Avenir, "Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`
- Mono stack:
  `"JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- Default body treatment:
  white text on a near-black background
- Typical sizing:
  `text-sm` for body copy, `text-xs` for metadata, `text-[10px]` to `text-[11px]` for pill labels and utility labels
- Typical uppercase tracking:
  `0.12em` to `0.20em`

### Color System

Use these as the extension's base tokens:

```css
:root {
  --chat-bg: #050505;
  --chat-surface: #0f0f0f;
  --chat-surface-raised: #101010;
  --chat-card: #000000;
  --chat-user-bubble: #202327;

  --chat-text-primary: #ffffff;
  --chat-text-secondary: #d4d4d8;
  --chat-text-muted: #a1a1aa;
  --chat-text-faint: #71717a;

  --chat-border: rgba(255, 255, 255, 0.1);
  --chat-border-strong: rgba(255, 255, 255, 0.18);
  --chat-border-soft: rgba(255, 255, 255, 0.06);

  --chat-hover: rgba(255, 255, 255, 0.04);
  --chat-hover-strong: rgba(255, 255, 255, 0.08);

  --chat-link: #7dd3fc;
  --chat-warning: #fde68a;
  --chat-warning-bg: rgba(253, 230, 138, 0.06);
  --chat-danger: #fda4af;
  --chat-danger-bg: rgba(244, 63, 94, 0.1);
  --chat-success: #86efac;
}
```

### Radii

- `rounded-full` for avatars, icon buttons, chips, and primary action buttons
- `rounded-2xl` for most controls, menus, search fields, media shells, and cards
- `rounded-3xl` for banners and large inline notices
- Custom radii for hero/composer shells:
  `1.12rem` to `1.4rem`
- Large modal/dialog radius:
  `1.75rem`

### Shadows and Blur

- Primary glass shell:
  `0 16px 48px rgba(0,0,0,0.28)` plus a subtle inset white highlight
- Menus and floating panels:
  `0 24px 70px` to `0 24px 80px rgba(0,0,0,0.42-0.45)`
- Focused draft card glow:
  white outline plus soft white bloom
- Backdrop blur:
  `24px` on high-value floating surfaces

## Layout Rules

### App Shell

- Root canvas fills viewport height
- Background is always `#050505`
- Text defaults to white
- Scrolling happens inside the thread area, not the whole page

Reference shape:

```css
.chat-root {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background: var(--chat-bg);
  color: var(--chat-text-primary);
}
```

### Sidebar

- Fixed/sticky left rail
- Open width is `18.5rem`
- Background matches app canvas
- Right divider uses `1px` translucent white border
- Search field and actions sit on the same monochrome system
- On mobile, sidebar uses a black overlay scrim

Sidebar styling cues:

- Search field: soft filled surface, `rounded-2xl`, no hard border
- Active thread row: faint white fill
- Hover state: slightly lighter white wash
- Context menus: dark popover, white border, blur, heavy shadow

### Header

- Thin bottom border
- Centered logo
- Utility actions styled as compact uppercase pills
- Minimal chrome; no large title bar

### Thread Canvas

- Standard reading width: `max-w-4xl`
- Horizontal padding: `px-4` on mobile, `px-6` on larger screens
- Top padding: `pt-8`
- Bottom padding leaves room for docked composer:
  `pb-44` mobile, `pb-32` larger screens
- Optional inline draft editor expands canvas to `max-w-[86rem]` and reserves right-side space

### Hero State

- New chat starts centered vertically
- Hero content is constrained to `max-w-xl`
- Large avatar + greeting + glass composer + quick action chips
- Transition out of hero is animated instead of instantly removed

### Docked Composer

- Anchored at the bottom of the thread canvas
- Width matches thread column: `max-w-4xl`
- Floats above content rather than occupying a permanent hard footer bar

## Component Recipes

### Glass Composer

The composer is the main stylistic anchor of `/chat`.

Use this exact visual recipe:

```css
.chat-composer {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition:
    border-color 500ms ease,
    box-shadow 500ms ease,
    transform 500ms ease,
    opacity 500ms ease;
}

.chat-composer:focus-within {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.15);
}
```

Composer behavior notes:

- Textarea is visually transparent
- Input text is `14px` with tight `leading-5`
- Placeholder text uses muted zinc tone
- Right side reserves room for icon actions and send button
- Primary send button is white with black iconography
- Secondary icon button uses translucent black fill with a white border

### Hero Quick Action Chips

- `rounded-full`
- Thin white border
- Faint white background fill
- `12px` to `13px` text
- Medium weight
- Hover increases fill and text contrast

### Header / Toolbar Pills

Use for "Tools", "Companion App", and similar actions:

```css
.chat-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 0.375rem 0.75rem;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--chat-text-secondary);
}
```

### User Messages

- Right aligned
- Contained bubble
- Bubble color: `#202327`
- Radius: about `1.15rem`
- Padding: `px-4 py-2`
- White text
- Action icons only appear on hover/focus

Do not style user messages like the assistant. They are intentionally denser and more contained.

### Assistant Messages

- Left aligned
- No hard bubble by default
- Content sits directly on the canvas
- Max row width is `88%`
- Text uses `text-zinc-100`
- Markdown is rendered with comfortable line height

This difference is important: assistant output feels editorial; user input feels compact and chat-like.

### Assistant Markdown

Assistant responses use a restrained prose treatment:

- Base text: `text-sm`
- Line height: `leading-7`
- Vertical rhythm: `space-y-2`
- Links: sky blue and underlined
- Inline code: subtle pill with translucent white background
- Blockquotes: left border in translucent white with left padding
- Lists: standard disc/decimal treatment with modest indent
- Headings: semibold, stepped from base to `xl`

Extension-safe approximation:

```css
.chat-markdown {
  font-size: 14px;
  line-height: 1.75;
  color: var(--chat-text-primary);
}

.chat-markdown a {
  color: var(--chat-link);
  text-decoration: underline;
}

.chat-markdown code {
  border-radius: 0.375rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.125rem 0.375rem;
}

.chat-markdown blockquote {
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 0.75rem;
}
```

### Typing / Progress States

- Use muted gray dots or a tiny ticker instead of bright spinners
- Keep progress low-contrast and inline with the message flow
- Draft-generation placeholders use black cards with shimmer rather than skeleton gray blocks

### Alerts and Notices

- Error banner:
  rounded, translucent rose background, soft rose border, light rose text
- Neutral status banner:
  rounded, faint white fill, white border, zinc text
- Warning notice:
  amber-tinted background, amber text, subtle border

The system avoids strong saturated backgrounds unless a state is truly important.

### Menus and Popovers

- Background: `#101010` or `zinc-950/95`
- Radius: `rounded-2xl` or `rounded-3xl`
- Border: `1px solid rgba(255,255,255,0.1)`
- Shadow: deep black drop shadow
- Optional blur for floating menus

### Media Attachments

- Image blocks live inside `rounded-2xl` containers
- Use a thin translucent border
- Bubble context uses `bg-black/20`
- Draft preview context uses `bg-[#050505]`
- Images should be full width with `object-cover`

### Draft Preview Cards

Draft previews are styled closer to X/Twitter cards than normal chat bubbles:

- Background: `#000000`
- Border: translucent white
- Radius: `rounded-2xl`
- Hover state slightly lifts contrast
- Focused state gets brighter border and glow
- Avatars are circular with dark zinc gradient fallback
- Metadata uses muted gray
- Main draft text uses `15px` with generous line-height

### Modals and Large Panels

For dialogs like pricing, feedback, extension, and analysis:

- Full-screen black overlay at `60-85%` opacity
- Panel background: `#0F0F0F`
- Border: white `10%`
- Radius: `1.75rem`
- Strong shadow
- Internal cards usually fall back to `bg-black/20` or `bg-black/30`

## Motion

Motion is present, but it is soft and premium rather than flashy.

- Standard reveal:
  fade in + slight upward slide
- Hero transitions:
  `500ms` to `720ms`
- Easing:
  `cubic-bezier(0.16, 1, 0.3, 1)` for major state shifts
- Hover motion:
  tiny lift or icon nudge only
- Reduced motion:
  disable shimmer, reveal, and float animations

Recommended motion rules:

- Keep transforms under `10px`
- Favor opacity, blur, and small translate shifts
- Avoid bouncy spring motion

## Extension Implementation Notes

If the extension needs a minimal version of `/chat`, preserve these rules first:

1. Keep the canvas matte black, not charcoal gray.
2. Use translucent white borders instead of solid gray outlines.
3. Treat the composer as a frosted glass surface.
4. Keep assistant messages mostly unboxed.
5. Keep user messages boxed and right-aligned.
6. Use accent colors only for links and status states.
7. Favor `rounded-2xl` and `rounded-full`; avoid sharp corners.
8. Use uppercase micro-labels with generous tracking for controls and metadata.

## Quick Copy-Paste Token Set

```json
{
  "fontSans": "Avenir, Avenir Next, Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif",
  "fontMono": "JetBrains Mono, IBM Plex Mono, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
  "colors": {
    "bg": "#050505",
    "surface": "#0F0F0F",
    "surfaceRaised": "#101010",
    "card": "#000000",
    "userBubble": "#202327",
    "textPrimary": "#FFFFFF",
    "textSecondary": "#D4D4D8",
    "textMuted": "#A1A1AA",
    "textFaint": "#71717A",
    "border": "rgba(255,255,255,0.10)",
    "borderStrong": "rgba(255,255,255,0.18)",
    "hover": "rgba(255,255,255,0.04)",
    "hoverStrong": "rgba(255,255,255,0.08)",
    "link": "#7DD3FC"
  },
  "radius": {
    "pill": "999px",
    "control": "1rem",
    "card": "1rem",
    "banner": "1.5rem",
    "dialog": "1.75rem"
  },
  "shadow": {
    "glass": "0 16px 48px rgba(0,0,0,0.28)",
    "menu": "0 24px 80px rgba(0,0,0,0.45)",
    "floating": "0 10px 30px rgba(0,0,0,0.35)"
  }
}
```

## Source of Truth

If the extension needs to stay aligned with the route over time, the most important source files are:

- `apps/web/app/chat/page.tsx`
- `apps/web/app/chat/_features/thread-history/threadViewState.ts`
- `apps/web/app/chat/_features/composer/ChatHero.tsx`
- `apps/web/app/chat/_features/composer/ChatComposerDock.tsx`
- `apps/web/app/chat/_features/composer/ChatComposerSurface.tsx`
- `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
- `apps/web/app/chat/_features/thread-history/MessageContent.tsx`
- `apps/web/app/chat/_features/workspace-chrome/ChatSidebar.tsx`
- `apps/web/app/chat/_features/workspace-chrome/ChatHeader.tsx`
- `apps/web/lib/ui/markdown.ts`
