from fastapi import APIRouter, Depends

from core.context import AuthContext
from core.dependencies import require_auth

router = APIRouter()


@router.get("/me")
def get_current_user(auth: AuthContext = Depends(require_auth)):
    return {
        "user_id": str(auth.user_id),
        "email": auth.email,
        "organization": {
            "id": str(auth.org_id),
            "slug": auth.org_slug,
            "plan": auth.org_plan,
        },
        "role": auth.role,
    }
