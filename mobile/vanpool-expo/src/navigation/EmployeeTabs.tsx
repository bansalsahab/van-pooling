import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/employee/HomeScreen';
import BookRideScreen from '../screens/employee/BookRideScreen';
import HistoryScreen from '../screens/employee/HistoryScreen';
import NotificationsScreen from '../screens/employee/NotificationsScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import TrackRideScreen from '../screens/employee/TrackRideScreen';
import SavedLocationsScreen from '../screens/employee/SavedLocationsScreen';
import RecurringRidesScreen from '../screens/employee/RecurringRidesScreen';
import HelpScreen from '../screens/employee/HelpScreen';
import CopilotScreen from '../screens/shared/CopilotScreen';

const Tab = createBottomTabNavigator();

export default function EmployeeTabs() {
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
        name="Home" 
        component={HomeScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> 
        }}
      />
      <Tab.Screen 
        name="Book" 
        component={BookRideScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="car" size={size} color={color} /> 
        }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} /> 
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
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
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> 
        }}
      />
      <Tab.Screen
        name="TrackRide"
        component={TrackRideScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="SavedLocations"
        component={SavedLocationsScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="RecurringRides"
        component={RecurringRidesScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="Help"
        component={HelpScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
