import logging

from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Max, Min
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .filters import ProductFilter, base_queryset, list_queryset
from .models import Activity, Collection, Product
from .pagination import StandardPagination
from .serializers import ActivitySerializer, CollectionSerializer, ProductSerializer
from .services import SCAN_KEY, import_csv, log_activity, scan_payload

logger = logging.getLogger("vitrine.catalog")


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    database = True
    try:
        connection.ensure_connection()
    except Exception:
        logger.exception("Database health check failed")
        database = False
    body = {"status": "ok" if database else "degraded", "database": database, "app": "vitrine"}
    return Response(body, status=200 if database else 503)


@extend_schema(tags=["Products"])
class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    filterset_class = ProductFilter
    ordering_fields = ["price", "name", "created_at", "completeness"]
    ordering = ["-created_at"]

    def get_queryset(self):
        if self.action == "list":
            return list_queryset(self.request.query_params)
        return base_queryset()

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        phrase = (self.request.query_params.get("q") or "").strip()
        ordering = (self.request.query_params.get("ordering") or "").strip()
        annotations = getattr(queryset.query, "annotations", {})
        if phrase and ordering in {"", "relevance"} and "sim" in annotations:
            queryset = queryset.order_by("-sim", "-created_at")
        return queryset.distinct()

    def perform_create(self, serializer):
        product = serializer.save()
        log_activity(
            self.request.user,
            "created",
            f"Added {product.sku} · {product.name}",
            {"id": product.id, "sku": product.sku},
        )

    def perform_update(self, serializer):
        product = serializer.save()
        log_activity(
            self.request.user,
            "updated",
            f"Revised {product.sku} · {product.name}",
            {"id": product.id, "sku": product.sku},
        )

    def perform_destroy(self, instance):
        meta = {"id": instance.id, "sku": instance.sku}
        summary = f"Removed {instance.sku} · {instance.name}"
        super().perform_destroy(instance)
        log_activity(self.request.user, "deleted", summary, meta)

    @action(detail=False, methods=["get"])
    def facets(self, request):
        active = Product.objects.filter(status=Product.Status.ACTIVE)
        category = (request.query_params.get("category") or "").strip()
        brand = (request.query_params.get("brand") or "").strip()
        brand_rows = active.filter(category__name__iexact=category) if category else active
        category_rows = active.filter(brand__name__iexact=brand) if brand else active
        categories = [
            {"name": row["category__name"], "count": row["count"]}
            for row in category_rows.values("category__name").annotate(count=Count("id")).order_by("category__name")
        ]
        brands = [
            {"name": row["brand__name"], "count": row["count"]}
            for row in brand_rows.values("brand__name").annotate(count=Count("id")).order_by("brand__name")
        ]
        prices = active.aggregate(min=Min("price"), max=Max("price"))
        return Response(
            {
                "categories": categories,
                "brands": brands,
                "price": {
                    "min": str(prices["min"] or 0),
                    "max": str(prices["max"] or 0),
                },
            }
        )

    @action(detail=False, methods=["get"])
    def compare(self, request):
        raw_ids = []
        for part in (request.query_params.get("ids") or "").split(","):
            part = part.strip()
            if part.isdigit():
                raw_ids.append(int(part))
        raw_ids = raw_ids[:3]
        found = {product.id: product for product in self.get_queryset().filter(id__in=raw_ids)}
        ordered = [found[pk] for pk in raw_ids if pk in found]
        missing = [pk for pk in raw_ids if pk not in found]
        return Response(
            {
                "results": ProductSerializer(ordered, many=True, context={"request": request}).data,
                "missing": missing,
            }
        )

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser], url_path="import")
    def import_csv_view(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Attach a CSV file."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = import_csv(upload, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        cache.delete(SCAN_KEY)
        return Response(result)


@extend_schema(tags=["Collections"])
class CollectionViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionSerializer
    queryset = Collection.objects.prefetch_related("products__brand", "products__category", "products__tags")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        collection = serializer.save()
        log_activity(self.request.user, "created", f"Opened the set “{collection.name}”", {"collection": collection.id})

    @action(detail=True, methods=["post"])
    def brief(self, request, pk=None):
        from apps.ai.services import draft_brief

        collection = self.get_object()
        products = list(collection.products.select_related("brand", "category").prefetch_related("tags"))
        if not products:
            return Response({"detail": "Add at least one style before asking for a brief."}, status=400)
        result = draft_brief(products)
        collection.brief = result["brief"]
        collection.brief_provider = result["provider"]
        collection.save(update_fields=["brief", "brief_provider", "updated_at"])
        log_activity(
            request.user,
            "brief",
            f"Wrote a brief for “{collection.name}”",
            {"collection": collection.id, "provider": result["provider"]},
        )
        return Response(CollectionSerializer(collection, context={"request": request}).data)


class ActivityPagination(StandardPagination):
    page_size = 20


@extend_schema(tags=["Activity"])
class ActivityViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ActivitySerializer
    queryset = Activity.objects.select_related("actor")
    pagination_class = ActivityPagination


@extend_schema(tags=["Insights"])
class InsightViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def health(self, request):
        payload = None
        try:
            payload = cache.get(SCAN_KEY)
        except Exception:
            logger.warning("Cache read failed; computing shelf health directly")
        if not payload:
            payload = scan_payload()
            try:
                cache.set(SCAN_KEY, payload, 60 * 30)
            except Exception:
                logger.warning("Cache write failed")
        return Response(payload)

    @action(detail=False, methods=["post"])
    def rescan(self, request):
        from .tasks import scan_catalog

        scan_catalog.delay()
        log_activity(request.user, "rescan", "Rescanned the sheet for duplicates and price outliers.")
        try:
            payload = cache.get(SCAN_KEY)
        except Exception:
            logger.warning("Cache read failed after rescan")
            payload = None
        return Response(payload or scan_payload())
