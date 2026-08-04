from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi import File, UploadFile
from services.file_storage import save_upload

from database import get_db
from dependencies import get_current_user
from models.company import CompanyOut

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _company_out(doc: dict) -> dict:
    return {
        "comp_id": str(doc["_id"]),
        "comp_name": doc.get("comp_name"),
        "comp_email": doc.get("comp_email"),
        "comp_industry": doc.get("comp_industry"),
        "comp_contact": doc.get("comp_contact"),
        "comp_website": doc.get("comp_website"),
        "comp_description": doc.get("comp_description"),
        "comp_logo": doc.get("comp_logo"),
        "created_at": doc.get("created_at"),
    }


@router.get("/{comp_id}", response_model=CompanyOut)
async def get_company(
    comp_id: str,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")
    
    company = await db.companies.find_one({"_id": ObjectId(comp_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Users can only fetch their own company
    if str(company["_id"]) != current_user.get("comp_id") and str(current_user.get("comp_id")) != comp_id:
        raise HTTPException(status_code=403, detail="Not authorised")
    
    return _company_out(company)


@router.put("/{comp_id}", response_model=CompanyOut)
async def update_company(
    comp_id: str,
    payload: dict,
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")

    # Only admin can update company profile
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update company profile")

    allowed_fields = {"comp_name", "comp_email", "comp_industry", "comp_contact", "comp_website", "comp_description"}
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    await db.companies.update_one(
        {"_id": ObjectId(comp_id)},
        {"$set": update_data}
    )

    company = await db.companies.find_one({"_id": ObjectId(comp_id)})
    return _company_out(company)


@router.patch("/{comp_id}/logo", response_model=CompanyOut)
async def update_company_logo(
    comp_id: str,
    logo: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")
    
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update logo")

    logo_path = await save_upload(logo, subdir="company_logos", key=comp_id)
    
    await db.companies.update_one(
        {"_id": ObjectId(comp_id)},
        {"$set": {"comp_logo": logo_path}}
    )

    company = await db.companies.find_one({"_id": ObjectId(comp_id)})
    return _company_out(company)