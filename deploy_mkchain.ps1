# ============================================================
# MKChain — HuggingFace Deploy Script
# Username: mk1311
# Run this in PowerShell from D:\projects\mkchain
# ============================================================

$HF_USER = "mk1311"

# ── Step 1: Clean up broken hf_deploy ───────────────────────
Write-Host ""
Write-Host "STEP 1: Cleaning up old hf_deploy..." -ForegroundColor Cyan
Set-Location D:\projects\mkchain
Remove-Item -Recurse -Force hf_deploy -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green

# ── Step 2: Clone HuggingFace Space ─────────────────────────
Write-Host ""
Write-Host "STEP 2: Cloning HuggingFace Space..." -ForegroundColor Cyan
git clone "https://huggingface.co/spaces/$HF_USER/mk1311-mkchain-api" hf_deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Space not found!" -ForegroundColor Red
    Write-Host "Please create it first at: https://huggingface.co/new-space" -ForegroundColor Yellow
    Write-Host "  Space name : mk1311-mkchain-api" -ForegroundColor Yellow
    Write-Host "  SDK        : Docker" -ForegroundColor Yellow
    Write-Host "  Visibility : Public" -ForegroundColor Yellow
    Write-Host "Then run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "Done." -ForegroundColor Green

# ── Step 3: Copy all backend files ──────────────────────────
Write-Host ""
Write-Host "STEP 3: Copying backend files into hf_deploy..." -ForegroundColor Cyan

# Root files
Copy-Item -Force backend\main.py           hf_deploy\main.py
Copy-Item -Force backend\models.py         hf_deploy\models.py
Copy-Item -Force backend\schemas.py        hf_deploy\schemas.py
Copy-Item -Force backend\database.py       hf_deploy\database.py
Copy-Item -Force backend\requirements.txt  hf_deploy\requirements.txt
Copy-Item -Force backend\Dockerfile        hf_deploy\Dockerfile
Copy-Item -Force backend\.env.example      hf_deploy\.env.example

# Subdirectories
New-Item -ItemType Directory -Force -Path hf_deploy\routes   | Out-Null
New-Item -ItemType Directory -Force -Path hf_deploy\services | Out-Null
New-Item -ItemType Directory -Force -Path hf_deploy\ml       | Out-Null

Copy-Item -Force backend\routes\__init__.py  hf_deploy\routes\__init__.py
Copy-Item -Force backend\routes\analysis.py  hf_deploy\routes\analysis.py
Copy-Item -Force backend\routes\reports.py   hf_deploy\routes\reports.py
Copy-Item -Force backend\routes\osint.py     hf_deploy\routes\osint.py

Copy-Item -Force backend\services\__init__.py   hf_deploy\services\__init__.py
Copy-Item -Force backend\services\blockchain.py hf_deploy\services\blockchain.py
Copy-Item -Force backend\services\graph.py      hf_deploy\services\graph.py
Copy-Item -Force backend\services\darkweb.py    hf_deploy\services\darkweb.py
Copy-Item -Force backend\services\ai_summary.py hf_deploy\services\ai_summary.py
Copy-Item -Force backend\services\pdf_report.py hf_deploy\services\pdf_report.py

Copy-Item -Force backend\ml\__init__.py     hf_deploy\ml\__init__.py
Copy-Item -Force backend\ml\risk_scorer.py  hf_deploy\ml\risk_scorer.py
Copy-Item -Force backend\ml\risk_model.pkl  hf_deploy\ml\risk_model.pkl

Write-Host "Done." -ForegroundColor Green

# ── Step 4: Verify structure ─────────────────────────────────
Write-Host ""
Write-Host "STEP 4: Verifying file structure..." -ForegroundColor Cyan
Write-Host "hf_deploy\" -ForegroundColor White
Get-ChildItem hf_deploy -Recurse -Name | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host "Done." -ForegroundColor Green

# ── Step 5: Commit and push to HuggingFace ──────────────────
Write-Host ""
Write-Host "STEP 5: Pushing to HuggingFace..." -ForegroundColor Cyan
Set-Location hf_deploy
git add .
git commit -m "deploy: MKChain backend Phase 6 complete - all files"
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " SUCCESS! Backend pushed to HuggingFace" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your API URL:" -ForegroundColor Yellow
    Write-Host "  https://mk1311-mk1311-mkchain-api.hf.space" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Wait 3-5 min for Docker build, then test:" -ForegroundColor Yellow
    Write-Host "  https://mk1311-mk1311-mkchain-api.hf.space/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next: Set up Vercel for frontend deployment." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Push failed. Try running: git push" -ForegroundColor Red
    Write-Host "If it asks for login, use your HuggingFace username + token" -ForegroundColor Yellow
    Write-Host "Get token at: https://huggingface.co/settings/tokens" -ForegroundColor Cyan
}

Set-Location ..
