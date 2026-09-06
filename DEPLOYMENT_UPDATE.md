# 🚀 DEPLOYMENT UPDATE - HuggingFace Backend

## Current Status
- ✅ Frontend: Deployed on Vercel (https://mkchain.vercel.app)
- ✅ Database: Supabase (connected)
- ⚠️  Backend: HuggingFace Spaces (needs update with graph fixes)

## HuggingFace Backend URL
```
https://mk1311-mk1311-mkchain-api.hf.space
```

## What Needs to be Updated

The HuggingFace backend is running **old code (v1.0.0)** without the graph visualization fixes.
It needs to be updated with the latest code (v2.0.0) that includes:

1. Enhanced blockchain service with logging and demo data fallback
2. Improved error handling
3. Multi-tenancy support
4. Billing system
5. Better graph building

## How to Update HuggingFace Spaces

### Option 1: Auto-Deploy from GitHub (RECOMMENDED)

If your HuggingFace Space is connected to your GitHub repo:

1. **Push to GitHub** (In progress...)
   ```bash
   git push origin main
   ```

2. **HuggingFace will auto-deploy** within 2-5 minutes
   - Go to: https://huggingface.co/spaces/mk1311/mkchain-api
   - Check "Building" status
   - Wait for deployment to complete

3. **Verify deployment:**
   ```bash
   curl https://mk1311-mk1311-mkchain-api.hf.space
   ```
   Should return: `"version":"2.0.0"` (not 1.0.0)

### Option 2: Manual Deploy (if auto-deploy is not set up)

1. **Go to HuggingFace Space settings:**
   https://huggingface.co/spaces/mk1311/mkchain-api/settings

2. **Connect to GitHub:**
   - Repository: sumit-prajapat/mkchain
   - Branch: main
   - Path: backend/

3. **Or manually upload files:**
   - Upload all files from `d:\projects\mkchain\backend\` directory
   - HuggingFace will automatically detect Dockerfile and rebuild

## Environment Variables on HuggingFace

Make sure these are set in HuggingFace Space Settings → Variables:

```bash
DATABASE_URL=<your-supabase-connection-string>
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>
ETHERSCAN_API_KEY=<your-etherscan-key>
BLOCKCYPHER_TOKEN=<your-blockcypher-token>
OPENROUTER_API_KEY=<your-openrouter-key>
RESEND_API_KEY=<your-resend-key>
DEMO_MODE=true
BILLING_ENABLED=false
FRONTEND_URL=https://mkchain.vercel.app
```

**NOTE:** Copy your actual API keys from `backend/.env` file

## Frontend Update

✅ **Already updated!** Frontend `.env` now points to HuggingFace:
```
VITE_API_URL=https://mk1311-mk1311-mkchain-api.hf.space
```

When you push this to GitHub, Vercel will auto-redeploy the frontend.

## Testing After Deployment

1. **Wait for HuggingFace build** (2-5 minutes)

2. **Check backend health:**
   ```bash
   curl https://mk1311-mk1311-mkchain-api.hf.space
   ```
   Should show: `"version":"2.0.0"` and `"demo_mode":"true"`

3. **Test from frontend:**
   - Go to https://mkchain.vercel.app
   - Analyze this address: `0x28c6c06298d514db089934071355e5743bf21d60`
   - Should see **transaction graph with nodes and edges**

## Troubleshooting

**If graph still doesn't show:**
1. Open browser DevTools (F12) → Network tab
2. Check if `/api/analyze` request succeeds
3. Look at response - should include `"graph": { "nodes": [...], "edges": [...] }`

**If backend shows 502 error:**
- HuggingFace Space might be sleeping (free tier)
- Wait 10-20 seconds for it to wake up
- Refresh and try again

**If version still shows 1.0.0:**
- HuggingFace hasn't pulled latest code yet
- Check HuggingFace Space logs for build errors
- May need to manually trigger rebuild

---

## Summary

1. ✅ Code pushed to GitHub
2. ✅ Frontend updated to use HuggingFace backend
3. ⏳ Waiting for HuggingFace to auto-deploy (2-5 min)
4. ⏳ Waiting for Vercel to auto-deploy frontend (1-2 min)

**Check back in 5 minutes and test the graph visualization!** 🎉
