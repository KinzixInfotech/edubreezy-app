# Home Screen Architecture

## Purpose
`/Users/manshajami/Documents/Edubreezy/app/(tabs)/home.js` is the route entry for the app home screen. It remains the single navigation entry point for `/(tabs)/home`, but the home-owned data contracts now live in dedicated modules so refresh, cache ownership, and unread badge behavior can be reasoned about in one place.

## Current Structure
- `app/(tabs)/home.js`
  Owns the route, session-backed user bootstrap, shared header animation state, permission banner state, and role dispatch.
- `app/(tabs)/home-modules/queryKeys.js`
  Canonical query key map for all home-owned data.
- `app/(tabs)/home-modules/cacheConfig.js`
  Shared cache policy used by home queries.
- `app/(tabs)/home-modules/refreshPolicy.js`
  Role-aware refresh policy. Pull-to-refresh now invalidates only home-owned keys.
- `app/(tabs)/home-modules/parentUtils.js`
  Parent child view-model mapping. This replaces the previous fake/random placeholder shaping.
- `app/(tabs)/home-modules/StatusModals.js`
  Global status modal owner extracted from `home.js`.
- `app/(tabs)/home-modules/HomeHeader.js`
  Animated home header shell with unread badge and refresh actions.
- `app/(tabs)/home-modules/HomeRoleRenderer.js`
  Role switch orchestration that decides which home view to mount.
- `app/(tabs)/home-modules/useHomeProfile.js`
  Stored-profile bootstrap and profile-sync hook for the home shell.
- `app/(tabs)/home-modules/useHomeRefresh.js`
  Role-aware pull-to-refresh hook for the home shell.

## Shell Responsibilities
The home shell should own only:
- Current profile bootstrap from secure storage.
- Header animation state and shared shell chrome.
- Shared permission banner state.
- Shared navigation guard via `navigateOnce`.
- Shared pull-to-refresh dispatch.
- Status modal refs and top-level modal mounting.
- Role selection and prop wiring.
- Shared animated header rendering.

The shell now delegates:
- profile bootstrap to `useHomeProfile`
- refresh orchestration to `useHomeRefresh`
- status modal ownership to `StatusModals`
- header rendering to `HomeHeader`
- role routing to `HomeRoleRenderer`

The shell should not own:
- Role-specific query shaping beyond passing resolved IDs into the role view.
- Placeholder/demo data for any role.
- Duplicate cache keys that drift from sibling screens.

## Query Ownership
The home route now uses canonical keys from `home-modules/queryKeys.js`.

### Shared keys
- `homeQueryKeys.notificationsSummary(userId, schoolId)`
  Home header unread badge source.
- `homeQueryKeys.upcomingEvents(schoolId)`
  Shared event summary source used by multiple role views.
- `homeQueryKeys.statusFeed()`
  Status viewer/upload refresh target.

### Role keys
- Student: `studentDashboard`
- Parent: `parentDashboard`, `parentBadgeTimestamps`
- Teacher: `teacherProfile`, `teacherDashboard`
- Director: `academicYears`, `dashboardOverview`, `feeDashboard`, `directorNotices`
- Principal: `academicYears`, `dashboardOverview`, `principalNotices`
- Accountant: `accountantDashboard`
- Driver / Conductor: `transportStaff`, `transportTrips`, role-specific notices

## Notification Coupling
The app now treats notification data as two explicit caches:
- Summary cache: home badge and header unread count.
- Feed cache: paginated notification screen data.

The notification screen updates the paged feed optimistically and also updates the home summary cache before background sync. Both caches are invalidated after the write settles. This prevents the old drift where home and the notification screen used unrelated key shapes.

## Refresh Behavior
Pull-to-refresh no longer invalidates the entire React Query cache.

Refresh flow:
1. `home.js` calls `getHomeRefreshKeys(...)`.
2. The refresh policy returns shared keys plus keys for the active role.
3. Only those home-owned queries are invalidated.
4. The stored user is reloaded to pick up profile changes safely.

This avoids unrelated screen refetches and reduces visible jank after refresh.

## Parent Flow
Parent home keeps one selected child in secure storage using:
- `selectedChild_${parentId}`

Behavior:
- We restore the cached child if it still exists in the latest dashboard payload.
- If not, we fall back to the first returned child.
- Child switching keeps previous dashboard data during refetch using TanStack Query v5-safe `placeholderData`.
- Child cards are now mapped from actual API fields only. Random attendance, fake fee state, and hardcoded demo parent data were removed.

## Transport Flow
Driver and conductor home rely on prefetched transport staff and trip data owned by the home shell. Those caches now use canonical keys so role refresh and cache invalidation are explicit.

## Session Assumptions
Home expects:
- a stored profile user
- a valid role name
- a resolvable `schoolId`

If those are missing, the shell now stops rendering the role content and shows the fallback state instead of trying to render partial home UI.

## How To Change Home Safely
- Add any new home-owned query key to `home-modules/queryKeys.js` first.
- If the data should refresh on pull-to-refresh, add it to `home-modules/refreshPolicy.js`.
- Keep role-specific shaping inside the role view or a role-local helper, not in the top-level shell.
- Do not reuse sibling-screen cache keys unless the data contract is intentionally shared.
- If a screen needs both a summary cache and a feed cache, give them separate explicit keys.
- Prefer API-backed nulls over invented fallback values in view models.

## Next Refactor Boundary
The next safe extraction is moving the role views themselves into `home-modules/roles/` with thin prop contracts from the shell:
- `user`
- `schoolId`
- `refreshing`
- `onRefresh`
- `navigateOnce`
- `banner`
- `upcomingEvents`
- any role-specific resolved data

That split can now happen on top of stable cache ownership instead of changing behavior and architecture at the same time.
