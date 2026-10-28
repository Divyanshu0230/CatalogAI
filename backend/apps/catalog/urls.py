from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ActivityViewSet, CollectionViewSet, InsightViewSet, ProductViewSet

router = DefaultRouter()
router.register("products", ProductViewSet, basename="product")
router.register("collections", CollectionViewSet, basename="collection")
router.register("activity", ActivityViewSet, basename="activity")
router.register("insights", InsightViewSet, basename="insight")

urlpatterns = [
    path("", include(router.urls)),
]
