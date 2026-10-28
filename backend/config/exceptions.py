import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("vitrine.request")


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error")
        return Response({"detail": "Something went wrong on the server."}, status=500)

    data = response.data
    if isinstance(data, dict) and "detail" not in data:
        response.data = {"detail": "Check the highlighted fields.", "errors": data}
    elif isinstance(data, list):
        response.data = {"detail": " ".join(str(item) for item in data)}
    return response
