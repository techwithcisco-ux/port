from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup_view, name="signup"),
    path("logout/", views.logout_view, name="logout"),
    path("", views.home, name="home"),

    path("owner/", views.owner_home, name="owner_home"),
    path("owner/stores/", views.owner_stores, name="owner_stores"),
    path("owner/audit/", views.audit_view, name="audit"),
    path("owner/flags/", views.flags_view, name="flags"),
    path("owner/balance/", views.balance_sheet_view, name="balance"),
    path("owner/team/", views.team_view, name="team"),
    path("owner/market/", views.market_view, name="market"),

    path("products/", views.product_list, name="products"),
    path("intake/", views.intake_view, name="intake"),
    path("allocation/", views.allocation_view, name="allocation"),
    path("suppliers/", views.suppliers_view, name="suppliers"),
    path("sales/", views.sales_report_view, name="sales_report"),
    path("profit/", views.profit_loss_view, name="profit"),
    path("expenses/", views.expenses_view, name="expenses"),
    path("ledger/", views.ledger_view, name="ledger"),
    path("stock/", views.stock_balance_view, name="stock"),
    path("manager/", views.manager_home, name="manager_home"),
    path("onboarding/", views.onboarding_view, name="onboarding"),
    path("activation/", views.activation_view, name="activation"),
    path("activate/<str:token>/", views.activate_token_view, name="activate_token"),
    path("staff-notice/", views.staff_notice_view, name="staff_notice"),
    path("documents/", views.documents_view, name="documents"),
    path("manager/pos/", views.manager_pos_view, name="manager_pos"),

    path("owner/market/items/", views.market_items_view, name="market_items"),
    path("owner/market/live/", views.market_live_view, name="market_live"),
    path("owner/market/analytics/", views.market_analytics_view, name="market_analytics"),
    path("owner/market/reports/", views.market_reports_view, name="market_reports"),

    path("offline/", views.offline_view, name="offline"),
    path("manifest.webmanifest", views.manifest_view, name="manifest"),
    path("sw.js", views.sw_view, name="sw"),
    path("static/pos-offline.js", views.pos_offline_js_view, name="pos_offline_js"),

    path("pos/", views.pos_sell, name="pos_sell"),
    path("pos/inventory/", views.pos_inventory, name="pos_inventory"),
    path("pos/invoices/", views.pos_invoices, name="pos_invoices"),
]
