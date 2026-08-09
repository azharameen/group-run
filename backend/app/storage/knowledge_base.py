"""Knowledge-base persistence helpers."""

from __future__ import annotations

import json
import mimetypes
import os
import re
from datetime import datetime, UTC
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..config import KNOWLEDGE_BASE_DIR
from .base import read_markdown, read_yaml, write_markdown

SUPPORTED_BINARY_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem.strip() or "upload"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem)
    return stem.strip("-") or "upload"


def _load_json_if_exists(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _extract_pdf_text(data: bytes) -> tuple[str, dict[str, Any]]:
    metadata: dict[str, Any] = {"mime_type": "application/pdf"}
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages[:8]]
        text = "\n\n".join(text.strip() for text in pages if text.strip())
        metadata["page_count"] = len(reader.pages)
        metadata["extracted"] = bool(text.strip())
        return text.strip(), metadata
    except Exception as exc:
        metadata["extracted"] = False
        metadata["warning"] = str(exc)
        return "", metadata


def _extract_image_text(data: bytes, filename: str) -> tuple[str, dict[str, Any]]:
    metadata: dict[str, Any] = {"mime_type": mimetypes.guess_type(filename)[0] or "image/*"}
    try:
        from PIL import Image

        with Image.open(BytesIO(data)) as image:
            metadata["dimensions"] = {"width": image.width, "height": image.height}
            metadata["mode"] = image.mode
            try:
                from pytesseract import image_to_string

                text = image_to_string(image).strip()
                metadata["ocr"] = bool(text)
                return text, metadata
            except Exception as exc:
                metadata["ocr"] = False
                metadata["warning"] = str(exc)
                return "", metadata
    except Exception as exc:
        metadata["warning"] = str(exc)
        return "", metadata


def save_knowledge_base_upload(
    filename: str,
    content: bytes,
    *,
    mime_type: str = "",
    source: str = "raw",
) -> dict[str, Any]:
    """Persist an uploaded knowledge file and generate an indexed companion note."""
    bucket = os.path.join(KNOWLEDGE_BASE_DIR, source, "uploads")
    os.makedirs(bucket, exist_ok=True)

    safe_name = f"{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}-{_safe_stem(filename)}"
    ext = Path(filename).suffix.lower() or mimetypes.guess_extension(mime_type or "") or ""
    binary_name = f"{safe_name}{ext}"
    binary_path = os.path.join(bucket, binary_name)
    with open(binary_path, "wb") as handle:
        handle.write(content)

    preview_text = ""
    metadata: dict[str, Any] = {
        "source": source,
        "filename": filename,
        "stored_filename": binary_name,
        "mime_type": mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        "byte_length": len(content),
        "stored_at": datetime.now(UTC).isoformat(),
        "path": os.path.relpath(binary_path, KNOWLEDGE_BASE_DIR).replace("\\", "/"),
    }

    if ext in {".md", ".txt"}:
        preview_text = content.decode("utf-8", errors="ignore").strip()
    elif ext == ".pdf" or metadata["mime_type"] == "application/pdf":
        preview_text, pdf_meta = _extract_pdf_text(content)
        metadata.update(pdf_meta)
    elif metadata["mime_type"].startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".webp"}:
        preview_text, image_meta = _extract_image_text(content, filename)
        metadata.update(image_meta)

    note_path = os.path.join(bucket, f"{safe_name}.json")
    metadata["preview"] = preview_text[:2000]
    with open(note_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, ensure_ascii=False)

    note_md = os.path.join(bucket, f"{safe_name}.md")
    note_lines = [
        f"# Knowledge-base ingest: {filename}",
        "",
        f"- Source: {source}",
        f"- Stored file: {binary_name}",
        f"- Mime type: {metadata['mime_type']}",
        f"- Bytes: {len(content)}",
    ]
    if metadata.get("page_count"):
        note_lines.append(f"- Pages: {metadata['page_count']}")
    if metadata.get("dimensions"):
        dims = metadata["dimensions"]
        note_lines.append(f"- Dimensions: {dims['width']} x {dims['height']}")
    if preview_text.strip():
        note_lines.extend(["", "## Extracted Text", preview_text.strip()])
    elif metadata.get("warning"):
        note_lines.extend(["", "## Extraction Notes", str(metadata["warning"])])
    write_markdown(note_md, "\n".join(note_lines))

    return {
        "source": source,
        "filename": filename,
        "stored_filename": binary_name,
        "mime_type": metadata["mime_type"],
        "path": metadata["path"],
        "note_path": os.path.relpath(note_md, KNOWLEDGE_BASE_DIR).replace("\\", "/"),
        "metadata_path": os.path.relpath(note_path, KNOWLEDGE_BASE_DIR).replace("\\", "/"),
    }


def _load_documents_from_dir(root: str, source: str) -> list[dict]:
    docs: list[dict] = []
    if not os.path.exists(root):
        return docs

    for dirpath, _, filenames in os.walk(root):
        for filename in sorted(filenames):
            if not filename.endswith((".md", ".yaml", ".yml", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".webp")):
                continue

            file_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(file_path, KNOWLEDGE_BASE_DIR).replace("\\", "/")
            if filename.endswith((".md", ".txt")):
                content = read_markdown(file_path)
            else:
                sidecar = os.path.splitext(file_path)[0] + ".json"
                content = _load_json_if_exists(sidecar) or {
                    "mime_type": mimetypes.guess_type(filename)[0] or "application/octet-stream",
                    "path": rel_path,
                    "filename": filename,
                }
                if isinstance(content, dict) and content.get("filename"):
                    filename = str(content["filename"])
            docs.append(
                {
                    "source": source,
                    "path": rel_path,
                    "filename": filename,
                    "content": content,
                }
            )
    return docs


def load_knowledge_base() -> list[dict]:
    docs: list[dict] = []
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "raw"), "raw"))
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "processed"), "processed"))
    return docs
