import { useEffect, useState } from 'react';
import { getUserDirectory, type UserAnalytics } from '../lib/api';

export default function UsersDirectory() {
  const [users, setUsers] = useState<UserAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    getUserDirectory().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  }, []);

  const filtered = users.filter((u) => {
    const matchesSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search) ||
      u.business_name.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">👥 User Directory</h1>
          <p className="page-sub">All registered users on the platform · {users.length} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or business…"
          className="input flex-1 max-w-md"
        />
        <div className="seg">
          {['all', 'owner', 'manager', 'staff'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`pill ${roleFilter === r ? 'pill-active' : ''}`}
            >
              {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* User cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading users…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-500">No users match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((user) => (
            <div key={user.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 grid place-items-center">
                    <span className="text-sm font-bold text-gray-600">
                      {user.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.phone}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  user.role === 'owner' ? 'bg-purple-100 text-purple-700' :
                  user.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {user.role}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Business</span>
                  <span className="font-medium">{user.business_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Branch</span>
                  <span className="font-medium">{user.branch_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sales (30d)</span>
                  <span className="font-medium tabular-nums">{user.total_sales}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Revenue (30d)</span>
                  <span className="font-semibold tabular-nums text-green-700">GHS {user.total_revenue.toLocaleString()}</span>
                </div>
              </div>

              {user.items_sold.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1.5">Items sold</p>
                  <div className="flex flex-wrap gap-1">
                    {user.items_sold.map((item) => (
                      <span key={item} className="px-2 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-400">
                <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                <span>Last active {new Date(user.last_active).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
