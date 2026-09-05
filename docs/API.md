# API Documentation

## Base URL

Production: https://mk1311-mk1311-mkchain-api.hf.space
Local: http://localhost:8000

## Authentication

All protected endpoints require JWT token from Supabase in Authorization header.

## Endpoints

### POST /api/analyze
Run forensic analysis on blockchain address.

### GET /api/analyses
List past analyses.

### GET /api/analyses/{id}
Get specific analysis results.

### GET /api/reports/{id}/pdf
Download PDF report.

### GET /api/darkweb/stats
Get OSINT database statistics.

### POST /api/compare
Compare two wallet addresses.

### POST /api/alerts/watch
Add address to watchlist.

### GET /api/alerts/stream
SSE event stream for real-time alerts.

