# Customizable Dashboard Layouts

## Overview

The Customizable Dashboard Layouts feature allows platform operators to personalize their administrative interface. By providing a drag-and-drop mechanism, users can reorder dashboard widgets (such as Audit Logs, System Overviews, and Quick Actions) to suit their workflow priorities.

## Features

1. **Drag-and-Drop Reordering**: Users can easily click, hold, and drag widgets to new positions within a responsive grid layout.
2. **Persistent Preferences**: Layout changes are automatically saved to `localStorage` under the `fluid-dashboard-layout` key, ensuring a consistent experience across sessions.
3. **Graceful Fallbacks**: If the stored layout data becomes corrupted or is missing, the system gracefully falls back to a sensible default arrangement.
4. **Layout Reset**: A one-click "Reset to Default" button enables operators to revert to the standard layout at any time.

## Implementation Details

- **Path**: `admin-dashboard/src/components/dashboard/CustomizableDashboardLayouts.tsx`
- **Drag API**: Utilizes native HTML5 drag-and-drop events (`onDragStart`, `onDragOver`, `onDrop`) for a lightweight, dependency-free implementation without adding bulky UI libraries.
- **State Management**: Uses React `useState` to manage the in-memory layout array, synchronized with browser `localStorage` via a `useEffect` hook.
- **Accessibility**: 
  - Draggable areas and action buttons include `aria-label` attributes for screen reader support.
  - Interactive elements feature high-visibility focus rings (`focus:ring-blue-500`).
  - Color palettes adhere to the established dark mode and high-contrast dashboard tokens.

## Security & Resilience

- Stored configuration is fully sanitized and validated at load time; malformed JSON directly triggers a fallback without crashing the UI.
- No sensitive or cross-tenant data is exposed within the customizable layout configuration.
- Relies strictly on DOM/state manipulation ensuring no XSS pathways through layout preferences.