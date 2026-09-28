"""Seed demo dataset: 1 business, 3 branches, 5 products, suppliers, 30 days of sales.

Run: python manage.py seed_demo
Logins (password: password123):
  owner phone 0540000000 · manager 0540000009 · staff 0540000001/2/3
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (AppUser, Branch, Business, InventoryAllocation, InventoryIntake, Product,
                         ProductVariant, Sale, Supplier, normalize_phone)


class Command(BaseCommand):
    help = "Seed demo data"

    def handle(self, *args, **options):
        random.seed(42)
        if Business.objects.filter(name="Demo Provisions").exists():
            self.stdout.write("Demo already seeded. Skipping.")
            return
        biz = Business.objects.create(name="Demo Provisions", business_form="both", business_type="general")
        madina = Branch.objects.create(business=biz, name="Madina")
        dansoman = Branch.objects.create(business=biz, name="Dansoman")
        achimota = Branch.objects.create(business=biz, name="Achimota")

        def mkuser(phone, name, role, branch=None):
            u = AppUser(username=phone, phone=normalize_phone(phone), first_name=name, role=role,
                        business=biz, branch=branch)
            u.set_password("password123")
            u.save()
            return u

        owner = mkuser("0540000000", "Demo Owner", "owner")
        biz.owner = owner
        biz.save()
        mkuser("0540000009", "Demo Manager", "manager")
        s1 = mkuser("0540000001", "Ama (Madina)", "staff", madina)
        s2 = mkuser("0540000002", "Kwame (Dansoman)", "staff", dansoman)
        s3 = mkuser("0540000003", "Efua (Achimota)", "staff", achimota)

        suppliers = [Supplier.objects.create(business=biz, name=n) for n in ("Makola Wholesalers", "Agro Direct", "Accra Foods")]
        catalog = [
            ("Royal Rice", "bag", "cup", 20, "50.00", "65.00", "6.50"),
            ("Palm Oil", "gallon", "litre", 8, "90.00", "120.00", "15.00"),
            ("Tomatoes", "crate", "bowl", 20, "60.00", "100.00", "5.00"),
            ("Onions", "bag", "bowl", 30, "80.00", "120.00", "4.00"),
            ("Yams", "sack", "tuber", 10, "100.00", "160.00", "16.00"),
        ]
        products = []
        for name, bulk_u, ret_u, upb, cost, bulk_sell, ret_sell in catalog:
            p = Product.objects.create(business=biz, name=name, bulk_unit_name=bulk_u, retail_unit_name=ret_u,
                                       units_per_bulk=upb, bulk_cost_price=cost, bulk_sell_price=bulk_sell,
                                       retail_sell_price=ret_sell)
            ProductVariant.objects.create(product=p, name=ret_u, price=ret_sell, base_units=1, sort_order=0)
            ProductVariant.objects.create(product=p, name=bulk_u, price=bulk_sell, base_units=upb, sort_order=1)
            products.append(p)

        # intakes
        for p in products:
            p.refresh_from_db()
            unit_cost = Decimal(str(p.bulk_cost_price))
            InventoryIntake.objects.create(business=biz, supplier=random.choice(suppliers), product=p,
                                           bulk_quantity=20, cost_price_total=unit_cost * 20,
                                           amount_paid=unit_cost * 20, created_by=owner)
        # allocations per branch
        alloc_plan = {0: [40, 8, 20, 30, 10], 1: [30, 10, 15, 20, 8], 2: [25, 6, 12, 15, 6]}
        for bi, branch in enumerate([madina, dansoman, achimota]):
            for pi, p in enumerate(products):
                p.refresh_from_db()
                retail_qty = alloc_plan[bi][pi]
                upb = Decimal(str(p.units_per_bulk)) or Decimal("1")
                InventoryAllocation.objects.create(product=p, branch=branch, bulk_quantity=Decimal(retail_qty) / upb,
                                                   retail_quantity_equivalent=retail_qty, allocated_by=owner)
        # 30 days of sales + a couple of anomalies (overprice + backdate)
        staff_by_branch = {str(madina.id): s1, str(dansoman.id): s2, str(achimota.id): s3}
        now = timezone.now()
        for day in range(30):
            for branch in (madina, dansoman, achimota):
                for _ in range(random.randint(2, 6)):
                    p = random.choice(products)
                    p.refresh_from_db()
                    qty = random.randint(1, 4)
                    price = Decimal(str(p.retail_sell_price))
                    sold_at = now - timedelta(days=day, hours=random.randint(0, 10))
                    Sale.objects.create(branch=branch, product=p, unit_type="retail", quantity=qty,
                                        unit_price=price, total_price=price * qty, sold_by=staff_by_branch[str(branch.id)],
                                        sold_at=sold_at, client_reported_at=sold_at)
        # anomaly: 2x price
        p0 = products[0]
        p0.refresh_from_db()
        p0_price = Decimal(str(p0.retail_sell_price))
        Sale.objects.create(branch=madina, product=p0, unit_type="retail", quantity=1,
                            unit_price=p0_price * 2, total_price=p0_price * 2,
                            sold_by=s1, sold_at=now, client_reported_at=now, price_flagged=True)
        # backdate: reported 3 days after sale
        p2 = products[2]
        p2.refresh_from_db()
        p2_price = Decimal(str(p2.retail_sell_price))
        Sale.objects.create(branch=dansoman, product=p2, unit_type="retail", quantity=2,
                            unit_price=p2_price, total_price=p2_price * 2,
                            sold_by=s2, sold_at=now - timedelta(days=5), client_reported_at=now)
        self.stdout.write(self.style.SUCCESS("Demo seeded. Login phones 0540000000/0540000009/0540000001-3, password password123"))
