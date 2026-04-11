import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

type VanFilter = 'all' | 'active' | 'available' | 'offline';

function statusColor(status: string) {
  switch (status) {
    case 'on_trip':
      return '#1D9E75';
    case 'available':
      return '#00B4D8';
    case 'maintenance':
      return '#F59E0B';
    case 'offline':
      return '#EF4444';
    default:
      return '#64748B';
  }
}

function formatLocationTime(value?: string) {
  if (!value) {
    return 'No live ping';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FleetScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<VanFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newCapacity, setNewCapacity] = useState('8');
  const [newStatus, setNewStatus] = useState<'offline' | 'available' | 'maintenance'>('offline');

  const vansQuery = useQuery({
    queryKey: ['admin', 'vans'],
    queryFn: () => backend.getAdminVans(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const createVanMutation = useMutation({
    mutationFn: () =>
      backend.createAdminVan(accessToken!, {
        license_plate: newPlate.trim().toUpperCase(),
        capacity: Number.parseInt(newCapacity, 10) || 8,
        status: newStatus,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'vans'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setShowCreateModal(false);
      setNewPlate('');
      setNewCapacity('8');
      setNewStatus('offline');
      Alert.alert('Van added', 'The new van is now available in fleet operations.');
    },
    onError: (error) => {
      Alert.alert('Create van failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const vans = vansQuery.data ?? [];
  const activeCount = vans.filter((van) => van.status === 'on_trip').length;
  const availableCount = vans.filter((van) => van.status === 'available').length;

  const filteredVans = useMemo(() => {
    switch (filter) {
      case 'active':
        return vans.filter((van) => van.status === 'on_trip');
      case 'available':
        return vans.filter((van) => van.status === 'available');
      case 'offline':
        return vans.filter((van) => ['offline', 'maintenance'].includes(van.status));
      default:
        return vans;
    }
  }, [filter, vans]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={vansQuery.isRefetching}
            onRefresh={() => vansQuery.refetch()}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Fleet</Text>
            <Text style={styles.subtitle}>
              {activeCount} active · {availableCount} available · {vans.length} total
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{vans.length}</Text>
            <Text style={styles.statLabel}>Total Vans</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>On Trip</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{availableCount}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {([
            ['all', 'All'],
            ['active', 'Active'],
            ['available', 'Available'],
            ['offline', 'Offline/Maint'],
          ] as Array<[VanFilter, string]>).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.filterBtn, filter === value && styles.filterBtnActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {vansQuery.isLoading ? (
          <ActivityIndicator size="large" color="#00B4D8" style={{ marginTop: 34 }} />
        ) : filteredVans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="car-outline" size={46} color="#334155" />
            <Text style={styles.emptyTitle}>No vans in this view</Text>
            <Text style={styles.emptyHint}>
              Add a van or change filters to inspect operational readiness.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredVans.map((van) => {
              const color = statusColor(van.status);
              const occupancy = van.current_occupancy ?? 0;
              return (
                <View key={van.id} style={styles.vanCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.plate}>{van.plate_number}</Text>
                      <Text style={styles.model}>{van.model}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: `${color}22` }]}>
                      <View style={[styles.statusDot, { backgroundColor: color }]} />
                      <Text style={[styles.statusText, { color }]}>
                        {van.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="people" size={14} color="#94A3B8" />
                      <Text style={styles.metaText}>{occupancy}/{van.capacity} seats</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="person" size={14} color="#94A3B8" />
                      <Text style={styles.metaText}>{van.current_driver_name ?? 'No driver assigned'}</Text>
                    </View>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="location" size={14} color="#94A3B8" />
                    <Text style={styles.metaText}>
                      Last location ping: {formatLocationTime(van.last_location_update ?? van.last_location?.updated_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Van</Text>
            <Text style={styles.modalHint}>Create a new van entry for dispatch and pooling.</Text>

            <Text style={styles.fieldLabel}>License plate</Text>
            <TextInput
              value={newPlate}
              onChangeText={setNewPlate}
              placeholder="RJ02 AB 1234"
              placeholderTextColor="#64748B"
              style={styles.input}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Capacity</Text>
            <TextInput
              value={newCapacity}
              onChangeText={setNewCapacity}
              placeholder="8"
              placeholderTextColor="#64748B"
              style={styles.input}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Initial status</Text>
            <View style={styles.statusSelector}>
              {(['offline', 'available', 'maintenance'] as const).map((status) => {
                const active = newStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[styles.statusOption, active && styles.statusOptionActive]}
                    onPress={() => setNewStatus(status)}
                  >
                    <Text style={[styles.statusOptionText, active && styles.statusOptionTextActive]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.ghostText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, createVanMutation.isPending && styles.disabledBtn]}
                onPress={() => createVanMutation.mutate()}
                disabled={createVanMutation.isPending || newPlate.trim().length < 3}
              >
                {createVanMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Create Van</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#E2E8F0',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 3,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    paddingVertical: 11,
    alignItems: 'center',
  },
  statValue: {
    color: '#E2E8F0',
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  filterScroll: {
    marginBottom: 10,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1A2E45',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterBtnActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  filterText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#E2E8F0',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },
  vanCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  plate: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  model: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.72)',
    padding: 14,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  modalHint: {
    color: '#94A3B8',
    fontSize: 12,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0F2135',
    color: '#E2E8F0',
    paddingHorizontal: 12,
    fontSize: 14,
  },
  statusSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  statusOption: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0F2135',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOptionActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  statusOptionText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusOptionTextActive: {
    color: '#E2E8F0',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#00B4D8',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.65,
  },
});
