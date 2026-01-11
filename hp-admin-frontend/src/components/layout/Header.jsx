/**
 * Header Component
 * Top bar with menu toggle, title, and user actions
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';

function Header({ onMenuClick, title }) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
  };

  return (
    <header className="h-16 bg-brand-green-dark/50 border-b border-brand-gold/10 flex items-center px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-brand-gold/10"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Page title */}
      <h1 className="ml-2 lg:ml-0 text-lg font-semibold text-white">
        {title || 'Dashboard'}
      </h1>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-4">
        {/* Notifications placeholder */}
        <button className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-brand-gold/10 relative">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-brand-gold/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-gold to-brand-gold-dark flex items-center justify-center">
              <span className="text-sm font-semibold text-brand-green">
                {user?.name?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-brand-green-dark border border-brand-gold/20 rounded-xl shadow-xl py-1 z-50 animate-fade-in">
              {/* User info */}
              <div className="px-4 py-3 border-b border-brand-gold/10">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 bg-brand-gold/20 text-brand-gold text-xs rounded-full">
                  {user?.role}
                </span>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-brand-gold/10 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
