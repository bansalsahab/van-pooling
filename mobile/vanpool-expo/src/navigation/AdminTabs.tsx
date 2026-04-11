import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from '../screens/admin/DashboardScreen';
import FleetScreen from '../screens/admin/FleetScreen';
import TripsScreen from '../screens/admin/TripsScreen';
import AlertsScreen from '../screens/admin/AlertsScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';
import CopilotScreen from '../screens/shared/CopilotScreen';

const Tab = createBottomTabNavigator();

export default function AdminTabs() {
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
        name="Dashboard" 
        component={DashboardScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> 
        }}
      />
      <Tab.Screen
        name="Fleet"
        component={FleetScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Trips"
        component={TripsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="warning" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Users"
        component={UsersScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Copilot"
        component={CopilotScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> 
        }}
      />
    </Tab.Navigator>
  );
}
