Alembic migrations
==================

This repository includes Alembic scaffolding under `alembic/` and an initial
migration `alembic/versions/0001_initial_create_tables.py` which creates tables
based on the SQLAlchemy models in `backend/models.py`.

Quick start
-----------

1. Install Alembic in your Python environment:

```bash
pip install alembic
```

2. Set `DATABASE_URL` in your environment (or update `alembic.ini`):

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/mkchain
```

3. Run migrations:

```bash
alembic -c alembic.ini upgrade head
```

Notes
-----
- The initial migration uses `models.Base.metadata.create_all()` so it will
  reflect the current models as implemented in `backend/models.py`.
- For iterative schema changes, prefer generating proper Alembic revisions.
