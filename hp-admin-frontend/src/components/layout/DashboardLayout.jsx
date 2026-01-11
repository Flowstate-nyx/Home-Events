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
    <div className="min-h-screen bg-brand-green flex">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-0">
        {/* Header */}
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
        />

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
