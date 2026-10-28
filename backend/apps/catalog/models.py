from django.conf import settings
from django.db import models


class Brand(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=40, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    sku = models.CharField(max_length=32, unique=True, blank=True)
    name = models.CharField(max_length=200)
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    image_url = models.URLField(max_length=600, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="products")
    attributes = models.JSONField(default=dict, blank=True)
    stock = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    completeness = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="products_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="products_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["price"]),
            models.Index(fields=["completeness"]),
        ]

    def __str__(self):
        return f"{self.sku} {self.name}"

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = next_sku()
        super().save(*args, **kwargs)


class Collection(models.Model):
    name = models.CharField(max_length=160)
    note = models.TextField(blank=True)
    brief = models.TextField(blank=True)
    brief_provider = models.CharField(max_length=40, blank=True)
    products = models.ManyToManyField(Product, blank=True, related_name="collections")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="collections_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class Activity(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activity",
    )
    action = models.CharField(max_length=24)
    summary = models.CharField(max_length=300)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activity"

    def __str__(self):
        return self.summary


def next_sku() -> str:
    last = Product.objects.order_by("-id").values_list("id", flat=True).first() or 1000
    candidate = f"VT-{last + 1000}"
    while Product.objects.filter(sku=candidate).exists():
        last += 1
        candidate = f"VT-{last + 1000}"
    return candidate
