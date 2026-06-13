---
name: JWT payload shape
description: The requireAuth() return type uses `id` (not `studioId`) for the studio's own ID.
---

`requireAuth(req, "STUDIO")` returns a `JWTPayload` with:
- `id` — the studio's UUID (matches `studiosTable.id`)
- `email`, `role`, `status?`

**Why:** There is no `studioId` field. Album ownership checks must compare `album.studioId !== payload.id`.

**How to apply:** Any new studio route that checks album/resource ownership should use `payload.id`, not `payload.studioId`.
