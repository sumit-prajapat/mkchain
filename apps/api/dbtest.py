from database import engine
from sqlalchemy import text, inspect
import models
from models import Base

print("=" * 50)
try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("[OK] DB connected")
except Exception as e:
    print(f"[FAIL] DB: {e}")
    exit(1)

existing = inspect(engine).get_table_names()
print(f"[INFO] Tables before: {existing}")

try:
    Base.metadata.create_all(bind=engine)
    print("[OK] create_all done")
except Exception as e:
    print(f"[FAIL] create_all: {e}")

existing2 = inspect(engine).get_table_names()
print(f"[INFO] Tables after: {existing2}")
print(f"[INFO] Models registered: {list(Base.metadata.tables.keys())}")
print("=" * 50)
