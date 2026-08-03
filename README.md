# Event Quest

Event Quest is a serverless, QR-led experience platform for weddings, festivals, conferences, team events and celebrations. Guests explore an event site, complete location-based challenges and follow a live leaderboard.

## Architecture

```text
GitHub Pages (React/Vite) → API Gateway → Lambda handlers → DynamoDB
                                      └→ CloudWatch logs and metrics
```

The web app is a static, mobile-first client. Each Lambda owns a single application use case; `@event-quest/shared` is the stable boundary for domain models, DTOs and API contracts. DynamoDB uses `PK`/`SK` keys to keep each aggregate predictable and inexpensive for the intended event-scale traffic.

## Local development

Requirements: Node 24+, pnpm 9+, Terraform 1.6+, AWS CLI, and AWS credentials for infrastructure work.

```bash
pnpm install
pnpm --filter @event-quest/web dev
pnpm test
pnpm build
```

Set `VITE_API_URL` in `apps/web/.env.local` to the HTTP API URL when testing against AWS. The browser retains a registered user ID in `localStorage` once your registration UI or event check-in flow writes `event-quest-user`.

## Deploy

Create a private S3 bucket in `eu-west-1` for the Lambda artifacts. Build each service, zip its `dist/index.js` as `<service>.zip`, and upload all six zip files to that bucket. Then:

```bash
cd infra/terraform
terraform init
terraform fmt -recursive
terraform validate
terraform apply -var='lambda_artifact_bucket=your-artifact-bucket'
```

Copy the resulting `api_url` and add it as the `VITE_API_URL` repository variable in GitHub. The Pages workflow publishes `apps/web/dist` from `develop`; the validation workflow runs type checks, tests, builds and Terraform validation on pull requests. The API includes the public game routes; keep the admin Lambda private until an API Gateway authorizer is configured.

## API

`POST /register-user`, `GET /question/{id}`, `POST /submit-answer/{id}`, `GET /ranking`, `GET /stats`, plus admin endpoints for question enablement, ranking freeze state and affiliations. Admin access should be protected with an API Gateway authorizer before public deployment.

Create each container or child affiliation with `POST /admin/upsert-affiliation`: `{ "affiliationId": "gryffindor", "name": "Gryffindor", "parentAffiliationId": "harry-potter", "avatarKey": "affiliations/gryffindor.png", "story": "…" }`. Then use `POST /admin/assign-user-affiliation` to add participants. The affiliation profile is stored once with its avatar, story, score and member count; the bucket serves avatars from `affiliations/`.

## Repository commands

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
