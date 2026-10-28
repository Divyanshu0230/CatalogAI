from django.db import migrations


def create_extension(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS catalog_product_name_trgm ON catalog_product USING gin (name gin_trgm_ops)"
    )
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS catalog_brand_name_trgm ON catalog_brand USING gin (name gin_trgm_ops)"
    )


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]
    operations = [migrations.RunPython(create_extension, migrations.RunPython.noop)]
