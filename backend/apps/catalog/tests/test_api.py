import os
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.ai.client import extract_json
from apps.ai.reading import parse_query
from apps.catalog.services import find_duplicates, find_outliers


class ReadingTests(APITestCase):
    def test_price_brand_and_shoes(self):
        reading = parse_query(
            "black nike shoes under ₹8,000",
            ["Nike", "Tata"],
            ["Footwear", "Grocery"],
        )
        self.assertEqual(reading.brand, "Nike")
        self.assertEqual(reading.category, "Footwear")
        self.assertEqual(reading.max_price, Decimal("8000"))
        self.assertIn("black", reading.keywords)
        self.assertNotIn("shoes", reading.keywords)

    def test_cheapest_tea_keeps_the_word(self):
        reading = parse_query("cheapest tea", ["Brooke Bond"], ["Grocery", "Apparel"])
        self.assertEqual(reading.category, "Grocery")
        self.assertEqual(reading.sort, "price_asc")
        self.assertIn("tea", reading.keywords)

    def test_between_prices(self):
        reading = parse_query("watches between 5,000 and 30,000", [], ["Watches"])
        self.assertEqual(reading.category, "Watches")
        self.assertEqual(reading.min_price, Decimal("5000"))
        self.assertEqual(reading.max_price, Decimal("30000"))

    def test_extract_json_from_a_fenced_reply(self):
        payload = extract_json('```json\n{"brand": "Nike"}\n```')
        self.assertEqual(payload["brand"], "Nike")


class CatalogApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("demo", "demo@vitrine.test", "demopass123", first_name="Asha")
        self.env = mock.patch.dict(os.environ, {"GROQ_API_KEY": ""})
        self.env.start()
        self.keys = mock.patch.multiple(
            "apps.ai.client.settings",
            GROQ_API_KEY="",
        )
        self.keys.start()
        login = self.client.post("/api/auth/login/", {"username": "demo", "password": "demopass123"}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def tearDown(self):
        self.keys.stop()
        self.env.stop()

    def create_product(self, **overrides):
        payload = {
            "name": "Trial Mug",
            "brand": "Nicobar",
            "category": "Home",
            "description": "A short house note for the trial mug on the sheet today.",
            "price": "450.00",
            "image_url": "https://images.example.com/mug.jpg",
            "tags": ["mug", "ceramic", "table"],
            "attributes": {"color": "white"},
            "stock": 4,
        }
        payload.update(overrides)
        response = self.client.post("/api/products/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.data

    def test_anonymous_catalog_is_closed(self):
        self.client.credentials()
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, 401)

    def test_register_and_negative_price(self):
        self.client.credentials()
        created = self.client.post(
            "/api/auth/register/",
            {
                "username": "buyer",
                "email": "buyer@vitrine.test",
                "password": "Shelf-ready-2026",
                "first_name": "Dev",
                "last_name": "Shah",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertIn("access", created.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {created.data['access']}")
        rejected = self.client.post(
            "/api/products/",
            {"name": "Bad", "brand": "X", "category": "Home", "price": "-5"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)

    def test_filter_sort_and_pagination(self):
        self.create_product(name="Cheap Bowl", price="100.00", brand="IKEA")
        self.create_product(name="Costly Lamp", price="9000.00", brand="IKEA", category="Home")
        listed = self.client.get("/api/products/?max_price=500&ordering=price")
        self.assertEqual(listed.status_code, 200)
        names = [item["name"] for item in listed.data["results"]]
        self.assertIn("Cheap Bowl", names)
        self.assertNotIn("Costly Lamp", names)
        self.assertIn("page", listed.data)

    def test_update_delete_and_activity(self):
        product = self.create_product()
        updated = self.client.patch(
            f"/api/products/{product['id']}/",
            {"price": "500.00", "description": "A longer note " * 8},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["price"], "500.00")
        self.assertGreaterEqual(updated.data["completeness"], 70)
        removed = self.client.delete(f"/api/products/{product['id']}/")
        self.assertEqual(removed.status_code, 204)
        activity = self.client.get("/api/activity/")
        summaries = " ".join(item["summary"] for item in activity.data["results"])
        self.assertIn("Removed", summaries)

    def test_natural_search_stays_on_the_database(self):
        self.create_product(name="Assam Tea Tin", brand="Brooke Bond", category="Grocery", price="285.00", tags=["tea"])
        self.create_product(name="Court Sneaker", brand="Adidas", category="Footwear", price="7000.00", tags=["sneaker"])
        response = self.client.post("/api/ai/search/", {"query": "cheapest tea"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["interpretation"]["source"], "local")
        self.assertEqual(response.data["interpretation"]["category"], "Grocery")
        self.assertEqual(response.data["products"][0]["name"], "Assam Tea Tin")
        self.assertIn("1 product", response.data["answer"])

    def test_describe_without_a_key_is_honest(self):
        response = self.client.post(
            "/api/ai/describe/",
            {"name": "Trail Runner", "brand": "Nike", "category": "Footwear", "price": "8299"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("GROQ_API_KEY", response.data["detail"])

    def test_duplicates_and_outliers(self):
        self.create_product(name="Pegasus Trail Runner", brand="Nike", category="Footwear", price="8000")
        self.create_product(name="Pegasus Trail Runner 2", brand="Nike", category="Footwear", price="8200")
        pairs = find_duplicates()
        self.assertTrue(any(pair["score"] >= 0.78 for pair in pairs))
        for index, price in enumerate(["100", "200", "300", "9000"]):
            self.create_product(name=f"Pantry {index}", brand="Tata", category="Grocery", price=price)
        reasons = " ".join(item["reason"] for item in find_outliers())
        self.assertIn("Grocery", reasons)

    def test_csv_import(self):
        content = (
            "name,brand,category,description,price,currency,image_url,stock,tags,status\n"
            "Trial Candle,Nicobar,Home,A short soy candle.,450,INR,,4,home|soy,draft\n"
        ).encode()
        upload = SimpleUploadedFile("styles.csv", content, content_type="text/csv")
        response = self.client.post("/api/products/import/", {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["created"], 1)
        drafts = self.client.get("/api/products/?status=draft")
        self.assertEqual(drafts.data["results"][0]["name"], "Trial Candle")

    def test_health_and_docs_are_public(self):
        self.client.credentials()
        health = self.client.get("/api/health/")
        self.assertEqual(health.status_code, 200)
        docs = self.client.get("/api/docs/")
        self.assertEqual(docs.status_code, 200)
