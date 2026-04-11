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