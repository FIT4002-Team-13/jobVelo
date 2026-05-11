"""Company model.

A company is created together with its first admin via /api/auth/signup-company
(multipart, because the logo file comes along). All invitations and users are
scoped to a single company via comp_id.

comp_logo stores the *relative path* under settings.uploads_dir (e.g.
"company_logos/68f3a4...png"). Fetch the binary via GET /api/files/{path}.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CompanyOut(BaseModel):
    comp_id: str
    comp_name: str
    comp_email: EmailStr
    comp_industry: str
    comp_contact: str
    comp_website: str | None = None
    comp_description: str | None = None
    comp_logo: str | None = None
    created_at: datetime
