"""Audit-trail signals — the Django equivalent of the Postgres
`security definer` audit trigger: every insert into the core tables appends
an AuditEvent. AuditEvent itself has no write path from views/admin."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AuditEvent, InventoryAllocation, InventoryIntake, Sale


def _business_of(instance):
    if hasattr(instance, "business"):
        return instance.business
    if hasattr(instance, "branch"):
        return instance.branch.business
    if hasattr(instance, "product"):
        return instance.product.business
    return None


def _actor_of(instance):
    for attr in ("sold_by", "created_by", "allocated_by"):
        if hasattr(instance, attr):
            return getattr(instance, attr)
    return None


def _log(action, instance):
    business = _business_of(instance)
    actor = _actor_of(instance)
    if business is None or actor is None:
        return
    AuditEvent.objects.create(
        business=business,
        actor=actor,
        action_type=action,
        entity_type=type(instance).__name__.lower(),
        entity_id=str(instance.pk),
        after_state={"id": str(instance.pk)},
    )


@receiver(post_save, sender=Sale)
def _audit_sale(sender, instance, created, **kwargs):
    if created:
        _log("insert", instance)


@receiver(post_save, sender=InventoryIntake)
def _audit_intake(sender, instance, created, **kwargs):
    if created:
        _log("insert", instance)


@receiver(post_save, sender=InventoryAllocation)
def _audit_allocation(sender, instance, created, **kwargs):
    if created:
        _log("insert", instance)
