/**
 * Stats Page
 * Analytics dashboard with metrics and charts
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { fetchStats } from '../services/stats.service.js';
import { formatCurrency, formatNumber, formatPercent } from '../utils/formatters.js';

function Stats() {
  const { accessToken } = useAuth();

  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch stats
  const loadStats = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchStats(accessToken);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Calculate derived stats
  const getOverviewStats = () => {
    if (!stats) return [];

    const totalRevenue = stats.totalRevenue || stats.revenue?.total || 0;
    const totalOrders = stats.totalOrders || stats.orders?.total || 0;
    const paidOrders = stats.paidOrders || stats.orders?.paid || 0;
    const totalTickets = stats.totalTickets || stats.tickets?.total || 0;
    const checkedIn = stats.checkedIn || stats.checkins?.total || 0;
    const totalEvents = stats.totalEvents || stats.events?.total || 0;
    const activeEvents = stats.activeEvents || stats.events?.active || 0;

    return [
      {
        label: 'Total Revenue',
        value: formatCurrency(totalRevenue),
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        color: 'from-brand-gold to-brand-gold-dark',
        bgColor: 'bg-brand-gold/10',
      },
      {
        label: 'Total Orders',
        value: formatNumber(totalOrders),
        subValue: `${formatNumber(paidOrders)} paid`,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
        color: 'from-purple-500 to-purple-600',
        bgColor: 'bg-purple-500/10',
      },
      {
        label: 'Tickets Sold',
        value: formatNumber(totalTickets),
        subValue: `${formatNumber(checkedIn)} checked in`,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
          </svg>
        ),
        color: 'from-green-500 to-green-600',
        bgColor: 'bg-green-500/10',
      },
      {
        label: 'Events',
        value: formatNumber(totalEvents),
        subValue: `${formatNumber(activeEvents)} active`,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        color: 'from-blue-500 to-blue-600',
        bgColor: 'bg-blue-500/10',
      },
    ];
  };

  // Get events breakdown for chart
  const getEventsBreakdown = () => {
    const events = stats?.eventStats || stats?.events?.breakdown || stats?.byEvent || [];
    return Array.isArray(events) ? events : [];
  };

  // Get order status breakdown
  const getOrdersBreakdown = () => {
    const orders = stats?.ordersByStatus || stats?.orders?.byStatus || {};
    
    // If it's already an array, use it
    if (Array.isArray(orders)) return orders;
    
    // Convert object to array
    return Object.entries(orders).map(([status, count]) => ({
      status,
      count: count || 0,
    }));
  };

  // Calculate check-in rate
  const getCheckInRate = () => {
    const totalTickets = stats?.totalTickets || stats?.tickets?.total || 0;
    const checkedIn = stats?.checkedIn || stats?.checkins?.total || 0;
    
    if (totalTickets === 0) return 0;
    return (checkedIn / totalTickets) * 100;
  };

  // Status colors for chart
  const statusColors = {
    pending: { bg: 'bg-yellow-500', text: 'text-yellow-400' },
    paid: { bg: 'bg-green-500', text: 'text-green-400' },
    cancelled: { bg: 'bg-red-500', text: 'text-red-400' },
    refunded: { bg: 'bg-gray-500', text: 'text-gray-400' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-brand-gold/60">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading statistics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <div className="text-red-400 mb-4">{error}</div>
        <button onClick={loadStats} className="btn-secondary">Retry</button>
      </div>
    );
  }

  const overviewStats = getOverviewStats();
  const eventsBreakdown = getEventsBreakdown();
  const ordersBreakdown = getOrdersBreakdown();
  const checkInRate = getCheckInRate();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Statistics</h2>
          <p className="text-sm text-brand-cream/60">Overview of sales and attendance</p>
        </div>
        <button onClick={loadStats} className="btn-secondary">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewStats.map((stat) => (
          <div key={stat.label} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
            <p className="text-sm text-brand-cream/60">{stat.label}</p>
            {stat.subValue && (
              <p className="text-xs text-gray-500 mt-1">{stat.subValue}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Check-in Rate */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Check-in Rate</h3>
          
          <div className="flex items-center justify-center">
            <div className="relative w-48 h-48">
              {/* Background circle */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                  className="text-brand-green-dark"
                />
                {/* Progress circle */}
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${checkInRate * 5.024} 502.4`}
                  className="text-green-500 transition-all duration-1000"
                />
              </svg>
              
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{formatPercent(checkInRate)}</span>
                <span className="text-sm text-gray-400">checked in</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-400">
                {formatNumber(stats?.checkedIn || stats?.checkins?.total || 0)}
              </p>
              <p className="text-sm text-gray-500">Checked In</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-400">
                {formatNumber((stats?.totalTickets || stats?.tickets?.total || 0) - (stats?.checkedIn || stats?.checkins?.total || 0))}
              </p>
              <p className="text-sm text-gray-500">Remaining</p>
            </div>
          </div>
        </div>

        {/* Orders by Status */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Orders by Status</h3>
          
          {ordersBreakdown.length > 0 ? (
            <div className="space-y-4">
              {ordersBreakdown.map((item) => {
                const status = item.status?.toLowerCase() || 'unknown';
                const colors = statusColors[status] || statusColors.pending;
                const total = ordersBreakdown.reduce((sum, o) => sum + (o.count || 0), 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;

                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium capitalize ${colors.text}`}>
                        {status}
                      </span>
                      <span className="text-sm text-gray-400">
                        {formatNumber(item.count)} ({formatPercent(percentage)})
                      </span>
                    </div>
                    <div className="h-3 bg-brand-green-dark rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors.bg} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No order data available
            </div>
          )}
        </div>
      </div>

      {/* Events Breakdown */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Sales by Event</h3>
        
        {eventsBreakdown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Tickets Sold</th>
                  <th>Capacity</th>
                  <th>Revenue</th>
                  <th>Check-ins</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {eventsBreakdown.map((event, index) => {
                  const sold = event.ticketsSold || event.sold || event.tickets_sold || 0;
                  const capacity = event.capacity || event.totalCapacity || event.total_capacity || 100;
                  const revenue = event.revenue || event.totalRevenue || 0;
                  const checkins = event.checkIns || event.checkedIn || event.checked_in || 0;
                  const progress = capacity > 0 ? (sold / capacity) * 100 : 0;

                  return (
                    <tr key={event.id || index}>
                      <td>
                        <div className="font-medium text-white">{event.name || event.eventName}</div>
                        <div className="text-xs text-gray-500">{event.date || event.event_date}</div>
                      </td>
                      <td>{formatNumber(sold)}</td>
                      <td>{formatNumber(capacity)}</td>
                      <td className="font-medium text-brand-gold">{formatCurrency(revenue)}</td>
                      <td>{formatNumber(checkins)}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-brand-green-dark rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-gold rounded-full transition-all"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-12">
                            {formatPercent(progress)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-gray-500">No event data available</p>
            <p className="text-sm text-gray-600 mt-1">Create events to see statistics</p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Order Value */}
        <div className="card p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-brand-gold/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-white mb-1">
            {formatCurrency(
              (stats?.totalRevenue || stats?.revenue?.total || 0) / 
              Math.max(stats?.paidOrders || stats?.orders?.paid || 1, 1)
            )}
          </p>
          <p className="text-sm text-brand-cream/60">Avg. Order Value</p>
        </div>

        {/* Conversion Rate */}
        <div className="card p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-white mb-1">
            {formatPercent(
              ((stats?.paidOrders || stats?.orders?.paid || 0) / 
              Math.max(stats?.totalOrders || stats?.orders?.total || 1, 1)) * 100
            )}
          </p>
          <p className="text-sm text-brand-cream/60">Payment Rate</p>
        </div>

        {/* Avg Tickets per Order */}
        <div className="card p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-white mb-1">
            {((stats?.totalTickets || stats?.tickets?.total || 0) / 
              Math.max(stats?.paidOrders || stats?.orders?.paid || 1, 1)).toFixed(1)}
          </p>
          <p className="text-sm text-brand-cream/60">Avg. Tickets/Order</p>
        </div>
      </div>
    </div>
  );
}

export default Stats;
