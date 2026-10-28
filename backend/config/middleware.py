import logging
import time

logger = logging.getLogger("vitrine.request")


class RequestLogMiddleware:
    """Log API method, path, status, and duration. Bodies stay out of the log."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        response = self.get_response(request)
        path = request.path
        if path.startswith("/api/") and path != "/api/health/":
            elapsed = (time.perf_counter() - started) * 1000
            logger.info("%s %s %s %.0fms", request.method, path, response.status_code, elapsed)
        return response
