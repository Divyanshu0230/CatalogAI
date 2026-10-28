import logging

from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger("vitrine.catalog")


@shared_task
def scan_catalog():
    from .services import SCAN_KEY, scan_payload

    payload = scan_payload()
    cache.set(SCAN_KEY, payload, 60 * 60)
    logger.info(
        "Shelf scan stored %s duplicate pairs and %s price outliers",
        len(payload["near_duplicates"]),
        len(payload["price_outliers"]),
    )
    return {
        "duplicates": len(payload["near_duplicates"]),
        "outliers": len(payload["price_outliers"]),
    }
