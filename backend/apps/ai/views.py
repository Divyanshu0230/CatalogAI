from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.filters import base_queryset
from apps.catalog.models import Brand, Category, Product
from apps.catalog.serializers import DescribeSerializer, ProductSerializer, SearchQuerySerializer
from apps.catalog.services import log_activity

from .client import ModelError, status_payload
from .reading import apply_reading, narrate
from .models import ChatMessage, Conversation
from .services import answer_chat, answer_followup, assist_product, chat_suggestions, draft_description, greeting, interpret


class StatusView(APIView):
    @extend_schema(tags=["AI"])
    def get(self, request):
        body = status_payload()
        body["provider_setting"] = settings.AI_PROVIDER
        return Response(body)


class DescribeView(APIView):
    @extend_schema(tags=["AI"], request=DescribeSerializer)
    def post(self, request):
        serializer = DescribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        facts = serializer.validated_data
        try:
            draft = draft_description(
                {
                    "name": facts["name"],
                    "brand": facts["brand"],
                    "category": facts.get("category") or "",
                    "price": str(facts["price"]) if facts.get("price") is not None else None,
                    "currency": facts.get("currency") or "INR",
                    "note": facts.get("note") or "",
                    "categories": list(Category.objects.values_list("name", flat=True)),
                }
            )
        except ModelError as exc:
            return Response({"detail": str(exc)}, status=503)
        log_activity(
            request.user,
            "described",
            f"Drafted shelf copy for {facts['name']}",
            {"provider": draft.get("provider"), "model": draft.get("model")},
        )
        return Response(draft)


class ProductAssistView(APIView):
    @extend_schema(tags=["AI"])
    def post(self, request, pk):
        product = Product.objects.filter(pk=pk).select_related("brand", "category").first()
        if product is None:
            return Response({"detail": "That product was not found."}, status=404)
        task = str(request.data.get("task") or "explain")
        if task not in {"explain", "audience", "rewrite", "questions", "compare"}:
            return Response({"detail": "Choose an action first."}, status=400)
        others = []
        if task == "compare":
            others = list(
                Product.objects.filter(category=product.category, status=Product.Status.ACTIVE)
                .exclude(pk=product.pk)
                .select_related("brand", "category")[:2]
            )
        try:
            body = assist_product(product, others, task)
        except ModelError as exc:
            return Response({"detail": str(exc)}, status=503)
        log_activity(
            request.user,
            "described",
            f"Asked Catalog Assistant AI to {task} {product.name}",
            {"provider": body.get("provider"), "task": task},
        )
        return Response(body)


WELCOME = (
    "Hi, I'm Catalog Assistant AI. Ask me how I am, or ask for a product, a brand, or a budget."
)


def _snapshot(product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand.name,
        "category": product.category.name,
        "price": str(product.price),
        "currency": product.currency,
    }


def _message_payload(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "products": message.products or [],
        "created_at": message.created_at.isoformat(),
    }


class ConversationListView(APIView):
    @extend_schema(tags=["AI"])
    def get(self, request):
        rows = Conversation.objects.filter(user=request.user)[:30]
        return Response(
            [
                {"id": row.id, "title": row.title, "updated_at": row.updated_at.isoformat()}
                for row in rows
            ]
        )

    @extend_schema(tags=["AI"])
    def post(self, request):
        conversation = Conversation.objects.create(user=request.user)
        ChatMessage.objects.create(conversation=conversation, role=ChatMessage.Role.ASSISTANT, content=WELCOME)
        return Response(
            {
                "id": conversation.id,
                "title": conversation.title,
                "messages": [_message_payload(message) for message in conversation.messages.all()],
            },
            status=201,
        )


class ConversationDetailView(APIView):
    @extend_schema(tags=["AI"])
    def get(self, request, pk):
        conversation = Conversation.objects.filter(user=request.user, pk=pk).first()
        if conversation is None:
            return Response({"detail": "That chat was not found."}, status=404)
        return Response(
            {
                "id": conversation.id,
                "title": conversation.title,
                "messages": [_message_payload(message) for message in conversation.messages.all()],
            }
        )

    @extend_schema(tags=["AI"])
    def delete(self, request, pk):
        deleted, _ = Conversation.objects.filter(user=request.user, pk=pk).delete()
        if not deleted:
            return Response({"detail": "That chat was not found."}, status=404)
        return Response(status=204)


class ConversationMessageView(APIView):
    @extend_schema(tags=["AI"])
    def post(self, request, pk):
        conversation = Conversation.objects.filter(user=request.user, pk=pk).first()
        if conversation is None:
            return Response({"detail": "That chat was not found."}, status=404)
        text = " ".join(str(request.data.get("content") or "").split())[:500]
        if len(text) < 2:
            return Response({"detail": "Write a message first."}, status=400)
        history = list(conversation.messages.all())
        previous = []
        for message in reversed(history):
            if message.role == ChatMessage.Role.ASSISTANT and message.products:
                previous = message.products
                break
        ChatMessage.objects.create(conversation=conversation, role=ChatMessage.Role.USER, content=text)
        if conversation.title == "New chat" and not greeting(text):
            conversation.title = text[:48]
        hello = greeting(text)
        follow = None if hello else answer_followup(text, previous)
        if hello:
            reply, products = hello, []
        elif follow:
            reply, products = follow
        else:
            transcript = [{"role": message.role, "content": message.content} for message in history]
            transcript.append({"role": "user", "content": text})
            brands = list(Brand.objects.values_list("name", flat=True))
            categories = list(Category.objects.values_list("name", flat=True))
            result = answer_chat(transcript, brands, categories)
            reply = result["reply"]
            products = result["products"]
        saved = ChatMessage.objects.create(
            conversation=conversation,
            role=ChatMessage.Role.ASSISTANT,
            content=reply,
            products=[_snapshot(product) for product in products],
        )
        conversation.save(update_fields=["title", "updated_at"])
        log_activity(request.user, "chatted", f"Asked the assistant “{text[:160]}”", {"count": len(products)})
        return Response(
            {
                "reply": _message_payload(saved),
                "suggestions": chat_suggestions(products, social=bool(hello)),
            }
        )


class ChatView(APIView):
    @extend_schema(tags=["AI"])
    def post(self, request):
        raw = request.data.get("messages")
        if not isinstance(raw, list) or not raw:
            return Response({"detail": "Send a message first."}, status=400)
        messages = []
        for item in raw[-8:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = " ".join(str(item.get("content") or "").split())[:500]
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        if not messages or messages[-1]["role"] != "user":
            return Response({"detail": "Send a message first."}, status=400)
        brands = list(Brand.objects.values_list("name", flat=True))
        categories = list(Category.objects.values_list("name", flat=True))
        result = answer_chat(messages, brands, categories)
        products = result.pop("products")
        log_activity(
            request.user,
            "chatted",
            f"Asked the assistant “{messages[-1]['content'][:160]}”",
            {"count": len(products)},
        )
        return Response(
            {
                "reply": result["reply"],
                "suggestions": result["suggestions"],
                "products": ProductSerializer(products, many=True).data,
            }
        )


class SearchView(APIView):
    @extend_schema(tags=["AI"], request=SearchQuerySerializer)
    def post(self, request):
        serializer = SearchQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data["query"]
        brands = list(Brand.objects.values_list("name", flat=True))
        categories = list(Category.objects.values_list("name", flat=True))
        reading, meta = interpret(query, brands, categories)
        queryset = apply_reading(base_queryset().filter(status=Product.Status.ACTIVE), reading)
        products = list(queryset[:24])
        answer = narrate(query, reading, products)
        log_activity(
            request.user,
            "searched",
            f"Asked “{query[:180]}” · {len(products)} styles",
            {"provider": meta.get("provider"), "count": len(products)},
        )
        steps = [
            {"label": "Read the sentence", "detail": query},
            {
                "label": "Bind it to the sheet",
                "detail": _binding_detail(reading),
            },
            {
                "label": "Count matching styles",
                "detail": answer,
            },
        ]
        return Response(
            {
                "query": query,
                "interpretation": reading.as_dict(),
                "meta": meta,
                "answer": answer,
                "steps": steps,
                "products": ProductSerializer(products, many=True, context={"request": request}).data,
            }
        )


def _binding_detail(reading) -> str:
    parts = []
    if reading.brand:
        parts.append(f"Brand {reading.brand}")
    if reading.category:
        parts.append(f"Category {reading.category}")
    if reading.min_price is not None:
        parts.append(f"From {reading.min_price}")
    if reading.max_price is not None:
        parts.append(f"Up to {reading.max_price}")
    if reading.keywords:
        parts.append(f"Words “{reading.keywords}”")
    if reading.sort != "relevance":
        parts.append(f"Sort {reading.sort.replace('_', ' ')}")
    parts.append(f"Reader {reading.source}")
    return " · ".join(parts)
