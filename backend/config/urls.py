from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny

from apps.catalog.views import health

admin.site.site_header = "CatalogAI"
admin.site.site_title = "CatalogAI"
admin.site.index_title = "Catalog desk"


class PublicSchemaView(SpectacularAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class PublicDocsView(SpectacularSwaggerView):
    authentication_classes = []
    permission_classes = [AllowAny]


urlpatterns = [
    path("", RedirectView.as_view(url="/api/docs/", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.catalog.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/schema/", PublicSchemaView.as_view(), name="schema"),
    path("api/docs/", PublicDocsView.as_view(url_name="schema"), name="docs"),
]
