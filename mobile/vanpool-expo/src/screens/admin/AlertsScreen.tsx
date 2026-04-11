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

import { backend } from '../../api/backend';
import { useAuthStore } from '../../store/authStore';
import type { AlertSummary } from '../../api/types';

type TripActionMode = 'reassign' | 'cancel';

function formatTimestamp(value?: string) {
  if (!value) {
    return 'Just now';
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

function severityColor(severity: string) {
  switch (severity.toLowerCase()) {
    case 'high':
    case 'critical':
      return '#EF4444';
    case 'medium':
      return '#F59E0B';
    default:
      return '#00B4D8';
  }
}

export default function AlertsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [includeResolved, setIncludeResolved] = useState(false);
  const [activeAlert, setActiveAlert] = useState<AlertSummary | null>(null);
  const [actionMode, setActionMode] = useState<TripActionMode>('reassign');
  const [reason, setReason] = useState('');
  const [selectedVanId, setSelectedVanId] = useState<string>('');
  const [showTripActionModal, setShowTripActionModal] = useState(false);

  const alertsQuery = useQuery({
    queryKey: ['admin', 'alerts', includeResolved],
    queryFn: () => backend.getAdminAlerts(accessToken!, { includeResolved }),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const vansQuery = useQuery({
    queryKey: ['admin', 'vans'],
    queryFn: () => backend.getAdminVans(accessToken!),
    enabled: Boolean(accessToken) && showTripActionModal && actionMode === 'reassign',
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => backend.resolveAdminAlert(accessToken!, alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => {
      Alert.alert('Resolve failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const cancelTripMutation = useMutation({
    mutationFn: (payload: { tripId: string; reason?: string }) =>
      backend.cancelAdminTrip(accessToken!, payload.tripId, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      closeTripActionModal();
      Alert.alert('Trip cancelled', 'The trip was cancelled successfully.');
    },
    onError: (error) => {
      Alert.alert('Cancel failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const reassignTripMutation = useMutation({
    mutationFn: (payload: { tripId: string; vanId: string; reason?: string }) =>
      backend.reassignAdminTrip(accessToken!, payload.tripId, {
        van_id: payload.vanId,
        reason: payload.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vans'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      closeTripActionModal();
      Alert.alert('Trip reassigned', 'The trip was moved to the selected van.');
    },
    onError: (error) => {
      Alert.alert('Reassign failed', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const alerts = alertsQuery.data ?? [];
  const openAlerts = useMemo(
    () => alerts.filter((item) => item.status !== 'sent'),
    [alerts],
  );

  const candidateVans = useMemo(() => {
    const vans = vansQuery.data ?? [];
    return vans.filter((van) => {
      const status = van.status.toLowerCase();
      const occupancy = van.current_occupancy ?? 0;
      return (status === 'available' || status === 'on_trip') && occupancy < van.capacity;
    });
  }, [vansQuery.data]);

  const openTripActionModal = (alert: AlertSummary, mode: TripActionMode) => {
    if (!alert.trip_id) {
      Alert.alert('Unavailable', 'This alert is not linked to a trip.');
      return;
    }
    setActionMode(mode);
    setActiveAlert(alert);
    setReason('');
    setSelectedVanId('');
    setShowTripActionModal(true);
  };

  const closeTripActionModal = () => {
    setShowTripActionModal(false);
    setActiveAlert(null);
    setReason('');
    setSelectedVanId('');
  };

  const submitTripAction = () => {
    if (!activeAlert?.trip_id) {
      return;
    }
    if (actionMode === 'reassign') {
      if (!selectedVanId) {
        Alert.alert('Select van', 'Choose a target van to complete reassignment.');
        return;
      }
      reassignTripMutation.mutate({
        tripId: activeAlert.trip_id,
        vanId: selectedVanId,
        reason: reason.trim() || undefined,
      });
      return;
    }
    cancelTripMutation.mutate({
      tripId: activeAlert.trip_id,
      reason: reason.trim() || undefined,
    });
  };

  const isSubmitting = cancelTripMutation.isPending || reassignTripMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={alertsQuery.isRefetching}
            onRefresh={() => alertsQuery.refetch()}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Alerts</Text>
          <Text style={styles.subtitle}>
            {openAlerts.length} open of {alerts.length}
          </Text>
          <TouchableOpacity
            style={[styles.toggleBtn, includeResolved && styles.toggleBtnActive]}
            onPress={() => setIncludeResolved((value) => !value)}
          >
            <Text style={[styles.toggleText, includeResolved && styles.toggleTextActive]}>
              {includeResolved ? 'Showing resolved' : 'Open only'}
            </Text>
          </TouchableOpacity>
        </View>

        {alertsQuery.isLoading ? (
          <ActivityIndicator size="large" color="#00B4D8" style={{ marginTop: 36 }} />
        ) : alerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle" size={44} color="#1D9E75" />
            <Text style={styles.emptyTitle}>No alerts right now</Text>
            <Text style={styles.emptyCaption}>
              Operational alerts will appear here whenever dispatch risk rises.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {alerts.map((alert) => {
              const color = severityColor(alert.severity);
              const resolved = alert.status === 'sent';
              return (
                <View key={alert.id} style={styles.alertCard}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.severityPill, { backgroundColor: `${color}22` }]}>
                      <View style={[styles.severityDot, { backgroundColor: color }]} />
                      <Text style={[styles.severityText, { color }]}>
                        {alert.severity.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.timeText}>
                      {formatTimestamp(alert.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.alertTitle}>
                    {alert.title || 'Operational alert'}
                  </Text>
                  <Text style={styles.alertMessage}>{alert.message}</Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Kind: {alert.kind}</Text>
                    {alert.trip_id ? <Text style={styles.metaText}>Trip: {alert.trip_id.slice(0, 8)}</Text> : null}
                    <Text style={styles.metaText}>Status: {alert.status}</Text>
                  </View>

                  {!resolved ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.resolveBtn}
                        onPress={() => resolveMutation.mutate(alert.id)}
                        disabled={resolveMutation.isPending}
                      >
                        <Text style={styles.resolveText}>Resolve</Text>
                      </TouchableOpacity>
                      {alert.trip_id ? (
                        <>
                          <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => openTripActionModal(alert, 'reassign')}
                          >
                            <Text style={styles.secondaryBtnText}>Reassign trip</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.secondaryDangerBtn}
                            onPress={() => openTripActionModal(alert, 'cancel')}
                          >
                            <Text style={styles.secondaryDangerText}>Cancel trip</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.resolvedLabel}>
                      Resolved {formatTimestamp(alert.resolved_at)}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showTripActionModal}
        transparent
        animationType="slide"
        onRequestClose={closeTripActionModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {actionMode === 'reassign' ? 'Reassign Trip' : 'Cancel Trip'}
            </Text>
            <Text style={styles.modalCaption}>
              {activeAlert?.trip_id ? `Trip ${activeAlert.trip_id.slice(0, 8)}` : 'Selected trip'}
            </Text>

            {actionMode === 'reassign' ? (
              <View style={styles.vanList}>
                <Text style={styles.fieldLabel}>Select target van</Text>
                {vansQuery.isLoading ? (
                  <ActivityIndicator color="#00B4D8" />
                ) : candidateVans.length === 0 ? (
                  <Text style={styles.emptyInline}>
                    No pool-eligible vans are currently available.
                  </Text>
                ) : (
                  candidateVans.map((van) => {
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
                  })
                )}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Add context for audit trail"
              placeholderTextColor="#64748B"
              style={styles.reasonInput}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalGhostBtn} onPress={closeTripActionModal}>
                <Text style={styles.modalGhostText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, isSubmitting && styles.disabledBtn]}
                onPress={submitTripAction}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>
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
    gap: 8,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
  },
  toggleBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#1A2E45',
  },
  toggleBtnActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  toggleText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#E2E8F0',
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 18,
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
  emptyCaption: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },
  alertCard: {
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
  },
  severityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  severityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeText: {
    color: '#64748B',
    fontSize: 12,
  },
  alertTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  alertMessage: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaText: {
    color: '#60A5FA',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  resolveBtn: {
    borderRadius: 10,
    backgroundColor: '#1D9E75',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resolveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#223F5F',
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryDangerBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  secondaryDangerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  resolvedLabel: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '600',
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
  modalCaption: {
    color: '#94A3B8',
    fontSize: 12,
  },
  vanList: {
    gap: 8,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyInline: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  vanOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F2135',
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
    minHeight: 80,
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
  modalGhostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalGhostText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.65,
  },
});
