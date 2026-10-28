from decimal import Decimal, ROUND_HALF_UP


def format_inr(value) -> str:
    amount = Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    negative = amount < 0
    digits = str(abs(int(amount)))
    if len(digits) <= 3:
        grouped = digits
    else:
        head, tail = digits[:-3], digits[-3:]
        chunks = [tail]
        while head:
            chunks.append(head[-2:])
            head = head[:-2]
        grouped = ",".join(reversed(chunks))
    return f"{'-' if negative else ''}₹{grouped}"
