"""Firebase Admin initialization and client access."""

from __future__ import annotations

import os
import threading

import firebase_admin
from firebase_admin import auth, firestore
from google.auth.credentials import AnonymousCredentials

from ..config import settings

_APP_NAME = "ideator-backend-auth"
_INIT_LOCK = threading.Lock()
_FIRESTORE_LOCK = threading.Lock()
_firestore_client = None


def get_firebase_project_id() -> str:
    project_id = (
        settings.firebase_project_id
        or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        or os.environ.get("GCLOUD_PROJECT", "")
    ).strip()
    if not project_id:
        raise RuntimeError("Firebase project ID is not configured")
    return project_id


def get_firebase_app():
    project_id = get_firebase_project_id()
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
    os.environ.setdefault("GCLOUD_PROJECT", project_id)

    try:
        return firebase_admin.get_app(_APP_NAME)
    except ValueError:
        with _INIT_LOCK:
            try:
                return firebase_admin.get_app(_APP_NAME)
            except ValueError:
                options = {"projectId": project_id}
                credential = None
                if os.environ.get("FIRESTORE_EMULATOR_HOST") or os.environ.get(
                    "FIREBASE_AUTH_EMULATOR_HOST"
                ):
                    credential = AnonymousCredentials()
                return firebase_admin.initialize_app(
                    credential=credential,
                    options=options,
                    name=_APP_NAME,
                )


def verify_firebase_token(token: str) -> dict:
    return auth.verify_id_token(
        token,
        app=get_firebase_app(),
        check_revoked=True,
    )


def get_firestore_client():
    global _firestore_client
    if _firestore_client is None:
        with _FIRESTORE_LOCK:
            if _firestore_client is None:
                _firestore_client = firestore.client(app=get_firebase_app())
    return _firestore_client
