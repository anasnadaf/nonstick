from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException

from app.config import get_settings

DEV_USER_ID = "dev"


@dataclass(frozen=True)
class User:
    id: str
    username: str


async def require_user(
    authorization: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),
) -> User:
    """Resolve the caller.

    With AUTH_URL set, the bearer token is validated against the external auth
    service (`GET {AUTH_URL}/auth/me`). Without it the app runs in dev mode as a
    fixed local user; the X-Dev-User header lets local tooling and tests exercise
    multi-user isolation.
    """
    settings = get_settings()
    if not settings.auth_url:
        uid = x_dev_user or DEV_USER_ID
        return User(id=uid, username=uid)

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(
                f"{settings.auth_url.rstrip('/')}/auth/me",
                headers={"Authorization": authorization},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="Auth service unavailable") from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid token")

    data = resp.json()
    # portfolio-auth answers /auth/me with {"email": ...} and nothing else, so
    # email has to be an accepted identifier — it is the JWT subject there, and
    # unique in the users table, which makes it a stable scoping key.
    uid = str(
        data.get("id") or data.get("user_id") or data.get("sub") or data.get("email") or ""
    )
    if not uid:
        raise HTTPException(status_code=401, detail="Auth service returned no user id")
    return User(id=uid, username=str(data.get("username") or data.get("email") or uid))
