/**
 * VANPOOL MOBILE - COMPLETE EXPO SOURCE CODE
 * 
 * This file contains ALL the source code for the VanPool mobile app.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Open Command Prompt and run:
 *    
 *    cd "c:\Users\Parth bansal\Desktop\van-pooling-platform\mobile"
 *    npx create-expo-app vanpool-expo -t expo-template-blank-typescript
 *    cd vanpool-expo
 *    npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context zustand @tanstack/react-query expo-secure-store
 * 
 * 2. Create directories:
 *    
 *    mkdir src\api src\store src\screens\employee src\screens\driver src\screens\admin src\navigation src\components
 * 
 * 3. Create each file below in the corresponding location
 * 
 * 4. Find your computer's IP: ipconfig (look for IPv4 Address)
 * 
 * 5. Update API_BASE_URL in src/api/backend.ts with your IP
 * 
 * 6. Start the backend:
 *    cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
 * 
 * 7. Start Expo:
 *    npx expo start
 * 
 * 8. Scan QR code with Expo Go app on your phone!
 */

// ============================================================
// FILE: App.tsx (replace the default one)
// ============================================================
/*
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
*/

// ============================================================
// FILE: src/api/types.ts
// ============================================================
/*
export type UserRole = "employee" | "driver" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  enterprise_id?: string | null;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface RideSummary {
  id: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  requested_pickup_time: string;
  passengers: number;
  status: string;
  assigned_van_plate?: string | null;
  driver_name?: string | null;
  eta_minutes?: number | null;
  created_at: string;
}

export interface EmployeeDashboard {
  next_ride: RideSummary | null;
  active_count: number;
  pending_count: number;
  recent_rides: RideSummary[];
}

export interface VanSummary {
  id: string;
  plate: string;
  capacity: number;
  status: string;
  lat?: number | null;
  lng?: number | null;
  driver_id?: string | null;
  driver_name?: string | null;
  current_trip_id?: string | null;
}

export interface DriverDashboardSummary {
  driver_name: string;
  status: string;
  assigned_van: VanSummary | null;
  current_shift_id?: string | null;
  shift_started_at?: string | null;
  today_completed_trips: number;
  today_passengers_served: number;
  current_trip_id?: string | null;
}

export interface DriverShiftSummary {
  id: string;
  driver_id: string;
  van_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  status: string;
  notes?: string | null;
}

export interface TripSummary {
  id: string;
  van_id: string;
  van_license_plate?: string | null;
  status: string;
  passenger_count: number;
  route: {
    origin?: { lat: number; lng: number; address?: string } | null;
    destination?: { lat: number; lng: number; address?: string } | null;
    eta_minutes?: number | null;
  };
  rides: RideSummary[];
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DriverTripSummary extends TripSummary {
  next_action: "start" | "pickup" | "dropoff" | "complete" | "none";
  next_ride_request_id?: string | null;
}

export interface AdminDashboard {
  total_employees: number;
  total_drivers: number;
  total_vans: number;
  active_vans: number;
  active_trips: number;
  pending_requests: number;
  today_completed_trips: number;
  today_passengers_served: number;
}

export interface NotificationSummary {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  is_alert: boolean;
  created_at: string;
}

export interface NotificationFeed {
  items: NotificationSummary[];
  unread_count: number;
  alert_count: number;
}

export interface GeocodeResult {
  address: string;
  lat: number;
  lng: number;
}
*/

// ============================================================
// FILE: src/api/backend.ts
// ============================================================
/*
import type { 
  User, 
  AuthTokens, 
  EmployeeDashboard, 
  DriverDashboardSummary, 
  DriverShiftSummary,
  DriverTripSummary,
  AdminDashboard, 
  RideSummary,
  VanSummary,
  NotificationFeed,
  GeocodeResult,
} from './types';

// ⚠️ UPDATE THIS WITH YOUR COMPUTER'S IP ADDRESS
// Run 'ipconfig' in Command Prompt to find it (look for IPv4 Address)
const API_BASE_URL = 'http://YOUR_IP_HERE:8000/api/v1';

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return response.json();
}

export const backend = {
  // Auth
  async login(email: string, password: string): Promise<AuthTokens> {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Login failed');
    }

    return response.json();
  },

  getMe(token: string) {
    return request<User>('/auth/me', { token });
  },

  updateProfile(token: string, data: { full_name?: string; phone?: string }) {
    return request<User>('/auth/me', { method: 'PUT', token, body: data });
  },

  // Employee
  getEmployeeDashboard(token: string) {
    return request<EmployeeDashboard>('/rides/dashboard', { token });
  },

  getRideHistory(token: string, limit = 20) {
    return request<RideSummary[]>(`/rides/history?limit=${limit}`, { token });
  },

  getActiveRide(token: string) {
    return request<RideSummary | null>('/rides/active', { token });
  },

  requestRide(token: string, payload: {
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    pickup_time: string;
    passengers: number;
  }) {
    return request<RideSummary>('/rides/request', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  cancelRide(token: string, rideId: string) {
    return request<RideSummary>(`/rides/${rideId}/cancel`, {
      method: 'POST',
      token,
    });
  },

  geocodeAddress(token: string, address: string) {
    return request<GeocodeResult>('/maps/geocode', {
      method: 'POST',
      token,
      body: { address },
    });
  },

  // Driver
  getDriverDashboard(token: string) {
    return request<DriverDashboardSummary>('/driver/dashboard', { token });
  },

  getDriverActiveTrip(token: string) {
    return request<DriverTripSummary | null>('/driver/trips/active', { token });
  },

  updateDriverStatus(token: string, status: string) {
    return request<{ message: string }>('/driver/status', {
      method: 'POST',
      token,
      body: { status },
    });
  },

  updateDriverLocation(token: string, latitude: number, longitude: number) {
    return request<{ message: string }>('/driver/location', {
      method: 'POST',
      token,
      body: { latitude, longitude },
    });
  },

  getDriverShifts(token: string, limit = 20) {
    return request<DriverShiftSummary[]>(`/driver/shifts?limit=${limit}`, { token });
  },

  startDriverShift(token: string) {
    return request<DriverShiftSummary>('/driver/shifts/start', {
      method: 'POST',
      token,
      body: {},
    });
  },

  endDriverShift(token: string, shiftId: string) {
    return request<DriverShiftSummary>(`/driver/shifts/${shiftId}/clock-out`, {
      method: 'POST',
      token,
    });
  },

  startTrip(token: string, tripId: string) {
    return request<DriverTripSummary>(`/driver/trips/${tripId}/start`, {
      method: 'POST',
      token,
    });
  },

  pickupPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<DriverTripSummary>(`/driver/trips/${tripId}/pickup/${rideRequestId}`, {
      method: 'POST',
      token,
    });
  },

  dropoffPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<DriverTripSummary>(`/driver/trips/${tripId}/dropoff/${rideRequestId}`, {
      method: 'POST',
      token,
    });
  },

  completeTrip(token: string, tripId: string) {
    return request<DriverTripSummary>(`/driver/trips/${tripId}/complete`, {
      method: 'POST',
      token,
    });
  },

  // Admin
  getAdminDashboard(token: string) {
    return request<AdminDashboard>('/admin/dashboard', { token });
  },

  getAdminVans(token: string) {
    return request<VanSummary[]>('/admin/vans', { token });
  },

  getAdminTrips(token: string) {
    return request<any[]>('/admin/trips', { token });
  },

  // Notifications
  getNotifications(token: string, options?: { includeAlerts?: boolean; limit?: number }) {
    const query = new URLSearchParams();
    if (options?.includeAlerts) query.set('include_alerts', 'true');
    if (options?.limit) query.set('limit', String(options.limit));
    return request<NotificationFeed>(`/notifications${query.toString() ? `?${query}` : ''}`, { token });
  },

  readNotification(token: string, notificationId: string) {
    return request<any>(`/notifications/${notificationId}/read`, {
      method: 'POST',
      token,
    });
  },
};
*/

// ============================================================
// FILE: src/store/authStore.ts
// ============================================================
/*
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: async (user, accessToken) => {
    await SecureStore.setItemAsync('auth_token', accessToken);
    await SecureStore.setItemAsync('auth_user', JSON.stringify(user));
    set({ user, accessToken });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
    set({ user: null, accessToken: null });
  },

  loadStoredAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const userJson = await SecureStore.getItemAsync('auth_user');
      if (token && userJson) {
        set({ accessToken: token, user: JSON.parse(userJson), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
*/

// ============================================================
// FILE: src/navigation/RootNavigator.tsx
// ============================================================
/*
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';

import LoginScreen from '../screens/LoginScreen';
import EmployeeTabs from './EmployeeTabs';
import DriverTabs from './DriverTabs';
import AdminTabs from './AdminTabs';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { user, isLoading, loadStoredAuth } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#06C167" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : user.role === 'employee' ? (
        <Stack.Screen name="EmployeeApp" component={EmployeeTabs} />
      ) : user.role === 'driver' ? (
        <Stack.Screen name="DriverApp" component={DriverTabs} />
      ) : (
        <Stack.Screen name="AdminApp" component={AdminTabs} />
      )}
    </Stack.Navigator>
  );
}
*/

// ============================================================
// FILE: src/navigation/EmployeeTabs.tsx
// ============================================================
/*
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/employee/HomeScreen';
import BookRideScreen from '../screens/employee/BookRideScreen';
import HistoryScreen from '../screens/employee/HistoryScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function EmployeeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#141414', 
          borderTopColor: '#222',
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
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
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> 
        }}
      />
    </Tab.Navigator>
  );
}
*/

// ============================================================
// FILE: src/navigation/DriverTabs.tsx
// ============================================================
/*
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import ConsoleScreen from '../screens/driver/ConsoleScreen';
import ShiftsScreen from '../screens/driver/ShiftsScreen';
import ProfileScreen from '../screens/driver/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#141414', 
          borderTopColor: '#222',
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
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
        name="Shifts" 
        component={ShiftsScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> 
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
*/

// ============================================================
// FILE: src/navigation/AdminTabs.tsx
// ============================================================
/*
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from '../screens/admin/DashboardScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#141414', 
          borderTopColor: '#222',
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
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
        name="Settings" 
        component={SettingsScreen}
        options={{ 
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> 
        }}
      />
    </Tab.Navigator>
  );
}
*/

// ============================================================
// FILE: src/screens/LoginScreen.tsx
// ============================================================
/*
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { backend } from '../api/backend';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const tokens = await backend.login(email.trim(), password);
      const user = await backend.getMe(tokens.access_token);
      await setAuth(user, tokens.access_token);
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>VP</Text>
          </View>
          <Text style={styles.title}>VanPool</Text>
          <Text style={styles.subtitle}>Corporate Commute</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Use your employee, driver, or admin credentials
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#06C167',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#06C167',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  logoText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#06C167',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
  },
});
*/

// ============================================================
// FILE: src/screens/employee/HomeScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

export default function HomeScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const dashboardQuery = useQuery({
    queryKey: ['employee', 'dashboard'],
    queryFn: () => backend.getEmployeeDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const dashboard = dashboardQuery.data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scroll}
        refreshControl={
          <RefreshControl 
            refreshing={dashboardQuery.isRefetching}
            onRefresh={() => dashboardQuery.refetch()}
            tintColor="#06C167"
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.full_name?.split(' ')[0] || 'there'}!</Text>
            <Text style={styles.subtitle}>Your commute dashboard</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn}>
            <Ionicons name="notifications-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.active_count || 0}</Text>
            <Text style={styles.statLabel}>Active Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.pending_count || 0}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {dashboard?.next_ride && (
          <View style={styles.nextRideCard}>
            <View style={styles.nextRideHeader}>
              <Ionicons name="car" size={20} color="#06C167" />
              <Text style={styles.cardTitle}>Next Ride</Text>
            </View>
            <Text style={styles.rideAddress} numberOfLines={2}>
              {dashboard.next_ride.pickup_address}
            </Text>
            <View style={styles.rideDetails}>
              <View style={styles.rideDetail}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={styles.rideTime}>
                  {new Date(dashboard.next_ride.requested_pickup_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {dashboard.next_ride.eta_minutes && (
                <View style={styles.etaBadge}>
                  <Text style={styles.etaText}>ETA {dashboard.next_ride.eta_minutes} min</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {!dashboard?.next_ride && !dashboardQuery.isLoading && (
          <View style={styles.emptyCard}>
            <Ionicons name="car-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No upcoming rides</Text>
            <Text style={styles.emptyHint}>Book a ride to get started</Text>
          </View>
        )}

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {dashboard?.recent_rides?.slice(0, 5).map((ride) => (
            <View key={ride.id} style={styles.rideItem}>
              <View style={styles.rideIcon}>
                <Ionicons 
                  name={ride.status === 'completed' ? 'checkmark-circle' : 'time'} 
                  size={20} 
                  color={ride.status === 'completed' ? '#06C167' : '#F59E0B'} 
                />
              </View>
              <View style={styles.rideInfo}>
                <Text style={styles.rideItemAddress} numberOfLines={1}>
                  {ride.pickup_address}
                </Text>
                <Text style={styles.rideItemTime}>
                  {new Date(ride.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={[
                styles.statusBadge, 
                { backgroundColor: ride.status === 'completed' ? '#06C16720' : '#F59E0B20' }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: ride.status === 'completed' ? '#06C167' : '#F59E0B' }
                ]}>
                  {ride.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
  },
  greeting: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#141414',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  statValue: {
    color: '#06C167',
    fontSize: 32,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  nextRideCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  nextRideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#06C167',
    fontSize: 14,
    fontWeight: '600',
  },
  rideAddress: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  rideDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rideDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rideTime: {
    color: '#666',
    fontSize: 14,
  },
  etaBadge: {
    backgroundColor: '#06C167',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  etaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  recentSection: {
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  rideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  rideIcon: {
    marginRight: 12,
  },
  rideInfo: {
    flex: 1,
  },
  rideItemAddress: {
    color: '#fff',
    fontSize: 16,
  },
  rideItemTime: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
*/

// ============================================================
// FILE: src/screens/employee/BookRideScreen.tsx
// ============================================================
/*
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function BookRideScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [passengers, setPassengers] = useState('1');
  const [pickupTime, setPickupTime] = useState(new Date(Date.now() + 30 * 60000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const geocodeMutation = useMutation({
    mutationFn: async (address: string) => {
      return backend.geocodeAddress(accessToken!, address);
    },
  });

  const bookRideMutation = useMutation({
    mutationFn: async () => {
      const pickup = await backend.geocodeAddress(accessToken!, pickupAddress);
      const dropoff = await backend.geocodeAddress(accessToken!, dropoffAddress);
      
      return backend.requestRide(accessToken!, {
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        pickup_time: pickupTime.toISOString(),
        passengers: parseInt(passengers) || 1,
      });
    },
    onSuccess: () => {
      Alert.alert('Success', 'Your ride has been booked!');
      setPickupAddress('');
      setDropoffAddress('');
      setPassengers('1');
      queryClient.invalidateQueries({ queryKey: ['employee'] });
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to book ride');
    },
  });

  const handleBook = () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      Alert.alert('Error', 'Please enter pickup and dropoff addresses');
      return;
    }
    bookRideMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.title}>Book a Ride</Text>
            <Text style={styles.subtitle}>Schedule your commute</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pickup Location</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="location" size={20} color="#06C167" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter pickup address"
                  placeholderTextColor="#666"
                  value={pickupAddress}
                  onChangeText={setPickupAddress}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dropoff Location</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="flag" size={20} color="#EF4444" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter dropoff address"
                  placeholderTextColor="#666"
                  value={dropoffAddress}
                  onChangeText={setDropoffAddress}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Passengers</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="people" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor="#666"
                    value={passengers}
                    onChangeText={setPassengers}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.label}>Pickup Time</Text>
                <TouchableOpacity 
                  style={styles.timeButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="time" size={20} color="#666" />
                  <Text style={styles.timeText}>
                    {pickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={pickupTime}
                mode="time"
                is24Hour={false}
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) setPickupTime(date);
                }}
              />
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.bookButton, bookRideMutation.isPending && styles.buttonDisabled]}
            onPress={handleBook}
            disabled={bookRideMutation.isPending}
          >
            {bookRideMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="car" size={20} color="#fff" />
                <Text style={styles.bookButtonText}>Book Ride</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  inputIcon: {
    marginLeft: 16,
  },
  input: {
    flex: 1,
    height: 56,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    height: 56,
    paddingHorizontal: 16,
    gap: 8,
  },
  timeText: {
    color: '#fff',
    fontSize: 16,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#000',
  },
  bookButton: {
    backgroundColor: '#06C167',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
*/

// ============================================================
// FILE: src/screens/employee/HistoryScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';
import type { RideSummary } from '../../api/types';

function RideHistoryItem({ ride }: { ride: RideSummary }) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    completed: { bg: '#06C16720', text: '#06C167' },
    cancelled: { bg: '#EF444420', text: '#EF4444' },
    pending: { bg: '#F59E0B20', text: '#F59E0B' },
    active: { bg: '#3B82F620', text: '#3B82F6' },
  };

  const colors = statusColors[ride.status] || statusColors.pending;

  return (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {new Date(ride.created_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.timeText}>
            {new Date(ride.requested_pickup_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {ride.status}
          </Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: '#06C167' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {ride.pickup_address}
          </Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {ride.dropoff_address}
          </Text>
        </View>
      </View>

      <View style={styles.rideFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="people-outline" size={16} color="#666" />
          <Text style={styles.footerText}>{ride.passengers} passenger(s)</Text>
        </View>
        {ride.driver_name && (
          <View style={styles.footerItem}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.footerText}>{ride.driver_name}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const historyQuery = useQuery({
    queryKey: ['employee', 'history'],
    queryFn: () => backend.getRideHistory(accessToken!, 50),
    enabled: Boolean(accessToken),
  });

  const rides = historyQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ride History</Text>
        <Text style={styles.subtitle}>{rides.length} rides</Text>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RideHistoryItem ride={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={historyQuery.isRefetching}
            onRefresh={() => historyQuery.refetch()}
            tintColor="#06C167"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>No ride history yet</Text>
            <Text style={styles.emptyHint}>Your completed rides will appear here</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  rideCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateContainer: {},
  dateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#666',
    fontSize: 14,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  routeContainer: {
    marginBottom: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#333',
    marginLeft: 4,
    marginVertical: 4,
  },
  addressText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  rideFooter: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
});
*/

// ============================================================
// FILE: src/screens/employee/ProfileScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

export default function ProfileScreen() {
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => clearAuth() },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="person-outline" size={22} color="#fff" />
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="lock-closed-outline" size={22} color="#fff" />
            <Text style={styles.menuText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            <Text style={styles.menuText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="help-circle-outline" size={22} color="#fff" />
            <Text style={styles.menuText}>Help Center</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="document-text-outline" size={22} color="#fff" />
            <Text style={styles.menuText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#06C167',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#06C167',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  avatarText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: '#06C16720',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  roleText: {
    color: '#06C167',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  menuText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF444420',
    marginHorizontal: 16,
    height: 56,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    color: '#333',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 24,
  },
});
*/

// ============================================================
// FILE: src/screens/driver/ConsoleScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

export default function ConsoleScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['driver', 'dashboard'],
    queryFn: () => backend.getDriverDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
  });

  const activeTripQuery = useQuery({
    queryKey: ['driver', 'activeTrip'],
    queryFn: () => backend.getDriverActiveTrip(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 5000,
  });

  const startShiftMutation = useMutation({
    mutationFn: () => backend.startDriverShift(accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver'] }),
  });

  const dashboard = dashboardQuery.data;
  const activeTrip = activeTripQuery.data;
  const isOnShift = Boolean(dashboard?.current_shift_id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={dashboardQuery.isRefetching}
            onRefresh={() => {
              dashboardQuery.refetch();
              activeTripQuery.refetch();
            }}
            tintColor="#06C167"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Driver Console</Text>
          <View style={[styles.statusIndicator, { backgroundColor: isOnShift ? '#06C167' : '#666' }]}>
            <Text style={styles.statusText}>{isOnShift ? 'On Shift' : 'Off Duty'}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.today_completed_trips || 0}</Text>
            <Text style={styles.statLabel}>Trips Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.today_passengers_served || 0}</Text>
            <Text style={styles.statLabel}>Passengers</Text>
          </View>
        </View>

        {!isOnShift && (
          <TouchableOpacity 
            style={styles.startShiftButton}
            onPress={() => startShiftMutation.mutate()}
            disabled={startShiftMutation.isPending}
          >
            <Ionicons name="play-circle" size={24} color="#fff" />
            <Text style={styles.startShiftText}>Start Shift</Text>
          </TouchableOpacity>
        )}

        {activeTrip && (
          <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <Ionicons name="car" size={20} color="#06C167" />
              <Text style={styles.tripTitle}>Active Trip</Text>
              <View style={styles.passengerBadge}>
                <Text style={styles.passengerText}>{activeTrip.passenger_count} pax</Text>
              </View>
            </View>

            <View style={styles.routeInfo}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#06C167' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeTrip.route.origin?.address || 'Pickup'}
                </Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeTrip.route.destination?.address || 'Dropoff'}
                </Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              {activeTrip.next_action === 'start' && (
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="play" size={20} color="#fff" />
                  <Text style={styles.actionText}>Start Trip</Text>
                </TouchableOpacity>
              )}
              {activeTrip.next_action === 'pickup' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.actionText}>Confirm Pickup</Text>
                </TouchableOpacity>
              )}
              {activeTrip.next_action === 'dropoff' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}>
                  <Ionicons name="flag" size={20} color="#fff" />
                  <Text style={styles.actionText}>Confirm Dropoff</Text>
                </TouchableOpacity>
              )}
              {activeTrip.next_action === 'complete' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#06C167' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.actionText}>Complete Trip</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {isOnShift && !activeTrip && (
          <View style={styles.waitingCard}>
            <Ionicons name="hourglass-outline" size={48} color="#666" />
            <Text style={styles.waitingText}>Waiting for trips...</Text>
            <Text style={styles.waitingHint}>New trips will appear here automatically</Text>
          </View>
        )}

        {dashboard?.assigned_van && (
          <View style={styles.vanCard}>
            <Ionicons name="bus" size={24} color="#06C167" />
            <View style={styles.vanInfo}>
              <Text style={styles.vanPlate}>{dashboard.assigned_van.plate}</Text>
              <Text style={styles.vanCapacity}>{dashboard.assigned_van.capacity} seats</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
  },
  greeting: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  statValue: {
    color: '#06C167',
    fontSize: 32,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  startShiftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06C167',
    margin: 16,
    height: 56,
    borderRadius: 12,
    gap: 8,
  },
  startShiftText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  tripCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tripTitle: {
    color: '#06C167',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  passengerBadge: {
    backgroundColor: '#06C16720',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  passengerText: {
    color: '#06C167',
    fontSize: 12,
    fontWeight: '600',
  },
  routeInfo: {
    marginBottom: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#333',
    marginLeft: 4,
    marginVertical: 4,
  },
  routeAddress: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  actionButtons: {
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06C167',
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  waitingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  waitingHint: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  vanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginTop: 0,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  vanInfo: {
    flex: 1,
  },
  vanPlate: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  vanCapacity: {
    color: '#666',
    fontSize: 14,
  },
});
*/

// ============================================================
// FILE: src/screens/driver/ShiftsScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';
import type { DriverShiftSummary } from '../../api/types';

function ShiftItem({ shift }: { shift: DriverShiftSummary }) {
  const duration = shift.ended_at 
    ? Math.round((new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 60000)
    : null;

  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftHeader}>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {new Date(shift.started_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.timeText}>
            {new Date(shift.started_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {shift.ended_at && ` - ${new Date(shift.ended_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          </Text>
        </View>
        <View style={[
          styles.statusBadge, 
          { backgroundColor: shift.status === 'completed' ? '#06C16720' : '#3B82F620' }
        ]}>
          <Text style={[
            styles.statusText,
            { color: shift.status === 'completed' ? '#06C167' : '#3B82F6' }
          ]}>
            {shift.status}
          </Text>
        </View>
      </View>

      {duration && (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.durationText}>
            {Math.floor(duration / 60)}h {duration % 60}m
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ShiftsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const shiftsQuery = useQuery({
    queryKey: ['driver', 'shifts'],
    queryFn: () => backend.getDriverShifts(accessToken!, 30),
    enabled: Boolean(accessToken),
  });

  const shifts = shiftsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Shift History</Text>
        <Text style={styles.subtitle}>{shifts.length} shifts</Text>
      </View>

      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ShiftItem shift={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={shiftsQuery.isRefetching}
            onRefresh={() => shiftsQuery.refetch()}
            tintColor="#06C167"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>No shift history</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  shiftCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {},
  dateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#666',
    fontSize: 14,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
    gap: 6,
  },
  durationText: {
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
});
*/

// ============================================================
// FILE: src/screens/driver/ProfileScreen.tsx
// ============================================================
/*
// Same as employee ProfileScreen - copy that file
*/

// ============================================================
// FILE: src/screens/admin/DashboardScreen.tsx
// ============================================================
/*
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => backend.getAdminDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const dashboard = dashboardQuery.data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={dashboardQuery.isRefetching}
            onRefresh={() => dashboardQuery.refetch()}
            tintColor="#06C167"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>Platform overview</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            title="Employees"
            value={dashboard?.total_employees || 0}
            icon="people"
            color="#3B82F6"
          />
          <StatCard
            title="Drivers"
            value={dashboard?.total_drivers || 0}
            icon="person"
            color="#06C167"
          />
          <StatCard
            title="Total Vans"
            value={dashboard?.total_vans || 0}
            icon="bus"
            color="#F59E0B"
          />
          <StatCard
            title="Active Vans"
            value={dashboard?.active_vans || 0}
            icon="car"
            color="#10B981"
          />
          <StatCard
            title="Active Trips"
            value={dashboard?.active_trips || 0}
            icon="navigate"
            color="#8B5CF6"
          />
          <StatCard
            title="Pending"
            value={dashboard?.pending_requests || 0}
            icon="hourglass"
            color="#EF4444"
          />
        </View>

        <View style={styles.todaySection}>
          <Text style={styles.sectionTitle}>Today's Stats</Text>
          <View style={styles.todayCard}>
            <View style={styles.todayRow}>
              <View style={styles.todayStat}>
                <Text style={styles.todayValue}>{dashboard?.today_completed_trips || 0}</Text>
                <Text style={styles.todayLabel}>Completed Trips</Text>
              </View>
              <View style={styles.todayDivider} />
              <View style={styles.todayStat}>
                <Text style={styles.todayValue}>{dashboard?.today_passengers_served || 0}</Text>
                <Text style={styles.todayLabel}>Passengers Served</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  todaySection: {
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  todayCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayStat: {
    flex: 1,
    alignItems: 'center',
  },
  todayDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  todayValue: {
    color: '#06C167',
    fontSize: 36,
    fontWeight: 'bold',
  },
  todayLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
});
*/

// ============================================================
// FILE: src/screens/admin/SettingsScreen.tsx  
// ============================================================
/*
// Same as employee ProfileScreen - copy that file with admin-specific options
*/

export {};
