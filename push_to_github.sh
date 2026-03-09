#!/bin/bash
# Run this script ONCE on your local machine (D:\projects\mkchain)
# After extracting the ZIP

echo "🔗 MKChain — Push to GitHub"
echo "================================"

# Set your GitHub username
GITHUB_USER="sumit-prajapat"
REPO_NAME="mkchain"

git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git
git branch -M main
git push -u origin main

echo ""
echo "✅ Pushed to https://github.com/$GITHUB_USER/$REPO_NAME"
