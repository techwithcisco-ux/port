"""Admin — Sale/AuditEvent are read-only (append-only trust rule)."""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (AppUser, AuditEvent, Branch, Business, Creditor, Debtor, Expense, InventoryAllocation,
                     InventoryIntake, Invoice, InvoiceItem, Product, ProductVariant, Sale, Supplier)


@admin.register(AppUser)
class AppUserAdmin(UserAdmin):
    list_display = ("username", "phone", "role", "business", "branch")
    list_filter = ("role",)
    fieldsets = UserAdmin.fieldsets + (("BranchPort", {"fields": ("phone", "role", "business", "branch", "pos_activated")}),)


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ("name", "business_type", "created_at")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "created_at")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "retail_sell_price", "bulk_cost_price")


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("sold_at", "product", "branch", "quantity", "total_price", "sold_by", "price_flagged")
    list_filter = ("price_flagged", "branch")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("occurred_at", "business", "actor", "action_type", "entity_type")
    list_filter = ("action_type", "entity_type")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for _m in (ProductVariant, Supplier, InventoryIntake, InventoryAllocation, Invoice, InvoiceItem, Expense, Debtor, Creditor):
    try:
        admin.site.register(_m)
    except admin.sites.AlreadyRegistered:
        pass
