# Security Specification for Fabula News

## 1. Data Invariants
- Only authenticated users whose Google email matches the allowed admin email can read or write app configuration and history.
- History items must include a valid userId matching the authenticated user.
- URLs and script openings cannot exceed their designated length limits.
- Default deny on any unknown collection or document.

## 2. The Dirty Dozen Attack Payloads
1. Unauthenticated read on `/config/general` -> Rejected (PERMISSION_DENIED).
2. Unauthenticated write to `/history/123` -> Rejected (PERMISSION_DENIED).
3. Spoofed user write to `/history/item1` with `userId != auth.uid` -> Rejected.
4. History item with excessively large script (> 100KB) -> Rejected.
5. Injected invalid characters in document ID -> Rejected.
6. Arbitrary collection write to `/__admin_backdoor__/1` -> Rejected by default deny.
7. Shadow field injection into config (e.g. `isSuperAdmin: true`) -> Rejected.
8. Unverified email write attempt -> Rejected.
9. Blank title or script in history -> Rejected.
10. Spoofed auth token without email verification -> Rejected.
11. Attempt to overwrite other user's history -> Rejected.
12. Attempt to list another user's private data -> Rejected.
