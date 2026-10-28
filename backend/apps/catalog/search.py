import re

from django.db import connection
from django.db.models import Q


def text_search(queryset, phrase: str):
    words = [word for word in phrase.split() if word]
    if not words:
        return queryset

    def word_query(word: str) -> Q:
        variants = {word}
        if word.endswith("s") and len(word) > 3:
            variants.add(word[:-1])
        query = Q()
        for variant in variants:
            if connection.vendor == "postgresql":
                pattern = rf"(^|[^[:alnum:]]){re.escape(variant)}([^[:alnum:]]|$)"
                query |= (
                    Q(name__iregex=pattern)
                    | Q(description__iregex=pattern)
                    | Q(brand__name__iregex=pattern)
                    | Q(category__name__iregex=pattern)
                    | Q(sku__iregex=pattern)
                    | Q(tags__name__iregex=pattern)
                )
            else:
                query |= (
                    Q(name__icontains=variant)
                    | Q(description__icontains=variant)
                    | Q(brand__name__icontains=variant)
                    | Q(category__name__icontains=variant)
                    | Q(sku__icontains=variant)
                    | Q(tags__name__icontains=variant)
                )
        return query

    combined = word_query(words[0])
    for word in words[1:]:
        nxt = word_query(word)
        combined = combined & nxt if len(words) <= 2 else combined | nxt

    if connection.vendor != "postgresql":
        return queryset.filter(combined).distinct()

    from django.contrib.postgres.search import TrigramSimilarity

    ranked = queryset.annotate(
        sim=TrigramSimilarity("name", phrase) + TrigramSimilarity("brand__name", phrase)
    )
    return ranked.filter(combined).distinct()
