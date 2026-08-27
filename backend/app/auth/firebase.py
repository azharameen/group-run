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
_using_dummy_credential = False


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
                elif os.environ.get("K_SERVICE") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                    # Use real Google Application Default Credentials in production/Cloud Run, or when explicitly set.
                    pass
                else:
                    # Fallback to dummy certificate locally to bypass Google ADC requirement.
                    global _using_dummy_credential
                    _using_dummy_credential = True
                    from firebase_admin import credentials
                    dummy_key = (
                        "-----BEGIN PRIVATE KEY-----\n"
                        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5TILWlTmEhfhz\n"
                        "BXBTzEgRpXGORfzDysqoDccftZ6LUBIe+BGqpduP68JH+6G8gyfujrcuBXL+olxh\n"
                        "QYPYa08ggobur5Ekr2YW9DlVHYw2IdTm4UPesbOnSNGscNsG3s25w0SUN8fGIDS0\n"
                        "AWINWjnN6kBIYq/tgqaRHv4Mjg7SvO8qrPs+U5CFJjzXSROdFIs2myg2cXxAYN6k\n"
                        "20n9OyAu2aYioHwbowclp8iyiSKnnv03hhoiB74JbDTUBngftUU4iaH7qRuaS4RC\n"
                        "FIIEnSSr2NAThAy2579Za3HlxeMWNxaItQRM7oCKXWgaeTTyq7rCwB222qc1xWTc\n"
                        "hkBjzwVfAgMBAAECggEAPUz7h+PMKHRtshedhotxWC0keQ3cRiWjj58nPe1Gqw3t\n"
                        "QMOOjKbcESvMlSXA5u1422npXdc9qNGrwBz9ci5l+fpUi0gXu0wveO6IvQjOZuYg\n"
                        "WdUyL80YAwKLIwIe45H3+zmHSYV+mKP064v9lS9BKkcRxyCm1OtBEYdwQlUIwFxi\n"
                        "btvlJjd+nZh1hf1b5nDw6ZL4wd3gN8ka0lgsjLaAwYdtOTkzC2PlOcsF8sy+i/D0\n"
                        "hXVDqKw4N8RqNa3GnJE9twFvc6r78ezaNJbGT8ekSac/6dFIjxYaeJkf2We5tGmN\n"
                        "sRzURACd6HWaecMy6NPXpgjgItUCvpf3Atkzvxfu+QKBgQDlwL9+0Ldl27HOI9Zx\n"
                        "iEfmjo4t2rxwJU348JwxXAWOjL2AxwNEMTeKoY/H3PhkPUUn0vTz7IzyRK0XTy04\n"
                        "sJuBCJckW/WxiZNr1ARp1dSATUg2qAgW+RKxv4OPb/DEINnj4lFlr3ft1lVDBf+g\n"
                        "8IEakuxj1OfIMib9UahFLaQg+wKBgQDOd638HStS2pXSpZNFQ6dZx06ElGBHm62X\n"
                        "ytuncZOud4qe2aGhnDIGAc5ZxV55kbYgvm/cwTZBGb3mPyAE2kGQ/JsrFnHH1I/a\n"
                        "io4F/hcCFSabmnzjZmaxZj2aMRH50m8n67qW9zzPvFabYDBc/yWN/iiAoZJ0m+SF\n"
                        "wp61lC7n7QKBgB0spqRx2HgEt8VXY6mzBn5OZ9uGxRrwgcA0vYC/EK2TTZUGsHF+\n"
                        "VnEyJtHYS2pfJWLzNMuspBE3i0tEcJecRYLTFm41hzNuJtwwZgcSchOAvMTD/ZL9\n"
                        "OdR8XzZdnpMpIMIBQRjKeU4oQ1dpcZZ8M8iuE3px1KTlSXItZlKygv71AoGAJgZ4\n"
                        "rqQYpIvJaCBCfVE2cxx344cILGgJkpkz1yTd1BYEG7ltQTxpIh4XCQWGntEtP96S\n"
                        "749OFLNO/CbIGNyxkqhTU54wmmMVk2RNP+FKD4IhuCq9sYvcgfOYiNtcuiv9eNa7\n"
                        "aK5kLsY7FSakAZykKACVKQuY040ai2AKptqBwQkCgYEAp0gh4cX+DKP3dC6W6//8\n"
                        "tpj+FOsGO7ER9e4CVTuTqB4QccYp/yIu3/VGXl0Stn1EI1kPHdF4Amwc4OHUDkCu\n"
                        "6cYbl6tDmQKxbGChdZYd7JazcljenmW4rbs89+pEplyrKUocn8eDk8alFxSFyxX+\n"
                        "Vt9+0SiU3jxL87yE9R87m5k=\n"
                        "-----END PRIVATE KEY-----\n"
                    )
                    dummy_info = {
                        "type": "service_account",
                        "project_id": project_id,
                        "private_key_id": "dummy",
                        "private_key": dummy_key,
                        "client_email": f"dummy@{project_id}.iam.gserviceaccount.com",
                        "token_uri": "https://oauth2.googleapis.com/token",
                    }
                    credential = credentials.Certificate(dummy_info)
                return firebase_admin.initialize_app(
                    credential=credential,
                    options=options,
                    name=_APP_NAME,
                )


def verify_firebase_token(token: str) -> dict:
    check_revoked = not (_using_dummy_credential or bool(os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")))
    return auth.verify_id_token(
        token,
        app=get_firebase_app(),
        check_revoked=check_revoked,
    )


def get_firestore_client():
    global _firestore_client
    if _firestore_client is None:
        with _FIRESTORE_LOCK:
            if _firestore_client is None:
                _firestore_client = firestore.client(app=get_firebase_app())
    return _firestore_client
