import asyncio
import sys

from .api.app import create_app

if sys.platform == "win32":
    # psycopg's async driver requires a Selector event loop on Windows.
    # Keep that even under uvicorn >= 0.36, whose get_loop_factory()
    # hardcodes ProactorEventLoop on Windows and ignores the policy.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        from uvicorn.loops import asyncio as _uvicorn_loops
    except ImportError:  # pragma: no cover
        pass
    else:
        _uvicorn_loops.asyncio_loop_factory = (
            lambda use_subprocess=False: asyncio.SelectorEventLoop
        )

app = create_app()
