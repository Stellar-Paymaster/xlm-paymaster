# JWT Token Rotation

## Overview

Implements automatic sliding-window JWT rotation in the admin-dashboard to mitigate risks of stolen authentication tokens. Tokens are automatically refreshed periodically without requiring re-authentication.

## Implementation Details

### Configuration

- **Rotation Interval**: 1 hour
- **Session Max Age**: 8 hours
- **Strategy**: Sliding window with automatic refresh

### How It Works

1. **Initial Authentication**: User logs in, receives JWT token with issued-at (iat) and expiration (exp) timestamps
2. **Active Session Monitoring**: On each request, the JWT callback checks if the rotation interval (1 hour) has passed
3. **Automatic Refresh**: If rotation interval exceeded, the token is rotated with new iat/exp times
4. **Backend Integration**: If using backend-issued tokens, a refresh request is made to `/admin/auth/refresh` endpoint
5. **Session Validation**: Expired sessions are automatically terminated and user is redirected to `/login`

### Files Modified

- `admin-dashboard/auth.ts` - Updated NextAuth configuration with token rotation logic

### Features

- ✓ Automatic token rotation without user interaction
- ✓ Backend token refresh support via `/admin/auth/refresh` endpoint
- ✓ Expired session detection and automatic redirect to login
- ✓ TTL validation on each request
- ✓ No impact on active PWA session reliability

### Environment Requirements

- NextAuth.js 5.0.0-beta.20 or compatible
- Backend `/admin/auth/refresh` endpoint (optional, for backend-issued tokens)

### Testing

Token rotation can be verified in development by:
1. Setting `JWT_ROTATION_INTERVAL = 60000` (1 minute) for testing
2. Monitoring console logs for token refresh events
3. Checking JWT_EXPIRATION boundaries in session validation

### Security Considerations

- Rotation minimizes exposure window if a token is compromised
- Expired sessions are not extended automatically
- Token refresh requires valid session context
- Server-side token refresh is optional but recommended for enhanced security
