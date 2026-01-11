/**
 * Dashboard Overview Page
 * Shows summary stats and quick actions
 */

import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import { ENDPOINTS } from '../config/api.js';
import { formatCurrency, formatNumber } from '../utils/formatters.js';

function Dashboard() {
  const { get } = useApi();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await get(ENDPOINTS.STATS.OVERVIEW);
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [get]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-brand-gold/60">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-red-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Default stats if API returns empty
  const displayStats = stats || {
    totalEvents: 0,
    activeEvents: 0,
    totalOrders: 0,
    paidOrders: 0,
    totalRevenue: 0,
    todayCheckins: 0,
  };

  const statCards = [
    {
      label: 'Total Events',
      value: formatNumber(displayStats.totalEvents || displayStats.events?.total || 0),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Total Orders',
      value: formatNumber(displayStats.totalOrders || displayStats.orders?.total || 0),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: 'from-purple-500 to-purple-600',
    },
    {
      label: 'Paid Orders',
      value: formatNumber(displayStats.paidOrders || displayStats.orders?.paid || 0),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-green-500 to-green-600',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(displayStats.totalRevenue || displayStats.revenue?.total || 0),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-brand-gold to-brand-gold-dark',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome message */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Welcome to Home Productions Admin</h2>
        <p className="text-brand-cream/60">Manage your events, orders, and check-ins from here.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
            <p className="text-sm text-brand-cream/60">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard/events" className="btn-gold">
            Create Event
          </a>
          <a href="/dashboard/orders" className="btn-secondary">
            View Orders
          </a>
          <a href="/dashboard/checkin" className="btn-secondary">
            Start Check-In
          </a>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
