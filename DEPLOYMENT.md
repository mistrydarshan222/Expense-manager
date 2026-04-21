# ExpenseFlow Deployment

This project has:

- an Angular frontend in `frontend`
- an Express + Prisma backend in `backend`
- a PostgreSQL database
- uploaded receipt files stored in `backend/uploads`

## 1. Server requirements

Recommended production stack:

- Ubuntu 22.04 or 24.04
- Node.js 22 LTS
- PostgreSQL 16
- Nginx
- PM2

## 2. Backend environment

Copy `backend/.env.example` to `backend/.env` on the server and fill in real values.

Important:

- use a strong `JWT_SECRET`
- use your real `GOOGLE_CLIENT_ID`
- use a real `OPENAI_API_KEY`
- set `ALLOWED_ORIGINS` to your frontend domain
- keep `backend/uploads` persistent between deploys

## 3. PostgreSQL setup

Create a database and user, then set:

- `DATABASE_URL`
- `DIRECT_URL`

Example format:

```env
DATABASE_URL=postgresql://expense_user:password@127.0.0.1:5432/expense_management
DIRECT_URL=postgresql://expense_user:password@127.0.0.1:5432/expense_management
```

## 4. Backend deploy

```bash
cd /var/www/expenseflow/backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
mkdir -p uploads
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Backend runs on port `5000` by default.

Health check:

```bash
curl http://127.0.0.1:5000/
```

## 5. Frontend deploy

Before building, confirm `frontend/src/environments/environment.prod.ts` points to your real API domain.

Current production API URL in the repo:

```ts
https://api.darshanmistry.in/api
```

If your domain is different, update that file before deploy.

Then build and copy the frontend output:

```bash
cd /var/www/expenseflow/frontend
npm ci
npm run build
```

Publish this folder with Nginx:

```text
frontend/dist/frontend/browser
```

## 6. Nginx

Use `deploy/nginx.expenseflow.conf` as a starting point.

Suggested layout:

- `https://your-frontend-domain.com` -> Angular frontend
- `https://api.your-frontend-domain.com` -> backend

After editing the domains:

```bash
sudo cp deploy/nginx.expenseflow.conf /etc/nginx/sites-available/expenseflow
sudo ln -s /etc/nginx/sites-available/expenseflow /etc/nginx/sites-enabled/expenseflow
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Google sign-in production setup

In Google Cloud Console, update:

- Authorized JavaScript origins
- Authorized redirect / allowed production domains as needed

Make sure your production frontend domain matches:

- `frontend/src/environments/environment.prod.ts`
- `ALLOWED_ORIGINS`
- Google OAuth settings

## 8. SSL

After Nginx is working, add HTTPS with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-frontend-domain.com -d www.your-frontend-domain.com -d api.your-frontend-domain.com
```

## 9. Deploy checklist

- backend `.env` created with real secrets
- PostgreSQL database reachable
- Prisma migrations applied
- `backend/uploads` exists and is persistent
- frontend API URL updated if domain changed
- Google OAuth production origin updated
- Nginx configured
- SSL enabled

## 10. First commands I would run on a fresh VPS

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```
