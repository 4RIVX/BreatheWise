# BreatheWise Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: `users/{userId}` holds email and personal preferences and is readable/writable ONLY by `request.auth.uid == userId` with verified email.
2. **Citizen Privacy on Smog Reports**: `smogReports/{reportId}` NEVER stores `email`, `phone`, or personal display names. It stores `authorUid` for ownership enforcement only.
3. **Unverified Default Moderation**: Every newly created `smogReports/{reportId}` MUST have `moderationStatus == 'UNVERIFIED'` and `confirmationsCount == 1` (or `0`) at creation. Only admins (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))`) may set `moderationStatus` to `REVIEWED` or `FLAGGED`.
4. **No Duplicate Confirmations**: Confirming a report requires creating `smogReports/{reportId}/confirmations/{request.auth.uid}` atomically with incrementing `smogReports/{reportId}.confirmationsCount` by `+1` using `existsAfter`. A user cannot create a confirmation under another user's UID or confirm twice.
5. **Temporal Integrity**: `createdAt` and `updatedAt` MUST equal `request.time`. `createdAt` and `authorUid`/`uid` are immutable after creation.
6. **Strict Schema & Bounds**: Every write validates required/allowed keys via `hasAll` + `hasOnly` (on create) and `affectedKeys().hasOnly(...)` (on update), plus string `.size()` bounds and ID regex `^[a-zA-Z0-9_\-]+$`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Smog Report Create**: `request.auth == null` -> `create /smogReports/rep1`.
2. **Unverified Email Create**: `request.auth.token.email_verified == false` -> `create /smogReports/rep1`.
3. **Spoofed Author UID**: Signed in as `userA`, payload has `authorUid: "userB"` -> `create /smogReports/rep1`.
4. **Pre-Verified Moderation Bypass**: Signed in as `userA`, payload sets `moderationStatus: "REVIEWED"` on create -> `create /smogReports/rep1`.
5. **Shadow Ghost Field Injection**: Signed in as `userA`, payload includes extra field `isOfficial: true` -> `create /smogReports/rep1`.
6. **Oversized Photo / Resource Poisoning**: Signed in as `userA`, `photoDataUrl` length > 80,000 or `description` > 400 -> `create /smogReports/rep1`.
7. **Invalid Document ID Poisoning**: Document ID contains `/`, spaces, or > 128 chars -> `create /smogReports/bad..id`.
8. **Duplicate / Non-Atomic Confirmation Inflation**: Updating `smogReports/rep1.confirmationsCount` by `+10` or without creating `/confirmations/{uid}` -> `update /smogReports/rep1`.
9. **Spoofed Confirmation UID**: Signed in as `userA`, creating `/smogReports/rep1/confirmations/userB` -> `create`.
10. **PII Cross-User Read**: Signed in as `userA`, reading `/users/userB` or listing `/users` -> `get`/`list`.
11. **Non-Owner Routine Write**: Signed in as `userA`, writing `/users/userB/routines/r1` -> `create`/`update`.
12. **Client Timestamp Forgery**: Payload sets `createdAt` to a past timestamp instead of `request.time` -> `create`.
