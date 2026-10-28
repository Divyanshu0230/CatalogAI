import difflib
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from apps.catalog.money import format_inr
from apps.catalog.search import text_search

SORTS = {"relevance", "price_asc", "price_desc", "newest"}

CATEGORY_WORDS = {
    "shoe": "Footwear",
    "shoes": "Footwear",
    "sneaker": "Footwear",
    "sneakers": "Footwear",
    "trainer": "Footwear",
    "trainers": "Footwear",
    "apparel": "Apparel",
    "clothing": "Apparel",
    "clothes": "Apparel",
    "skincare": "Beauty",
    "beauty": "Beauty",
    "makeup": "Beauty",
    "electronics": "Electronics",
    "watch": "Watches",
    "watches": "Watches",
    "grocery": "Grocery",
    "groceries": "Grocery",
    "staples": "Grocery",
    "home": "Home",
    "accessories": "Accessories",
}

HINTS = {
    "loafer": "Footwear",
    "loafers": "Footwear",
    "sandal": "Footwear",
    "sandals": "Footwear",
    "heel": "Footwear",
    "heels": "Footwear",
    "shirt": "Apparel",
    "jacket": "Apparel",
    "jeans": "Apparel",
    "serum": "Beauty",
    "sunscreen": "Beauty",
    "kajal": "Beauty",
    "lamp": "Home",
    "mug": "Home",
    "headphone": "Electronics",
    "headphones": "Electronics",
    "speaker": "Electronics",
    "keyboard": "Electronics",
    "camera": "Electronics",
    "tea": "Grocery",
    "coffee": "Grocery",
    "rice": "Grocery",
    "salt": "Grocery",
    "honey": "Grocery",
    "chocolate": "Grocery",
    "sunglasses": "Accessories",
    "tote": "Accessories",
    "bag": "Accessories",
    "bags": "Accessories",
    "backpack": "Accessories",
    "headphone": "Electronics",
    "earbuds": "Electronics",
    "earphone": "Electronics",
    "earphones": "Electronics",
    "phone": "Electronics",
    "phones": "Electronics",
    "camera": "Electronics",
    "speaker": "Electronics",
    "speakers": "Electronics",
    "perfume": "Beauty",
    "lipstick": "Beauty",
    "soap": "Beauty",
    "cream": "Beauty",
    "jeans": "Apparel",
    "hoodie": "Apparel",
    "dress": "Apparel",
    "kurta": "Apparel",
    "cap": "Apparel",
    "coffee": "Grocery",
    "chocolate": "Grocery",
    "oil": "Grocery",
    "bread": "Grocery",
    "milk": "Grocery",
    "candle": "Home",
    "chair": "Home",
    "bottle": "Accessories",
}

STOP = {
    "a", "an", "the", "for", "with", "from", "me", "please", "show", "find", "looking",
    "something", "some", "of", "and", "in", "to", "style", "styles", "product", "products",
    "pair", "pairs", "on", "under", "below", "above", "over", "between", "than", "less",
    "more", "cheap", "cheapest", "expensive", "premium", "newest", "latest", "new",
    "budget", "luxury", "highest", "lowest", "rupee", "rupees", "rs", "inr", "all", "any",
    "i", "want", "need", "get", "give", "list", "only", "just", "that", "this", "are", "is",
    "good", "my", "your",
}
SORT_ASC = {"cheap", "cheapest", "lowest", "budget"}
SORT_DESC = {"expensive", "premium", "highest", "luxury"}
SORT_NEW = {"newest", "latest"}

PRICE_BETWEEN = re.compile(
    r"between\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)(k)?\s*(?:and|to|-)\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)(k)?",
    re.IGNORECASE,
)
PRICE_UNDER = re.compile(
    r"(?:under|below|less than|cheaper than|upto|up to|max|within)\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)(k)?",
    re.IGNORECASE,
)
PRICE_OVER = re.compile(
    r"(?:over|above|more than|greater than|min)\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*)(k)?",
    re.IGNORECASE,
)
PRICE_BARE = re.compile(r"(?:₹|rs\.?)\s*([0-9][0-9,]*)(k)?", re.IGNORECASE)


@dataclass
class Reading:
    keywords: str = ""
    brand: str | None = None
    category: str | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    sort: str = "relevance"
    source: str = "local"

    def as_dict(self) -> dict:
        return {
            "keywords": self.keywords,
            "brand": self.brand,
            "category": self.category,
            "min_price": float(self.min_price) if self.min_price is not None else None,
            "max_price": float(self.max_price) if self.max_price is not None else None,
            "sort": self.sort,
            "source": self.source,
        }


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def money_amount(number: str, suffix: str | None) -> Decimal:
    value = Decimal(number.replace(",", ""))
    if suffix:
        value *= 1000
    return value


def as_decimal(value):
    if value is None or value == "":
        return None
    try:
        amount = Decimal(str(value).replace(",", "").replace("₹", "").strip())
    except (InvalidOperation, ValueError):
        return None
    if amount < 0 or amount > Decimal("10000000"):
        return None
    return amount


def _cut(pattern: re.Pattern, text: str):
    match = pattern.search(text)
    if not match:
        return text, None
    return text[: match.start()] + " " + text[match.end() :], match


def parse_query(query: str, brands: list[str], categories: list[str]) -> Reading:
    reading = Reading()
    working = f" {query} "
    working, between = _cut(PRICE_BETWEEN, working)
    if between:
        reading.min_price = money_amount(between.group(1), between.group(2))
        reading.max_price = money_amount(between.group(3), between.group(4))
    else:
        working, under = _cut(PRICE_UNDER, working)
        working, over = _cut(PRICE_OVER, working)
        if under:
            reading.max_price = money_amount(under.group(1), under.group(2))
        if over:
            reading.min_price = money_amount(over.group(1), over.group(2))
        if reading.min_price is None and reading.max_price is None:
            working, bare = _cut(PRICE_BARE, working)
            if bare:
                reading.max_price = money_amount(bare.group(1), bare.group(2))
    if (
        reading.min_price is not None
        and reading.max_price is not None
        and reading.min_price > reading.max_price
    ):
        reading.min_price, reading.max_price = reading.max_price, reading.min_price

    text = normalize(working)
    named = sorted(((normalize(brand), brand) for brand in brands), key=lambda item: len(item[0]), reverse=True)
    for needle, brand in named:
        if needle and re.search(rf"(?:^| ){re.escape(needle)}(?: |$)", f" {text} "):
            reading.brand = brand
            text = re.sub(rf"(?:^| ){re.escape(needle)}(?: |$)", " ", f" {text} ")
            text = normalize(text)
            break

    category_lookup = {category.casefold(): category for category in categories}
    named_categories = sorted(
        ((normalize(category), category) for category in categories),
        key=lambda item: len(item[0]),
        reverse=True,
    )
    for needle, category in named_categories:
        if needle and re.search(rf"(?:^| ){re.escape(needle)}(?: |$)", f" {text} "):
            reading.category = category
            text = normalize(re.sub(rf"(?:^| ){re.escape(needle)}(?: |$)", " ", f" {text} "))
            break

    words = text.split()
    if reading.category is None:
        for word in words:
            target = CATEGORY_WORDS.get(word) or HINTS.get(word)
            if target and target.casefold() in category_lookup:
                reading.category = category_lookup[target.casefold()]
                if word in CATEGORY_WORDS:
                    words = [item for item in words if item != word]
                break

    if reading.category is not None:
        words = [
            word
            for word in words
            if CATEGORY_WORDS.get(word, "").casefold() != reading.category.casefold()
        ]

    if any(word in SORT_ASC for word in words):
        reading.sort = "price_asc"
    elif any(word in SORT_DESC for word in words):
        reading.sort = "price_desc"
    elif any(word in SORT_NEW for word in words):
        reading.sort = "newest"

    drop = STOP | SORT_ASC | SORT_DESC | SORT_NEW
    reading.keywords = " ".join(word for word in words if word not in drop and not word.isdigit())
    return reading


def reading_from_payload(payload: dict) -> Reading:
    brand = payload.get("brand")
    category = payload.get("category")
    return Reading(
        keywords=str(payload.get("keywords") or ""),
        brand=str(brand).strip() if brand else None,
        category=str(category).strip() if category else None,
        min_price=as_decimal(payload.get("min_price")),
        max_price=as_decimal(payload.get("max_price")),
        sort=str(payload.get("sort") or "relevance"),
        source="model",
    )


def sanitize(reading: Reading, brands: list[str], categories: list[str]) -> Reading:
    brand_map = {brand.casefold(): brand for brand in brands}
    category_map = {category.casefold(): category for category in categories}
    if reading.brand:
        found = brand_map.get(reading.brand.casefold())
        if not found:
            match = difflib.get_close_matches(reading.brand, brands, n=1, cutoff=0.86)
            found = match[0] if match else None
        reading.brand = found
    if reading.category:
        key = reading.category.casefold()
        found = category_map.get(key)
        if not found:
            hinted = CATEGORY_WORDS.get(key) or HINTS.get(key)
            if hinted:
                found = category_map.get(hinted.casefold())
        if not found:
            match = difflib.get_close_matches(reading.category, categories, n=1, cutoff=0.8)
            found = match[0] if match else None
        reading.category = found
    if reading.sort not in SORTS:
        reading.sort = "relevance"
    if (
        reading.min_price is not None
        and reading.max_price is not None
        and reading.min_price > reading.max_price
    ):
        reading.min_price, reading.max_price = reading.max_price, reading.min_price
    reading.keywords = " ".join(reading.keywords.split())[:120]
    return reading


def is_blank(reading: Reading) -> bool:
    return not any(
        [
            reading.keywords,
            reading.brand,
            reading.category,
            reading.min_price is not None,
            reading.max_price is not None,
        ]
    )


def apply_reading(queryset, reading: Reading):
    if reading.brand:
        queryset = queryset.filter(brand__name__iexact=reading.brand)
    if reading.category:
        queryset = queryset.filter(category__name__iexact=reading.category)
    if reading.min_price is not None:
        queryset = queryset.filter(price__gte=reading.min_price)
    if reading.max_price is not None:
        queryset = queryset.filter(price__lte=reading.max_price)
    if reading.keywords:
        queryset = text_search(queryset, reading.keywords)
    if reading.sort == "price_asc":
        return queryset.order_by("price", "name")
    if reading.sort == "price_desc":
        return queryset.order_by("-price", "name")
    if reading.sort == "newest":
        return queryset.order_by("-created_at")
    if "sim" in getattr(queryset.query, "annotations", {}):
        return queryset.order_by("-sim", "name")
    return queryset.order_by("name")


def narrate(query: str, reading: Reading, products) -> str:
    if not products:
        focus = " ".join(part for part in [reading.brand, reading.category] if part) or "the catalog"
        if reading.min_price is not None and reading.max_price is not None:
            price = f" between {format_inr(reading.min_price)} and {format_inr(reading.max_price)}"
        elif reading.max_price is not None:
            price = f" under {format_inr(reading.max_price)}"
        elif reading.min_price is not None:
            price = f" above {format_inr(reading.min_price)}"
        else:
            price = ""
        return f"Nothing in {focus}{price} matches “{query}”."

    if len(products) == 1:
        product = products[0]
        price = format_inr(product.price) if product.currency == "INR" else f"{product.currency} {product.price}"
        return f"1 product. {product.brand.name} {product.name} is {price}."

    prices = [product.price for product in products]
    if all(product.currency == "INR" for product in products):
        span = f" Prices run from {format_inr(min(prices))} to {format_inr(max(prices))}."
    else:
        span = ""
    names = ", ".join(f"{product.brand.name} {product.name}" for product in products[:3])
    extra = f" Plus {len(products) - 3} more." if len(products) > 3 else ""
    return f"{len(products)} products.{span} {names}.{extra}"
