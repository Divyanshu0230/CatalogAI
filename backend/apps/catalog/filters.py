import django_filters
from django.db.models import Q

from .models import Product
from .search import text_search


class ProductFilter(django_filters.FilterSet):
    brand = django_filters.CharFilter(field_name="brand__name", lookup_expr="iexact")
    category = django_filters.CharFilter(field_name="category__name", lookup_expr="iexact")
    min_price = django_filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price", lookup_expr="lte")
    tag = django_filters.CharFilter(field_name="tags__name", lookup_expr="iexact")
    q = django_filters.CharFilter(method="filter_q")

    class Meta:
        model = Product
        fields = ["brand", "category", "min_price", "max_price", "tag", "q"]

    def filter_q(self, queryset, name, value):
        phrase = (value or "").strip()
        if not phrase:
            return queryset
        return text_search(queryset, phrase)


def base_queryset():
    return Product.objects.select_related("brand", "category", "created_by", "updated_by").prefetch_related("tags")


def list_queryset(params):
    queryset = base_queryset()
    status = (params.get("status") or "active").strip().lower()
    if status != "all":
        queryset = queryset.filter(status=status)
    needs = (params.get("needs") or "").strip().lower()
    if needs == "image":
        queryset = queryset.filter(Q(image_url=""))
    elif needs == "story":
        queryset = queryset.filter(completeness__lt=75)
    stock = (params.get("stock") or "").strip().lower()
    if stock == "low":
        queryset = queryset.filter(stock__lte=5)
    elif stock == "out":
        queryset = queryset.filter(stock=0)
    return queryset
