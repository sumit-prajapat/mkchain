from fastapi import APIRouter

from api.v1 import me

router = APIRouter(prefix="/api/v1")
router.include_router(me.router, tags=["Auth"])
