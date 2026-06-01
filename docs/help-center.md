# Help Center Integration

The Fluid Admin Dashboard includes a centralized Help Center accessible from the top navigation bar. This integration provides quick access to official documentation, support resources, and community channels.

## Features

- **Direct Documentation Access**: Quick links to the Fluid developer documentation.
- **Support Ticketing**: Link to the support portal for opening and tracking technical tickets.
- **Help Center**: Access to the searchable knowledge base for common questions.
- **Community Support**: Integrated links to the Fluid Discord community.

## Configuration

The Help Center links are configurable via environment variables in the `admin-dashboard` package:

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_DOCS_URL` | Fluid Documentation URL | `https://docs.fluid.dev` |
| `NEXT_PUBLIC_HELP_CENTER_URL` | Searchable Knowledge Base URL | `https://help.fluid.dev` |
| `NEXT_PUBLIC_SUPPORT_URL` | Support Ticket Portal URL | `https://support.fluid.dev/tickets` |
| `NEXT_PUBLIC_DISCORD_URL` | Community Discord Invite Link | `https://discord.gg/fluid` |

## Implementation Details

The implementation consists of:
1. **Utility**: `admin-dashboard/lib/portal-links.ts` - Centralizes link management.
2. **UI Component**: `admin-dashboard/components/HelpCenter.tsx` - A premium Popover-based menu.
3. **Integration**: `admin-dashboard/components/Navbar.tsx` - Global availability across the dashboard.

## Security Standards

All external links use `target="_blank"` and `rel="noopener noreferrer"` (handled by Next.js `Link` component where applicable or standard HTML best practices) to prevent tab-nabbing and ensure security when navigating away from the dashboard.
