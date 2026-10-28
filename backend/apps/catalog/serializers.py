from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from .models import Activity, Collection, Product
from .services import CURRENCIES, refresh_score, resolve_brand, resolve_category, set_tags


class ProductSerializer(serializers.ModelSerializer):
    brand = serializers.CharField()
    category = serializers.CharField()
    tags = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    currency = serializers.CharField(required=False, default="INR")

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "brand",
            "category",
            "description",
            "price",
            "currency",
            "image_url",
            "tags",
            "attributes",
            "stock",
            "status",
            "completeness",
            "created_by",
            "updated_at",
            "created_at",
        ]
        read_only_fields = ["id", "sku", "completeness", "created_by", "updated_at", "created_at"]

    def validate_name(self, value):
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise serializers.ValidationError("Name needs at least 2 characters.")
        return cleaned

    def validate_brand(self, value):
        cleaned = " ".join(value.split())
        if not cleaned:
            raise serializers.ValidationError("Brand is required.")
        return cleaned

    def validate_category(self, value):
        cleaned = " ".join(value.split())
        if not cleaned:
            raise serializers.ValidationError("Category is required.")
        return cleaned

    def validate_price(self, value: Decimal):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        if value > Decimal("10000000"):
            raise serializers.ValidationError("Price is unreasonably large.")
        return value

    def validate_currency(self, value):
        code = (value or "INR").upper()
        if code not in CURRENCIES:
            raise serializers.ValidationError("Currency must be INR, USD, or EUR.")
        return code

    def validate_image_url(self, value):
        if value and not value.startswith(("http://", "https://")):
            raise serializers.ValidationError("Image URL must start with http:// or https://.")
        return value

    def validate_attributes(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Attributes must be an object.")
        cleaned = {}
        for key, raw in value.items():
            name = str(key).strip().lower()[:40]
            if not name or raw in (None, ""):
                continue
            cleaned[name] = str(raw).strip()[:80]
        return cleaned

    def validate_tags(self, value):
        cleaned = []
        for raw in value:
            name = " ".join(str(raw).split()).lower()
            if name:
                cleaned.append(name[:40])
        return cleaned[:12]

    def to_representation(self, instance):
        user = instance.created_by
        attributes = instance.attributes or {}
        return {
            "id": instance.id,
            "sku": instance.sku,
            "name": instance.name,
            "brand": instance.brand.name,
            "category": instance.category.name,
            "description": instance.description,
            "price": f"{instance.price:.2f}",
            "currency": instance.currency,
            "image_url": instance.image_url,
            "tags": [tag.name for tag in instance.tags.all()],
            "attributes": {str(key): "" if val is None else str(val) for key, val in attributes.items()},
            "stock": instance.stock,
            "status": instance.status,
            "completeness": instance.completeness,
            "created_by": (user.get_full_name() or user.username) if user else None,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        request = self.context["request"]
        product = Product(
            name=validated_data["name"],
            brand=resolve_brand(validated_data["brand"]),
            category=resolve_category(validated_data["category"]),
            description=validated_data.get("description", ""),
            price=validated_data["price"],
            currency=validated_data.get("currency", "INR"),
            image_url=validated_data.get("image_url", ""),
            attributes=validated_data.get("attributes") or {},
            stock=validated_data.get("stock") or 0,
            status=validated_data.get("status") or Product.Status.ACTIVE,
            created_by=request.user,
            updated_by=request.user,
        )
        product.save()
        set_tags(product, tags)
        refresh_score(product)
        return product

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        if "brand" in validated_data:
            instance.brand = resolve_brand(validated_data.pop("brand"))
        if "category" in validated_data:
            instance.category = resolve_category(validated_data.pop("category"))
        for field in ("name", "description", "price", "currency", "image_url", "attributes", "stock", "status"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.updated_by = self.context["request"].user
        instance.save()
        if tags is not None:
            set_tags(instance, tags)
        refresh_score(instance)
        return instance


class CollectionSerializer(serializers.ModelSerializer):
    product_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    products = ProductSerializer(many=True, read_only=True)

    class Meta:
        model = Collection
        fields = [
            "id",
            "name",
            "note",
            "brief",
            "brief_provider",
            "products",
            "product_ids",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "brief", "brief_provider", "created_at", "updated_at"]

    def validate_name(self, value):
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise serializers.ValidationError("A set needs a name.")
        return cleaned

    def validate_product_ids(self, value):
        if len(value) > 24:
            raise serializers.ValidationError("A set holds at most 24 styles.")
        return value

    def _apply_products(self, collection, ids):
        if ids is None:
            return
        products = list(Product.objects.filter(id__in=ids))
        order = {pk: index for index, pk in enumerate(ids)}
        products.sort(key=lambda product: order.get(product.id, 999))
        collection.products.set(products)

    def create(self, validated_data):
        ids = validated_data.pop("product_ids", [])
        collection = Collection.objects.create(created_by=self.context["request"].user, **validated_data)
        self._apply_products(collection, ids)
        return collection

    def update(self, instance, validated_data):
        ids = validated_data.pop("product_ids", None)
        for field in ("name", "note"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        self._apply_products(instance, ids)
        return instance


class ActivitySerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = ["id", "actor", "action", "summary", "meta", "created_at"]

    def get_actor(self, obj):
        if not obj.actor:
            return None
        return obj.actor.get_full_name() or obj.actor.username


class DescribeSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    brand = serializers.CharField(max_length=120)
    category = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    currency = serializers.CharField(required=False, default="INR")
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_price(self, value):
        try:
            price = Decimal(value)
        except (InvalidOperation, TypeError) as exc:
            raise serializers.ValidationError("Price must be a number.") from exc
        if price < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return price


class SearchQuerySerializer(serializers.Serializer):
    query = serializers.CharField(max_length=400)

    def validate_query(self, value):
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise serializers.ValidationError("Ask with at least a couple of words.")
        return cleaned
