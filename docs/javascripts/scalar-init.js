/* Initializes the Scalar API reference embed on docs/api/scalar.md.
 *
 * Material's `navigation.instant` feature swaps page content via history.pushState
 * instead of a full page load, so inline <script> tags in markdown never re-run
 * when a user clicks into this page from elsewhere in the nav (only a hard
 * refresh would trigger them). We hook into Material's `document$` observable
 * (fired on every instant-navigation as well as the first load) and (re)create
 * the Scalar reference whenever the #app mount point is present on the page.
 */
(function () {
  var OPENAPI_URL = "https://backend-service-601546984807.asia-south1.run.app/openapi.json";
  var SCALAR_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.66.1";
  var MAX_RETRIES = 50; // ~5s at 100ms intervals, in case the Scalar CDN bundle is still loading
  var scalarLoadStarted = false;

  function loadScalar() {
    if (scalarLoadStarted || typeof window.Scalar !== "undefined") {
      return;
    }
    scalarLoadStarted = true;
    var script = document.createElement("script");
    script.src = SCALAR_SCRIPT;
    script.crossOrigin = "anonymous";
    script.async = true;
    document.head.appendChild(script);
  }

  function initScalar(retriesLeft) {
    var el = document.getElementById("app");
    if (!el) {
      return; // Not on the API reference page.
    }
    loadScalar();
    if (typeof window.Scalar === "undefined") {
      if (retriesLeft > 0) {
        setTimeout(function () {
          initScalar(retriesLeft - 1);
        }, 100);
      } else {
        el.innerHTML =
          '<p><strong>⚠️ Unable to load the Scalar API reference bundle.</strong> ' +
          'Check your connection or view it directly at ' +
          '<a href="' + OPENAPI_URL.replace("/openapi.json", "/scalar") + '">the live backend</a>.</p>';
      }
      return;
    }
    if (el.dataset.scalarInitialized === "true") {
      return;
    }
    el.innerHTML = "";
    window.Scalar.createApiReference(el, { url: OPENAPI_URL });
    el.dataset.scalarInitialized = "true";
  }

  if (window.document$) {
    // Material for MkDocs instant-navigation hook — fires on first load too.
    document$.subscribe(function () {
      initScalar(MAX_RETRIES);
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      initScalar(MAX_RETRIES);
    });
  }
})();
