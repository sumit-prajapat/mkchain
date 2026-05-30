# Run migrations helper
# Attempts to start DB via docker-compose then runs alembic upgrade head.
# If docker isn't available, tries to run alembic directly (requires DATABASE_URL env var).

$ErrorActionPreference = 'Stop'

Write-Host "Starting migration helper..."

# Try to start DB via docker-compose
try {
    Write-Host "Attempting to start Postgres via docker-compose..."
    docker-compose up -d db | Out-Null
    Write-Host "Waiting 5 seconds for DB to initialize..."
    Start-Sleep -Seconds 5
    $env:DATABASE_URL = "postgresql://mkchain:mkchain123@localhost:5432/mkchain"
    Write-Host "Running alembic migrations..."
    python -m alembic -c alembic.ini upgrade head
    Write-Host "Migrations applied (via docker-compose path)."
    exit 0
} catch {
    Write-Warning "Docker compose start failed or docker not running: $_"
}

# Fallback: run alembic if DATABASE_URL is set
if ($env:DATABASE_URL) {
    try {
        Write-Host "Running alembic using existing DATABASE_URL..."
        python -m alembic -c alembic.ini upgrade head
        Write-Host "Migrations applied."
        exit 0
    } catch {
        Write-Error "Alembic failed: $_"
        exit 1
    }
} else {
    Write-Warning "No DATABASE_URL set and docker-compose start failed."
    Write-Host "Please either start Postgres (e.g. via Docker) or set DATABASE_URL and rerun this script."
    Write-Host "Example: $env:DATABASE_URL='postgresql://mkchain:mkchain123@localhost:5432/mkchain'; .\\scripts\\run_migrations.ps1"
    exit 1
}
