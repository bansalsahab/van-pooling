import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { backend } from '../../api/backend';
import type { DriverTripSummary, TripPassenger } from '../../api/types';
import { useAuthStore } from '../../store/authStore';

type DriverNextAction = 'accept' | 'start' | 'pickup' | 'dropoff' | 'complete';

export default function ConsoleScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [pickupOtp, setPickupOtp] = useState('');

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

  const briefQuery = useQuery({
    queryKey: ['driver', 'copilotBrief'],
    queryFn: () => backend.getCopilotBrief(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'driver', 'alerts'],
    queryFn: () => backend.getNotifications(accessToken!, { includeAlerts: true, limit: 25 }),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
  });

  const startShiftMutation = useMutation({
    mutationFn: () => backend.startDriverShift(accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver'] });
    },
    onError: (error) => {
      Alert.alert('Shift Error', error instanceof Error ? error.message : 'Could not start shift');
    },
  });

  const tripActionMutation = useMutation({
    mutationFn: async () => {
      const trip = activeTripQuery.data;
      if (!trip) {
        throw new Error('No active trip found.');
      }

      const nextAction = inferNextAction(trip);
      const targetPassenger = findActionablePassenger(trip, nextAction);

      if (nextAction === 'accept') {
        return backend.acceptTrip(accessToken!, trip.id);
      }
      if (nextAction === 'start') {
        return backend.startTrip(accessToken!, trip.id);
      }
      if (nextAction === 'pickup') {
        if (!targetPassenger) {
          throw new Error('Pickup target is missing.');
        }
        if (!pickupOtp.trim()) {
          throw new Error('Enter the 4-digit OTP before confirming pickup.');
        }
        return backend.pickupPassenger(accessToken!, trip.id, targetPassenger.ride_request_id, pickupOtp.trim());
      }
      if (nextAction === 'dropoff') {
        if (!targetPassenger) {
          throw new Error('Dropoff target is missing.');
        }
        return backend.dropoffPassenger(accessToken!, trip.id, targetPassenger.ride_request_id);
      }
      return backend.completeTrip(accessToken!, trip.id);
    },
    onSuccess: () => {
      setPickupOtp('');
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      Alert.alert('Trip Action Failed', error instanceof Error ? error.message : 'Action failed');
    },
  });

  const askCopilotMutation = useMutation({
    mutationFn: () => backend.askCopilot(accessToken!, copilotQuestion.trim()),
    onSuccess: (reply) => {
      setCopilotAnswer(reply.answer);
      setCopilotQuestion('');
    },
    onError: (error) => {
      Alert.alert('Copilot Error', error instanceof Error ? error.message : 'Unable to ask copilot');
    },
  });

  const dashboard = dashboardQuery.data;
  const activeTrip = activeTripQuery.data;
  const nextAction = inferNextAction(activeTrip);
  const targetPassenger = findActionablePassenger(activeTrip ?? undefined, nextAction);
  const pickupOtpReady = pickupOtp.trim().length === 4;
  const isActionDisabled = tripActionMutation.isPending
    || !activeTrip
    || (nextAction === 'pickup' && (!targetPassenger || !pickupOtpReady))
    || (nextAction === 'dropoff' && !targetPassenger);
  const latestAlert = notificationsQuery.data?.notifications?.find((notification) => (
    notification.type === 'alert'
    || notification.type === 'warning'
    || notification.kind?.includes('alert')
    || notification.kind?.includes('incident')
  ));
  const unreadAlerts = notificationsQuery.data?.unread_count ?? 0;
  const assignedVan = useMemo(() => {
    const fromVan = dashboard?.van;
    if (fromVan) {
      return {
        plate: fromVan.license_plate ?? fromVan.plate_number ?? '--',
        capacity: fromVan.capacity,
      };
    }
    return dashboard?.assigned_van;
  }, [dashboard]);

  const isOnShift = Boolean(dashboard?.current_shift_id || activeTrip);
  const hasQueryError = dashboardQuery.isError || activeTripQuery.isError;
  const queryError = dashboardQuery.error ?? activeTripQuery.error ?? notificationsQuery.error;
  const queryErrorMessage = queryError instanceof Error
    ? queryError.message
    : 'Could not sync live dashboard data.';
  const isConnected = !dashboardQuery.isError && !activeTripQuery.isError;
  const connectionLabel = isConnected
    ? (dashboardQuery.isFetching || activeTripQuery.isFetching ? 'Syncing' : 'Connected')
    : 'Degraded';
  const connectionColor = isConnected ? '#1D9E75' : '#F59E0B';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={
              dashboardQuery.isRefetching
              || activeTripQuery.isRefetching
              || notificationsQuery.isRefetching
            }
            onRefresh={() => {
              dashboardQuery.refetch();
              activeTripQuery.refetch();
              briefQuery.refetch();
              notificationsQuery.refetch();
            }}
            tintColor="#06C167"
          />
        )}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Driver Console</Text>
            <Text style={styles.headerSubtitle}>Trip, alerts, and rider actions in one board.</Text>
          </View>
          <View style={styles.headerStatusColumn}>
            <View style={[styles.statusIndicator, { backgroundColor: isOnShift ? '#1D9E75' : '#64748B' }]}>
              <Text style={styles.statusText}>{isOnShift ? 'On Shift' : 'Off Duty'}</Text>
            </View>
            <View style={[styles.connectionIndicator, { backgroundColor: `${connectionColor}20` }]}>
              <View style={[styles.connectionDot, { backgroundColor: connectionColor }]} />
              <Text style={[styles.connectionText, { color: connectionColor }]}>{connectionLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.today_completed_trips ?? 0}</Text>
            <Text style={styles.statLabel}>Trips Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.today_passengers_served ?? 0}</Text>
            <Text style={styles.statLabel}>Passengers</Text>
          </View>
        </View>

        {hasQueryError && (
          <View style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons name="warning-outline" size={16} color="#F59E0B" />
              <Text style={styles.errorTitle}>Live data degraded</Text>
            </View>
            <Text style={styles.errorBody}>{queryErrorMessage}</Text>
            <TouchableOpacity
              style={styles.errorRetryBtn}
              onPress={() => {
                dashboardQuery.refetch();
                activeTripQuery.refetch();
                notificationsQuery.refetch();
              }}
            >
              <Text style={styles.errorRetryText}>Retry sync</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isOnShift && (
          <TouchableOpacity
            style={styles.startShiftButton}
            onPress={() => startShiftMutation.mutate()}
            disabled={startShiftMutation.isPending}
          >
            {startShiftMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="play-circle" size={24} color="#fff" />
                <Text style={styles.startShiftText}>Start Shift</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.actionLinksRow}>
          <TouchableOpacity style={styles.actionLinkBtn} onPress={() => navigation.navigate('Alerts')}>
            <Ionicons name="notifications-outline" size={16} color="#E2E8F0" />
            <Text style={styles.actionLinkText}>
              Alerts {unreadAlerts > 0 ? `(${unreadAlerts > 9 ? '9+' : unreadAlerts})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionLinkBtn} onPress={() => navigation.navigate('Copilot')}>
            <Ionicons name="sparkles-outline" size={16} color="#E2E8F0" />
            <Text style={styles.actionLinkText}>Full Copilot</Text>
          </TouchableOpacity>
        </View>

        {latestAlert && (
          <TouchableOpacity style={styles.alertCard} onPress={() => navigation.navigate('Alerts')}>
            <View style={styles.alertHeader}>
              <View style={styles.alertBadge}>
                <View style={styles.alertDot} />
                <Text style={styles.alertLabel}>Dispatch alert</Text>
              </View>
              <Text style={styles.alertCta}>Open</Text>
            </View>
            <Text style={styles.alertTitle} numberOfLines={1}>
              {latestAlert.title || 'Operational alert'}
            </Text>
            <Text style={styles.alertBody} numberOfLines={2}>
              {latestAlert.message}
            </Text>
          </TouchableOpacity>
        )}

        {activeTrip && (
          <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <Ionicons name="car" size={20} color="#00B4D8" />
              <Text style={styles.tripTitle}>Active Trip</Text>
              <View style={styles.passengerBadge}>
                <Text style={styles.passengerText}>{activeTrip.passenger_count} pax</Text>
              </View>
            </View>

            <Text style={styles.nextActionHint}>
              Next action: {actionLabelFor(nextAction)}
              {targetPassenger ? ` for ${targetPassenger.passenger_name || 'next rider'}` : ''}
            </Text>

            <View style={styles.routeInfo}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#1D9E75' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeTrip.route.origin?.address || activeTrip.passengers?.[0]?.pickup_address || 'Pickup'}
                </Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeTrip.route.destination?.address || activeTrip.passengers?.[0]?.destination_address || 'Dropoff'}
                </Text>
              </View>
            </View>

            {nextAction === 'pickup' && (
              <View style={styles.otpInputWrap}>
                <Text style={styles.otpLabel}>
                  Boarding OTP {targetPassenger?.passenger_name ? `for ${targetPassenger.passenger_name}` : ''}
                </Text>
                <TextInput
                  style={styles.otpInput}
                  value={pickupOtp}
                  onChangeText={(value) => setPickupOtp(value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="Enter 4-digit OTP"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            )}

            <View style={styles.passengerList}>
              {activeTrip.passengers.map((passenger) => {
                const passengerStatus = normalizePassengerStatus(passenger.status);
                const isTarget = targetPassenger?.ride_request_id === passenger.ride_request_id;
                return (
                  <View
                    key={passenger.ride_request_id}
                    style={[styles.passengerRow, isTarget && styles.passengerRowActive]}
                  >
                    <View style={styles.passengerMain}>
                      <Text style={styles.passengerName}>{passenger.passenger_name || 'Passenger'}</Text>
                      <Text style={styles.passengerAddress} numberOfLines={1}>
                        {passenger.pickup_address}
                      </Text>
                      <Text style={styles.passengerAddress} numberOfLines={1}>
                        {passenger.destination_address || passenger.dropoff_address || 'Destination pending'}
                      </Text>
                    </View>
                    <View style={styles.passengerStatusPill}>
                      <Text style={styles.passengerStatusText}>{passengerStatus}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.actionButton, isActionDisabled && styles.actionButtonDisabled]}
              onPress={() => tripActionMutation.mutate()}
              disabled={isActionDisabled}
            >
              {tripActionMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name={actionIconFor(nextAction)} size={18} color="#fff" />
                  <Text style={styles.actionText}>{actionLabelFor(nextAction, targetPassenger)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isOnShift && !activeTrip && (
          <View style={styles.waitingCard}>
            <Ionicons name="hourglass-outline" size={48} color="#64748B" />
            <Text style={styles.waitingText}>Standing by for dispatch</Text>
            <Text style={styles.waitingHint}>Trips will appear here as soon as they are assigned.</Text>
          </View>
        )}

        {assignedVan && (
          <View style={styles.vanCard}>
            <Ionicons name="bus" size={24} color="#00B4D8" />
            <View style={styles.vanInfo}>
              <Text style={styles.vanPlate}>{assignedVan.plate}</Text>
              <Text style={styles.vanCapacity}>{assignedVan.capacity} seats</Text>
            </View>
          </View>
        )}

        <View style={styles.copilotCard}>
          <View style={styles.copilotHeader}>
            <View style={styles.copilotTitleRow}>
              <Ionicons name="sparkles-outline" size={18} color="#00B4D8" />
              <Text style={styles.copilotTitle}>Driver Copilot</Text>
            </View>
            {briefQuery.data?.health_score !== undefined && (
              <Text style={styles.copilotScore}>Health {briefQuery.data.health_score}</Text>
            )}
          </View>

          {briefQuery.isLoading ? (
            <Text style={styles.copilotText}>Loading brief...</Text>
          ) : (
            <>
              <Text style={styles.copilotText}>
                {briefQuery.data?.summary || 'Copilot is ready for route and exception guidance.'}
              </Text>
              {briefQuery.data?.recommended_actions?.slice(0, 2).map((action) => (
                <Text key={action} style={styles.copilotBullet}>* {action}</Text>
              ))}
            </>
          )}

          {copilotAnswer && (
            <View style={styles.answerCard}>
              <Text style={styles.answerLabel}>Latest reply</Text>
              <Text style={styles.answerText}>{copilotAnswer}</Text>
            </View>
          )}

          <View style={styles.copilotAskRow}>
            <TextInput
              style={styles.copilotInput}
              value={copilotQuestion}
              onChangeText={setCopilotQuestion}
              placeholder="Ask about next stop, delays, or no-shows"
              placeholderTextColor="#64748B"
            />
            <TouchableOpacity
              style={styles.copilotAskButton}
              onPress={() => askCopilotMutation.mutate()}
              disabled={askCopilotMutation.isPending || !copilotQuestion.trim()}
            >
              {askCopilotMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function inferNextAction(trip?: DriverTripSummary | null): DriverNextAction {
  const explicit = String(trip?.next_action ?? '').toLowerCase();
  if (explicit === 'accept') return 'accept';
  if (explicit === 'start') return 'start';
  if (explicit === 'pickup') return 'pickup';
  if (explicit === 'dropoff') return 'dropoff';
  if (explicit === 'complete') return 'complete';

  const value = String(trip?.status ?? '').toLowerCase();
  if (value === 'dispatch_ready') return 'accept';
  if (value === 'planned') return 'start';
  if (value === 'active_to_pickup' || value === 'active_mixed') return 'pickup';
  if (value === 'active_in_transit') return 'dropoff';
  return 'complete';
}

function normalizePassengerStatus(status?: TripPassenger['status'] | string) {
  return String(status ?? 'unknown').toLowerCase().replace(/_/g, ' ');
}

function findActionablePassenger(trip?: DriverTripSummary, action?: DriverNextAction) {
  const passengers = trip?.passengers ?? [];
  if (!passengers.length) {
    return undefined;
  }

  if (action === 'pickup') {
    return passengers.find((passenger) => {
      const status = normalizePassengerStatus(passenger.status);
      return status === 'waiting' || status === 'assigned' || status === 'notified';
    });
  }

  if (action === 'dropoff') {
    return passengers.find((passenger) => {
      const status = normalizePassengerStatus(passenger.status);
      return status === 'picked up' || status === 'in transit';
    });
  }

  return passengers[0];
}

function actionLabelFor(action?: DriverNextAction, passenger?: TripPassenger) {
  const passengerName = passenger?.passenger_name || 'rider';
  switch (action) {
    case 'accept':
      return 'Accept Trip';
    case 'start':
      return 'Start Trip';
    case 'pickup':
      return `Pick Up ${passengerName}`;
    case 'dropoff':
      return `Drop Off ${passengerName}`;
    default:
      return 'Complete Trip';
  }
}

function actionIconFor(action?: DriverNextAction): 'checkmark-done' | 'play' | 'person-add' | 'flag' | 'checkmark-circle' {
  switch (action) {
    case 'accept':
      return 'checkmark-done';
    case 'start':
      return 'play';
    case 'pickup':
      return 'person-add';
    case 'dropoff':
      return 'flag';
    default:
      return 'checkmark-circle';
  }
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
    alignItems: 'flex-start',
    padding: 24,
    paddingBottom: 16,
  },
  greeting: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 12,
  },
  headerStatusColumn: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    color: '#00B4D8',
    fontSize: 30,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  errorCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.14)',
    padding: 12,
    gap: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBody: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18,
  },
  errorRetryBtn: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(15,23,42,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorRetryText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  startShiftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00B4D8',
    margin: 16,
    height: 52,
    borderRadius: 12,
    gap: 8,
  },
  startShiftText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionLinksRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 8,
  },
  actionLinkBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1A2E45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLinkText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  alertCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1A2E45',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    gap: 6,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  alertDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  alertLabel: {
    color: '#FCD34D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  alertCta: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '700',
  },
  alertTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  alertBody: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
  },
  tripCard: {
    margin: 16,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.55)',
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripTitle: {
    color: '#00B4D8',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  nextActionHint: {
    color: '#BAE6FD',
    fontSize: 12,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  passengerBadge: {
    backgroundColor: 'rgba(0,180,216,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  passengerText: {
    color: '#00B4D8',
    fontSize: 12,
    fontWeight: '600',
  },
  routeInfo: {
    marginBottom: 14,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#334155',
    marginLeft: 4,
    marginVertical: 4,
  },
  routeAddress: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  otpInputWrap: {
    marginBottom: 12,
  },
  otpLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 6,
  },
  otpInput: {
    height: 44,
    backgroundColor: '#0F2135',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    color: '#E2E8F0',
    fontSize: 15,
    letterSpacing: 2,
  },
  passengerList: {
    marginBottom: 12,
    gap: 8,
  },
  passengerRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0F2135',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  passengerRowActive: {
    borderColor: 'rgba(0,180,216,0.52)',
    backgroundColor: '#12334A',
  },
  passengerMain: {
    flex: 1,
    gap: 2,
  },
  passengerName: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  passengerAddress: {
    color: '#94A3B8',
    fontSize: 12,
  },
  passengerStatusPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  passengerStatusText: {
    color: '#CBD5E1',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#00B4D8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  waitingCard: {
    margin: 16,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  waitingText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 14,
  },
  waitingHint: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  vanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  vanInfo: {
    flex: 1,
  },
  vanPlate: {
    color: '#E2E8F0',
    fontSize: 17,
    fontWeight: '600',
  },
  vanCapacity: {
    color: '#94A3B8',
    fontSize: 13,
  },
  copilotCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  copilotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  copilotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copilotTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  copilotScore: {
    color: '#94A3B8',
    fontSize: 12,
  },
  copilotText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  copilotBullet: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 6,
  },
  answerCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  answerLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  answerText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
  },
  copilotAskRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  copilotInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    color: '#E2E8F0',
    fontSize: 13,
  },
  copilotAskButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#00B4D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
