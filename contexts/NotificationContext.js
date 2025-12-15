// contexts/NotificationContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const NotificationContext = createContext();

const BADGE_KEY = 'noticeBadgeCount';

export const NotificationProvider = ({ children }) => {
  const [noticeBadgeCount, setNoticeBadgeCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load badge count from SecureStore on mount
  useEffect(() => {
    const loadBadgeCount = async () => {
      try {
        const saved = await SecureStore.getItemAsync(BADGE_KEY);
        if (saved) {
          const count = parseInt(saved, 10);
          setNoticeBadgeCount(isNaN(count) ? 0 : count);
        }
      } catch (error) {
        console.error('Error loading badge count:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadBadgeCount();
  }, []);

  const incrementNoticeBadge = async () => {
    try {
      const newCount = noticeBadgeCount + 1;
      setNoticeBadgeCount(newCount);
      await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
      // console.log('✅ Badge incremented to:', newCount);
    } catch (error) {
      console.error('Error incrementing badge:', error);
    }
  };

  const clearNoticeBadge = async () => {
    try {
      setNoticeBadgeCount(0);
      await SecureStore.setItemAsync(BADGE_KEY, '0');
      // console.log('✅ Badge cleared');
    } catch (error) {
      console.error('Error clearing badge:', error);
    }
  };

  // Helper to manually set badge (used when app opens from background notification)
  const setBadgeCount = async (count) => {
    try {
      setNoticeBadgeCount(count);
      await SecureStore.setItemAsync(BADGE_KEY, count.toString());
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        noticeBadgeCount,
        incrementNoticeBadge,
        clearNoticeBadge,
        setBadgeCount,
        isLoaded,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};