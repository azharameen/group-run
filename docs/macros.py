"""Shared values for MkDocs macros."""


def define_env(env):
    env.variables["backend_url"] = (
        "https://backend-service-601546984807.asia-south1.run.app"
    )
    env.variables["openapi_url"] = (
        "https://backend-service-601546984807.asia-south1.run.app/openapi.json"
    )
    env.variables["scalar_url"] = (
        "https://backend-service-601546984807.asia-south1.run.app/scalar"
    )
