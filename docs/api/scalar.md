# Companion API Reference

The full REST API for Companion, served live from GCP Cloud Run.

The interactive reference is generated from the FastAPI OpenAPI schema. The
schema is available for client generation and contract testing at
[`openapi.json`]({{ openapi_url }}).

!!! info "Live API"
    The backend-hosted Scalar UI is available at [`/scalar`]({{ scalar_url }}).
    The embedded reference below uses the same live OpenAPI schema.

!!! tip "Health Check"
    Verify the backend is running: [`/api/health`]({{ backend_url }}/api/health)

!!! warning "If the reference doesn't load"
    The embed pulls the OpenAPI schema live from Cloud Run. If the service is cold-starting or
    unreachable, open the [live Scalar UI]({{ scalar_url }}) directly, or check the
    [`/api/health`]({{ backend_url }}/api/health) endpoint.

<div id="app"></div>
