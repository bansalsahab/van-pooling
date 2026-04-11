import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { backend } from '../../api/backend';
import { useAuthStore } from '../../store/authStore';

const RIDE_STEPS = [
  'requested',
  'matching',
  'matched',
  'driver_en_route',
  'arrived_at_pickup',
  'picked_up',
  'in_transit',
  'arrived_at_destination',
  'dropped_off',
  'completed',
];

const CANCELLABLE_STATUSES = new Set([
  'requested',
  'matching',
  'matched',
  'driver_en_route',
  'arrived_at_pickup',
]);

function titleCaseStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function formatTimestamp(value?: string) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TrackRideScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const activeRideQuery = useQuery({
    queryKey: ['employee', 'activeRide'],
    queryFn: () => backend.getActiveRide(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 8000,
  });

  const cancelRideMutation = useMutation({
    mutationFn: async () => {
      const ride = activeRideQuery.data;
      if (!ride) {
        throw new Error('No active ride to cancel.');
      }
      return backend.cancelRide(accessToken!, ride.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Ride cancelled', 'Your active ride request has been cancelled.');
    },
    onError: (error) => {
      Alert.alert('Cancel failed', error instanceof Error ? error.message : 'Could not cancel ride.');
    },
  });

  const ride = activeRideQuery.data;

  const currentStepIndex = useMemo(() => {
    if (!ride?.status) return -1;
    return RIDE_STEPS.indexOf(ride.status);
  }, [ride?.status]);

  if (activeRideQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#00B4D8" />
          <Text style={styles.centerCaption}>Loading active ride...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={activeRideQuery.isRefetching}
            onRefresh={() => activeRideQuery.refetch()}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Track Ride</Text>
          <Text style={styles.subtitle}>Live state from dispatch and driver actions</Text>
        </View>

        {!ride ? (
          <View style={styles.emptyCard}>
            <Ionicons name="car-outline" size={52} color="#334155" />
            <Text style={styles.emptyTitle}>No active ride right now</Text>
            <Text style={styles.emptyText}>
              Create a ride request to see live status, ETA, and driver details here.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Book')}>
              <Text style={styles.primaryButtonText}>Book a ride</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{titleCaseStatus(ride.status)}</Text>
                </View>
                <Text style={styles.updatedAt}>
                  Requested {formatTimestamp(ride.requested_at ?? ride.created_at)}
                </Text>
              </View>

              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeValue}>{ride.pickup_address}</Text>

              <Text style={styles.routeLabel}>Destination</Text>
              <Text style={styles.routeValue}>{ride.destination_address || ride.dropoff_address}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={16} color="#94A3B8" />
                  <Text style={styles.metaText}>
                    ETA {ride.estimated_wait_minutes ?? '--'} min
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={16} color="#94A3B8" />
                  <Text style={styles.metaText}>{ride.driver_name ?? 'Driver pending'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="bus-outline" size={16} color="#94A3B8" />
                  <Text style={styles.metaText}>{ride.van_plate ?? 'Van pending'}</Text>
                </View>
              </View>
            </View>

            {!!ride.boarding_otp_code && (
              <View style={styles.otpCard}>
                <Text style={styles.otpLabel}>Boarding OTP</Text>
                <Text style={styles.otpValue}>{ride.boarding_otp_code}</Text>
                <Text style={styles.otpHint}>Share this code with the driver before pickup confirmation.</Text>
              </View>
            )}

            <View style={styles.timelineCard}>
              <Text style={styles.sectionTitle}>Ride Timeline</Text>
              {RIDE_STEPS.map((step, index) => {
                const completed = currentStepIndex >= index;
                return (
                  <View key={step} style={styles.stepRow}>
                    <View style={[styles.stepDot, completed && styles.stepDotActive]} />
                    <Text style={[styles.stepText, completed && styles.stepTextActive]}>
                      {titleCaseStatus(step)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => activeRideQuery.refetch()}>
                <Text style={styles.secondaryButtonText}>Refresh status</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  (!CANCELLABLE_STATUSES.has(ride.status) || cancelRideMutation.isPending) && styles.buttonDisabled,
                ]}
                onPress={() => cancelRideMutation.mutate()}
                disabled={!CANCELLABLE_STATUSES.has(ride.status) || cancelRideMutation.isPending}
              >
                {cancelRideMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.dangerButtonText}>
                    {CANCELLABLE_STATUSES.has(ride.status) ? 'Cancel ride' : 'Cannot cancel now'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  centerCaption: {
    color: '#94A3B8',
    fontSize: 13,
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
    fontSize: 13,
    marginTop: 4,
  },
  emptyCard: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 10,
    minHeight: 44,
    minWidth: 160,
    backgroundColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 8,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(29,158,117,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(29,158,117,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1D9E75',
  },
  statusText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  updatedAt: {
    color: '#94A3B8',
    fontSize: 11,
  },
  routeLabel: {
    color: '#94A3B8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  routeValue: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    gap: 8,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  otpCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.14)',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  otpLabel: {
    color: '#FDE68A',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  otpValue: {
    color: '#FFF7ED',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
  },
  otpHint: {
    color: '#FCD34D',
    fontSize: 12,
    textAlign: 'center',
  },
  timelineCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  stepDotActive: {
    backgroundColor: '#00B4D8',
  },
  stepText: {
    color: '#94A3B8',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  stepTextActive: {
    color: '#E2E8F0',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#223F5F',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  dangerButton: {
    flex: 1,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
