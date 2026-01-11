/**
 * Dashboard Layout
 * Main layout wrapper with sidebar and header
 */

import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';

// Page titles based on route
const pageTitles = {
  '/dashboard': 'Overview',
  '/dashboard/events': 'Events',
  '/dashboard/orders': 'Orders',
  '/dashboard/checkin': 'Check-In',
  '/dashboard/stats': 'Statistics',
  '/dashboard/gallery': 'Gallery',
};

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Get page title from route
  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="h-screen bg-brand-green flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
        />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;