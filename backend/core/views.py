"""Full-Python UI — server-rendered replacement for the React dashboard + POS + market apps."""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .analytics import branch_stats, business_analytics, detect_flags
from .forms import (AllocationForm, ExpenseForm, IntakeForm, OwnerSignupForm, PhoneLoginForm, ProductForm,
                    QuickSaleForm, SupplierForm)
from .models import (AppUser, AuditEvent, Branch, Business, Creditor, Debtor, Expense, InvoiceItem, InventoryAllocation,
                      InventoryIntake, Invoice, Product, ProductVariant, Sale, Supplier, normalize_phone)


# ── helpers ──────────────────────────────────────────────────────────

def _biz(user):
    return user.business


def role_required(*roles):
    def deco(view):
        @login_required
        def wrapper(request, *args, **kwargs):
            if request.user.role not in roles:
                messages.error(request, "You don't have access to that page.")
                return redirect("home")
            return view(request, *args, **kwargs)
        return wrapper
    return deco


def ghs(n):
    try:
        return f"GHS {Decimal(str(n or 0)):,.2f}"
    except Exception:
        return f"GHS {n}"


# ── auth ─────────────────────────────────────────────────────────────

def login_view(request):
    if request.user.is_authenticated:
        return redirect("home")
    form = PhoneLoginForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        phone = normalize_phone(form.cleaned_data["username"])
        user = authenticate(request, username=phone, password=form.cleaned_data["password"])
        if user is None:  # allow raw username fallback
            user = authenticate(request, username=form.cleaned_data["username"], password=form.cleaned_data["password"])
        if user:
            login(request, user)
            return redirect("home")
        messages.error(request, "Wrong phone number or password.")
    return render(request, "core/login.html", {"form": form, "show_splash": True})


def signup_view(request):
    form = OwnerSignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        phone = normalize_phone(form.cleaned_data["phone"])
        if AppUser.objects.filter(phone=phone).exists():
            messages.error(request, "This phone number is already registered. Please sign in.")
        else:
            biz = Business.objects.create(name=form.cleaned_data["business_name"], business_form=form.cleaned_data["business_form"], business_type=form.cleaned_data["business_type"])
            user = AppUser(username=phone, phone=phone, role="owner", business=biz,
                           first_name=form.cleaned_data["name"])
            user.set_password(form.cleaned_data["password"])
            user.save()
            biz.owner = user
            biz.save()
            # default branch so POS/stock work immediately
            Branch.objects.create(business=biz, name="Main Branch")
            login(request, user)
            messages.success(request, f"Akwaaba, {form.cleaned_data['name']}! Your business is ready.")
            return redirect("home")
    return render(request, "core/signup.html", {"form": form, "show_splash": True})


def logout_view(request):
    logout(request)
    return redirect("login")


@login_required
def home(request):
    role = request.user.role
    if role == "owner":
        return redirect("owner_home")
    if role == "manager":
        return redirect("manager_home")
    return redirect("pos_sell")


# ── owner ────────────────────────────────────────────────────────────

@role_required("owner")
def owner_home(request):
    biz = _biz(request.user)
    branches = list(biz.branches.all())
    products = list(biz.products.all())
    sales = list(Sale.objects.filter(branch__business=biz).select_related("product", "variant", "branch"))
    allocs = list(InventoryAllocation.objects.filter(branch__business=biz))
    data = business_analytics(products, branches, allocs, sales)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_sales = [s for s in sales if s.sold_at >= today]
    revenue_today = sum((s.total_price for s in today_sales), Decimal("0"))
    return render(request, "core/owner_home.html", {
        "biz": biz, "branches": branches, "data": data, "revenue_today": revenue_today,
        "sales_count": len(sales), "ghs": ghs,
    })


@role_required("owner", "manager")
def product_list(request):
    biz = _biz(request.user)
    products = biz.products.prefetch_related("variants").all()
    form = ProductForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        p = form.save(commit=False)
        p.business = biz
        p.save()
        # auto-create retail/bulk variants for the till
        ProductVariant.objects.create(product=p, name=p.retail_unit_name, price=p.retail_sell_price, base_units=1, sort_order=0)
        ProductVariant.objects.create(product=p, name=p.bulk_unit_name, price=p.bulk_sell_price, base_units=p.units_per_bulk or 1, sort_order=1)
        messages.success(request, f"Product '{p.name}' added.")
        return redirect("products")
    return render(request, "core/products.html", {"products": products, "form": form})


@role_required("owner")
def owner_stores(request):
    biz = _biz(request.user)
    branches = biz.branches.all()
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        if name:
            Branch.objects.create(business=biz, name=name)
            messages.success(request, f"Branch '{name}' created.")
            return redirect("owner_stores")
    data = []
    for b in branches:
        sales = Sale.objects.filter(branch=b)
        rev = sales.aggregate(t=Sum("total_price"))["t"] or 0
        data.append({"branch": b, "revenue": rev, "sales": sales.count(),
                     "stock": InventoryAllocation.objects.filter(branch=b).count()})
    return render(request, "core/stores.html", {"branches": data})


@role_required("owner", "manager")
def intake_view(request):
    biz = _biz(request.user)
    intakes = InventoryIntake.objects.filter(business=biz).select_related("supplier", "product").order_by("-created_at")[:100]
    form = IntakeForm(request.POST or None)
    if form.is_valid():
        form.fields["supplier"].queryset = biz.suppliers.all()
        form.fields["product"].queryset = biz.products.all()
    else:
        form.fields["supplier"].queryset = biz.suppliers.all()
        form.fields["product"].queryset = biz.products.all()
    if request.method == "POST" and form.is_valid():
        row = form.save(commit=False)
        row.business = biz
        row.created_by = request.user
        row.full_clean()
        row.save()
        messages.success(request, "Stock intake recorded (immutable).")
        return redirect("intake")
    owed = sum((i.amount_owed for i in InventoryIntake.objects.filter(business=biz)), Decimal("0"))
    return render(request, "core/intake.html", {"intakes": intakes, "form": form, "owed": owed, "ghs": ghs})


@role_required("owner", "manager")
def allocation_view(request):
    biz = _biz(request.user)
    allocs = InventoryAllocation.objects.filter(branch__business=biz).select_related("product", "branch").order_by("-allocated_at")[:100]
    form = AllocationForm(request.POST or None)
    form.fields["product"].queryset = biz.products.all()
    form.fields["branch"].queryset = biz.branches.all()
    if request.method == "POST" and form.is_valid():
        row = form.save(commit=False)
        row.allocated_by = request.user
        row.full_clean()
        row.save()
        messages.success(request, "Stock allocated to branch.")
        return redirect("allocation")
    return render(request, "core/allocation.html", {"allocs": allocs, "form": form})


@role_required("owner", "manager")
def suppliers_view(request):
    biz = _biz(request.user)
    suppliers = biz.suppliers.all()
    form = SupplierForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        s = form.save(commit=False)
        s.business = biz
        s.save()
        return redirect("suppliers")
    ledger = []
    for s in suppliers:
        owed = sum((i.amount_owed for i in s.intakes.all()), Decimal("0"))
        paid = s.payments.aggregate(t=Sum("amount"))["t"] or 0
        ledger.append({"s": s, "owed": owed, "paid": paid, "balance": owed - paid})
    return render(request, "core/suppliers.html", {"ledger": ledger, "form": form, "ghs": ghs})


@role_required("owner")
def audit_view(request):
    biz = _biz(request.user)
    events = AuditEvent.objects.filter(business=biz).select_related("actor").order_by("-occurred_at")[:200]
    q = request.GET.get("q", "").strip()
    if q:
        events = events.filter(Q(entity_type__icontains=q) | Q(action_type__icontains=q))[:200]
    return render(request, "core/audit.html", {"events": events, "q": q})


@role_required("owner")
def flags_view(request):
    biz = _biz(request.user)
    sales = list(Sale.objects.filter(branch__business=biz).select_related("product", "variant", "branch", "sold_by")[:500])
    products = list(biz.products.all())
    flags = detect_flags(sales, products)
    users = {str(u.id): u for u in AppUser.objects.filter(business=biz)}
    return render(request, "core/flags.html", {"flags": flags, "users": users, "ghs": ghs})


@role_required("owner")
def balance_sheet_view(request):
    biz = _biz(request.user)
    products = list(biz.products.all())
    allocs = list(InventoryAllocation.objects.filter(branch__business=biz))
    sales = list(Sale.objects.filter(branch__business=biz))
    data = business_analytics(products, list(biz.branches.all()), allocs, sales)
    expenses = Expense.objects.filter(business=biz).aggregate(t=Sum("amount"))["t"] or 0
    debtors = Debtor.objects.filter(business=biz).aggregate(t=Sum("amount_owed"))["t"] or 0
    creditors = Creditor.objects.filter(business=biz).aggregate(t=Sum("amount_owed"))["t"] or 0
    stock_value = sum((p.base_cost * sum((a.retail_quantity_equivalent for a in allocs if str(a.product_id) == str(p.id)), Decimal("0")) for p in products), Decimal("0"))
    return render(request, "core/balance.html", {
        "data": data, "expenses": expenses, "debtors": debtors, "creditors": creditors,
        "stock_value": stock_value, "ghs": ghs,
    })


@role_required("owner")
def team_view(request):
    biz = _biz(request.user)
    users = AppUser.objects.filter(business=biz).select_related("branch")
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        phone = normalize_phone(request.POST.get("phone", ""))
        role = request.POST.get("role", "staff")
        branch_id = request.POST.get("branch") or None
        password = request.POST.get("password", "password123")
        if name and phone and not AppUser.objects.filter(phone=phone).exists():
            u = AppUser(username=phone, phone=phone, first_name=name, role=role, business=biz,
                        branch_id=branch_id if branch_id else None)
            u.set_password(password)
            u.save()
            messages.success(request, f"{role.title()} '{name}' added (login: {phone}).")
            return redirect("team")
        messages.error(request, "Name + unique phone required.")
    return render(request, "core/team.html", {"users": users, "branches": biz.branches.all()})


@role_required("owner", "manager")
def sales_report_view(request):
    biz = _biz(request.user)
    sales = Sale.objects.filter(branch__business=biz).select_related("product", "branch", "sold_by").order_by("-sold_at")[:300]
    branch_id = request.GET.get("branch")
    if branch_id:
        sales = sales.filter(branch_id=branch_id)
    total = sales.aggregate(t=Sum("total_price"))["t"] or 0
    return render(request, "core/sales_report.html", {
        "sales": sales, "total": total, "branches": biz.branches.all(), "ghs": ghs,
        "active_branch": branch_id or "",
    })


@role_required("owner", "manager")
def profit_loss_view(request):
    biz = _biz(request.user)
    products = list(biz.products.all())
    branches = list(biz.branches.all())
    sales = list(Sale.objects.filter(branch__business=biz).select_related("product", "variant"))
    allocs = list(InventoryAllocation.objects.filter(branch__business=biz))
    data = business_analytics(products, branches, allocs, sales)
    expenses = Expense.objects.filter(business=biz).aggregate(t=Sum("amount"))["t"] or 0
    net = data["profit"] - (expenses or 0)
    return render(request, "core/profit_loss.html", {"data": data, "expenses": expenses, "net": net, "ghs": ghs})


@role_required("owner", "manager")
def expenses_view(request):
    biz = _biz(request.user)
    expenses = Expense.objects.filter(business=biz).order_by("-created_at")[:200]
    form = ExpenseForm(request.POST or None)
    if request.method == "POST":
        form.fields["branch"].queryset = biz.branches.all()
        if form.is_valid():
            e = form.save(commit=False)
            e.business = biz
            e.created_by = request.user
            e.save()
            return redirect("expenses")
    else:
        form.fields["branch"].queryset = biz.branches.all()
    total = expenses.aggregate(t=Sum("amount"))["t"] if hasattr(expenses, "aggregate") else 0
    return render(request, "core/expenses.html", {"expenses": expenses, "form": form, "ghs": ghs})


@role_required("owner", "manager")
def ledger_view(request):
    biz = _biz(request.user)
    debtors = Debtor.objects.filter(business=biz).order_by("-created_at")[:200]
    creditors = Creditor.objects.filter(business=biz).order_by("-created_at")[:200]
    if request.method == "POST":
        kind = request.POST.get("kind")
        if kind == "debtor":
            amt = Decimal(request.POST.get("amount") or 0)
            Debtor.objects.create(business=biz, branch=request.user.branch,
                                  customer_name=request.POST.get("customer_name", "Walk-in"),
                                  customer_phone=request.POST.get("customer_phone") or None,
                                  original_amount=amt, amount_owed=amt)
            return redirect("ledger")
        if kind == "creditor":
            amt = Decimal(request.POST.get("amount") or 0)
            Creditor.objects.create(business=biz, supplier_name=request.POST.get("supplier_name", "Supplier"),
                                    original_amount=amt, amount_owed=amt)
            return redirect("ledger")
    return render(request, "core/ledger.html", {"debtors": debtors, "creditors": creditors, "ghs": ghs})


@role_required("owner", "manager")
def stock_balance_view(request):
    biz = _biz(request.user)
    products = list(biz.products.all())
    allocs = list(InventoryAllocation.objects.filter(branch__business=biz))
    sales = list(Sale.objects.filter(branch__business=biz))
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    branch_id = request.GET.get("branch") or None
    stats = branch_stats(products, allocs, sales, branch_id, today)
    return render(request, "core/stock_balance.html", {
        "stats": stats, "branches": biz.branches.all(), "active_branch": branch_id or "", "ghs": ghs,
    })


@role_required("manager")
def manager_home(request):
    biz = _biz(request.user)
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    sales = list(Sale.objects.filter(branch__business=biz))
    stats = branch_stats(list(biz.products.all()), list(InventoryAllocation.objects.filter(branch__business=biz)), sales, None, today)
    return render(request, "core/manager_home.html", {"biz": biz, "stats": stats, "ghs": ghs})


@role_required("owner")
def market_view(request):
    """Cross-business aggregated intelligence (simple, no PII)."""
    products = Product.objects.values("name").annotate(revenue=Sum("sales__total_price"), sold=Sum("sales__quantity")).order_by("-revenue")[:20]
    total_rev = Sale.objects.aggregate(t=Sum("total_price"))["t"] or 0
    total_sales = Sale.objects.count()
    shops = Business.objects.count()
    return render(request, "core/market.html", {"products": products, "total_rev": total_rev, "total_sales": total_sales, "shops": shops, "ghs": ghs})


# ── POS (staff) ──────────────────────────────────────────────────────

def _pos_branch(request):
    if request.user.role == "staff":
        return request.user.branch
    # manager/owner testing the till: use first branch (or ?branch=)
    bid = request.GET.get("branch") or request.session.get("pos_branch")
    biz = _biz(request.user)
    if bid:
        try:
            b = biz.branches.get(id=bid)
            request.session["pos_branch"] = str(b.id)
            return b
        except Branch.DoesNotExist:
            pass
    return biz.branches.first()


@role_required("owner", "manager", "staff")
def pos_sell(request):
    biz = _biz(request.user)
    if request.user.role == "staff" and not request.user.pos_activated:
        return redirect("staff_notice")
    branch = _pos_branch(request)
    if not branch:
        messages.error(request, "No branch yet — create one first.")
        return redirect("home")
    products = list(biz.products.prefetch_related("variants").order_by("name"))
    q = request.GET.get("q", "").strip().lower()
    if q:
        products = [p for p in products if q in p.name.lower()]
    # stock per product
    allocs = list(InventoryAllocation.objects.filter(branch=branch))
    sales = list(Sale.objects.filter(branch=branch).select_related("product", "variant"))
    stock = {}
    for p in products:
        alloc = sum((a.retail_quantity_equivalent for a in allocs if str(a.product_id) == str(p.id)), Decimal("0"))
        sold = sum((s.quantity * s.sale_base_units() for s in sales if str(s.product_id) == str(p.id)), Decimal("0"))
        left = max(alloc - sold, Decimal("0"))
        stock[str(p.id)] = left
        p.stock_left = left

    cart = request.session.get("cart", [])
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "add":
            pid = request.POST.get("product_id")
            vid = request.POST.get("variant_id") or None
            qty = Decimal(request.POST.get("quantity") or 1)
            p = get_object_or_404(Product, id=pid, business=biz)
            variants = list(p.variants.order_by("sort_order"))
            v = next((x for x in variants if str(x.id) == str(vid)), (variants[0] if variants else None))
            price = v.price if v else p.retail_sell_price
            cart.append({"product_id": str(p.id), "product_name": p.name, "variant_id": str(v.id) if v and v.pk else None,
                         "variant_name": v.name if v else p.retail_unit_name, "qty": str(qty),
                         "unit_price": str(price), "total": str(qty * price)})
            request.session["cart"] = cart
            return redirect(f"{request.path}?branch={branch.id}")
        if action == "clear":
            request.session["cart"] = []
            return redirect(f"{request.path}?branch={branch.id}")
        if action == "checkout":
            if not cart:
                messages.error(request, "Cart is empty.")
            else:
                grand = sum((Decimal(i["total"]) for i in cart), Decimal("0"))
                pay_mode = request.POST.get("payment_mode", "full")
                paid = grand if pay_mode == "full" else Decimal("0")
                owed = grand - paid
                inv_no = f"BP-{timezone.now():%Y%m}-{uuid.uuid4().hex[:4].upper()}"
                inv = Invoice.objects.create(
                    invoice_number=inv_no, branch=branch, created_by=request.user,
                    customer_name=request.POST.get("customer_name") or None,
                    customer_phone=request.POST.get("customer_phone") or None,
                    items_data=cart, subtotal=grand, grand_total=grand,
                    payment_mode=pay_mode, amount_paid=paid, amount_owed=owed,
                    status="completed" if owed <= 0 else "pending")
                now = timezone.now()
                for line in cart:
                    p = Product.objects.get(id=line["product_id"])
                    v = ProductVariant.objects.filter(id=line.get("variant_id")).first()
                    unit_price = Decimal(line["unit_price"])
                    expected = v.price if v else p.retail_sell_price
                    flagged = expected and expected > 0 and abs(unit_price - expected) / expected > Decimal("0.2")
                    InvoiceItem.objects.create(
                        invoice=inv, product=p, variant=v,
                        product_name=line["product_name"],
                        variant_name=line.get("variant_name"),
                        qty=Decimal(line["qty"]), unit_price=unit_price,
                        total=Decimal(line["total"]),
                        sort_order=0)
                    Sale.objects.create(
                        branch=branch, product=p, variant=v,
                        unit_type="bulk" if (v and v.base_units and v.base_units > 1) else "retail",
                        quantity=Decimal(line["qty"]), unit_price=unit_price,
                        total_price=Decimal(line["total"]), sold_by=request.user,
                        sold_at=now, client_reported_at=now, price_flagged=bool(flagged),
                        customer_name=request.POST.get("customer_name") or None,
                        customer_phone=request.POST.get("customer_phone") or None)
                if owed > 0:
                    Debtor.objects.create(business=biz, branch=branch,
                                          customer_name=request.POST.get("customer_name") or "Walk-in",
                                          customer_phone=request.POST.get("customer_phone") or None,
                                          invoice=inv, original_amount=grand, amount_paid=paid, amount_owed=owed)
                request.session["cart"] = []
                messages.success(request, f"Sale complete — {ghs(grand)}" + (f" ({ghs(owed)} owed)" if owed > 0 else ""))
                return redirect(f"{request.path}?branch={branch.id}")
    grand = sum((Decimal(i["total"]) for i in cart), Decimal("0"))
    return render(request, "core/pos_sell.html", {
        "products": products, "stock": stock, "cart": cart, "grand": grand, "ghs": ghs,
        "branch": branch, "branches": biz.branches.all(), "q": request.GET.get("q", ""),
    })


@role_required("owner", "manager", "staff")
def pos_inventory(request):
    biz = _biz(request.user)
    if request.user.role == "staff" and not request.user.pos_activated:
        return redirect("staff_notice")
    branch = _pos_branch(request)
    products = list(biz.products.all())
    allocs = list(InventoryAllocation.objects.filter(branch=branch))
    sales = list(Sale.objects.filter(branch=branch).select_related("product", "variant"))
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    stats = branch_stats(products, allocs, sales, str(branch.id), today)
    return render(request, "core/pos_inventory.html", {"stats": stats, "branch": branch, "ghs": ghs})


@role_required("owner", "manager", "staff")
def pos_invoices(request):
    biz = _biz(request.user)
    if request.user.role == "staff" and not request.user.pos_activated:
        return redirect("staff_notice")
    invoices = Invoice.objects.filter(branch__business=biz).order_by("-created_at")[:200]
    if request.user.role == "staff" and request.user.branch:
        invoices = invoices.filter(branch=request.user.branch)
    return render(request, "core/pos_invoices.html", {"invoices": invoices, "ghs": ghs})


# ── onboarding / activation / staff notice ───────────────────────

@role_required("owner")
def onboarding_view(request):
    """Post-signup checklist: branches → products → suppliers → intake → allocation → staff → first sale."""
    import secrets as _secrets

    biz = _biz(request.user)
    if request.method == "POST":
        kind = request.POST.get("kind")
        if kind == "branch":
            name = request.POST.get("name", "").strip()
            if name:
                Branch.objects.create(business=biz, name=name)
                messages.success(request, f"Branch '{name}' created.")
            return redirect("onboarding")
        if kind == "supplier":
            name = request.POST.get("name", "").strip()
            if name:
                Supplier.objects.create(business=biz, name=name)
                messages.success(request, f"Supplier '{name}' added.")
            return redirect("onboarding")
        if kind == "staff":
            name = request.POST.get("name", "").strip()
            phone = normalize_phone(request.POST.get("phone", ""))
            branch_id = request.POST.get("branch") or None
            if name and phone and not AppUser.objects.filter(phone=phone).exists():
                u = AppUser(username=phone, phone=phone, first_name=name, role="staff",
                            business=biz, branch_id=branch_id or None,
                            pos_activated=False, pos_activation_token=_secrets.token_urlsafe(24))
                u.set_password(request.POST.get("password", "password123"))
                u.save()
                messages.success(request, f"Staff '{name}' invited — share their activation link.")
            else:
                messages.error(request, "Name + unique phone required.")
            return redirect("onboarding")
    steps = {
        "branch": biz.branches.exists(),
        "product": biz.products.exists(),
        "supplier": biz.suppliers.exists(),
        "intake": InventoryIntake.objects.filter(business=biz).exists(),
        "allocation": InventoryAllocation.objects.filter(branch__business=biz).exists(),
        "staff": AppUser.objects.filter(business=biz, role="staff").exists(),
        "sale": Sale.objects.filter(branch__business=biz).exists(),
    }
    done = sum(1 for v in steps.values() if v)
    staff = AppUser.objects.filter(business=biz, role__in=("staff", "manager")).select_related("branch")[:50]
    return render(request, "core/onboarding.html", {
        "biz": biz, "steps": steps, "done": done, "total": len(steps),
        "branches": biz.branches.all(), "staff": staff,
    })


@role_required("owner", "manager")
def activation_view(request):
    """POS activation console: see who can use the till, issue/revoke links."""
    import secrets as _secrets

    biz = _biz(request.user)
    users = AppUser.objects.filter(business=biz, role__in=("staff", "manager")).select_related("branch").order_by("first_name")
    if request.method == "POST" and request.user.role == "owner":
        uid = request.POST.get("user_id")
        action = request.POST.get("action")
        try:
            u = biz.users.get(id=uid)
        except (AppUser.DoesNotExist, ValueError, TypeError):
            messages.error(request, "Unknown user.")
            return redirect("activation")
        if action == "issue":
            u.pos_activation_token = _secrets.token_urlsafe(24)
            u.pos_activated = False
            u.save(update_fields=["pos_activation_token", "pos_activated"])
            messages.success(request, f"Activation link issued for {u.first_name or u.phone}.")
        elif action == "activate":
            u.pos_activated = True
            u.save(update_fields=["pos_activated"])
            messages.success(request, f"{u.first_name or u.phone} activated.")
        elif action == "revoke":
            u.pos_activated = False
            u.pos_activation_token = None
            u.save(update_fields=["pos_activated", "pos_activation_token"])
            messages.success(request, f"Access revoked for {u.first_name or u.phone}.")
        return redirect("activation")
    return render(request, "core/activation.html", {"users": users, "biz": biz})


def activate_token_view(request, token):
    """Public one-tap POS activation link (e.g. shared on WhatsApp)."""
    try:
        u = AppUser.objects.select_related("business", "branch").get(pos_activation_token=token)
    except AppUser.DoesNotExist:
        messages.error(request, "That activation link is invalid or expired.")
        return redirect("login")
    u.pos_activated = True
    u.pos_activation_token = None
    u.save(update_fields=["pos_activated", "pos_activation_token"])
    messages.success(request, f"Akwaaba {u.first_name or u.phone}! Your POS access is active — please sign in.")
    return redirect("login")


@login_required
def staff_notice_view(request):
    """Shown to staff whose POS access is not yet activated."""
    if request.user.role != "staff" or request.user.pos_activated:
        return redirect("home")
    return render(request, "core/staff_notice.html", {})


# ── manager POS + documents ──────────────────────────────────────

@role_required("owner", "manager")
def manager_pos_view(request):
    """Manager till overview: pick a branch, see today's pulse, jump into the till."""
    biz = _biz(request.user)
    branches = list(biz.branches.all())
    bid = request.GET.get("branch") or (str(branches[0].id) if branches else None)
    branch = next((b for b in branches if str(b.id) == str(bid)), (branches[0] if branches else None))
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    products = list(biz.products.all())
    if branch:
        allocs = list(InventoryAllocation.objects.filter(branch=branch))
        sales = list(Sale.objects.filter(branch=branch).select_related("product", "variant", "sold_by"))
    else:
        allocs, sales = [], []
    stats = branch_stats(products, allocs, sales, str(branch.id) if branch else None, today) if branch else None
    recent = sorted(sales, key=lambda s: s.sold_at, reverse=True)[:15]
    return render(request, "core/manager_pos.html", {
        "biz": biz, "branches": branches, "branch": branch, "stats": stats,
        "recent": recent, "ghs": ghs,
    })


@role_required("owner", "manager")
def documents_view(request):
    """Documents centre: invoices, intakes, allocations + CSV export for the accountant."""
    import csv as _csv

    biz = _biz(request.user)
    kind = request.GET.get("export")
    sales = Sale.objects.filter(branch__business=biz).select_related("product", "branch", "sold_by").order_by("-sold_at")
    invoices = Invoice.objects.filter(branch__business=biz).select_related("branch").order_by("-created_at")[:200]
    intakes = InventoryIntake.objects.filter(business=biz).select_related("supplier", "product").order_by("-created_at")[:200]
    allocs = InventoryAllocation.objects.filter(branch__business=biz).select_related("product", "branch").order_by("-allocated_at")[:200]
    if kind in ("sales", "invoices", "intakes"):
        from django.http import HttpResponse as _HR
        resp = _HR(content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="branchport-{kind}.csv"'
        w = _csv.writer(resp)
        if kind == "sales":
            w.writerow(["sold_at", "branch", "product", "qty", "unit_price", "total", "sold_by", "flagged"])
            for s in sales[:2000]:
                w.writerow([s.sold_at, s.branch.name, s.product.name, s.quantity, s.unit_price, s.total_price, s.sold_by.phone, s.price_flagged])
        elif kind == "invoices":
            w.writerow(["number", "branch", "customer", "total", "paid", "owed", "status", "created"])
            for i in invoices:
                w.writerow([i.invoice_number, i.branch.name, i.customer_name, i.grand_total, i.amount_paid, i.amount_owed, i.status, i.created_at])
        else:
            w.writerow(["created", "supplier", "product", "bulk_qty", "cost_total", "paid", "owed"])
            for i in intakes:
                w.writerow([i.created_at, i.supplier.name, i.product.name, i.bulk_quantity, i.cost_price_total, i.amount_paid, i.amount_owed])
        return resp
    return render(request, "core/documents.html", {
        "invoices": invoices, "intakes": intakes, "allocs": allocs,
        "sales_count": sales.count(), "ghs": ghs,
    })


# ── market detail pages ──────────────────────────────────────────

def _market_catalog():
    """Per-commodity aggregates across all shops (no PII)."""
    from django.db.models import Avg, Count, Max, Min, Sum as _Sum
    now = timezone.now()
    d30 = now - timedelta(days=30)
    d7 = now - timedelta(days=7)
    d14 = now - timedelta(days=14)
    rows = (Product.objects.values("name")
            .annotate(revenue=_Sum("sales__total_price"), sold=_Sum("sales__quantity"),
                      avg_price=Avg("sales__unit_price"), min_price=Min("sales__unit_price"),
                      max_price=Max("sales__unit_price"), shops=Count("sales__branch__business", distinct=True))
            .order_by("-revenue"))
    items = []
    for r in rows:
        name = r["name"]
        recent = Sale.objects.filter(product__name=name, sold_at__gte=d30)
        sold30 = recent.aggregate(t=_Sum("quantity"))["t"] or 0
        rev30 = recent.aggregate(t=_Sum("total_price"))["t"] or 0
        last7 = Sale.objects.filter(product__name=name, sold_at__gte=d7).aggregate(t=Avg("unit_price"))["t"] or 0
        prev7 = Sale.objects.filter(product__name=name, sold_at__gte=d14, sold_at__lt=d7).aggregate(t=Avg("unit_price"))["t"] or 0
        try:
            pct = round((float(last7) - float(prev7)) / float(prev7) * 100, 1) if prev7 else 0.0
        except Exception:
            pct = 0.0
        trend = "rising" if pct > 2 else ("falling" if pct < -2 else "stable")
        items.append({"name": name, "revenue": r["revenue"] or 0, "sold": r["sold"] or 0,
                      "avg_price": r["avg_price"] or 0, "min_price": r["min_price"] or 0,
                      "max_price": r["max_price"] or 0, "shops": r["shops"] or 0,
                      "sold30": sold30, "rev30": rev30, "trend": trend, "trend_pct": pct})
    return items


@role_required("owner")
def market_items_view(request):
    items = _market_catalog()
    q = request.GET.get("q", "").strip().lower()
    if q:
        items = [i for i in items if q in i["name"].lower()]
    return render(request, "core/market_items.html", {"items": items, "q": q, "ghs": ghs})


@role_required("owner")
def market_live_view(request):
    """Binance-style ticker computed from real sales: 24h change, volume, high/low, 14-day sparkline."""
    from django.db.models import Avg, Count, Max, Min, Sum as _Sum
    now = timezone.now()
    d1 = now - timedelta(days=1)
    d2 = now - timedelta(days=2)
    names = list(Product.objects.values_list("name", flat=True).distinct())
    board = []
    for name in names:
        last = Sale.objects.filter(product__name=name).order_by("-sold_at").first()
        if not last:
            continue
        t24 = Sale.objects.filter(product__name=name, sold_at__gte=d1)
        prev = Sale.objects.filter(product__name=name, sold_at__gte=d2, sold_at__lt=d1).aggregate(t=Avg("unit_price"))["t"] or 0
        agg = t24.aggregate(n=Count("id"), hi=Max("unit_price"), lo=Min("unit_price"), avg=Avg("unit_price"))
        cur = float(last.unit_price or 0)
        try:
            chg = round((cur - float(prev)) / float(prev) * 100, 1) if prev else 0.0
        except Exception:
            chg = 0.0
        spark = []
        for d in range(13, -1, -1):
            day = now - timedelta(days=d)
            v = Sale.objects.filter(product__name=name, sold_at__date=day.date()).aggregate(t=Avg("unit_price"))["t"] or 0
            spark.append(float(v))
        board.append({"name": name, "price": cur, "chg": chg, "vol": agg["n"] or 0,
                      "hi": agg["hi"] or cur, "lo": agg["lo"] or cur, "spark": spark})
    board.sort(key=lambda r: abs(r["chg"]), reverse=True)
    gainers = [r for r in board if r["chg"] > 0][:5]
    losers = [r for r in board if r["chg"] < 0][:5]
    return render(request, "core/market_live.html", {"board": board, "gainers": gainers, "losers": losers, "ghs": ghs})


@role_required("owner")
def market_analytics_view(request):
    """30-day platform usage built from real users + sales (no mock data)."""
    from django.db.models import Count, Sum as _Sum
    from django.contrib.auth import get_user_model as _gum
    days = []
    for d in range(29, -1, -1):
        day = (timezone.now() - timedelta(days=d)).date()
        signups = AppUser.objects.filter(date_joined__date=day).count()
        ss = Sale.objects.filter(sold_at__date=day)
        agg = ss.aggregate(n=Count("id"), rev=_Sum("total_price"))
        active = ss.values("sold_by").distinct().count()
        days.append({"date": day.strftime("%m-%d"), "signups": signups,
                     "sales": agg["n"] or 0, "revenue": agg["rev"] or 0, "active": active})
    totals = {"signups": sum(d["signups"] for d in days), "sales": sum(d["sales"] for d in days),
              "revenue": sum((d["revenue"] or 0 for d in days), Decimal("0")),
              "active_avg": round(sum(d["active"] for d in days) / len(days)) if days else 0}
    mx = {"users": max([d["active"] for d in days] + [1]), "signups": max([d["signups"] for d in days] + [1]),
          "revenue": float(max([d["revenue"] or 0 for d in days] + [1]))}
    platform = {"users": AppUser.objects.count(), "businesses": Business.objects.count(),
                "active7": Sale.objects.filter(sold_at__gte=timezone.now() - timedelta(days=7)).values("sold_by").distinct().count()}
    return render(request, "core/market_analytics.html", {"days": days, "totals": totals, "mx": mx, "platform": platform, "ghs": ghs})


@role_required("owner")
def market_reports_view(request):
    """Printable reports + server-side CSV export (no client-side blob hacks)."""
    import csv as _csv
    from django.db.models import Count, Sum as _Sum
    from django.http import HttpResponse as _HR
    kind = request.GET.get("export")
    users = list(AppUser.objects.select_related("business", "branch").order_by("first_name")[:500])
    items = _market_catalog()
    stats = {"users": AppUser.objects.count(), "businesses": Business.objects.count(),
             "products": Product.objects.count(), "branches": Branch.objects.count(),
             "sales30": Sale.objects.filter(sold_at__gte=timezone.now() - timedelta(days=30)).count(),
             "rev30": Sale.objects.filter(sold_at__gte=timezone.now() - timedelta(days=30)).aggregate(t=_Sum("total_price"))["t"] or 0}
    if kind in ("users", "items", "summary"):
        resp = _HR(content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="branchport-{kind}.csv"'
        w = _csv.writer(resp)
        if kind == "summary":
            w.writerow(["total_users", "businesses", "products", "branches", "sales_30d", "revenue_30d"])
            w.writerow([stats["users"], stats["businesses"], stats["products"], stats["branches"], stats["sales30"], stats["rev30"]])
        elif kind == "users":
            w.writerow(["name", "phone", "role", "business", "branch"])
            for u in users:
                w.writerow([u.first_name, u.phone, u.role, u.business.name if u.business else "", u.branch.name if u.branch else ""])
        else:
            w.writerow(["item", "avg_price", "min_price", "max_price", "sold_30d", "revenue_30d", "shops", "trend", "trend_pct"])
            for i in items:
                w.writerow([i["name"], i["avg_price"], i["min_price"], i["max_price"], i["sold30"], i["rev30"], i["shops"], i["trend"], i["trend_pct"]])
        return resp
    return render(request, "core/market_reports.html", {"stats": stats, "users": users[:50], "items": items[:50], "ghs": ghs})


# ── offline / PWA ────────────────────────────────────────────────

def offline_view(request):
    return render(request, "core/offline.html", {})


def manifest_view(request):
    from django.http import JsonResponse as _JR
    return _JR({"name": "BranchPort POS", "short_name": "BranchPort",
                "description": "Sales, stock, supplier credit and audit trail for Ghanaian retail.",
                "start_url": "/pos/", "scope": "/", "display": "standalone",
                "background_color": "#faf9f6", "theme_color": "#111827",
                "icons": []})


def sw_view(request):
    from django.http import HttpResponse as _HR
    js = """/* BranchPort POS service worker — offline-first till. */
const CACHE = 'branchport-pos-v1';
const CORE = ['/offline/', '/pos/', '/pos/inventory/', '/pos/invoices/', '/login/'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return; // let queued POSTs go to the network / outbox
  e.respondWith(
    fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match(request).then((hit) => hit || caches.match('/offline/')))
  );
});
"""
    return _HR(js, content_type="application/javascript")


def pos_offline_js_view(request):
    from django.http import HttpResponse as _HR
    js = """/* BranchPort POS offline layer: local cart backup + sale outbox queue.
   The server-rendered till keeps working; this only adds resilience:
   - cart form state is mirrored to localStorage so a reload/offline keeps it
   - failed checkout POSTs are queued in an outbox and retried when online */
(function () {
  var CART_KEY = 'bp-pos-cart-v1';
  var OUTBOX_KEY = 'bp-pos-outbox-v1';
  function load(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // Mirror quantity inputs so a refresh never loses the till state
  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'quantity') {
      var rows = Array.prototype.map.call(document.querySelectorAll('.prod form'), function (f) {
        var pid = f.querySelector('input[name=product_id]');
        var q = f.querySelector('input[name=quantity]');
        var vsel = f.querySelector('select[name=variant_id]');
        return { product_id: pid && pid.value, quantity: q && q.value, variant_id: vsel && vsel.value };
      });
      save(CART_KEY, rows);
    }
  });
  function outboxCount() { return load(OUTBOX_KEY, []).length; }
  function badge() {
    var n = outboxCount();
    if (!n) return;
    var d = document.createElement('div');
    d.className = 'alert err';
    d.textContent = n + ' sale(s) queued offline — they will sync automatically when you are back online.';
    var w = document.querySelector('.wrap');
    if (w) w.prepend(d);
  }
  window.addEventListener('online', function () { badge(); });
  document.addEventListener('DOMContentLoaded', badge);
})();
"""
    return _HR(js, content_type="application/javascript")
