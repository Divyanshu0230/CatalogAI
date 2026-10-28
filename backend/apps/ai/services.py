import json
import logging
import re
import time

from apps.catalog.money import format_inr

from .client import ModelError, complete_json, llm_ready
from .reading import (
    CATEGORY_WORDS,
    HINTS,
    Reading,
    apply_reading,
    is_blank,
    narrate,
    parse_query,
    reading_from_payload,
    sanitize,
)

logger = logging.getLogger("vitrine.ai")

SEARCH_SYSTEM = """You convert a shopper sentence into a JSON object for a retail catalog.
Return only a JSON object with this shape:
{"keywords": "", "brand": null, "category": null, "min_price": null, "max_price": null, "sort": "relevance"}
sort is one of relevance, price_asc, price_desc, newest.
Prices are plain numbers in INR. "under 5000" means max_price 5000. "5k" means 5000. "above 2000" means min_price 2000.
Choose a brand or category only from the lists in the user message, and only when the sentence clearly asks for it.
Shoes map to Footwear, tea or rice map to Grocery, a watch maps to Watches.
Do not invent a brand. Keep colors and materials in keywords.
"""

DESCRIBE_SYSTEM = """You write shelf copy for one retail product. Return only a JSON object:
{"headline": "", "title": "", "description": "", "tags": [], "category_suggestion": null, "attributes": {}}
headline is at most 12 words.
description is 40 to 70 words, concrete and calm, like a buyer's note.
tags is 4 to 6 lowercase tags of one or two words.
title is a clearer product name of at most 8 words. Keep the brand out of the title.
category_suggestion is one name from the categories list, or null when the given category already fits.
attributes may include only color, material, audience. Omit a key if you do not know it.
Use only the facts in the input. You may rely on the ordinary meaning of the product type.
Do not invent sizes, weights, ingredients, discounts, awards, or performance numbers.
Do not claim medical benefits. Do not say best, luxury miracle, or perfect.
"""

BRIEF_SYSTEM = """You write a buying brief for a set a merchant already chose. Return only a JSON object:
{"title": "", "brief": ""}
brief is 70 to 110 words.
Use only the products in the payload. Mention the price span and the mix of categories.
Do not add products, promotions, or claims that are not in the payload.
"""

ATTRIBUTE_KEYS = {"color", "material", "audience"}


CHAT_SYSTEM = """You answer a shopper who is looking through one retail catalog.
Return only a JSON object: {"reply": ""}
The reply is 1 to 3 short sentences.
Use only the products in the payload. Mention real names and prices from that list.
If the list is empty, say nothing matched and suggest a broader search.
Do not invent products, discounts, stock, or claims.
"""

ROUTER_SYSTEM = """You are Catalog Assistant AI. Decide what the person wants.
Return only a JSON object: {"mode": "talk", "reply": ""} or {"mode": "search", "query": ""}
Use mode "talk" for anything that is not a request to find, filter, compare, or check products.
Greetings, feelings, the date, the time, what you can do, thanks, typos, and ordinary questions are talk.
When they ask the date or time, answer from the today field. Do not look for a product.
Use mode "search" only when they want items from a shop catalog: a product, brand, category, budget, or stock.
For search, query is a clear shopping sentence and you do not write a reply.
Never say that nothing matched. Never invent a product or a price.
"""

SOCIAL_SYSTEM = """You are Catalog Assistant. The person is chatting, not searching for a product.
Return only a JSON object: {"reply": ""}
Answer the actual message in one or two warm sentences.
If they ask how you are, say you are well and invite them to ask for a product.
Do not name any product or brand. Do not mention a price, rupees, or dollars.
Do not say that nothing matched.
"""

SUGGESTIONS = [
    "Cheapest tea",
    "Running shoes under ₹9,000",
    "Nike jackets",
    "Headphones under ₹5,000",
    "Premium watches above ₹50,000",
    "Something for a monsoon commute",
    "Brooke Bond tea",
    "What is low on stock?",
]


def answer_chat(messages: list[dict], brands: list[str], categories: list[str]) -> dict:
    from apps.catalog.filters import base_queryset
    from apps.catalog.models import Product

    latest = ""
    for message in reversed(messages):
        if message.get("role") == "user":
            latest = str(message.get("content") or "").strip()
            break
    if len(latest) < 2:
        return {
            "reply": "Tell me a product, a brand, or a budget and I will look it up in the catalog.",
            "products": [],
            "suggestions": SUGGESTIONS,
            "social": True,
        }

    if any(phrase in latest.casefold() for phrase in ("low on stock", "out of stock", "low stock", "running low")):
        products = list(
            base_queryset().filter(status=Product.Status.ACTIVE, stock__lte=5).order_by("stock", "name")[:6]
        )
        names = ", ".join(product.name for product in products[:3]) or "nothing"
        reply = f"{len(products)} products are low or out of stock. Start with {names}." if products else "Nothing is low on stock."
        return {"reply": reply, "products": products, "suggestions": SUGGESTIONS, "social": False}

    routed_query = None
    if llm_ready():
        routed = route_turn(latest)
        if routed and routed.get("mode") == "talk" and routed.get("reply"):
            return {
                "reply": routed["reply"],
                "products": [],
                "suggestions": SUGGESTIONS,
                "social": True,
            }
        if routed and routed.get("mode") == "search":
            routed_query = routed.get("query") or latest

    if routed_query is None:
        hello = greeting(latest)
        if hello:
            return {"reply": hello, "products": [], "suggestions": SUGGESTIONS, "social": True}
        advice = advisor_prompt(latest)
        if advice:
            return {"reply": advice, "products": [], "suggestions": SUGGESTIONS, "social": True}

    query = routed_query or latest
    if routed_query is None and re_search_followup(latest) and len(messages) > 1:
        earlier = [item["content"] for item in messages if item.get("role") == "user"]
        if len(earlier) >= 2:
            query = f"{earlier[-2]} {latest}"

    reading, _meta = interpret(query, brands, categories)

    products = list(apply_reading(base_queryset().filter(status=Product.Status.ACTIVE), reading)[:6])
    reply = narrate(latest, reading, products)
    if llm_ready() and products:
        brief = [
            {
                "name": product.name,
                "brand": product.brand.name,
                "category": product.category.name,
                "price": str(product.price),
                "stock": product.stock,
            }
            for product in products
        ]
        try:
            payload = complete_json(
                system=CHAT_SYSTEM,
                user=json.dumps({"question": latest, "products": brief}),
                task="quality",
                timeout=12,
            )
            text = " ".join(str(payload.get("reply") or "").split())
            if _reply_matches_products(text, products, latest):
                reply = text[:700]
        except Exception:
            logger.warning("Chat reply kept the catalog sentence", exc_info=True)
    return {"reply": reply, "products": products, "suggestions": SUGGESTIONS, "social": False}


_SOCIAL_LOCAL = {
    "greet": "Hi. I'm Catalog Assistant AI. Tell me a product, a brand, or a budget and I will look it up.",
    "how": "I'm doing well, thank you for asking. What would you like to find in the catalog?",
    "thanks": "You're welcome. Ask me for another product whenever you want.",
    "bye": "Bye for now. I'll be here when you want to look something up.",
    "help": "I'm Catalog Assistant AI. I can find products, compare the ones I just showed you, and tell you what is low on stock.",
    "who": "I'm Catalog Assistant AI. I answer from the products that are actually listed in this catalog.",
    "fine": "Glad to hear it. What are you looking for?",
}


def _norm_chat(text: str) -> str:
    cleaned = text.casefold().replace("'", "").replace("’", "")
    cleaned = re.sub(r"[^a-z\s]", " ", cleaned)
    return " ".join(cleaned.split())


def _has_catalog_signal(cleaned: str) -> bool:
    if re.search(r"\d", cleaned):
        return True
    tokens = set(cleaned.split())
    words = {
        "under", "above", "below", "between", "cheap", "cheaper", "price", "stock",
        "shoe", "shoes", "tea", "watch", "jacket", "laptop", "headphone", "phone",
        "brand", "category", "compare", "product", "catalog", "rupee", "rs", "inr",
    }
    return bool(tokens & words)


def social_intent(text: str) -> str | None:
    cleaned = _norm_chat(text)
    if not cleaned or len(cleaned) > 90 or _has_catalog_signal(cleaned):
        return None
    if re.fullmatch(r"(hi+|hello+|hey+|heya|yo|hola|good (morning|afternoon|evening|night))( there)?", cleaned):
        return "greet"
    if re.search(
        r"\b(how are you|how are u|how r you|how r u|how you doing|hows it going|how is it going|whats up|what is up|how do you do|how have you been|are you (ok|okay|fine|good|there|real|a bot|an ai|ai|doing))\b",
        cleaned,
    ):
        return "how"
    if re.fullmatch(r"(thanks|thank you|thankyou|ty|thx)( so much| a lot)?", cleaned):
        return "thanks"
    if re.fullmatch(r"(bye|goodbye|good bye|see you|see ya)", cleaned):
        return "bye"
    if re.search(r"\b(who are you|what is your name|whats your name|your name)\b", cleaned):
        return "who"
    if re.search(r"\b(what can you do|how can you help|help me|what do you do)\b", cleaned):
        return "help"
    if re.fullmatch(r"(i am|im) (good|fine|ok|okay|great|well)( thanks| thank you)?", cleaned):
        return "fine"
    if re.fullmatch(r"(nice|cool|great|awesome|good|ok|okay|alright|nice to meet you)", cleaned):
        return "fine"
    return None


def _social_ok(reply: str) -> bool:
    if not reply or len(reply) < 8 or len(reply) > 320:
        return False
    folded = reply.casefold()
    if any(token in reply or token in folded for token in ("₹", "$", "nothing in the catalog", "nothing matches")):
        return False
    if re.search(r"\d{3,}", reply):
        return False
    return True


def route_turn(text: str) -> dict | None:
    from django.utils import timezone

    today = timezone.localtime().strftime("%A, %d %B %Y, %I:%M %p")
    try:
        payload = complete_json(
            system=ROUTER_SYSTEM,
            user=json.dumps({"today": today, "message": text}),
            task="fast",
            timeout=10,
        )
    except Exception:
        logger.warning("Chat routing used the catalog reader", exc_info=True)
        return None
    mode = str(payload.get("mode") or "").strip().lower()
    if mode == "talk":
        reply = " ".join(str(payload.get("reply") or "").split())
        if _talk_ok(reply):
            return {"mode": "talk", "reply": reply[:500]}
        return None
    if mode == "search":
        query = " ".join(str(payload.get("query") or text).split())[:300]
        return {"mode": "search", "query": query or text}
    return None


def _talk_ok(reply: str) -> bool:
    if not reply or len(reply) < 8 or len(reply) > 500:
        return False
    folded = reply.casefold()
    if "₹" in reply or "$" in reply:
        return False
    if "nothing in the catalog" in folded or "nothing matches" in folded:
        return False
    return True


def greeting(text: str) -> str | None:
    intent = social_intent(text)
    if not intent:
        return None
    local = _SOCIAL_LOCAL[intent]
    if intent != "how" or not llm_ready():
        return local
    try:
        payload = complete_json(
            system=SOCIAL_SYSTEM,
            user=json.dumps({"message": text, "intent": intent}),
            task="fast",
            timeout=8,
        )
        reply = " ".join(str(payload.get("reply") or "").split())
        if _social_ok(reply):
            return reply
    except Exception:
        logger.warning("Social reply stayed with the local welcome", exc_info=True)
    return local


def advisor_prompt(text: str) -> str | None:
    cleaned = _norm_chat(text)
    tokens = cleaned.split()
    if not tokens or _has_catalog_signal(cleaned):
        return None
    vague = {"gift", "something", "recommend", "recommendation", "suggest", "suggestion", "anything", "whatever"}
    if not (set(tokens) & vague):
        return None
    filler = {"a", "an", "the", "me", "for", "please", "some", "any", "to", "i", "want", "need", "can", "you", "show"}
    content = [token for token in tokens if token not in vague and token not in filler]
    if len(content) > 1:
        return None
    return (
        "Tell me who it is for and a budget, and I will look in the catalog. "
        "A gift under ₹2,000, or running shoes under ₹9,000, both work."
    )


def chat_suggestions(products, social: bool) -> list[str]:
    if social or not products:
        return SUGGESTIONS
    tips = []
    if len(products) >= 2:
        tips.extend(["Which one is cheaper?", "Compare these"])
    tips.extend(SUGGESTIONS[:4])
    return tips[:6]


def answer_followup(text: str, snapshots: list[dict]):
    from apps.catalog.models import Product

    folded = text.casefold()
    if not any(word in folded for word in ("cheaper", "lowest", "which one", "compare", "difference", "the first", "the second")):
        return None
    ids = [item.get("id") for item in snapshots if isinstance(item, dict) and item.get("id")]
    products = list(Product.objects.filter(id__in=ids, status=Product.Status.ACTIVE).select_related("brand", "category"))
    if len(products) < 2:
        return None
    if "compare" in folded or "difference" in folded:
        lines = []
        for product in products[:3]:
            note = " ".join((product.description or "").split())[:90]
            extra = f" {note}" if note else ""
            lines.append(f"{product.brand.name} {product.name} is {format_inr(product.price)}.{extra}")
        return " ".join(lines), products
    cheapest = min(products, key=lambda product: product.price)
    dearest = max(products, key=lambda product: product.price)
    gap = dearest.price - cheapest.price
    extra = ""
    if dearest.id != cheapest.id and gap > 0:
        extra = f" {dearest.brand.name} {dearest.name} costs {format_inr(gap)} more."
    return (
        f"{cheapest.brand.name} {cheapest.name} is the lower price, at {format_inr(cheapest.price)}.{extra}",
        products,
    )


PRODUCT_SYSTEM = """You are Catalog Assistant AI writing about one saved product.
Return only a JSON object: {"text": "", "points": []}
Use only the facts in the payload. Do not invent specs, materials, awards, discounts, or performance numbers.
explain: text is 2 or 3 sentences a shopper can read. points are up to 3 facts from the payload.
audience: text says who this listing fits, using the category, price, and description only.
rewrite: text is a 40 to 70 word description. points are 4 lowercase tags.
questions: text is one short sentence. points are 4 questions a shopper could ask about this product.
compare: text compares this product with the others using only their stored names and prices.
"""


def assist_product(product, others, task: str) -> dict:
    if not llm_ready():
        raise ModelError("No language model is configured. Set GROQ_API_KEY and restart the API.")
    payload = complete_json(
        system=PRODUCT_SYSTEM,
        user=json.dumps(
            {
                "task": task,
                "product": _product_facts(product),
                "others": [_product_facts(item) for item in others],
            }
        ),
        task="quality",
        timeout=16,
    )
    text = " ".join(str(payload.get("text") or "").split())
    points = []
    for raw in payload.get("points") or []:
        point = " ".join(str(raw).split())
        if point:
            points.append(point[:160])
    if len(text) < 20:
        raise ModelError("The draft was too thin to use. Try again.")
    blob = json.dumps(_product_facts(product)).replace(",", "")
    for number in re.findall(r"\d{4,}", text.replace(",", "")):
        if number not in blob:
            raise ModelError("The draft added a number that is not on the listing.")
    return {
        "task": task,
        "text": text[:900],
        "points": points[:6],
        "provider": payload.get("_provider") or "model",
        "model": payload.get("_model"),
    }


def _product_facts(product) -> dict:
    return {
        "name": product.name,
        "brand": product.brand.name,
        "category": product.category.name,
        "description": " ".join((product.description or "").split())[:400],
        "price": str(product.price),
        "currency": product.currency,
        "stock": product.stock,
        "tags": [tag.name for tag in product.tags.all()],
        "attributes": product.attributes or {},
    }


def re_search_followup(text: str) -> bool:
    cleaned = text.casefold()
    return any(word in cleaned for word in ("cheaper", "costlier", "more", "another", "those", "same", "else"))


_SAFE_WORDS = {
    "a", "an", "the", "is", "are", "at", "from", "by", "for", "and", "with", "in", "of", "to",
    "it", "its", "this", "these", "priced", "price", "costs", "cost", "rupee", "rupees", "rs",
    "inr", "available", "stock", "left", "currently", "we", "have", "also", "next", "one",
    "only", "match", "matches", "catalog", "under", "above", "budget", "fits", "which",
    "your", "there", "that", "on", "our",
}


def _reply_matches_products(text: str, products, question: str = "") -> bool:
    folded = " ".join(text.casefold().split())
    if len(folded) < 20:
        return False
    names = [product.name.casefold() for product in products]
    if "$" in text and any(product.currency == "INR" for product in products):
        return False
    if not any(name in folded for name in names):
        return False
    source = " ".join(
        " ".join([product.name, product.brand.name, product.category.name, product.description or ""])
        for product in products
    )
    allowed = set(re.findall(r"[a-z0-9]+", f"{source} {question}".casefold())) | _SAFE_WORDS
    extra = {word for word in set(re.findall(r"[a-z0-9]+", folded)) - allowed if not word.isdigit()}
    if extra:
        return False
    for token in folded.replace("₹", " ").replace(",", "").split():
        if token.isdigit() and len(token) >= 3:
            amount = int(token)
            if not any(abs(float(product.price) - amount) <= 1 for product in products):
                return False
    return True


def _query_supports_category(query: str, category: str | None) -> bool:
    if not category:
        return False
    folded = query.casefold()
    if category.casefold() in folded:
        return True
    for word in folded.split():
        target = CATEGORY_WORDS.get(word) or HINTS.get(word)
        if target and target.casefold() == category.casefold():
            return True
    return False


def merge_reading(local: Reading, model: Reading, query: str) -> Reading:
    """Keep a clear local reading. The model may only fill a field the reader left empty."""
    query_words = set(query.casefold().split())
    if not local.brand:
        local.brand = model.brand
    if not local.category and _query_supports_category(query, model.category):
        local.category = model.category
    if local.min_price is None:
        local.min_price = model.min_price
    if local.max_price is None:
        local.max_price = model.max_price
    if local.sort == "relevance" and model.sort in {"price_asc", "price_desc", "newest"}:
        local.sort = model.sort
    if not local.keywords:
        model_words = set((model.keywords or "").casefold().split())
        if model_words & query_words:
            local.keywords = model.keywords
    return local


def interpret(query: str, brands: list[str], categories: list[str]) -> tuple[Reading, dict]:
    local = parse_query(query, brands, categories)
    local.source = "local"
    if not llm_ready():
        return local, {"provider": "local", "model": None, "latency_ms": 0, "fallback": False}

    started = time.perf_counter()
    user = json.dumps({"query": query, "brands": brands, "categories": categories, "currency": "INR"})
    try:
        payload = complete_json(system=SEARCH_SYSTEM, user=user, task="fast", timeout=6.5)
        model = sanitize(reading_from_payload(payload), brands, categories)
        reading = merge_reading(local, model, query)
        reading.source = payload.get("_provider") or "local"
        if is_blank(reading):
            local.source = "local"
            return local, {
                "provider": "local",
                "model": payload.get("_model"),
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "fallback": True,
            }
        return reading, {
            "provider": payload.get("_provider"),
            "model": payload.get("_model"),
            "latency_ms": payload.get("_latency_ms"),
            "fallback": False,
        }
    except Exception:
        logger.warning("Search interpretation fell back to the local reader", exc_info=True)
        local.source = "local"
        return local, {
            "provider": "local",
            "model": None,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "fallback": True,
        }


def draft_description(facts: dict) -> dict:
    if not llm_ready():
        raise ModelError(
            "No language model is configured. Set GROQ_API_KEY and restart the API."
        )
    user = json.dumps(
        {
            "name": facts.get("name"),
            "brand": facts.get("brand"),
            "category": facts.get("category"),
            "price": facts.get("price"),
            "currency": facts.get("currency") or "INR",
            "merchant_note": (facts.get("note") or "")[:280],
            "categories": facts.get("categories") or [],
        }
    )
    payload = complete_json(system=DESCRIBE_SYSTEM, user=user, task="quality", timeout=18)
    description = " ".join(str(payload.get("description") or "").split())
    if len(description) < 40:
        raise ModelError("The draft was too thin to use. Try again.")
    tags = []
    for raw in payload.get("tags") or []:
        tag = " ".join(str(raw).split()).lower()
        if tag and tag not in tags:
            tags.append(tag[:40])
    attributes = {}
    raw_attributes = payload.get("attributes") or {}
    if isinstance(raw_attributes, dict):
        for key, value in raw_attributes.items():
            name = str(key).strip().lower()
            if name in ATTRIBUTE_KEYS and value not in (None, ""):
                attributes[name] = str(value).strip()[:80]
    headline = " ".join(str(payload.get("title") or payload.get("headline") or "").split())[:90]
    allowed = {name.casefold(): name for name in (facts.get("categories") or [])}
    suggested = " ".join(str(payload.get("category_suggestion") or "").split())
    category_suggestion = allowed.get(suggested.casefold())
    return {
        "headline": headline,
        "description": description[:700],
        "tags": tags[:6],
        "category_suggestion": category_suggestion,
        "attributes": attributes,
        "provider": payload.get("_provider"),
        "model": payload.get("_model"),
        "latency_ms": payload.get("_latency_ms"),
    }


def draft_brief(products) -> dict:
    if llm_ready():
        payload_products = [
            {
                "name": product.name,
                "brand": product.brand.name,
                "category": product.category.name,
                "price": str(product.price),
                "currency": product.currency,
                "tags": [tag.name for tag in product.tags.all()],
                "completeness": product.completeness,
                "description": " ".join(product.description.split())[:180],
            }
            for product in products
        ]
        try:
            payload = complete_json(
                system=BRIEF_SYSTEM,
                user=json.dumps({"products": payload_products}),
                task="quality",
                timeout=18,
            )
            brief = " ".join(str(payload.get("brief") or "").split())
            if len(brief) >= 40:
                return {
                    "brief": brief[:900],
                    "title": " ".join(str(payload.get("title") or "").split())[:90],
                    "provider": payload.get("_provider") or "model",
                    "model": payload.get("_model"),
                    "latency_ms": payload.get("_latency_ms"),
                }
        except Exception:
            logger.warning("Brief fell back to the shelf composer", exc_info=True)
    return {"brief": local_brief(products), "title": "Shelf note", "provider": "local", "model": None, "latency_ms": 0}


def local_brief(products) -> str:
    categories = sorted({product.category.name for product in products})
    brands = sorted({product.brand.name for product in products})
    prices = [product.price for product in products]
    thin = sum(1 for product in products if product.completeness < 75)
    missing = sum(1 for product in products if not product.image_url)
    mix = ", ".join(categories)
    brand_list = ", ".join(brands[:6])
    text = (
        f"This set holds {len(products)} styles across {mix}. "
        f"Prices run from {format_inr(min(prices))} to {format_inr(max(prices))}. "
        f"Brands on the list: {brand_list}. "
    )
    if thin:
        text += f"{thin} of them still need a fuller story before they are shelf-ready."
    else:
        text += "Every style in the set already has a solid shelf score."
    if missing:
        text += f" {missing} are missing a photo."
    return text
