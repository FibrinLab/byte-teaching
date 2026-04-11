# `lib/db/` — Data Access Layer

This directory is the only place in the codebase that talks to Supabase.
Server actions, API routes, and components go through thin typed functions
here instead of calling `supabase.from('table').select(...)` themselves.

## Why this exists

We're not tied to Supabase forever. The day we migrate to self-hosted
Postgres (+ drizzle/kysely, + Lucia/Auth.js) the only files that need to
change are in `lib/db/`. Everything upstream keeps using the same function
signatures. Without this layer, a migration would touch 30+ action files
and hundreds of queries.

## Rules

1. **No `@supabase/*` imports outside `lib/db/`.** The one exception today
   is `supabase.auth.admin.*` calls in `app/actions/departments.ts` and a
   few other spots — those are on the *auth plane*, not the data plane, and
   will move when we swap auth providers. Everything touching **tables**
   goes through here.

2. **Entity modules return domain types from `lib/types.ts`.** Never return
   a raw `PostgrestResponse` or leak `{ data, error }` tuples.

3. **Throw `DbError` subclasses, never raw driver errors.** Use
   `toDbError(message, error)` at every throw site so the driver's error
   shape can change in one place.

4. **Input arguments use camelCase.** DB row types (stored in `lib/types.ts`)
   keep snake_case because they mirror columns, but function inputs like
   `insertSession({ orgId, departmentId, ... })` use TypeScript-native
   naming. The module translates at the boundary.

5. **Explicit service-role usage.** Functions that deliberately bypass RLS
   use `getServiceDb()` internally and document why in a JSDoc block.
   Callers must have already performed their own authorization check.

## File layout

```
lib/db/
├── client.ts              # getDb() / getServiceDb() — only file importing @/lib/supabase
├── errors.ts              # DbError, DbNotFoundError, DbConflictError, toDbError
├── index.ts               # barrel — exports error types
├── departments.ts         # departments + department_members + moderated lookups
├── sessions.ts            # sessions + session_teachers + public session reads
├── organizations.ts       # organizations + organization_members + role checks
├── attendance.ts          # attendance + attendance_evidence + group codes
├── certificates.ts        # certificates + certificate-render lookups
├── feedback.ts            # session_feedback + feedback template + audit reads
├── audit.ts               # aggregation reads (service role, cross-boundary)
├── teacher-invitations.ts # teacher_invitations + invitation lookups
├── teacher-emails.ts      # teacher_emails audit log
├── join-requests.ts       # department_join_requests CRUD
├── onboarding.ts          # invite links + onboarding requests + memberships
├── super-admins.ts        # super_admins + cross-org admin ops
└── README.md              # this file
```

## Call-site pattern

```ts
// app/actions/departments.ts
import * as departmentsDb from '@/lib/db/departments'
import { DbNotFoundError } from '@/lib/db'
import { requireAuth, requireOrg } from '@/lib/auth'

export async function createDepartment(name: string) {
  const userId = await requireAuth()
  const orgId = await requireOrg()

  const department = await departmentsDb.insertDepartment({
    orgId,
    name,
    createdBy: userId,
  })

  revalidatePath('/departments')
  return department
}
```

Always prefer **namespace imports** (`import * as departmentsDb`) so call
sites read as `departmentsDb.insertDepartment(...)` — clearer than a loose
`insertDepartment(...)` which could collide with helpers from other
modules (`insertSession`, `insertOrganization`, etc).

## Adding a new query

1. Open the entity module that owns the table (`lib/db/<entity>.ts`).
2. Add a function with a descriptive verb-noun name:
   - `findX`, `getXOrThrow` — reads that may return null vs throw
   - `listX` — array reads
   - `insertX`, `updateX`, `deleteX` — mutations
3. Input: plain camelCase object or individual arguments.
4. Output: a domain type from `lib/types.ts` (or a small inline type if
   the function returns a projection).
5. Wrap every `error` branch with `throw toDbError('...', error)`.
6. If it uses service role, add a JSDoc explaining why and reminding the
   caller that authorization is their responsibility.

## Migration progress

**Action files (`app/actions/*.ts`)** — all data-plane queries routed through the DAL:

| Action file                      | Status     | Remaining Supabase import        |
|----------------------------------|------------|----------------------------------|
| `departments.ts`                 | ✅ Migrated | `auth.admin.getUserById`         |
| `sessions.ts`                    | ✅ Migrated | —                                |
| `organizations.ts`               | ✅ Migrated | —                                |
| `attendance.ts`                  | ✅ Migrated | —                                |
| `attendance-evidence.ts`         | ✅ Migrated | —                                |
| `audit.ts`                       | ✅ Migrated | `auth.admin.getUserById`         |
| `certificates.ts`                | ✅ Migrated | `auth.getUser`                   |
| `feedback.ts`                    | ✅ Migrated | —                                |
| `emails.ts`                      | ✅ Migrated | `auth.admin.getUserById`         |
| `teacher-invitations.ts`         | ✅ Migrated | —                                |
| `join-requests.ts`               | ✅ Migrated | —                                |
| `member-onboarding.ts`           | ✅ Migrated | `auth.admin.{generateLink,updateUserById,getUserById}` |
| `super-admin.ts`                 | ✅ Migrated | `auth.admin.listUsers`           |
| `auth.ts`                        | 🔒 Auth-plane | Entire file is auth-plane      |

**Non-action files with DB reads** — also migrated:

| File                                                    | Status     | Notes                       |
|---------------------------------------------------------|------------|-----------------------------|
| `components/NavShell.tsx`                               | ✅ Migrated | Role-check helpers in DAL   |
| `app/api/sessions/[id]/group-code/current/route.ts`     | ✅ Migrated | Uses attendance DAL         |
| `app/api/calendar/ics/route.ts`                         | ✅ Migrated | Public ICS feed             |
| `app/api/certificates/preview/route.ts`                 | ✅ Migrated | Uses dept/org DAL           |
| `app/api/certificates/[id]/download/route.ts`           | ✅ Migrated | Uses certificates DAL       |
| `app/departments/[id]/feedback/page.tsx`                | ✅ Migrated | Public feedback landing     |
| `app/sessions/[id]/feedback/page.tsx`                   | ✅ Migrated | Session feedback page       |
| `app/sessions/[id]/teacher-rsvp/[code]/page.tsx`        | ✅ Migrated | Public RSVP page            |
| `app/api/auth/debug/route.ts`                           | 🔒 Auth-plane | `auth.getSession` only     |

**Zero data-plane Supabase references remain outside `lib/db/`.** Every
surviving `@/lib/supabase/server` import in the codebase is either:

1. Inside `lib/db/client.ts` (the one authorized caller), or
2. Invoking `supabase.auth.*` — the auth plane, deliberately left in place
   until the auth provider swap.

`lib/auth.ts` stays untouched — it's the seam for the auth-provider swap
(Lucia / Auth.js) when that day comes.

## The actual migration (when we're ready)

When we decide to leave Supabase:

1. Stand up Postgres on the target (Neon, Railway, Fly, self-hosted, …).
2. Apply the SQL files in `supabase/migrations/` against the new DB — they
   are plain SQL, no Supabase-specific features beyond RLS policies.
3. Decide whether to keep RLS or move authorization fully into the app
   layer (the `requireAuth` / `isOrgAdmin` helpers already cover most of
   it, so dropping RLS is a realistic option).
4. Replace the body of `lib/db/client.ts`:
   - `getDb()` returns a drizzle/kysely/pg client tied to the request
   - `getServiceDb()` returns a client with elevated credentials
5. Rewrite each entity module's internals (`from('x').select(...)`
   → `db.select().from(x)`) keeping the same function signatures.
6. Update `toDbError` in `errors.ts` to recognise the new driver's error
   codes.
7. Swap auth provider separately — `lib/auth.ts` is the touch point.

Nothing in `app/`, `components/`, or other `lib/*` files should need
changes for the DB migration itself.
