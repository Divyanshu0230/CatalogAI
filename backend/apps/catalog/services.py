import csv
import difflib
import io
import logging
from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Count
from django.utils import timezone
from django.utils.text import slugify

from .models import Activity, Brand, Category, Product, Tag
from .money import format_inr

logger = logging.getLogger("vitrine.catalog")
SCAN_KEY = "catalog:scan:v1"
CURRENCIES = {"INR", "USD", "EUR"}


def log_activity(actor, action: str, summary: str, meta=None):
    Activity.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        summary=summary[:300],
        meta=meta or {},
    )


def resolve_named(model, raw: str):
    name = " ".join((raw or "").split())
    if not name:
        raise ValueError("This needs a name.")
    existing = model.objects.filter(name__iexact=name).first()
    if existing:
        return existing
    base = slugify(name)[:120] or "item"
    slug = base
    suffix = 2
    while model.objects.filter(slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
    return model.objects.create(name=name, slug=slug)


def resolve_brand(name: str) -> Brand:
    return resolve_named(Brand, name)


def resolve_category(name: str) -> Category:
    return resolve_named(Category, name)


def set_tags(product: Product, tags: list[str]):
    objects = []
    seen = set()
    for raw in tags:
        name = " ".join(raw.split()).lower()
        if not name or name in seen:
            continue
        seen.add(name)
        tag, _ = Tag.objects.get_or_create(name=name[:40])
        objects.append(tag)
    product.tags.set(objects)


def compute_score(product: Product, tag_count: int) -> int:
    score = 0
    if product.name:
        score += 10
    if product.brand_id:
        score += 10
    if product.category_id:
        score += 10
    price = Decimal(product.price or 0)
    if price > 0:
        score += 10
    words = len((product.description or "").split())
    if words >= 28:
        score += 25
    elif words >= 8:
        score += 12
    if product.image_url:
        score += 20
    if tag_count >= 3:
        score += 10
    elif tag_count >= 1:
        score += 5
    if product.attributes:
        score += 5
    return min(score, 100)


def refresh_score(product: Product) -> int:
    score = compute_score(product, len(product.tags.all()))
    if product.completeness != score:
        Product.objects.filter(pk=product.pk).update(completeness=score)
        product.completeness = score
    return score


def product_card(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "brand": product.brand.name,
        "category": product.category.name,
        "price": str(product.price),
        "currency": product.currency,
    }


def find_duplicates(threshold: float = 0.78) -> list[dict]:
    products = list(
        Product.objects.filter(status=Product.Status.ACTIVE).select_related("brand").order_by("brand_id", "name")
    )
    by_brand: dict[int, list[Product]] = {}
    for product in products:
        by_brand.setdefault(product.brand_id, []).append(product)

    pairs = []
    for group in by_brand.values():
        for index, left in enumerate(group):
            for right in group[index + 1 :]:
                score = difflib.SequenceMatcher(None, left.name.casefold(), right.name.casefold()).ratio()
                if score < threshold:
                    continue
                pairs.append(
                    {
                        "score": round(score, 2),
                        "left": product_card(left),
                        "right": product_card(right),
                    }
                )
    pairs.sort(key=lambda item: item["score"], reverse=True)
    return pairs[:12]


def find_outliers() -> list[dict]:
    products = list(Product.objects.filter(status=Product.Status.ACTIVE).select_related("category", "brand"))
    grouped: dict[str, list[Product]] = {}
    for product in products:
        grouped.setdefault(product.category.name, []).append(product)

    findings = []
    for category, group in grouped.items():
        if len(group) < 4:
            continue
        prices = sorted(product.price for product in group)
        mid = len(prices) // 2
        if len(prices) % 2:
            median = prices[mid]
        else:
            median = (prices[mid - 1] + prices[mid]) / 2
        if median <= 0:
            continue
        for product in group:
            high = product.price >= median * 5
            low = product.price <= median * Decimal("0.15")
            if not high and not low:
                continue
            direction = "more than five times" if high else "under 15% of"
            findings.append(
                {
                    "id": product.id,
                    "sku": product.sku,
                    "name": product.name,
                    "brand": product.brand.name,
                    "category": category,
                    "price": str(product.price),
                    "median": str(median.quantize(Decimal("1"))),
                    "reason": (
                        f"{format_inr(product.price)} is {direction} the {category} median of {format_inr(median)}."
                    ),
                }
            )
    findings.sort(key=lambda item: Decimal(item["price"]), reverse=True)
    return findings


def scan_payload() -> dict:
    active = Product.objects.filter(status=Product.Status.ACTIVE)
    total = Product.objects.count()
    missing_image = active.filter(image_url="").count()
    thin = active.filter(completeness__lt=75).count()
    by_category = [
        {
            "name": row["category__name"],
            "count": row["count"],
            "avg_price": str((row["avg_price"] or Decimal("0")).quantize(Decimal("1"))),
        }
        for row in active.values("category__name")
        .annotate(count=Count("id"), avg_price=Avg("price"))
        .order_by("-count", "category__name")
    ]
    average = active.aggregate(value=Avg("completeness"))["value"] or 0
    low_rows = active.filter(stock__lte=5).select_related("brand").order_by("stock", "name")[:8]
    return {
        "total": total,
        "active": active.count(),
        "drafts": Product.objects.filter(status=Product.Status.DRAFT).count(),
        "missing_image": missing_image,
        "thin": thin,
        "low_stock_count": active.filter(stock__lte=5).count(),
        "low_stock": [
            {
                "id": product.id,
                "sku": product.sku,
                "name": product.name,
                "brand": product.brand.name,
                "stock": product.stock,
                "price": str(product.price),
            }
            for product in low_rows
        ],
        "avg_completeness": round(float(average)),
        "by_category": by_category,
        "near_duplicates": find_duplicates(),
        "price_outliers": find_outliers(),
        "scanned_at": timezone.now().isoformat(),
    }


def parse_price(raw: str) -> Decimal:
    cleaned = (raw or "").strip().replace(",", "").replace("₹", "").replace("Rs", "").replace("rs", "")
    if not cleaned:
        raise ValueError("Price is missing.")
    try:
        price = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError("Price must be a number.") from exc
    if price < 0:
        raise ValueError("Price cannot be negative.")
    if price > Decimal("10000000"):
        raise ValueError("Price is unreasonably large.")
    return price.quantize(Decimal("0.01"))


def import_csv(uploaded, actor) -> dict:
    raw = uploaded.read()
    if len(raw) > 1_000_000:
        raise ValueError("The file is larger than 1 MB.")
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "name" not in [name.strip().lower() for name in reader.fieldnames if name]:
        raise ValueError("The CSV needs a name column.")

    created = 0
    updated = 0
    errors = []
    for index, row in enumerate(reader, start=2):
        if index > 501:
            errors.append({"row": index, "detail": "Import stopped at 500 rows."})
            break
        normalized = {(key or "").strip().lower(): (value or "").strip() for key, value in row.items()}
        try:
            name = normalized.get("name", "")
            brand = normalized.get("brand", "")
            category = normalized.get("category", "")
            if not name or not brand or not category:
                raise ValueError("Name, brand, and category are required.")
            price = parse_price(normalized.get("price", ""))
            currency = (normalized.get("currency") or "INR").upper()
            if currency not in CURRENCIES:
                raise ValueError("Currency must be INR, USD, or EUR.")
            status = (normalized.get("status") or "active").lower()
            if status not in {choice for choice, _ in Product.Status.choices}:
                raise ValueError("Status must be draft, active, or archived.")
            sku = normalized.get("sku", "")
            image_url = normalized.get("image_url", "")
            if image_url and not image_url.startswith(("http://", "https://")):
                raise ValueError("Image URL must start with http:// or https://.")
            defaults = {
                "name": name,
                "brand": resolve_brand(brand),
                "category": resolve_category(category),
                "description": normalized.get("description", ""),
                "price": price,
                "currency": currency,
                "image_url": image_url,
                "stock": int(normalized.get("stock") or 0),
                "status": status,
                "updated_by": actor,
            }
            if defaults["stock"] < 0:
                raise ValueError("Stock cannot be negative.")
            if sku:
                product, was_created = Product.objects.update_or_create(sku=sku, defaults=defaults)
            else:
                product = Product.objects.create(created_by=actor, **defaults)
                was_created = True
            if was_created and product.created_by_id is None:
                product.created_by = actor
                product.save(update_fields=["created_by"])
            tag_raw = normalized.get("tags", "")
            tags = [part for part in tag_raw.replace("|", ",").split(",") if part.strip()]
            set_tags(product, tags)
            refresh_score(product)
            if was_created:
                created += 1
            else:
                updated += 1
        except (ValueError, Product.DoesNotExist) as exc:
            errors.append({"row": index, "detail": str(exc)})
        except Exception:
            logger.exception("CSV row %s failed", index)
            errors.append({"row": index, "detail": "This row could not be read."})

    log_activity(
        actor,
        "imported",
        f"Imported a sheet: {created} added, {updated} updated.",
        {"created": created, "updated": updated, "errors": len(errors)},
    )
    return {"created": created, "updated": updated, "errors": errors[:20]}
