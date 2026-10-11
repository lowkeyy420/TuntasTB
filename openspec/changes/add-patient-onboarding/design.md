# Design

## Context

`add-project-foundation` provides the `patients` table, nurse session (`requireNurse`), audit writer, consent helpers and the neutral family shell at `/f/[token]`. This change adds the first real writes to `patients` and the family link mechanism every family feature reuses. Requirements are in `specs/patient-onboarding/spec.md`.

## Goals / Non-Goals

**Goals:**

- Registration a nurse finishes in about three minutes: five inputs, one screen.
- A family link that is safe to lose: unguessable, hashed at rest, replaceable in one tap.
- One function, `resolveFamilyToken`, that every family route uses.

**Non-Goals:**

- Delivering the link to the family.
- Editing or archiving patients beyond phase and pickup interval.

## Decisions

### API surface

| Route | Purpose |
| --- | --- |
| `POST /api/nurse/patients` | Create a patient; returns the patient and the one-time `familyLink` |
| `GET /api/nurse/patients` | List patients of the session's Puskesmas |
| `PATCH /api/nurse/patients/[id]` | Change phase or pickup interval |
| `POST /api/nurse/patients/[id]/token` | Rotate the link; returns the new one-time `familyLink` |
| `DELETE /api/nurse/patients/[id]/token` | Revoke the link |
| `GET /api/family/session` | Resolve the bearer token; returns `{ consented, treatmentDay, puskesmasName, puskesmasPhone }` |
| `POST /api/family/consent` | Record consent for the token's patient |

Request bodies are validated with zod using `.strict()`, so an unexpected `name` key is a 400, which is how the "extra field is rejected" scenario is enforced.

### Family token

- 32 random bytes from `crypto.randomBytes`, base64url encoded (43 characters).
- Stored as `SHA-256(token)` hex in `patients.family_token_hash` with a unique index. A fast hash is correct here because the token already has 256 bits of entropy; bcrypt would add latency to every family request for no gain.
- `resolveFamilyToken(token)` hashes the input, looks up the row and returns the patient only when `token_revoked_at` is null. Unknown and revoked take the same code path and return the same 404 body.
- Rotate: generate a new token, overwrite the hash, clear `token_revoked_at`. Revoke: set `token_revoked_at = now` and keep the hash, so a later audit can tell "revoked" from "never issued".
- Family pages read the token from the path; family API calls send it as `Authorization: Bearer <token>`. Alternative considered: exchanging the token for a cookie. Rejected: installed PWAs on Android open in a separate storage context, and a cookie would make the link stop working after install.

### PMO contact hash

Normalise to digits, convert a leading `0` or `62` to `+62`, then `HMAC-SHA256(HASH_PEPPER, normalised)`. A keyed hash is needed because phone numbers have low entropy and a plain hash is reversible by enumeration. The raw value is never written to a variable that outlives the request handler, and the request logger does not log bodies.

### Consent

The page `/f/[token]` calls `GET /api/family/session`. When `consented` is false it renders the consent screen from `family.id.ts`. "Saya setuju" calls `POST /api/family/consent`, which calls `recordConsent` and writes the audit entry in one transaction. "Tidak setuju" makes no request at all. Consent is a property of the patient, not of the token, so rotation keeps it.

Draft consent copy (to be refined by the designer, kept under the forbidden-terms check):

> Layanan ini membantu keluarga dan perawat Puskesmas memantau minum obat harian. Kami mencatat: obat diminum atau tidak, keluhan yang Anda pilih, dan catatan singkat. Jangan tulis nama atau alamat. Catatan dibaca oleh sistem otomatis setelah data pribadi dihapus, dan hanya perawat Puskesmas Anda yang dapat melihatnya. Layanan ini tidak menggantikan perawat. Anda bisa berhenti kapan saja dengan menghubungi Puskesmas.

### Nurse screens

`/nurse/patients` (list) and `/nurse/patients/new` (form). After a successful create or rotate, a modal shows the link with "Salin tautan" and the warning "Tautan hanya ditampilkan sekali". Treatment day is `daysBetween(start_date, todayJakarta()) + 1`.

## Cross-cutting

- **Redaction**: no free text is collected in this change. The PMO phone is hashed, not redacted, and never stored in clear.
- **Audit logging**: `patient.create`, `patient.update`, `patient.list`, `patient.read`, `family_token.rotate`, `family_token.revoke`, `consent.give`, `family.open`. Entries carry identifiers only; the token and the phone number never reach `meta`.
- **Neutral wording**: the consent screen, the invalid-link page and their titles go through the family copy file and its forbidden-terms test. The consent text says "minum obat harian", not the illness.
- **Bahasa copy**: all form labels, validation messages and the consent text are plain Bahasa Indonesia; validation messages name the field in everyday words ("Tanggal mulai").

## Risks / Trade-offs

- [The token sits in the URL, so it can appear in browser history or be forwarded] → Accepted as the cost of "no account"; mitigated by one-tap rotate and revoke, and by the web server not logging request paths under `/f/`.
- [A nurse types a real name into the code field] → The format (uppercase letters, digits, hyphen, no spaces) blocks full names; the field hint reads "Jangan isi nama".
- [The nurse closes the modal before copying the link] → Rotate issues a new one in one tap.
- [Consent is given by whoever opens the link first, who may be the PMO rather than the patient] → Matches the plan (family PMO is the primary user); the nurse explains this at registration. Recorded as an assumption.

## Open Questions

- Should the consent text be reviewed by the Puskesmas's own data protection contact before the pilot? Copy can change without touching code.
