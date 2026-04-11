import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { backend } from '../api/backend';
import { useAuthStore } from '../store/authStore';

type AuthMode = 'signin' | 'register';
type Role = 'employee' | 'driver' | 'admin';

const ROLE_ACCENT: Record<Role, string> = {
  employee: '#1D9E75',
  driver: '#F59E0B',
  admin: '#8B5CF6',
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  employee: 'Book, track, and manage your daily commute.',
  driver: 'Sign in to run your assigned shifts and trips.',
  admin: 'Manage fleet, demand, dispatch, and tenant operations.',
};

export default function LoginScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [role, setRole] = useState<Role>('employee');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const accent = useMemo(() => ROLE_ACCENT[role], [role]);

  const resetRegisterFields = () => {
    setName('');
    setPhone('');
    setCompanyDomain('');
    setCompanyName('');
    setConfirmPassword('');
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    if (nextMode === 'signin') {
      resetRegisterFields();
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Enter email and password to continue.');
      return;
    }

    setLoading(true);
    try {
      const tokens = await backend.login(email.trim(), password, role);
      const user = tokens.user ?? await backend.getMe(tokens.access_token);
      await setAuth(user, tokens.access_token);
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (role === 'driver') {
      Alert.alert(
        'Driver registration unavailable',
        'Driver accounts are created by admins. Use driver portal only for sign in.',
      );
      return;
    }
    if (!name.trim() || !email.trim() || !password.trim() || !companyDomain.trim()) {
      Alert.alert('Missing fields', 'Fill name, email, password, and company domain.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Confirm password must match exactly.');
      return;
    }
    if (password.length < 12) {
      Alert.alert(
        'Weak password',
        'Use at least 12 characters with upper, lower, number, and special symbol.',
      );
      return;
    }
    if (role === 'admin' && !companyName.trim()) {
      Alert.alert('Company name required', 'Admin workspace bootstrap requires company name.');
      return;
    }

    setLoading(true);
    try {
      const tokens = await backend.register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        company_domain: companyDomain.trim().toLowerCase(),
        company_name: role === 'admin' ? companyName.trim() : undefined,
        requested_role: role,
      });
      const user = tokens.user ?? await backend.getMe(tokens.access_token);
      await setAuth(user, tokens.access_token);
    } catch (error) {
      Alert.alert('Registration Failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'signin') {
      handleSignIn();
      return;
    }
    handleRegister();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={[styles.logo, { shadowColor: accent }]}>
              <Text style={styles.logoText}>VP</Text>
            </View>
            <Text style={styles.title}>VanPool</Text>
            <Text style={styles.subtitle}>One fleet app. Three operating roles.</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.modeSwitch}>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'signin' && { backgroundColor: '#0E7490' }]}
                onPress={() => handleModeChange('signin')}
              >
                <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'register' && { backgroundColor: '#0E7490' }]}
                onPress={() => handleModeChange('register')}
              >
                <Text style={[styles.modeText, mode === 'register' && styles.modeTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.roleLabel, { color: accent }]}>{role.toUpperCase()}</Text>
            <Text style={styles.roleDescription}>{ROLE_DESCRIPTION[role]}</Text>

            <View style={styles.roleSwitch}>
              {(['employee', 'driver', 'admin'] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.roleButton,
                    role === value && { backgroundColor: `${ROLE_ACCENT[value]}33`, borderColor: ROLE_ACCENT[value] },
                  ]}
                  onPress={() => setRole(value)}
                >
                  <Text style={[styles.roleButtonText, role === value && { color: '#E2E8F0' }]}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'register' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone (optional)"
                  placeholderTextColor="#64748B"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Company domain (example: ibm.com)"
                  placeholderTextColor="#64748B"
                  value={companyDomain}
                  onChangeText={setCompanyDomain}
                  autoCapitalize="none"
                />
                {role === 'admin' && (
                  <TextInput
                    style={styles.input}
                    placeholder="Company name"
                    placeholderTextColor="#64748B"
                    value={companyName}
                    onChangeText={setCompanyName}
                  />
                )}
              </>
            )}

            <TextInput
              style={styles.input}
              placeholder="Work email"
              placeholderTextColor="#64748B"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {mode === 'register' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#64748B"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
                <Text style={styles.passwordHint}>
                  Password needs 12+ chars with uppercase, lowercase, number, and symbol.
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: accent }, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'signin' ? 'Sign In' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  keyboardWrap: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#00B4D8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  title: {
    color: '#E2E8F0',
    fontSize: 38,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 4,
  },
  formCard: {
    borderRadius: 20,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 10,
  },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 4,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modeText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#fff',
  },
  roleLabel: {
    fontSize: 11,
    letterSpacing: 0.9,
    fontWeight: '600',
  },
  roleDescription: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 4,
  },
  roleSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  roleButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F2135',
  },
  roleButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderRadius: 10,
    height: 52,
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 14,
  },
  passwordHint: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: -2,
    marginBottom: 4,
  },
  submitButton: {
    marginTop: 6,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
