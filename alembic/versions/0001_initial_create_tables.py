"""Initial migration: create all tables from SQLAlchemy models.

This migration uses the SQLAlchemy model metadata to create tables. It is
intended as the initial migration only. Downgrade will drop all tables.

Run with:
  alembic -c alembic.ini upgrade head
Ensure `DATABASE_URL` env var is set when running.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Import models and create tables using the current bind
    try:
        from backend import models
        bind = op.get_bind()
        models.Base.metadata.create_all(bind=bind)
    except Exception:
        # If model import fails, raise to make the migration visible
        raise


def downgrade() -> None:
    try:
        from backend import models
        bind = op.get_bind()
        models.Base.metadata.drop_all(bind=bind)
    except Exception:
        raise
