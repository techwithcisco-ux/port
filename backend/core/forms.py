from django import forms
from django.contrib.auth.forms import AuthenticationForm

from .models import AppUser, Business, BUSINESS_FORMS, BUSINESS_TYPES, Expense, InventoryAllocation, InventoryIntake, Product, Supplier


class PhoneLoginForm(AuthenticationForm):
    username = forms.CharField(label="Phone number", widget=forms.TextInput(attrs={"placeholder": "054 123 4567", "autocomplete": "tel"}))


class OwnerSignupForm(forms.Form):
    name = forms.CharField(max_length=150)
    phone = forms.CharField(max_length=30)
    business_name = forms.CharField(max_length=200)
    business_form = forms.ChoiceField(choices=BUSINESS_FORMS, initial="retail")
    business_type = forms.ChoiceField(choices=BUSINESS_TYPES, initial="grocery")
    password = forms.CharField(widget=forms.PasswordInput, min_length=7)


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = ["name", "bulk_unit_name", "retail_unit_name", "units_per_bulk", "bulk_cost_price", "bulk_sell_price", "retail_sell_price"]


class SupplierForm(forms.ModelForm):
    class Meta:
        model = Supplier
        fields = ["name"]


class IntakeForm(forms.ModelForm):
    class Meta:
        model = InventoryIntake
        fields = ["supplier", "product", "bulk_quantity", "cost_price_total", "amount_paid"]


class AllocationForm(forms.ModelForm):
    class Meta:
        model = InventoryAllocation
        fields = ["product", "branch", "bulk_quantity", "retail_quantity_equivalent"]


class ExpenseForm(forms.ModelForm):
    class Meta:
        model = Expense
        fields = ["branch", "category", "description", "amount", "frequency"]


class QuickSaleForm(forms.Form):
    product = forms.ModelChoiceField(queryset=Product.objects.none())
    variant = forms.ChoiceField(choices=[], required=False)
    quantity = forms.DecimalField(min_value=1, initial=1)
    cut_price = forms.DecimalField(min_value=0, required=False)
    customer_name = forms.CharField(max_length=200, required=False)
    customer_phone = forms.CharField(max_length=30, required=False)
    payment_mode = forms.ChoiceField(choices=[("full", "Cash"), ("credit", "Credit")], initial="full")

    def __init__(self, business, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["product"].queryset = Product.objects.filter(business=business).order_by("name")
