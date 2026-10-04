# Security Specification — Chitron's Archive Live Messenger

## 1. Data Invariants
1. **Default-Deny Global Catch-All**: All paths not explicitly matched (`/{document=**}`) deny all reads and writes (`allow read, write: if false;`).
2. **Admin Verification Invariant**: Administrator privileges require either an existing document at `/admins/$(request.auth.uid)` or a verified Google authentication token (`request.auth.token.email == 'chitronbhattacharjee@gmail.com' && request.auth.token.email_verified == true`).
3. **Visitor Capability ID Invariant**: A `visitorId` MUST match `^visitor_[a-zA-Z0-9_\-]+$` with length between 16 and 128 characters. No short or malformed IDs are permitted.
4. **Master Gate (Relational Sync)**: A message in `/conversations/{visitorId}/messages/{messageId}` can only be created or accessed if the parent `/conversations/{visitorId}` exists (or existsAfter in an atomic batch) and is not in a terminal `blocked` state (unless admin).
5. **Strict Schema & Anti-Update-Gap**: Every `create` and `update` on `Conversation` and `ChatMessage` must pass `isValidConversation(incoming())` or `isValidChatMessage(incoming())`, enforcing `hasAll` and `hasOnly` key allowlists, string `.size()` boundaries, enum constraints, and `request.time` temporal integrity.
6. **Immutability Invariant**: `visitorId` and `createdAt` on `Conversation`, and `messageId`, `visitorId`, `sender`, `type`, `text`, and `timestamp` on `ChatMessage` are strictly immutable once created.
7. **Action-Based Updates**: Updates to `Conversation` and `ChatMessage` are partitioned into explicit actions using `incoming().diff(existing()).affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on Conversation Create**:
   ```json
   {
     "visitorId": "visitor_abc1234567890xyz",
     "lastMessage": "Hello",
     "lastSender": "visitor",
     "unreadForAdmin": 1,
     "unreadForVisitor": 0,
     "status": "active",
     "createdAt": "SERVER_TIMESTAMP",
     "lastMessageAt": "SERVER_TIMESTAMP",
     "isAdmin": true
   }
   ```
2. **Oversized String DoS on ChatMessage**:
   ```json
   {
     "messageId": "msg_12345678",
     "visitorId": "visitor_abc1234567890xyz",
     "sender": "visitor",
     "text": "<5000-char-string>",
     "type": "text",
     "read": false,
     "timestamp": "SERVER_TIMESTAMP"
   }
   ```
3. **ID Poisoning on Conversation Path**:
   Path: `/conversations/bad..id!!`
4. **Spoofed Admin Sender by Unauthenticated Visitor**:
   ```json
   {
     "messageId": "msg_12345678",
     "visitorId": "visitor_abc1234567890xyz",
     "sender": "admin",
     "text": "Fake admin reply",
     "type": "text",
     "read": false,
     "timestamp": "SERVER_TIMESTAMP"
   }
   ```
5. **Unverified Admin Email Spoof**:
   Auth token: `{ email: "chitronbhattacharjee@gmail.com", email_verified: false }` attempting admin list/write.
6. **Client-Spoofed Past Timestamp on Create**:
   `createdAt` set to `"2020-01-01T00:00:00Z"` instead of `request.time`.
7. **Immutable Field Mutation (`createdAt` / `visitorId`) on Conversation Update**:
   Changing `visitorId` to `"visitor_other999999999"` during update.
8. **Blocked Conversation Bypass**:
   Visitor attempting to post or update when `existing().status == 'blocked'`.
9. **Orphaned Message Write**:
   Creating `/conversations/visitor_nonexistent12345/messages/msg_12345678` when parent conversation does not exist.
10. **Message Content Tampering on Update**:
    Visitor attempting to edit `text` of an existing message via `update` instead of only marking `read`.
11. **Unauthorized Blanket Conversation Listing**:
    Unauthenticated visitor attempting `list` on `/conversations` without `visitorId` filter or admin credentials.
12. **Self-Assigned Admin Privilege Escalation**:
    Non-admin user attempting to create `/admins/{uid}`.
