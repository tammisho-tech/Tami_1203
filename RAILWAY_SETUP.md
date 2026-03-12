# Railway Full Deployment — Two Services, Two Environments

## Architecture

| Environment | Branch | Services |
|-------------|--------|----------|
| **PRODUCTION** | `main` | BACKEND + FRONTEND |
| **STAGING** | `DEV` | BACKEND + FRONTEND |

---

## Prerequisites

1. **Railway CLI** (installed): `railway --version`
2. **Login**: Run `railway login` and complete browser auth
3. **GitHub**: Repo linked at `origin`

---

## Step 1: Login to Railway (Run in Terminal)

**You must run this yourself** — it opens a browser for authentication:

```powershell
railway login
```

Complete the browser authentication. If you get "Error authenticating with GitHub", try:
- Incognito window
- Different browser
- Revoke Railway from GitHub Settings → Applications → Authorized OAuth Apps, then retry

---

## Step 2: Create Project (Dashboard)

Railway's two-service + two-environment setup is easiest via the **Dashboard**:

1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → Select **Tami_1203**
3. **Add PostgreSQL** (optional): + New → Database → PostgreSQL

---

## Step 3: Add Second Service & Configure (Dashboard)

### Service 1: BACKEND (auto-created from repo)

1. Click the service → **Settings**
2. **Root Directory**: `backend`
3. **Build Command**: `pip install -r requirements.txt` (or leave default)
4. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Variables**: Add `ANTHROPIC_API_KEY`, `SECRET_KEY`; `DATABASE_URL` if using PostgreSQL

### Service 2: FRONTEND

1. **+ New** → **GitHub Repo** → Select **Tami_1203** again
2. **Root Directory**: `frontend`
3. **Build Command**: `npm ci && npm run build`
4. **Start Command**: `npx serve -s dist -l $PORT`
5. **Variables**: Add `VITE_API_URL` = Backend public URL (e.g. `https://your-backend.up.railway.app/api`)

---

## Step 4: Environments & Branch Triggers

1. **Settings** → **Environments**
2. Create **production** (or use default)
3. Create **staging**
4. For each service, set **Deploy**:
   - BACKEND production → branch `main`
   - BACKEND staging → branch `DEV`
   - FRONTEND production → branch `main`
   - FRONTEND staging → branch `DEV`

---

## Step 5: Generate Domains

For each service: **Settings** → **Networking** → **Generate Domain**

---

## Environment Variables Summary

### BACKEND (both environments)
| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SECRET_KEY` | Random 32+ char string |
| `DATABASE_URL` | Auto from PostgreSQL (if added) |

### FRONTEND (both environments)
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<backend-domain>/api` |

---

## CLI Alternative (Single Service Deploy)

To deploy from CLI (one service at a time):

```powershell
# Deploy backend to current environment
cd backend
railway up

# Deploy frontend (from another terminal or after switching)
cd frontend
railway up
```

---

## Note: Single-Service Option

If the two-service setup is complex, you can use the **original single-service** deployment (backend serves frontend). Restore `railway.json` and `nixpacks.toml` at project root from git history.
