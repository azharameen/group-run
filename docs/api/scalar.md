# Companion API Reference

The full REST API for Companion, served live from GCP Cloud Run.

!!! info "Live API"
    The backend-hosted Scalar UI is available at [`/scalar`](https://backend-service-601546984807.asia-south1.run.app/scalar).
    The embedded reference below uses the same live OpenAPI schema.

!!! tip "Health Check"
    Verify the backend is running: [`/api/health`](https://backend-service-601546984807.asia-south1.run.app/api/health)

<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.66.1" crossorigin="anonymous"></script>
<script>
  Scalar.createApiReference("#app", {
    url: "https://backend-service-601546984807.asia-south1.run.app/openapi.json"
  });
</script>
