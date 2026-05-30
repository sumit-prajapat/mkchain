from dataclasses import dataclass
from typing import Optional
from uuid import UUID


@dataclass(frozen=True)
class AuthContext:
    user_id: UUID
    email: str
    org_id: UUID
    org_slug: str
    org_plan: str
    role: str

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"

    @property
    def is_admin(self) -> bool:
        return self.role in ("owner", "admin")


@dataclass
class RequestContext:
    request_id: str
    auth: Optional[AuthContext] = None
