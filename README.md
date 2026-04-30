# BidFlow

BidFlow is a procurement tender management system for B2B supplier bidding workflows. It provides supplier onboarding, tender publishing, invited bidding, quote revision controls, real-time ranking, audit logs, and export support.

The current repository contains only the application source code:

- `backend/`: NestJS API service
- `frontend/`: Vue 3 + Element Plus web application

Runtime secrets, local environment files, build outputs, and deployment-only files are intentionally not committed.

## Tech Stack

Backend:

- NestJS 10
- TypeORM
- PostgreSQL
- Redis
- MinIO / S3-compatible object storage
- Socket.IO WebSocket gateway
- JWT authentication

Frontend:

- Vue 3
- Vite
- Element Plus
- Pinia
- Vue Router
- Vue I18n
- Axios
- Socket.IO client

## Main Features

- Public tender hall
- Company user login and role capability checks
- Supplier registration
- Supplier profile submission and review workflow
- Supplier approval, rejection, supplement request, suspension, and resume
- Tender creation, publishing, opening, closing, and invitation
- Lot and line-item quote management
- Quote update cooldown, max revision count, and minimum decrease validation
- Redis-backed real-time ranking
- WebSocket ranking updates with frontend polling fallback
- Ranking snapshot generation
- Tender quote export
- Audit logging
- Chinese, English, and Indonesian locale resources

## Repository Layout

```text
.
├── backend/
│   ├── package.json
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── migrations/
│       ├── modules/
│       │   ├── auth/
│       │   ├── supplier/
│       │   ├── tender/
│       │   ├── quote/
│       │   ├── bid-record/
│       │   ├── hall/
│       │   └── notification/
│       └── shared/
│           ├── audit/
│           ├── config/
│           ├── export/
│           ├── i18n/
│           ├── mail/
│           ├── rbac/
│           └── upload/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/
│       ├── stores/
│       ├── composables/
│       ├── i18n/
│       ├── mobile/
│       ├── shared/
│       └── views/
├── LICENSE
└── README.md
```

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+
- Redis 7+
- MinIO or another S3-compatible object storage service

For local development, you may run PostgreSQL, Redis, and MinIO with Docker or install them directly on your machine.

## Backend Setup

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `backend/.env`:

```ini
DB_URL=postgresql://bidflow:bidflow_dev@localhost:55432/bidflow
REDIS_URL=redis://:bidflow_dev@localhost:56379

JWT_SECRET=CHANGE_ME_min_32_chars_random_string
JWT_EXPIRES_IN=8h

OTP_EXPIRES_SECONDS=300
OTP_LENGTH=6
OTP_RESEND_COOLDOWN_SECONDS=60

OSS_ENDPOINT=http://localhost:59000
OSS_BUCKET=bidflow
OSS_ACCESS_KEY=bidflow
OSS_SECRET_KEY=bidflow_dev_secret
OSS_REGION=us-east-1

PORT=3010
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5180

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@bidflow.local
SMTP_SECURE=false

GOOGLE_CLIENT_ID=
```

Build and run migrations:

```bash
npm run build
npm run migration:run
```

Start the backend in development mode:

```bash
npm run start:dev
```

The backend will listen on the `PORT` value from `.env`.

## Frontend Setup

```bash
cd frontend
npm ci
cp .env.example .env
```

Edit `frontend/.env`:

```ini
FRONTEND_DEV_PORT=5180
VITE_API_BASE_URL=http://localhost:3010
VITE_WS_URL=ws://localhost:3010
VITE_GOOGLE_CLIENT_ID=
```

Start the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:5180
```

## Common Scripts

Backend:

```bash
npm run build
npm run start
npm run start:dev
npm run migration:run
npm run migration:revert
```

Frontend:

```bash
npm run dev
npm run build
npm run preview
```

## Production Deployment

Recommended production topology:

```text
Internet
  |
  v
Nginx / HTTPS / bidflow.jtcargo.co.id
  |-- /      -> frontend/dist
  |-- /api   -> backend NestJS service
  |-- /ws    -> backend WebSocket gateway
       |
       |-- PostgreSQL
       |-- Redis
       |-- MinIO or S3-compatible object storage
```

The frontend and backend do not have to run in Docker:

- Frontend can be built with `npm run build` and served by Nginx from `frontend/dist`.
- Backend can be built with `npm run build` and managed by PM2 with `node dist/main.js`.

Docker is still practical for PostgreSQL, Redis, and MinIO because it keeps infrastructure services isolated and easy to reproduce. You may also use managed cloud services instead.

Production backend environment example:

```ini
DB_URL=postgresql://bidflow:CHANGE_ME_DB_PASSWORD@127.0.0.1:55432/bidflow
REDIS_URL=redis://:CHANGE_ME_REDIS_PASSWORD@127.0.0.1:56379
JWT_SECRET=CHANGE_ME_USE_OPENSSL_RAND_BASE64_32
JWT_EXPIRES_IN=8h
OSS_ENDPOINT=http://127.0.0.1:59000
OSS_BUCKET=bidflow
OSS_ACCESS_KEY=bidflow
OSS_SECRET_KEY=CHANGE_ME_MINIO_PASSWORD
OSS_REGION=us-east-1
PORT=13000
NODE_ENV=production
FRONTEND_ORIGIN=https://bidflow.jtcargo.co.id
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=CHANGE_ME_SMTP_PASSWORD
SMTP_FROM=noreply@example.com
SMTP_SECURE=false
```

Production frontend environment example:

```ini
VITE_API_BASE_URL=
VITE_WS_URL=
VITE_GOOGLE_CLIENT_ID=
```

Using empty `VITE_API_BASE_URL` and `VITE_WS_URL` lets the frontend call same-origin `/api` and `/ws`, which should be handled by Nginx reverse proxy.

Typical release flow:

```bash
git pull

cd backend
npm ci --production=false
npm run build
NODE_ENV=production npm run migration:run
pm2 reload bidflow-backend
npm prune --production

cd ../frontend
npm ci
npm run build

sudo nginx -t
sudo systemctl reload nginx
```

## Git And Secret Policy

Do not commit:

- `.env`
- `.env.*`
- `node_modules/`
- `dist/`
- production database dumps
- private keys
- SMTP passwords
- JWT secrets
- object storage access keys

Use `.env.example` files to document required variables without exposing secrets.

## License

This project is released under the MIT License. See [LICENSE](./LICENSE).
