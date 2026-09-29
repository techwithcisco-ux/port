"""BranchPort data model — Python port of apps/api/schema.sql + packages/shared/src/types.ts.

Trust rules enforced at the model layer (mirrors the API-layer rules in apps/api):
- Sale / InventoryIntake / InventoryAllocation are immutable: no update/delete
  through the UI (admin also blocks change/delete for Sale).
- AuditEvent is append-only and written ONLY by signals (like the
  explicit writes apps/api makes on every mutation). Views never write it directly.
- Sale.sold_by is always the logged-in user; unit_price/total kept consistent.
"""
import uuid
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


ROLE_CHOICES = [("owner", "Owner"), ("manager", "Manager"), ("staff", "Staff")]
UNIT_CHOICES = [("bulk", "Bulk"), ("retail", "Retail")]
BUSINESS_FORMS = [("retail", "Retail"), ("wholesale", "Wholesale"), ("both", "Both")]
BUSINESS_TYPES = [("grocery", "Grocery"), ("pharmacy", "Pharmacy"), ("stationery", "Stationery"), ("electronics", "Electronics"), ("general", "General"), ("other", "Other")]


def normalize_phone(v: str) -> str:
    return "".join(ch for ch in (v or "").strip() if ch.isdigit() or ch == "+").replace(" ", "")


class Business(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    business_form = models.CharField(max_length=20, choices=BUSINESS_FORMS, default="retail")
    business_type = models.CharField(max_length=50, choices=BUSINESS_TYPES, default="grocery")
    owner = models.ForeignKey("core.AppUser", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_businesses")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.business.name} — {self.name}"


class AppUser(AbstractUser):
    """Custom user: phone is the login identity, role scopes every view."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, null=True, blank=True, on_delete=models.CASCADE, related_name="users")
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name="staff")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="staff")
    phone = models.CharField(max_length=30, unique=True)
    pos_activated = models.BooleanField(default=True)
    pos_activation_token = models.CharField(max_length=64, null=True, blank=True, unique=True)

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone or self.username)
        if not self.username:
            self.username = self.phone
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="products")
    name = models.CharField(max_length=200)
    bulk_unit_name = models.CharField(max_length=50, default="bag")
    retail_unit_name = models.CharField(max_length=50, default="cup")
    units_per_bulk = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    bulk_cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bulk_sell_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    retail_sell_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def base_cost(self) -> Decimal:
        if self.units_per_bulk and self.units_per_bulk > 0:
            return self.bulk_cost_price / self.units_per_bulk
        return Decimal("0")

    def get_variants(self):
        stored = list(self.variants.order_by("sort_order"))
        if stored:
            return stored
        # Synthetic retail/bulk fallback (mirrors variants.ts getProductVariants)
        return [
            ProductVariant(product=self, name=self.retail_unit_name, price=self.retail_sell_price, base_units=1, sort_order=0),
            ProductVariant(product=self, name=self.bulk_unit_name, price=self.bulk_sell_price, base_units=self.units_per_bulk or 1, sort_order=1),
        ]


class ProductVariant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    base_units = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product.name} — {self.name}"


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="suppliers")
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class InventoryIntake(models.Model):
    """Immutable once created (no edit view). amount_owed is derived, not stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="intakes")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="intakes")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="intakes")
    bulk_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price_total = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="intakes")

    @property
    def amount_owed(self):
        return (self.cost_price_total or 0) - (self.amount_paid or 0)


class InventoryAllocation(models.Model):
    """Immutable once created."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="allocations")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="allocations")
    bulk_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    retail_quantity_equivalent = models.DecimalField(max_digits=12, decimal_places=2)
    allocated_at = models.DateTimeField(auto_now_add=True)
    allocated_by = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="allocations")

    def clean(self):
        if self.bulk_quantity is not None and self.bulk_quantity <= 0:
            raise ValidationError("Bulk quantity must be > 0.")


class Sale(models.Model):
    """Append-only. No update/delete — enforced in admin + no edit views."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="sales")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sales")
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL)
    unit_type = models.CharField(max_length=10, choices=UNIT_CHOICES, default="retail")
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    sold_by = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="sales")
    sold_at = models.DateTimeField(default=timezone.now)
    client_reported_at = models.DateTimeField(default=timezone.now)
    price_flagged = models.BooleanField(default=False)
    customer_name = models.CharField(max_length=200, null=True, blank=True)
    customer_phone = models.CharField(max_length=30, null=True, blank=True)
    cut_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_discounted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-sold_at"]

    def clean(self):
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError("Quantity must be > 0.")
        if self.unit_price is not None and self.unit_price < 0:
            raise ValidationError("Unit price cannot be negative (zero-price guard).")

    def sale_base_units(self) -> Decimal:
        """How many base units one sold unit consumes (mirrors saleBaseUnits)."""
        if self.variant_id and self.variant.base_units:
            return self.variant.base_units
        if self.unit_type == "bulk":
            return self.product.units_per_bulk or Decimal("1")
        return Decimal("1")


class SupplierPayment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="supplier_payments")
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    supplier_payment_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    paid_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(AppUser, on_delete=models.PROTECT)


class SupplierReconciliation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=[("confirmed", "Confirmed"), ("disputed", "Disputed")])
    supplier_reconciliation_status = models.CharField(max_length=20, null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    reconciled_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(AppUser, on_delete=models.PROTECT)


class AuditEvent(models.Model):
    """Append-only. Written only by signals; admin + views are read-only."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="audit_events")
    action_type = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=64)
    before_state = models.JSONField(null=True, blank=True)
    after_state = models.JSONField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    client_reported_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-occurred_at"]


class Invoice(models.Model):
    STATUS = [("pending", "Pending"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=30, unique=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="invoices")
    created_by = models.ForeignKey(AppUser, on_delete=models.PROTECT)
    customer_name = models.CharField(max_length=200, null=True, blank=True)
    customer_phone = models.CharField(max_length=30, null=True, blank=True)
    items_data = models.JSONField(default=list)  # list of {product_id, product_name, variant_name, qty, unit_price, total}
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_mode = models.CharField(max_length=10, default="full")
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_owed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS, default="completed")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class Expense(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="expenses")
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL)
    category = models.CharField(max_length=30, default="misc")
    description = models.CharField(max_length=300)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    frequency = models.CharField(max_length=10, default="one_off")
    created_by = models.ForeignKey(AppUser, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class Debtor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="debtors")
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL)
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=30, null=True, blank=True)
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.SET_NULL)
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_owed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, default="pending")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Creditor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="creditors")
    supplier_name = models.CharField(max_length=200)
    supplier_phone = models.CharField(max_length=30, null=True, blank=True)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL)
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_owed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, default="pending")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class InvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="invoice_items")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=200)
    variant_name = models.CharField(max_length=100, null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.product_name} × {self.qty}"


class ManagerAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE)
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="managed_assignments")
    manager = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="branch_assignments")
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL)
    assigned_at = models.DateTimeField(auto_now_add=True)
