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
import type { AdminTrip } from '../../api/types';

type TripFilter = 'all' | 'active' | 'planned' | 'completed' | 'exception';
type TripActionMode = 'reassign' | 'cancel';

const ACTIVE_TRIP_STATUSES = new Set([
  'dispatch_ready',
  'active_to_pickup',
  'active_in_transit',
  'active_mixed',
]);

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return '#1D9E75';
    case 'active_to_pickup':
    case 'active_in_transit':
    case 'active_mixed':
      return '#00B4D8';
    case 'planned':
    case 'dispatch_ready':
      return '#F59E0B';
    case 'cancelled':
    case 'failed_operational_issue':
    case 'reassigned':
      return '#EF4444';
    default:
      return '#64748B';
  }
}

function formatTime(value?: string) {
  if (!value) {
    return 'TBD';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function canManageTrip(status: string) {
  return !['completed', 'cancelled', 'failed_operational_issue'].includes(status);
}

export default function TripsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<TripFilter>('all');
  const [selectedTrip, setSelectedTrip] = useState<AdminTrip | null>(null);
  const [actionMode, setActionMode] = useState<TripActionMode>('reassign');
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedVanId, setSelectedVanId] = useState('');
  const [reason, setReason] = useState('');

  const tripsQuery = useQuery({
    queryKey: ['admin', 'trips'],
    queryFn: () => backend.getAdminTripsWithDetails(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const vansQuery = useQuery({
    queryKey: ['admin', 'vans'],
    queryFn: () => backend.getAdminVans(accessToken!),
    enabled: Boolean(accessToken) && showActionModal && actionMode === 'reassign',
  });

  const reassignMutation = useMutation({
    mutationFn: (payload: { tripId: string; vanId: string; reason?: string }) =>
      backend.reassignAdminTrip(accessToken!, payload.tripId, {
        van_id: payload.vanId,
        reason: payload.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vans'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      closeActionModal();
      Alert.alert('Trip reassigned', 'The trip is now assigned to the selected van.');
    },
    onError: (error) => {
      Alert.alert('Reassign failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { tripId: string; reason?: string }) =>
      backend.cancelAdminTrip(accessToken!, payload.tripId, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      closeActionModal();
      Alert.alert('Trip cancelled', 'Trip cancellation was recorded successfully.');
    },
    onError: (error) => {
      Alert.alert('Cancel failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const trips = tripsQuery.data ?? [];
  const activeTrips = useMemo(
    () => trips.filter((trip) => ACTIVE_TRIP_STATUSES.has(trip.status)),
    [trips],
  );
  const completedTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'completed'),
    [trips],
  );
  const exceptionTrips = useMemo(
    () => trips.filter((trip) => ['cancelled', 'failed_operational_issue', 'reassigned'].includes(trip.status)),
    [trips],
  );

  const filteredTrips = useMemo(() => {
    switch (filter) {
      case 'active':
        return activeTrips;
      case 'planned':
        return trips.filter((trip) => trip.status === 'planned' || trip.status === 'dispatch_ready');
      case 'completed':
        return completedTrips;
      case 'exception':
        return exceptionTrips;
      default:
        return trips;
    }
  }, [activeTrips, completedTrips, exceptionTrips, filter, trips]);

  const candidateVans = useMemo(() => {
    const vans = vansQuery.data ?? [];
    return vans.filter((van) => {
      const status = van.status.toLowerCase();
      const occupancy = van.current_occupancy ?? 0;
      return (status === 'available' || status === 'on_trip') && occupancy < van.capacity;
    });
  }, [vansQuery.data]);

  const openActionModal = (trip: AdminTrip, mode: TripActionMode) => {
    setSelectedTrip(trip);
    setActionMode(mode);
    setReason('');
    setSelectedVanId('');
    setShowActionModal(true);
  };

  const closeActionModal = () => {
    setShowActionModal(false);
    setSelectedTrip(null);
    setReason('');
    setSelectedVanId('');
  };

  const submitAction = () => {
    if (!selectedTrip) {
      return;
    }
    if (actionMode === 'reassign') {
      if (!selectedVanId) {
        Alert.alert('Select van', 'Choose a target van before confirming reassignment.');
        return;
      }
      reassignMutation.mutate({
        tripId: selectedTrip.id,
        vanId: selectedVanId,
        reason: reason.trim() || undefined,
      });
      return;
    }
    cancelMutation.mutate({
      tripId: selectedTrip.id,
      reason: reason.trim() || undefined,
    });
  };

  const isSubmitting = reassignMutation.isPending || cancelMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={tripsQuery.isRefetching}
            onRefresh={() => tripsQuery.refetch()}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>
            {activeTrips.length} active, {trips.length} total
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeTrips.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{completedTrips.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{trips.reduce((acc, trip) => acc + trip.passenger_count, 0)}</Text>
            <Text style={styles.statLabel}>Passengers</Text>
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
            ['planned', 'Planned'],
            ['completed', 'Completed'],
            ['exception', 'Exceptions'],
          ] as Array<[TripFilter, string]>).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.filterBtn, filter === value && styles.filterBtnActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tripsQuery.isLoading ? (
          <ActivityIndicator size="large" color="#00B4D8" style={{ marginTop: 34 }} />
        ) : filteredTrips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="navigate-outline" size={46} color="#334155" />
            <Text style={styles.emptyTitle}>No trips in this filter</Text>
            <Text style={styles.emptyHint}>Trips will appear here as dispatch decisions are made.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredTrips.map((trip) => {
              const color = getStatusColor(trip.status);
              const routeLabel = trip.route_name
                || `${trip.route?.origin?.address ?? 'Origin'} -> ${trip.route?.destination?.address ?? 'Destination'}`;

              return (
                <View key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tripId}>Trip #{trip.id.slice(0, 8)}</Text>
                      <Text style={styles.tripTime}>
                        Created {formatTime(trip.created_at ?? trip.scheduled_start)}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: `${color}22` }]}>
                      <View style={[styles.statusDot, { backgroundColor: color }]} />
                      <Text style={[styles.statusText, { color }]}>
                        {trip.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.routeName}>{routeLabel}</Text>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="bus" size={14} color="#94A3B8" />
                      <Text style={styles.metaText}>{trip.van_plate ?? 'Unassigned van'}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="people" size={14} color="#94A3B8" />
                      <Text style={styles.metaText}>{trip.passenger_count} riders</Text>
                    </View>
                  </View>

                  {trip.actual_start || trip.started_at ? (
                    <Text style={styles.timelineText}>
                      Started {formatTime(trip.actual_start ?? trip.started_at)}
                    </Text>
                  ) : null}

                  {canManageTrip(trip.status) ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => openActionModal(trip, 'reassign')}
                      >
                        <Text style={styles.secondaryBtnText}>Reassign</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dangerBtn}
                        onPress={() => openActionModal(trip, 'cancel')}
                      >
                        <Text style={styles.dangerBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showActionModal}
        transparent
        animationType="slide"
        onRequestClose={closeActionModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {actionMode === 'reassign' ? 'Reassign Trip' : 'Cancel Trip'}
            </Text>
            <Text style={styles.modalCaption}>
              {selectedTrip ? `Trip ${selectedTrip.id.slice(0, 8)}` : 'Trip'}
            </Text>

            {actionMode === 'reassign' ? (
              <>
                <Text style={styles.fieldLabel}>Select target van</Text>
                {vansQuery.isLoading ? (
                  <ActivityIndicator color="#00B4D8" />
                ) : candidateVans.length === 0 ? (
                  <Text style={styles.emptyInline}>No eligible vans are available right now.</Text>
                ) : (
                  <ScrollView style={styles.vanList} nestedScrollEnabled>
                    {candidateVans.map((van) => {
                      const active = selectedVanId === van.id;
                      return (
                        <TouchableOpacity
                          key={van.id}
                          style={[styles.vanOption, active && styles.vanOptionActive]}
                          onPress={() => setSelectedVanId(van.id)}
                        >
                          <Text style={styles.vanPlate}>{van.plate_number}</Text>
                          <Text style={styles.vanMeta}>
                            {van.current_occupancy ?? 0}/{van.capacity} seats
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Describe why you are taking this action"
              placeholderTextColor="#64748B"
              style={styles.reasonInput}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={closeActionModal}>
                <Text style={styles.ghostText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isSubmitting && styles.disabledBtn]}
                onPress={submitAction}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>
                    {actionMode === 'reassign' ? 'Confirm Reassign' : 'Confirm Cancel'}
                  </Text>
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
  },
  title: {
    color: '#E2E8F0',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
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
    paddingVertical: 12,
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
    marginTop: 3,
  },
  filterScroll: {
    marginBottom: 12,
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
  tripCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 9,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  tripId: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  tripTime: {
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
  routeName: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
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
  timelineText: {
    color: '#60A5FA',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#223F5F',
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  dangerBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  dangerBtnText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 22,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
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
    backgroundColor: 'rgba(2,6,23,0.74)',
    padding: 14,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 10,
    maxHeight: '84%',
  },
  modalTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCaption: {
    color: '#94A3B8',
    fontSize: 12,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyInline: {
    color: '#94A3B8',
    fontSize: 12,
  },
  vanList: {
    maxHeight: 170,
  },
  vanOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0F2135',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vanOptionActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  vanPlate: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  vanMeta: {
    color: '#94A3B8',
    fontSize: 12,
  },
  reasonInput: {
    minHeight: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0F2135',
    color: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
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
