/**
 * Auth Context
 * Centralized authentication state management
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import {
  login as loginService,
  logout as logoutService,
  refreshAccessToken,
  hasStoredCredentials,
  getStoredUser,
} from '../services/auth.service.js';

// Create context
export const AuthContext = createContext(null);

/**
 * Auth Provider Component
 * Wraps app and provides auth state to all children
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived state
  const isAuthenticated = !!accessToken && !!user;

  // Check for existing session on mount
  useEffect(() => {
    const initAuth = async () => {
      if (hasStoredCredentials()) {
        try {
          const data = await refreshAccessToken();
          setAccessToken(data.accessToken);
          setUser(data.user || getStoredUser());
        } catch (error) {
          console.log('No valid session:', error.message);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Login function
  const login = useCallback(async (email, password) => {
    const data = await loginService(email, password);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    await logoutService(accessToken);
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  // Check if user has specific role
  const hasRole = useCallback((role) => {
    if (!user?.role) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  }, [user]);

  // Refresh token (exposed for useApi hook)
  const refreshToken = useCallback(async () => {
    try {
      const data = await refreshAccessToken();
      setAccessToken(data.accessToken);
      if (data.user) setUser(data.user);
      return data.accessToken;
    } catch (error) {
      // Refresh failed - log out
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, []);

  const value = {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    login,
    logout,
    hasRole,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
