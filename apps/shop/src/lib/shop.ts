// Public shop API — no login. Everything is scoped to the invite token
// the shop sent the customer. Prices come from the server; the client
// never decides what anything costs.

let apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'http://localhost:8080';
if (apiBaseUrl && !/:\/\//.test(apiBaseUrl)) apiBaseUrl = `https://${apiBaseUrl}`;

export interface ShopItem {
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  available: number;
}

export interface ShopCatalog {
  business_name: string;
  branch_name: string;
  customer_phone: string;
  expires_at: string;
  contact: { name: string; phone: string | null };
  items: ShopItem[];
}

export interface OrderLine {
  product_id: string;
  name: string;
  unit: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface PlacedOrder {
  id: string;
  ref: string;
  items: OrderLine[];
  total: number;
  status: string;
  customer_phone: string;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try { return (JSON.parse(await res.text()) ?? {}) as Record<string, unknown>; }
  catch { return {}; }
}

export async function fetchCatalog(token: string): Promise<ShopCatalog> {
  const res = await fetch(`${apiBaseUrl}/w/${encodeURIComponent(token)}`);
  const body = await readBody(res);
  if (res.status !== 200) throw new Error((body.error as string) || `Could not load shop (${res.status}).`);
  return body as unknown as ShopCatalog;
}

export async function submitOrder(
  token: string,
  lines: Array<{ product_id: string; qty: number }>,
  customerName: string,
): Promise<{ order: PlacedOrder; contact: { name: string; phone: string | null } }> {
  const res = await fetch(`${apiBaseUrl}/w/${encodeURIComponent(token)}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: lines, customer_name: customerName }),
  });
  const body = await readBody(res);
  if (res.status !== 200) throw new Error((body.error as string) || `Order failed (${res.status}).`);
  return body as unknown as { order: PlacedOrder; contact: { name: string; phone: string | null } };
}

export function ghs(n: number): string {
  return `GHS ${Number(n).toFixed(2)}`;
}

// The WhatsApp message the customer sends the retailer. Built from the
// SERVER-confirmed order (not the cart) so totals can't be tampered with.
export function orderWhatsAppText(
  businessName: string,
  branchName: string,
  order: PlacedOrder,
  customerName: string,
): string {
  const lines = order.items.map(
    (l) => `\u2022 ${l.qty} \u00D7 ${l.name} \u2014 ${ghs(l.line_total)}`,
  );
  return [
    `Hello ${businessName} (${branchName})! I would like to order (ref ${order.ref}):`,
    '',
    ...lines,
    '',
    `Total: ${ghs(order.total)}`,
    `\u2014 ${customerName || 'Customer'} (${order.customer_phone})`,
  ].join('\n');
}

export function waLink(phone: string | null, text: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
