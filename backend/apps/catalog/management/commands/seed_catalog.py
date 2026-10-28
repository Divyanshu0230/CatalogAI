from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.ai.services import local_brief
from apps.catalog.models import Activity, Collection, Product
from apps.catalog.seed_data import PRODUCTS
from apps.catalog.services import refresh_score, resolve_brand, resolve_category, set_tags


BUYERS = [
    {"username": "demo1", "email": "demo1@vitrine.test", "first_name": "Demo", "last_name": "1", "password": "Catalog123", "was": ("asha", "demo")},
    {"username": "demo2", "email": "demo2@vitrine.test", "first_name": "Demo", "last_name": "2", "password": "Catalog123", "was": ("rohan",)},
    {"username": "demo3", "email": "demo3@vitrine.test", "first_name": "Demo", "last_name": "3", "password": "Catalog123", "was": ("meera",)},
]


def ensure_buyer(user_model, spec):
    user = user_model.objects.filter(username=spec["username"]).first()
    if user is None:
        for previous in spec["was"]:
            user = user_model.objects.filter(username=previous).first()
            if user is not None:
                break
    if user is None:
        user = user_model(username=spec["username"])
    user.username = spec["username"]
    user.email = spec["email"]
    user.first_name = spec["first_name"]
    user.last_name = spec["last_name"]
    user.set_password(spec["password"])
    user.save()
    return user


class Command(BaseCommand):
    help = "Load the opening assortment and the buyer accounts."

    @transaction.atomic
    def handle(self, *args, **options):
        user_model = get_user_model()
        user = ensure_buyer(user_model, BUYERS[0])
        for spec in BUYERS[1:]:
            ensure_buyer(user_model, spec)

        for item in PRODUCTS:
            product, _was_created = Product.objects.update_or_create(
                sku=item["sku"],
                defaults={
                    "name": item["name"],
                    "brand": resolve_brand(item["brand"]),
                    "category": resolve_category(item["category"]),
                    "description": item["description"],
                    "price": item["price"],
                    "currency": "INR",
                    "image_url": item["image_url"],
                    "attributes": item["attributes"],
                    "stock": item["stock"],
                    "status": item.get("status", "active"),
                    "created_by": user,
                    "updated_by": user,
                },
            )
            set_tags(product, item["tags"])
            refresh_score(product)

        monsoon = Collection.objects.filter(name="Monsoon desk", created_by=user).first()
        if monsoon is None:
            monsoon = Collection.objects.create(name="Monsoon desk", created_by=user, brief_provider="local")
        styles = list(Product.objects.filter(sku__in=["VT-1004", "VT-1008"]).order_by("sku"))
        monsoon.products.set(styles)
        monsoon.brief = local_brief(styles)
        monsoon.brief_provider = "local"
        monsoon.save(update_fields=["brief", "brief_provider", "updated_at"])

        if not Activity.objects.filter(meta__source="seed").exists():
            Activity.objects.create(
                actor=user,
                action="imported",
                summary=f"Loaded the opening assortment of {len(PRODUCTS)} styles.",
                meta={"source": "seed"},
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(PRODUCTS)} styles. Accounts demo1, demo2, demo3 / Catalog123"))
