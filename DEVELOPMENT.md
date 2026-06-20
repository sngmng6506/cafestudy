# Study Meetup MVP Development Notes

## Product Scope

IT/AI study meetup web platform MVP.

The MVP includes only three product features:

1. Meetup creation
2. Photo verification with point rewards
3. Point ranking: all-time and monthly

Explicitly out of scope for MVP:

- Notifications
- Real-time push
- Payment
- Advanced search/filtering
- Comments
- Chat

## Current Architecture Decision

Use Railway as the main deployment platform.

GitHub repository:

```text
https://github.com/sngmng6506/cafestudy.git
```

Recommended Railway project layout:

```text
Railway Project
├─ Web Service
│  └─ GitHub repository deployment
│     Express API
│
└─ PostgreSQL
   └─ Railway PostgreSQL database
```

The Express app should connect to the database with:

```text
DATABASE_URL
```

Do not store photo files directly in PostgreSQL. Store only the image URL or object key in the database.

Photo storage options, to be decided separately:

- Supabase Storage
- Cloudflare R2
- AWS S3-compatible storage

## Fixed Stack

- Backend: Express on Node.js
- Database: Railway PostgreSQL
- Frontend: React SPA
- File storage: object storage, not PostgreSQL
- Real-time: not used in MVP

Authentication is intentionally abstracted behind backend middleware for now.

Future choices:

- Supabase Auth
- Passport.js with Google/Naver OAuth
- Auth.js
- Custom session/JWT flow

Until the final provider is selected, feature code should depend on an internal auth middleware contract, not directly on a specific provider SDK.

## Data Model

Initial tables:

```text
users
- id
- oauth_provider
- nickname
- avatar
- total_points
- created_at

meetups
- id
- host_id
- title
- cafe_name
- location
- scheduled_at
- status
- created_at

participants
- id
- meetup_id
- user_id
- joined_at

verifications
- id
- meetup_id
- user_id
- photo_url
- points_awarded
- status
- created_at

point_logs
- id
- user_id
- source
- ref_id
- amount
- created_at
```

Constraints and policies:

- `verifications` must enforce one verification per user per meetup:

```sql
UNIQUE (meetup_id, user_id)
```

- `users.total_points` is a cache.
- `point_logs` is the source of truth.
- If point totals become inconsistent, recompute `users.total_points` from `point_logs`.

## Decisions From Step 0

Use the following defaults unless a later PR explicitly changes them:

```text
meetups.status: open / closed
monthly ranking: aggregate point_logs by created_at
```

Monthly ranking should use the service timezone consistently. The current working timezone is Asia/Seoul.

Monthly ranking query rule:

```text
created_at >= start of month
created_at < start of next month
```

## Point Rules

Initial point values are placeholders and should live in config:

```text
PHOTO_VERIFICATION_POINTS = N
MEETUP_CREATE_POINTS = M
```

Recommended MVP default:

```text
PHOTO_VERIFICATION_POINTS = 10
MEETUP_CREATE_POINTS = 0
```

Reasoning:

- Photo verification is the core contribution.
- Meetup creation points can encourage spam if enabled too early.

## Transaction Requirement

Photo verification must be handled atomically.

The following operations must succeed or fail together:

1. Insert `verifications`
2. Insert `point_logs`
3. Increment `users.total_points`

Recommended implementation:

- Use a PostgreSQL transaction in the Express service layer.
- Alternatively, use a stored function later if DB-side encapsulation becomes useful.

Do not implement these three writes as unrelated independent queries.

## Plugin Feature Architecture

The app is organized by feature, not by contributor.

```text
src/
  core/
    loadFeatures.js
    db.js
    auth.js
    config.js
  shared/
    api-response.js
  features/
    _template/
    meetups/
    verifications/
    ranking/
  app.js
```

Core rule:

- `core/` and `shared/` are stable shared infrastructure.
- Feature contributors should usually add code under `src/features/<feature-name>/`.
- Feature code should not directly import another feature.
- Feature-to-feature communication should happen through the database in MVP.

## Plugin Contract

Use a factory-style route contract so dependencies can be injected.

Recommended feature entry:

```js
export default {
  name: 'meetups',
  basePath: '/api/meetups',
  createRoutes: (ctx) => createMeetupRouter(ctx),
  navItem: { label: 'Meetups', path: '/meetups' },
};
```

`ctx` should contain shared dependencies:

```js
{
  db,
  auth,
  config
}
```

Feature modules should use dependencies from `ctx` instead of creating their own database clients.

## API Response Format

All API responses should use the same shape:

Success:

```json
{
  "data": {},
  "error": null
}
```

Failure:

```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## Walking Skeleton Acceptance Criteria

The first implementation slice should prove the system works end to end:

- A logged-in user can create a meetup.
- Created meetups are returned by the meetup list API.
- Created meetups appear in the React UI.
- Unauthenticated users cannot create meetups.
- API responses use `{ data, error }`.
- `features/meetups/index.js` satisfies the plugin contract.
- `core/loadFeatures.js` auto-loads feature modules.
- `features/_template/` exists as a starter feature skeleton.

## Railway Setup Checklist

1. Create a Railway project.
2. Connect the GitHub repository as a Web Service.
3. Add a PostgreSQL database in the same Railway project.
4. Expose the database connection as `DATABASE_URL` to the Web Service.
5. Configure the service start command after the app scaffold exists.
6. Add required environment variables in Railway, not in source control.
7. Run database migrations after `DATABASE_URL` is connected:

```text
npm run db:migrate
```

Never commit production secrets.

## Environment Variables

Expected variables:

```text
DATABASE_URL=
NODE_ENV=
PORT=
```

Future auth/storage variables may include:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_PUBLIC_BASE_URL=
```

## Migration Convention

Database migrations should be committed as SQL files.

Recommended layout:

```text
migrations/
  20260620_init.sql
  20260620_add_verifications.sql
```

Rules:

- Use timestamp-prefixed filenames.
- Do not edit already-applied migrations casually.
- Add a new migration for schema changes after review.
- Keep schema constraints in migrations, not only in application code.

## Collaboration Rules

The project is designed for contributors to add one feature at a time.

Contributor rules:

- Start from `features/_template/`.
- Keep changes focused on one feature.
- Avoid changing `core/` and `shared/` unless the PR is explicitly about shared infrastructure.
- Keep PRs below about 400 changed lines when practical.
- Add or update tests for behavior introduced by the PR.

Ownership should be handled through `CODEOWNERS`, not by creating folders named after people.

## Suggested Next Implementation Order

1. Scaffold Express and React.
2. Add `core/loadFeatures.js`.
3. Add `shared/api-response.js`.
4. Add `core/db.js` using `DATABASE_URL`.
5. Add placeholder `core/auth.js`.
6. Implement `features/meetups/`.
7. Add `features/_template/`.
8. Add initial migrations.
9. Deploy the Express service and Railway PostgreSQL connection.
