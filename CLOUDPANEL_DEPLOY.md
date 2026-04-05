# CloudPanel Deployment

This project is set up to deploy from GitHub Actions to your CloudPanel server.

## Recommended CloudPanel layout

Use:

- `darshanmistry.in` for the Angular frontend
- `api.darshanmistry.in` for the Node.js backend

Recommended server paths:

- Frontend root: `/home/darshan/htdocs/darshanmistry.in`
- Backend app: `/home/darshan/apps/expenseflow-api`
- Backend uploads: `/home/darshan/apps/expenseflow-api/uploads`

Do not deploy the frontend to `/home/darshan/htdocs/darshanmistry.in/ExpenseFlow` unless you want the app to live under `/ExpenseFlow` in the URL.

## GitHub Actions secrets

Add these exact values in:

`GitHub -> Repository -> Settings -> Secrets and variables -> Actions`

### Server connection

- `SERVER_HOST`: `72.61.233.38`
- `SERVER_PORT`: `22`
- `SERVER_USER`: your CloudPanel SSH username
- `SERVER_SSH_KEY`: the private key for that SSH user

### Deploy paths

- `FRONTEND_DEPLOY_PATH`: `/home/darshan/htdocs/darshanmistry.in`
- `BACKEND_DEPLOY_PATH`: `/home/darshan/apps/expenseflow-api`
- `BACKEND_UPLOADS_PATH`: `/home/darshan/apps/expenseflow-api/uploads`

### Backend runtime

- `BACKEND_PORT`: `3000`
- `PM2_APP_NAME`: `expenseflow-api`
- `CORS_ORIGINS`: `https://darshanmistry.in,https://www.darshanmistry.in`

### App secrets

- `DATABASE_URL`: your production PostgreSQL connection string
- `JWT_SECRET`: a long random secret string

## CloudPanel setup

### 1. Frontend site

Your main domain should point to:

- domain: `darshanmistry.in`
- document root: `/home/darshan/htdocs/darshanmistry.in`

### 2. Backend site

Create a Node.js site in CloudPanel:

- domain: `api.darshanmistry.in`
- app path: `/home/darshan/apps/expenseflow-api`
- app port: `3000`

### 3. SSL

Issue Let's Encrypt certificates for:

- `darshanmistry.in`
- `www.darshanmistry.in`
- `api.darshanmistry.in`

## DNS records

Create these DNS records:

- `A` record: `darshanmistry.in -> 72.61.233.38`
- `A` record: `www.darshanmistry.in -> 72.61.233.38`
- `A` record: `api.darshanmistry.in -> 72.61.233.38`

## One-time server commands

Run these once after SSH login:

```bash
mkdir -p /home/darshan/apps/expenseflow-api
mkdir -p /home/darshan/apps/expenseflow-api/uploads
npm install -g pm2
pm2 save
```

If Node.js is not available on the server yet, install the version used by CloudPanel for your Node.js site first.

## SSH key setup for GitHub Actions

Generate a deploy key locally:

```bash
ssh-keygen -t ed25519 -C "github-actions-expenseflow" -f expenseflow_deploy_key
```

Then:

1. Put the contents of `expenseflow_deploy_key.pub` into your server user's `~/.ssh/authorized_keys`
2. Paste the contents of `expenseflow_deploy_key` into the GitHub secret `SERVER_SSH_KEY`

## First deployment flow

1. Make sure all GitHub secrets are added
2. Make sure CloudPanel site + Node.js app exist
3. Make sure DNS is pointing correctly
4. Push to `main`
5. GitHub Actions will:
   - build frontend and backend
   - upload frontend files
   - upload backend files
   - write backend `.env`
   - run Prisma migrations
   - restart the backend with `pm2`

## Important note about PostgreSQL

This project uses PostgreSQL through Prisma. CloudPanel's database UI is usually used for MySQL/MariaDB, so your production PostgreSQL database may be:

- manually installed on the VPS, or
- hosted externally

As long as `DATABASE_URL` is valid, the workflow will work.
