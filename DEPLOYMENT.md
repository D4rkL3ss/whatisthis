# Deployment Guide for Render.com

## Overview
This guide walks you through deploying "The Fractured Abyss" on Render.com. The app includes both a React frontend and Node.js/Express backend served together.

## Prerequisites
- GitHub account with your code pushed
- Render.com account (free tier available)

## Step-by-Step Setup

### 1. Push Your Code to GitHub
```powershell
git add .
git commit -m "Ready for deployment"
git push
```

### 2. Create a New Web Service on Render

1. Go to [render.com](https://render.com) and log in
2. Click **"New +"** → **"Web Service"**
3. Select **"Connect a repository"** and choose your GitHub repo
4. Fill in the settings:
   - **Name**: `fractured-abyss` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free (or Paid if you want better performance)

### 3. Configure Environment Variables

In the Render dashboard, scroll to **"Environment"** and add:

```
NODE_ENV=production
VITE_API_URL=/api
```

### 4. Deploy

Click **"Create Web Service"** and Render will:
1. Clone your repo
2. Run `npm install && npm run build`
3. Start the server with `npm start`
4. Give you a URL like `https://fractured-abyss.onrender.com`

## How It Works

- **Frontend**: Built React app is served from the `/dist` folder
- **Backend**: Express server runs on the same service and serves:
  - Static files from `dist/`
  - API endpoint at `/api/validate-code`
  - Falls back to `index.html` for SPA routing

## Updating After Deployment

Every time you push to GitHub, Render automatically rebuilds and deploys. Just:

```powershell
git add .
git commit -m "Your changes"
git push
```

## Free Tier Limitations
- 0.5 GB RAM / 0.5 CPU
- Spins down after 15 minutes of inactivity (cold starts take ~30 seconds)
- No SSL certificate concerns (included)

For production, consider upgrading to a paid plan.

## Adding More Secret Codes

Edit `server.js` in the `validCodes` object:

```javascript
const validCodes = {
  'The First Fragment': { shardNumber: 1, fragmentComponent: 'FirstFragment' },
  "He's Always Watching": { shardNumber: 2, fragmentComponent: 'SecondFragment' },
  'New Code': { shardNumber: 3, fragmentComponent: 'NewComponent' }
};
```

Then push to GitHub - it will redeploy automatically.

## Troubleshooting

**"Cannot find module"** → Run `npm install` locally and commit `package-lock.json`

**API not responding** → Check that the API URL in your app matches your Render URL

**CORS errors** → Already configured in `server.js` with `cors()` middleware

**Cold start delays** → Free tier apps sleep after 15 minutes - normal on Render

