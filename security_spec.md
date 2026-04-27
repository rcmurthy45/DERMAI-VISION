# Security Specification: DermAI

## Data Invariants
1.  **User Isolation**: A user can only access their own profile and their own diagnosis records.
2.  **Multimodal Integrity**: A diagnosis must have a valid `userId` matching the authenticated user.
3.  **Identity Lockdown**: Users cannot spoof `ownerId` or `userId` in any write operation.
4.  **Terminal State**: Diagnosis results are immutable once written.

## The "Dirty Dozen" (Attack Payloads)

| Attack Type | Collection | Payload | Result |
| :--- | :--- | :--- | :--- |
| **Spoofing Owner** | `users` | `{ uid: 'other_user_id', name: 'Hacker' }` (written as victim) | **REJECTED** |
| **Cross-User Leak** | `diagnoses` | `GET /diagnoses/some_audit_id` (by different user) | **REJECTED** |
| **Resource Poisoning** | `diagnoses` | `{ userId: 'me', confidence: 100, diseaseName: 'A'.repeat(5000) }` | **REJECTED** |
| **Shadow Field** | `users` | `{ uid: 'me', name: 'John', isAdmin: true }` | **REJECTED** |
| **Unauthenticated Write**| `diagnoses` | `{ userId: 'me', diseaseName: 'Cancer' }` (no auth) | **REJECTED** |
| **Client Timestamp** | `diagnoses` | `{ userId: 'me', createdAt: '2000-01-01' }` | **REJECTED** |
| **Ghost Diagnosis** | `diagnoses` | `{ userId: 'me', diseaseName: 'N/A', isSkinNailRelated: true }` (schema mismatch) | **REJECTED** |
| **ID Injection** | `users` | `WRITE /users/../../../bad_path` | **REJECTED** |
| **Update Gap** | `diagnoses` | `UPDATE /diagnoses/id { confidence: 0 }` (modifying immutable result) | **REJECTED** |
| **Email Spoofing** | `users` | Auth with `email_verified: false` | **REJECTED** |
| **Unbounded List** | `diagnoses` | `{ userId: 'me', symptoms: ['A'.repeat(1000), ...] }` (size overload) | **REJECTED** |
| **Orphaned Write** | `diagnoses` | `{ userId: 'none' }` | **REJECTED** |

## Test Runner
Stored in `firestore.rules.test.ts`.
