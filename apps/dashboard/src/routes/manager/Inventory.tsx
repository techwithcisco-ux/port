import { useEffect, useState, FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, Supplier } from '@branchport/shared';

// Implements requirements.txt 4.3 (credit ledger): amount_owed is a
// generated column (cost_price_total - amount_paid), computed by
// Postgres — this form just submits the two source numbers.
export default function Inventory() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [costPriceTotal, setCostPriceTotal] = useState('');
  const [paidOnCredit, setPaidOnCredit] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => setProducts((data as Product[]) ?? []));
    supabase.from('suppliers').select('*').then(({ data }) => setSuppliers((data as Supplier[]) ?? []));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setStatus(null);

    const paid = paidOnCredit ? Number(amountPaid || 0) : Number(costPriceTotal);

    const { error } = await supabase.from('inventory_intake').insert({
      business_id: profile.business_id,
      supplier_id: supplierId,
      product_id: productId,
      bulk_quantity: Number(bulkQuantity),
      cost_price_total: Number(costPriceTotal),
      amount_paid: paid,
      created_by: profile.id,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus('Recorded.');
      setBulkQuantity('');
      setCostPriceTotal('');
      setAmountPaid('');
      setPaidOnCredit(false);
    }
  }

  const owed = paidOnCredit
    ? Math.max(Number(costPriceTotal || 0) - Number(amountPaid || 0), 0)
    : 0;

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-6">Inventory intake</h1>

      <form onSubmit={handleSubmit} className="card p-6 max-w-md space-y-4 h-fit">
        <div>
          <label className="label">Supplier</label>
          <select
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="input w-full"
          >
            <option value="" disabled>Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Product</label>
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="input w-full"
          >
            <option value="" disabled>Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.bulk_unit_name})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Bulk quantity bought</label>
          <input
            type="number" min="0" step="any" required
            value={bulkQuantity}
            onChange={(e) => setBulkQuantity(e.target.value)}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Total cost price (GHS)</label>
          <input
            type="number" min="0" step="any" required
            value={costPriceTotal}
            onChange={(e) => setCostPriceTotal(e.target.value)}
            className="input w-full"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={paidOnCredit} onChange={(e) => setPaidOnCredit(e.target.checked)} className="rounded border-gray-300" />
          Bought on credit (partial payment)
        </label>

        {paidOnCredit && (
          <div>
            <label className="label">Amount paid now (GHS)</label>
            <input
              type="number" min="0" step="any"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="input w-full"
            />
            <p className="text-sm text-gray-500 mt-1">Amount owed after this: GHS {owed.toFixed(2)}</p>
          </div>
        )}

        {status && <p className="text-sm">{status}</p>}

        <button type="submit" className="btn btn-primary w-full">
          Record intake
        </button>
      </form>

      {/* Empty lists on a fresh business? Add your products and suppliers
          via the Product setup and Suppliers screens first — the dropdowns
          above load from `products`/`suppliers`, and both are manager-only
          writes under RLS. */}
    </DashboardLayout>
  );
}
