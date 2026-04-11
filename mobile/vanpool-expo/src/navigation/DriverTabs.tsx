import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import ConsoleScreen from '../screens/driver/ConsoleScreen';
import AlertsScreen from '../screens/driver/AlertsScreen';
import ShiftsScreen from '../screens/driver/ShiftsScreen';
import VehicleChecksScreen from '../screens/driver/VehicleChecksScreen';
import ProfileScreen from '../screens/driver/ProfileScreen';
import CopilotScreen from '../screens/shared/CopilotScreen';
import { backend } from '../api/backend';
import { useAuthStore } from '../store/authStore';

const Tab = createBottomTabNavigator();

export default function DriverTabs() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'driver', 'alerts'],
    queryFn: () => backend.getNotifications(accessToken!, { includeAlerts: true, limit: 25 }),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
  });
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#141414', 
          borderTopColor: '#222',
        },
        tabBarActiveTintColor: '#06C167',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen 
        name="Console" 
        component={ConsoleScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="speedometer" size={size} color={color} /> 
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            color: '#fff',
            fontSize: 11,
            fontWeight: '700',
          },
        }}
      />
      <Tab.Screen 
        name="Shifts" 
        component={ShiftsScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> 
        }}
      />
      <Tab.Screen
        name="Checks"
        component={VehicleChecksScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Copilot"
        component={CopilotScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> 
        }}
      />
    </Tab.Navigator>
  );
}
