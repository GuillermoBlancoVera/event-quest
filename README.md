# Event Quest

Event Quest is a serverless, QR-led experience platform for weddings, festivals, conferences, team events and celebrations. Guests explore an event site, complete location-based challenges, follow a live leaderboard and share photos in a private gallery.

## Architecture

```text
GitHub Pages (React/Vite) ──► API Gateway (HTTP, throttled) ──► one Lambda per use case ──► DynamoDB
        │                                                              │
        │  avatars and icons                                           ├─► S3 (private bucket)
        └──────────────► CloudFront ──► S3 avatars/, affiliations/     └─► SSM (session secret)
        │
        └── photo uploads and downloads go straight to S3 with short-lived signed URLs
```

- `apps/web` is a static, mobile-first client with clean URLs (`/galeria`, `/juego/perfil`, `/admin`). GitHub Pages serves `404.html`, a copy of the app, for deep links.
- `services/*` holds one Lambda per use case. `packages/server` is their shared kit (sessions, password hashing, DynamoDB helpers); `packages/shared` holds the models and API contracts used by both sides.
- `infra/terraform` owns every AWS resource. Each Lambda has its own IAM role with only the table and bucket permissions it uses.

## Security model

| Area | How it works |
| --- | --- |
| Sessions | `POST /login` returns an HMAC-signed token (player 30 days, admin 12 hours). Every other route verifies it and takes the caller's identity from it; a `userId` in a request body is never trusted. |
| Passwords | Stored as salted scrypt hashes. Accounts created before hashing are upgraded on their next login. Ten wrong attempts lock an account for five minutes. |
| Gallery | Readable and writable only with a session: a player account, or a guest session obtained by exchanging the shared wedding code (`POST /event-session`). Changing the code in the admin panel signs every guest out. |
| Uploads | The API returns a one-time S3 form (presigned POST) that pins the content type and caps the size (40 MB photos, 500 MB videos by default). On completion the first bytes are checked against real photo/video formats; anything else is deleted. |
| Deleting | Removing a memory deletes its files from S3 and its record. Versioning keeps them recoverable for 7 days, then they are gone. Abandoned uploads expire after 2 days. |
| QR codes | A player's QR and a protected challenge's QR carry a signature derived from the session secret, so ids taken from the ranking or guessed cannot be used. "Por la cara" ids are random. |
| Admin | `/admin/*` requires an admin session, and the role is re-read from the database on every call. All changes are written to the audit table with the caller and source IP. |
| Limits | API Gateway throttles the whole API and, more tightly, login, the wedding code and new uploads. A budget alert and error alarms notify `alert_email`. |

## Local development

Requirements: Node 24+, pnpm, Terraform 1.6+, AWS CLI, and AWS credentials for infrastructure work.

```bash
pnpm install
pnpm --filter @event-quest/web dev
pnpm test
pnpm build
```

Set `VITE_API_URL` (the HTTP API URL) and `VITE_ASSETS_URL` (the CloudFront URL) in `apps/web/.env.local` when testing against AWS. To call the deployed API from `localhost`, add the origin to `web_origins` in a local `terraform.tfvars`; production only allows the GitHub Pages origin.

## Deploy

### First time in a new AWS account

1. Create a private S3 bucket for Lambda artifacts and upload the zips: `scripts/deploy-lambdas.sh --upload <artifact-bucket>`.
2. `cd infra/terraform && terraform init && terraform apply -var='lambda_artifact_bucket=<artifact-bucket>' -var='alert_email=<you@example.com>'`. Confirm the SNS subscription email so alarms can reach you.
3. In GitHub, set the repository variables from the Terraform outputs: `VITE_API_URL` (`api_url`), `VITE_ASSETS_URL` (`assets_base_url`) and `AWS_DEPLOY_ROLE_ARN` (`github_deploy_role_arn`).
4. Create the first administrator: `USERS_TABLE=<users_table> node scripts/create-admin.mjs <name>`.
5. Push to `develop`. The **Deploy web** workflow publishes the site and **Deploy Lambdas** ships the function code.
6. Sign in at `/admin`, set the wedding code under *Ajustes*, and create players, questions and communities.

### Day to day

- Code: merging to `develop` deploys the web and the Lambdas. `scripts/deploy-lambdas.sh` does the same for the Lambdas from a terminal.
- Infrastructure: `terraform apply`. Terraform manages each function's configuration and permissions but not its code, so applying never rolls code back.
- State: copy `infra/terraform/backend.tf.example` to `backend.tf` to keep the Terraform state in an encrypted, versioned S3 bucket instead of on one laptop.

If the account already has a GitHub OIDC provider, pass its ARN as `github_oidc_provider_arn`; an account can only hold one.

## Admin panel

`/admin` manages players (create, edit, reset password or progress, delete), questions, "por la cara" challenges, communities and cabins, and the game settings (open or close the game, freeze the ranking, wedding code). Each question and "por la cara" has a *QR* button that shows the exact link to print. Admin accounts do not appear in the ranking.

## API

All routes except the first two require `Authorization: Bearer <session token>`.

| Route | Who | Purpose |
| --- | --- | --- |
| `POST /login` | anyone | Name and password for a player or admin session |
| `POST /event-session` | anyone | Wedding code for a guest (gallery-only) session |
| `GET /profile/me` | player | Own profile, answer history and QR code |
| `GET /challenges`, `GET /question/{id}`, `POST /submit-answer/{id}` | player | Questions; one attempt each |
| `GET /por-la-cara`, `GET\|POST /por-la-cara/{id}` | player | Claimed bonus challenges; claim one by its QR id |
| `POST /community-scan/{code}` | player | Register a meeting from another player's QR |
| `GET /ranking`, `GET /stats` | player | Leaderboard and totals |
| `GET /media`, `POST /media/uploads`, `POST /media/{id}/complete`, `POST /media/cancel`, `PATCH\|DELETE /media/{id}` | guest, player | Gallery |
| `ANY /admin/{players\|challenges\|por-la-cara\|affiliations\|settings\|uploads}` | admin | Administration |

## Repository commands

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
