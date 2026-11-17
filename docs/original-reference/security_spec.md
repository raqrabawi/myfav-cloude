# Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Identity Ownership Invariant**: Every document in `/categories/{categoryId}`, `/bookmarks/{bookmarkId}`, and `/userSettings/{userId}` belongs exclusively to a single authenticated and email-verified user (`request.auth.uid == ownerId && request.auth.token.email_verified == true`). For `/userSettings/{userId}`, the document ID `{userId}` must also strictly equal `request.auth.uid`.
2. **Relational Consistency Invariant (Master Gate)**:
   - A `Bookmark` document cannot be created or moved unless its `categoryId` references an existing `/categories/{categoryId}` document whose `ownerId == request.auth.uid`.
   - If a `Bookmark` specifies a non-empty `subcategoryId`, that `/categories/{subcategoryId}` document must also exist, belong to `request.auth.uid`, and have `parentId == incoming().categoryId`.
   - A `Category` document with a non-empty `parentId` (subcategory) cannot be created unless `/categories/{parentId}` exists and belongs to `request.auth.uid`.
3. **Immutable & Temporal Fields Invariant**:
   - `ownerId` and `createdAt` are strictly immutable across all update actions (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
   - All creation timestamps (`createdAt`) and modification timestamps (`updatedAt`) must equal `request.time`.
4. **Strict Volumetric & Key Boundaries**:
   - Every string field enforces strict `.size()` bounds and regex pattern checks matching `firebase-blueprint.json`.
   - Every `create` checks `hasAll` and `hasOnly` on keys; every `update` action branch enforces `incoming().diff(existing()).affectedKeys().hasOnly(...)` wrapped inside `isValid[Entity](incoming())`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on Category Create)**: Authenticated user `user_A` attempts to create `/categories/cat_1` with `ownerId: "user_B"`.
   ```json
   { "ownerId": "user_B", "name": "Design", "icon": "palette", "parentId": "", "order": 1, "createdAt": "REQUEST_TIME", "updatedAt": "REQUEST_TIME" }
   ```
2. **Payload 2 (Unverified Email Write)**: Authenticated user `user_A` with `email_verified: false` attempts to create `/categories/cat_1`.
   ```json
   { "ownerId": "user_A", "name": "Design", "icon": "palette", "parentId": "", "order": 1, "createdAt": "REQUEST_TIME", "updatedAt": "REQUEST_TIME" }
   ```
3. **Payload 3 (Shadow Field Injection on Bookmark Create)**: Authenticated user injects an undeclared field `isAdmin: true` into `/bookmarks/bm_1`.
   ```json
   { "ownerId": "user_A", "title": "Figma", "url": "https://figma.com", "description": "UI tool", "categoryId": "cat_1", "subcategoryId": "", "isFavorite": true, "isAdmin": true, "createdAt": "REQUEST_TIME", "updatedAt": "REQUEST_TIME" }
   ```
4. **Payload 4 (Orphaned Bookmark Creation)**: User attempts to create `/bookmarks/bm_1` referencing a non-existent `categoryId: "non_existent_cat"`.
   ```json
   { "ownerId": "user_A", "title": "Figma", "url": "https://figma.com", "description": "UI tool", "categoryId": "non_existent_cat", "subcategoryId": "", "isFavorite": false, "createdAt": "REQUEST_TIME", "updatedAt": "REQUEST_TIME" }
   ```
5. **Payload 5 (Cross-Tenant Category Hijack on Bookmark Move)**: User `user_A` attempts to update `/bookmarks/bm_1` to point to `categoryId: "cat_owned_by_user_B"`.
   ```json
   { "categoryId": "cat_owned_by_user_B", "subcategoryId": "", "updatedAt": "REQUEST_TIME" }
   ```
6. **Payload 6 (Immutable `ownerId` Tampering on Update)**: User `user_A` attempts to transfer ownership of `/bookmarks/bm_1` to `user_B` during an update.
   ```json
   { "ownerId": "user_B", "title": "Updated", "updatedAt": "REQUEST_TIME" }
   ```
7. **Payload 7 (Immutable `createdAt` Backdating on Update)**: User `user_A` attempts to mutate `createdAt` on `/categories/cat_1`.
   ```json
   { "name": "Renamed", "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "REQUEST_TIME" }
   ```
8. **Payload 8 (Forged Client Timestamp on Create)**: User `user_A` sends a future or past `createdAt` timestamp instead of `request.time`.
   ```json
   { "ownerId": "user_A", "name": "Icons", "icon": "sparkles", "parentId": "", "order": 0, "createdAt": "2099-01-01T00:00:00Z", "updatedAt": "2099-01-01T00:00:00Z" }
   ```
9. **Payload 9 (Denial-of-Wallet String Overflow)**: User `user_A` attempts to inject a 10,000-character string into `Bookmark.description` (max 400 chars).
   ```json
   { "description": "A... (10,000 chars)", "updatedAt": "REQUEST_TIME" }
   ```
10. **Payload 10 (JavaScript URI Injection in Bookmark URL)**: User `user_A` attempts to save `url: "javascript:alert(1)"` violating `^https?://.+$`.
    ```json
    { "ownerId": "user_A", "title": "XSS", "url": "javascript:alert(1)", "description": "", "categoryId": "cat_1", "subcategoryId": "", "isFavorite": false, "createdAt": "REQUEST_TIME", "updatedAt": "REQUEST_TIME" }
    ```
11. **Payload 11 (Path ID Poisoning)**: User `user_A` attempts to create a document with special characters or >128 chars in `{categoryId}`.
    ```json
    { "path": "/categories/invalid$id!@#", "ownerId": "user_A" }
    ```
12. **Payload 12 (Unauthorized Cross-User List Query)**: User `user_A` attempts an unfiltered `list` query across `/bookmarks` without constraining `ownerId == request.auth.uid`.
    ```json
    { "operation": "list", "path": "/bookmarks", "where": "none" }
    ```

---

## 3. Hardened Red Team Conflict Report

| Collection | Identity Spoofing | State / Key Shortcutting | Resource / Value Poisoning | Query Trust & PII Guard | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/categories/{categoryId}` | Blocked: `ownerId == request.auth.uid` + `email_verified` | Blocked: `isValidCategory(incoming())` wraps `update` + `affectedKeys().hasOnly(...)` | Blocked: `isValidId(categoryId)` + string `.size()` & regex limits | Blocked: `allow list` enforces `resource.data.ownerId == request.auth.uid` | PASS |
| `/bookmarks/{bookmarkId}` | Blocked: `ownerId == request.auth.uid` + parent category ownership verified via `get()` | Blocked: `isValidBookmark(incoming())` wraps `update` + action branches | Blocked: URL regex `^https?://.+$`, title <= 120, desc <= 400 | Blocked: `allow list` enforces `resource.data.ownerId == request.auth.uid` | PASS |
| `/userSettings/{userId}` | Blocked: `userId == request.auth.uid && ownerId == request.auth.uid` | Blocked: `isValidUserSettings(incoming())` + enum allowlists | Blocked: `primaryColor` <= 32 chars, strict enum checks | Blocked: Only document owner can `get` | PASS |
| `/quickShortcuts/{shortcutId}` | Blocked: `ownerId == request.auth.uid` + `email_verified` | Blocked: `isValidQuickShortcut(incoming())` wraps `update` + `affectedKeys().hasOnly(...)` | Blocked: URL regex `^https?://.+$`, title <= 80, iconType enum, customIcon <= 500 | Blocked: `allow list` enforces `resource.data.ownerId == request.auth.uid` | PASS |
| `/sharedCategories/{shareId}` | Blocked: `ownerId == request.auth.uid` + `email_verified` + `get()` verifies root category ownership | Blocked: `isValidSharedCategory(incoming())` wraps `update` + `affectedKeys().hasOnly(...)`; `categoryId` immutable | Blocked: `isValidId(shareId)`, `subcategories.size() <= 100`, `bookmarks.size() <= 500`, first-element map key/type checks, zero PII fields | Blocked: `allow get` only when `isPublic == true` (or owner); `allow list` enforces `resource.data.ownerId == request.auth.uid` | PASS |

