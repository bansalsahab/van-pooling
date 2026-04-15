import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

export default function UsersScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'employee' | 'driver' | 'admin'>('all');
  
  // Create form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'employee' | 'driver' | 'admin'>('employee');
  const [newAdminScope, setNewAdminScope] = useState<'supervisor' | 'dispatcher' | 'viewer' | 'support'>('viewer');

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => backend.getAdminUsers(accessToken!),
    enabled: Boolean(accessToken),
  });

  const createMutation = useMutation({
    mutationFn: () => backend.createUser(accessToken!, {
      email: newEmail,
      password: newPassword,
      full_name: newName,
      role: newRole,
      phone: newPhone || undefined,
      admin_scope: newRole === 'admin' ? newAdminScope : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowCreateModal(false);
      resetForm();
      Alert.alert('Success', 'User created successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create user');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      backend.updateUser(accessToken!, userId, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      Alert.alert('Success', 'User status updated.');
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update status');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => backend.resetUserPassword(accessToken!, userId),
    onSuccess: (data) => {
      Alert.alert('Password Reset', `Temporary password: ${data.temp_password}`);
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to reset password');
    },
  });

  const resetForm = () => {
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewPhone('');
    setNewRole('employee');
    setNewAdminScope('viewer');
  };

  const users = usersQuery.data || [];
  const filteredUsers = filter === 'all' 
    ? users 
    : users.filter(u => u.role === filter);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return '#8B5CF6';
      case 'driver': return '#3B82F6';
      case 'employee': return '#06C167';
      default: return '#64748B';
    }
  };

  const openCreateForRole = (role: 'employee' | 'driver' | 'admin') => {
    setNewRole(role);
    if (role !== 'admin') {
      setNewAdminScope('viewer');
    }
    setShowCreateModal(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={usersQuery.isRefetching}
            onRefresh={() => usersQuery.refetch()}
            tintColor="#06C167"
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Users</Text>
            <Text style={styles.subtitle}>{users.length} total users</Text>
          </View>
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={[styles.quickActionBtn, { borderColor: '#06C16755' }]}
            onPress={() => openCreateForRole('employee')}
          >
            <Ionicons name="person-add-outline" size={16} color="#06C167" />
            <Text style={styles.quickActionText}>Add Employee</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionBtn, { borderColor: '#3B82F655' }]}
            onPress={() => openCreateForRole('driver')}
          >
            <Ionicons name="car-sport-outline" size={16} color="#3B82F6" />
            <Text style={styles.quickActionText}>Add Driver</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {(['all', 'employee', 'driver', 'admin'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Users List */}
        {usersQuery.isLoading ? (
          <ActivityIndicator size="large" color="#06C167" style={{ marginTop: 40 }} />
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        ) : (
          <View style={styles.usersList}>
            {filteredUsers.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userAvatar}>
                  <Text style={styles.avatarText}>
                    {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.userMeta}>
                    <View style={[
                      styles.roleBadge,
                      { backgroundColor: getRoleBadgeColor(user.role) + '20' }
                    ]}>
                      <Text style={[styles.roleText, { color: getRoleBadgeColor(user.role) }]}>
                        {user.role}
                      </Text>
                    </View>
                    {!user.is_active && (
                      <View style={[styles.roleBadge, { backgroundColor: '#FF5D7420' }]}>
                        <Text style={[styles.roleText, { color: '#FF5D74' }]}>Inactive</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={() => {
                    Alert.alert(
                      user.full_name,
                      'Select an action',
                      [
                        {
                          text: user.is_active ? 'Deactivate User' : 'Activate User',
                          onPress: () =>
                            toggleStatusMutation.mutate({
                              userId: user.id,
                              isActive: !user.is_active,
                            }),
                        },
                        {
                          text: 'Reset Password',
                          onPress: () => resetPasswordMutation.mutate(user.id),
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create User Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New User</Text>
            <TouchableOpacity 
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName || !newEmail || !newPassword}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#06C167" />
              ) : (
                <Text style={[
                  styles.saveBtn,
                  (!newName || !newEmail || !newPassword) && styles.saveBtnDisabled
                ]}>
                  Create
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Full Name *</Text>
              <TextInput
                style={styles.formInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter full name"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Email *</Text>
              <TextInput
                style={styles.formInput}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="Enter email"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Password *</Text>
              <TextInput
                style={styles.formInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter password"
                placeholderTextColor="#64748B"
                secureTextEntry
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={styles.formInput}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Enter phone (optional)"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Role *</Text>
              <View style={styles.roleSelector}>
                {(['employee', 'driver', 'admin'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.roleSelectorBtn,
                      newRole === r && styles.roleSelectorBtnActive
                    ]}
                    onPress={() => setNewRole(r)}
                  >
                    <Text style={[
                      styles.roleSelectorText,
                      newRole === r && styles.roleSelectorTextActive
                    ]}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {newRole === 'admin' && (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Admin Scope</Text>
                <View style={styles.roleSelector}>
                  {(['supervisor', 'dispatcher', 'viewer', 'support'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.scopeBtn,
                        newAdminScope === s && styles.scopeBtnActive
                      ]}
                      onPress={() => setNewAdminScope(s)}
                    >
                      <Text style={[
                        styles.scopeBtnText,
                        newAdminScope === s && styles.scopeBtnTextActive
                      ]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 16,
    marginTop: 4,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#06C167',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#141414',
    minHeight: 44,
  },
  quickActionText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
  },
  filterBtnActive: {
    backgroundColor: '#06C167',
    borderColor: '#06C167',
  },
  filterBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  usersList: {
    padding: 20,
    paddingTop: 0,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#06C16730',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#06C167',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 2,
  },
  userMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  menuBtn: {
    padding: 8,
  },
  emptyCard: {
    margin: 20,
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
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelBtn: {
    color: '#999',
    fontSize: 16,
  },
  saveBtn: {
    color: '#06C167',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtnDisabled: {
    color: '#333',
  },
  modalScroll: {
    flex: 1,
    padding: 20,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  roleSelectorBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
  },
  roleSelectorBtnActive: {
    backgroundColor: '#06C167',
    borderColor: '#06C167',
  },
  roleSelectorText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  roleSelectorTextActive: {
    color: '#fff',
  },
  scopeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
  },
  scopeBtnActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  scopeBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  scopeBtnTextActive: {
    color: '#fff',
  },
});
