import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';

import { backend } from '../../api/backend';
import { useAuthStore } from '../../store/authStore';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigation = useNavigation<any>();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pushNotifications, setPushNotifications] = useState(user?.notification_preferences?.push ?? true);
  const [smsNotifications, setSmsNotifications] = useState(user?.notification_preferences?.sms ?? false);
  const [emailNotifications, setEmailNotifications] = useState(user?.notification_preferences?.email ?? true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setPhone(user?.phone ?? '');
    setPushNotifications(user?.notification_preferences?.push ?? true);
    setSmsNotifications(user?.notification_preferences?.sms ?? false);
    setEmailNotifications(user?.notification_preferences?.email ?? true);
  }, [user]);

  const dashboardQuery = useQuery({
    queryKey: ['driver', 'dashboard'],
    queryFn: () => backend.getDriverDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }
      const updated = await backend.updateProfile(accessToken, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        notification_preferences: {
          push: pushNotifications,
          sms: smsNotifications,
          email: emailNotifications,
        },
      });
      await setAuth(updated, accessToken);
    },
    onSuccess: () => {
      Alert.alert('Saved', 'Driver profile updated.');
    },
    onError: (error) => {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new Error('Fill current, new, and confirm password.');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirm password do not match.');
      }
      await backend.changePassword(accessToken, {
        current_password: currentPassword,
        new_password: newPassword,
      });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Your password was updated successfully.');
    },
    onError: (error) => {
      Alert.alert('Password update failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const handleLogout = () => {
    Alert.alert('Sign out', 'Do you want to sign out from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => clearAuth() },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#00B4D8" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.full_name?.charAt(0).toUpperCase() || 'D'}</Text>
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboardQuery.data?.today_completed_trips ?? 0}</Text>
            <Text style={styles.statLabel}>Trips today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboardQuery.data?.today_passengers_served ?? 0}</Text>
            <Text style={styles.statLabel}>Passengers</Text>
          </View>
        </View>

        <View style={styles.quickLinksRow}>
          <TouchableOpacity style={styles.quickLinkCard} onPress={() => navigation.navigate('Shifts')}>
            <Ionicons name="calendar-outline" size={18} color="#00B4D8" />
            <Text style={styles.quickLinkText}>Shifts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLinkCard} onPress={() => navigation.navigate('Checks')}>
            <Ionicons name="checkmark-done-outline" size={18} color="#1D9E75" />
            <Text style={styles.quickLinkText}>Checks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLinkCard} onPress={() => navigation.navigate('Alerts')}>
            <Ionicons name="notifications-outline" size={18} color="#F59E0B" />
            <Text style={styles.quickLinkText}>Alerts</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver Settings</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Push alerts</Text>
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              thumbColor="#fff"
              trackColor={{ false: '#334155', true: '#1D9E75' }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>SMS alerts</Text>
            <Switch
              value={smsNotifications}
              onValueChange={setSmsNotifications}
              thumbColor="#fff"
              trackColor={{ false: '#334155', true: '#1D9E75' }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Email alerts</Text>
            <Switch
              value={emailNotifications}
              onValueChange={setEmailNotifications}
              thumbColor="#fff"
              trackColor={{ false: '#334155', true: '#1D9E75' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, saveProfileMutation.isPending && styles.disabledButton]}
            onPress={() => saveProfileMutation.mutate()}
            disabled={saveProfileMutation.isPending}
          >
            {saveProfileMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Save settings</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            placeholderTextColor="#64748B"
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            placeholderTextColor="#64748B"
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            placeholderTextColor="#64748B"
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.secondaryButton, changePasswordMutation.isPending && styles.disabledButton]}
            onPress={() => changePasswordMutation.mutate()}
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.secondaryButtonText}>Update password</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 4,
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  name: {
    color: '#E2E8F0',
    fontSize: 22,
    fontWeight: '700',
  },
  email: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickLinkCard: {
    flex: 1,
    minHeight: 68,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1A2E45',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickLinkText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  statValue: {
    color: '#00B4D8',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#E2E8F0',
    paddingHorizontal: 12,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchText: {
    color: '#CBD5E1',
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 4,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 2,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
  logoutButton: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
