from django.contrib import admin

from .models import Activity, Brand, Category, Collection, Product, Tag


class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "brand", "category", "price", "status", "completeness")
    list_filter = ("status", "category", "brand")
    search_fields = ("sku", "name", "brand__name", "description")
    autocomplete_fields = ("brand", "category")


class BrandAdmin(admin.ModelAdmin):
    search_fields = ("name",)


class CategoryAdmin(admin.ModelAdmin):
    search_fields = ("name",)


admin.site.register(Product, ProductAdmin)
admin.site.register(Brand, BrandAdmin)
admin.site.register(Category, CategoryAdmin)
admin.site.register(Tag)
admin.site.register(Collection)
admin.site.register(Activity)
