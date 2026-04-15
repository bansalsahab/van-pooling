# VanPool Mobile - React Native Setup

## Quick Start

### Option 1: Use Expo (Recommended for beginners)

This is the easiest way to get started:

```bash
cd "c:\Users\Parth bansal\Desktop\van-pooling-platform\mobile"

# Create new Expo project
npx create-expo-app vanpool-expo --template blank-typescript

cd vanpool-expo

# Install dependencies
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install zustand @tanstack/react-query
npm install expo-secure-store

# Start the app (scan QR code with Expo Go app on your phone)
npx expo start
```

### Option 2: React Native CLI

For native builds:

```bash
cd "c:\Users\Parth bansal\Desktop\van-pooling-platform\mobile"

# Create new React Native project
npx react-native init VanPoolMobile --template react-native-template-typescript

cd VanPoolMobile

# Install dependencies
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context react-native-vector-icons
npm install zustand @tanstack/react-query
npm install react-native-async-storage/async-storage

# iOS only
cd ios && pod install && cd ..

# Run
npx react-native run-android
# OR
npx react-native run-ios
```

## Project Structure to Create

After creating the project, create these files:

```
src/
├── api/
│   ├── types.ts
│   └── backend.ts
├── store/
│   └── authStore.ts
├── screens/
│   ├── LoginScreen.tsx
│   ├── employee/
│   │   ├── HomeScreen.tsx
│   │   ├── BookRideScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── driver/
│   │   ├── ConsoleScreen.tsx
│   │   └── ProfileScreen.tsx
│   └── admin/
│       ├── DashboardScreen.tsx
│       └── SettingsScreen.tsx
├── components/
│   ├── Button.tsx
│   └── Card.tsx
└── navigation/
    └── RootNavigator.tsx
```

## API Configuration

Update the API_BASE_URL in `src/api/backend.ts` to your backend server:
- Development: `http://10.0.2.2:8000/api/v1` (Android emulator)
- Development: `http://localhost:8000/api/v1` (iOS simulator)
- Production: Your production API URL

---

# SOURCE CODE FILES

## File: src/api/types.ts

```typescript
export type UserRole = "employee" | "driver" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
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

export interface DriverDashboardSummary {
  driver_name: string;
  status: string;
  today_completed_trips: number;
  today_passengers_served: number;
}

export interface AdminDashboard {
  total_employees: number;
  total_drivers: number;
  total_vans: number;
  active_trips: number;
}
```

## File: src/api/backend.ts

```typescript
import type { User, AuthTokens, EmployeeDashboard, DriverDashboardSummary, AdminDashboard, RideSummary } from './types';

// Update this URL based on your environment
const API_BASE_URL = __DEV__ 
  ? 'http://10.0.2.2:8000/api/v1'  // Android emulator
  : 'https://your-production-api.com/api/v1';

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
  login(email: string, password: string) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    return fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    }).then(res => res.json()) as Promise<AuthTokens>;
  },

  getMe(token: string) {
    return request<User>('/auth/me', { token });
  },

  // Employee
  getEmployeeDashboard(token: string) {
    return request<EmployeeDashboard>('/rides/dashboard', { token });
  },

  getRideHistory(token: string) {
    return request<RideSummary[]>('/rides/history', { token });
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

  // Driver
  getDriverDashboard(token: string) {
    return request<DriverDashboardSummary>('/driver/dashboard', { token });
  },

  // Admin
  getAdminDashboard(token: string) {
    return request<AdminDashboard>('/admin/dashboard', { token });
  },
};
```

## File: src/store/authStore.ts

```typescript
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: async (user, accessToken) => {
    await AsyncStorage.setItem('auth_token', accessToken);
    await AsyncStorage.setItem('auth_user', JSON.stringify(user));
    set({ user, accessToken });
  },

  clearAuth: async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('auth_user');
    set({ user: null, accessToken: null });
  },

  loadStoredAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userJson = await AsyncStorage.getItem('auth_user');
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
```

## File: src/navigation/RootNavigator.tsx

```typescript
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
```

## File: src/navigation/EmployeeTabs.tsx

```typescript
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

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
        tabBarStyle: { backgroundColor: '#141414', borderTopColor: '#222' },
        tabBarActiveTintColor: '#06C167',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Icon name="home" size={24} color={color} /> }}
      />
      <Tab.Screen 
        name="Book" 
        component={BookRideScreen}
        options={{ tabBarIcon: ({ color }) => <Icon name="car" size={24} color={color} /> }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ tabBarIcon: ({ color }) => <Icon name="history" size={24} color={color} /> }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <Icon name="account" size={24} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
```

## File: src/screens/LoginScreen.tsx

```typescript
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
      setAuth(user, tokens.access_token);
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
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
      </View>
    </KeyboardAvoidingView>
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
});
```

## File: src/screens/employee/HomeScreen.tsx

```typescript
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

export default function HomeScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const dashboardQuery = useQuery({
    queryKey: ['employee', 'dashboard'],
    queryFn: () => backend.getEmployeeDashboard(accessToken!),
    enabled: Boolean(accessToken),
  });

  const dashboard = dashboardQuery.data;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl 
          refreshing={dashboardQuery.isRefetching}
          onRefresh={() => dashboardQuery.refetch()}
          tintColor="#06C167"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.full_name?.split(' ')[0] || 'there'}!</Text>
        <Text style={styles.subtitle}>Your commute dashboard</Text>
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
          <Text style={styles.cardTitle}>Next Ride</Text>
          <Text style={styles.rideAddress}>{dashboard.next_ride.pickup_address}</Text>
          <Text style={styles.rideTime}>
            {new Date(dashboard.next_ride.requested_pickup_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {dashboard.next_ride.eta_minutes && (
            <View style={styles.etaBadge}>
              <Text style={styles.etaText}>ETA {dashboard.next_ride.eta_minutes} min</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Rides</Text>
        {dashboard?.recent_rides?.map((ride) => (
          <View key={ride.id} style={styles.rideItem}>
            <View style={styles.rideInfo}>
              <Text style={styles.rideItemAddress} numberOfLines={1}>
                {ride.pickup_address}
              </Text>
              <Text style={styles.rideItemTime}>
                {new Date(ride.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: ride.status === 'completed' ? '#06C167' : '#F59E0B' }]}>
              <Text style={styles.statusText}>{ride.status}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 24,
    paddingTop: 60,
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
  statsRow: {
    flexDirection: 'row',
    padding: 16,
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
  cardTitle: {
    color: '#06C167',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  rideAddress: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  rideTime: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  etaBadge: {
    backgroundColor: '#06C167',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  etaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
```

## File: src/screens/employee/ProfileScreen.tsx

```typescript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuthStore } from '../../store/authStore';

export default function ProfileScreen() {
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: clearAuth },
      ]
    );
  };

  return (
    <View style={styles.container}>
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
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Change Password</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Notification Settings</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#06C167',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
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
    backgroundColor: '#06C167',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  section: {
    backgroundColor: '#141414',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  menuText: {
    color: '#fff',
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
```

---

# ALTERNATIVE: PWA (Progressive Web App)

If you want the **quickest** solution, you can run the existing React web app on your phone:

1. Start the backend and frontend:
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

cd app-ui/Frontend-Focus-1/artifacts/van-pool
pnpm dev --host
```

2. Find your computer's IP address (e.g., 192.168.1.100)

3. On your phone, open Chrome/Safari and go to:
   `http://192.168.1.100:5173`

4. Add to Home Screen for app-like experience!

This works immediately with no extra setup needed.
