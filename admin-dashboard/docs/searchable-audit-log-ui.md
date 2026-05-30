# Searchable Audit Log UI

## Overview

The Searchable Audit Log UI provides platform operators and administrators with a high-performance interface to inspect system and user activity on the Fluid platform. It supports granular filtering by actor, action type, and time range, facilitating rapid incident response and compliance reporting.

## Features

1. **Text Search**: Real-time filtering by actor identifier (e.g., email or system name) or specific log details.
2. **Action Filtering**: Dropdown selection to narrow logs down to specific event types (`LOGIN`, `ADD_ASSET`, `SYNC`, etc.).
3. **Time Range Filtering**: Pre-defined intervals (`24H`, `7D`, `30D`) to slice data temporally.
4. **Accessible Design**: Form controls and tables utilize appropriate ARIA attributes. Color contrast ratios meet dark mode and high-contrast dashboard standards.

## Implementation Details

- **Path**: `admin-dashboard/src/components/dashboard/AuditLogUI.tsx`
- **State Management**: Uses React `useState` for filter controls and `useMemo` to ensure high-performance client-side filtering without redundant re-renders.
- **Resilience**: Handles edge cases such as empty search results gracefully by presenting a clear empty-state message.

## Security & Compliance

- The component safely renders text without executing HTML, preventing XSS vulnerabilities from potentially malicious log entries.
- Filtering happens purely via state derivation, ensuring no unintended DOM mutations.
- Focus states explicitly utilize visual outline rings (`focus:ring-blue-500`) to comply with accessibility workflows.