# BreatheWise Firestore Security Specification

## 1. Data Invariants

1. **PII Isolation**: `users/{userId}` holds email and personal preferences and is readable/writable ONLY by `request.auth.uid == userId` with verified email.
2. **Citizen Anonymity on Public Smog Reports**: Public `smogReports/{reportId}` documents NEVER store `authorUid`, `uid`, `email`, `phone`, or display names. Ownership (`authorUid`) is strictly isolated into `smogReports/{reportId}/private/owner`, readable only by the creator or admin (`allow list: if false;`).
3. **Unverified Default Moderation**: Every newly created `smogReports/{reportId}` MUST have `moderationStatus == 'UNVERIFIED'`, `confirmationsCount == 1`, an atomic `private/owner` record, and an atomic `confirmations/{authorUid}` record. Only admins (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))`) may set `moderationStatus` to `REVIEWED` or `FLAGGED`.
4. **No Duplicate Confirmations & Concurrency Safety**: Confirming a report requires creating `smogReports/{reportId}/confirmations/{request.auth.uid}` inside a Firestore transaction atomically with incrementing `smogReports/{reportId}.confirmationsCount` by `+1`. Initial report creation also records `confirmations/{authorUid}` so creators cannot confirm their own sighting twice.
5. **Temporal Integrity**: `createdAt` and `updatedAt` MUST equal `request.time`. `createdAt` and owner `uid`/`authorUid` are immutable after creation.
6. **Strict Schema & Bounds**: Every write validates required/allowed keys via `hasAll` + `hasOnly` (on create) and `affectedKeys().hasOnly(...)` (on update), plus string `.size()` bounds and ID regex `^[a-zA-Z0-9_\-]+$`.

## 2. Adversarial Payloads (Must All Return PERMISSION_DENIED)

1. **Unauthenticated Smog Report Create**: `request.auth == null` -> `create /smogReports/rep1`.
2. **Unverified Email Create**: `request.auth.token.email_verified == false` -> `create /smogReports/rep1`.
3. **Public Author UID Leak Injection**: Signed in as `userA`, payload includes `authorUid: "userA"` on public `/smogReports/rep1` -> `create /smogReports/rep1` rejected by `hasOnly`.
4. **Spoofed Private Owner UID**: Signed in as `userA`, `/smogReports/rep1/private/owner` has `authorUid: "userB"` -> `create` rejected.
5. **Pre-Verified Moderation Bypass**: Signed in as `userA`, payload sets `moderationStatus: "REVIEWED"` on create -> `create /smogReports/rep1`.
6. **Shadow Ghost Field Injection**: Signed in as `userA`, payload includes extra field `isOfficial: true` -> `create /smogReports/rep1`.
7. **Oversized Photo / Resource Poisoning**: Signed in as `userA`, `photoDataUrl` length > 80,000 or `description` > 400 -> `create /smogReports/rep1`.
8. **Invalid Document ID Poisoning**: Document ID contains `/`, spaces, or > 128 chars -> `create /smogReports/bad..id`.
9. **Duplicate / Non-Atomic Confirmation Inflation**: Updating `smogReports/rep1.confirmationsCount` by `+10` or without creating `/confirmations/{uid}` -> `update /smogReports/rep1`.
10. **Cross-User Private Owner Read / Listing**: Signed in as `userB`, reading or listing `/smogReports/rep1/private/owner` -> `get`/`list` denied.
11. **PII Cross-User Read**: Signed in as `userA`, reading `/users/userB` or listing `/users` -> `get`/`list` denied.
12. **Client Timestamp Forgery**: Payload sets `createdAt` to a past timestamp instead of `request.time` -> `create` denied.
