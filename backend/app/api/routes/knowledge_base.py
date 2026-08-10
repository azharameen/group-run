import logging
import os
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from ...config import KNOWLEDGE_BASE_DIR
from ...storage.knowledge_base import (
    archive_knowledge_base_document,
    delete_knowledge_base_document,
    load_knowledge_base,
    save_knowledge_base_upload,
    SUPPORTED_BINARY_EXTENSIONS,
)
from ..schemas import KnowledgeBaseResponse, KnowledgeDocument

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge"])
logger = logging.getLogger(__name__)


@router.get("/", response_model=KnowledgeBaseResponse)
@router.get("", response_model=KnowledgeBaseResponse)
async def list_documents():
    """List all documents in the knowledge base."""
    try:
        docs = load_knowledge_base()
        return KnowledgeBaseResponse(
            documents=[KnowledgeDocument(**d) for d in docs],
            count=len(docs)
        )
    except Exception as e:
        logger.error(f"Error listing KB documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list documents: {str(e)}"
        )


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    source: str = "raw"
):
    """Upload a new document to the knowledge base."""
    # Validate file extension (Story 6.4 requirement)
    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = {".md", ".txt", ".pdf"} | SUPPORTED_BINARY_EXTENSIONS
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(allowed_exts))}"
        )

    try:
        content = await file.read()
        result = save_knowledge_base_upload(
            filename=file.filename,
            content=content,
            mime_type=file.content_type,
            source=source
        )
        return result
    except Exception as e:
        logger.error(f"Error uploading KB document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )


@router.get("/search", response_model=KnowledgeBaseResponse)
async def search_documents(q: str = Query(..., min_length=1)):
    """Simple lexical search across knowledge base documents."""
    try:
        docs = load_knowledge_base()
        query = q.lower()
        
        filtered = []
        for d in docs:
            # Search in filename
            if query in d.get("filename", "").lower():
                filtered.append(d)
                continue
            
            # Search in content (if string)
            content = d.get("content")
            if isinstance(content, str) and query in content.lower():
                filtered.append(d)
                continue
                
            # Search in sidecar metadata (if dict)
            if isinstance(content, dict):
                preview = content.get("preview", "")
                if query in preview.lower():
                    filtered.append(d)
                    continue
        
        return KnowledgeBaseResponse(
            documents=[KnowledgeDocument(**d) for d in filtered],
            count=len(filtered)
        )
    except Exception as e:
        logger.error(f"Error searching KB documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.get("/file/{path:path}")
async def get_document_file(path: str):
    """Retrieve raw document content or sidecar metadata."""
    full_path = os.path.join(KNOWLEDGE_BASE_DIR, path)
    
    # Path traversal protection
    if not os.path.abspath(full_path).startswith(os.path.abspath(KNOWLEDGE_BASE_DIR)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access outside knowledge base is forbidden"
        )
        
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found at {path}"
        )
        
    if os.path.isdir(full_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested path is a directory"
        )
        
    return FileResponse(full_path)


@router.delete("/{path:path}")
async def delete_document(path: str):
    """Delete a knowledge base document."""
    try:
        result = delete_knowledge_base_document(path)
        return result
    except ValueError as e:
        message = str(e)
        if "forbidden" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=message
            )
        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=message
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=message
        )


@router.patch("/{path:path}/archive")
async def archive_document(path: str):
    """Archive a knowledge base document."""
    try:
        result = archive_knowledge_base_document(path)
        return result
    except ValueError as e:
        message = str(e)
        if "forbidden" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=message
            )
        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=message
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=message
        )
