# Interactive API Reference

The full REST API for the Group Run backend, served live from GCP Cloud Run.

!!! info "Live API"
    Scalar connects to the **live backend** at `https://backend-service-601546984807.asia-south1.run.app`.
    You can inspect all endpoints, schemas, and try requests directly from this page.

!!! tip "Health Check"
    Verify the backend is running: [`/api/health`](https://backend-service-601546984807.asia-south1.run.app/api/health)

<script
  src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
  crossorigin="anonymous"
></script>
<scalar-api-reference
  configuration='{"url":"https://backend-service-601546984807.asia-south1.run.app/openapi.json"}'
></scalar-api-reference>
