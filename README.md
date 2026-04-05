## CI/CD Pipeline

This repository includes a GitHub Actions workflow at `.github/workflows/ci-cd.yml`.

### What it does

- Builds the backend on every push and pull request to `main`
- Builds the frontend on every push and pull request to `main`
- Deploys the frontend and backend to your server on pushes to `main`
- Restarts the backend with `pm2` after deployment

### GitHub Secrets required

Add these in `GitHub -> Settings -> Secrets and variables -> Actions`:

- `SERVER_HOST`: your server IP or hostname
- `SERVER_PORT`: SSH port, usually `22`
- `SERVER_USER`: SSH username used by GitHub Actions
- `SERVER_SSH_KEY`: private SSH key for that server user
- `FRONTEND_DEPLOY_PATH`: frontend web root on the server
- `BACKEND_DEPLOY_PATH`: backend app folder on the server
- `BACKEND_UPLOADS_PATH`: backend uploads folder on the server
- `BACKEND_PORT`: port your backend should run on, for example `3000`
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: production JWT secret
- `CORS_ORIGINS`: comma-separated frontend origins, for example `https://darshanmistry.in,https://www.darshanmistry.in`
- `PM2_APP_NAME`: process name used by `pm2`, for example `expenseflow-api`

### Suggested values for your server

Based on your CloudPanel setup, a typical starting point would be:

- `FRONTEND_DEPLOY_PATH=/home/darshan/htdocs/darshanmistry.in`
- `BACKEND_DEPLOY_PATH=/home/darshan/apps/expenseflow-api`
- `BACKEND_UPLOADS_PATH=/home/darshan/apps/expenseflow-api/uploads`
- `PM2_APP_NAME=expenseflow-api`

### Frontend production API URL

The frontend now uses environment files:

- local development: `http://localhost:5000/api`
- production: `https://api.darshanmistry.in/api`

If your production API domain is different, update:

- `frontend/src/environments/environment.production.ts`

### Backend production environment

Use `backend/.env.example` as the template for your production environment values.
