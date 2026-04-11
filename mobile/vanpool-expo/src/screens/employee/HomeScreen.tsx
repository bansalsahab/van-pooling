import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

function normalizeStatus(status?: string) {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ');
}

export default function HomeScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<any>();

  const dashboardQuery = useQuery({
    queryKey: ['employee', 'dashboard'],
    queryFn: () => backend.getEmployeeDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const activeRideQuery = useQuery({
    queryKey: ['employee', 'activeRide'],
    queryFn: () => backend.getActiveRide(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 8000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => backend.getNotifications(accessToken!, { limit: 20 }),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const dashboard = dashboardQuery.data;
  const activeRide = activeRideQuery.data;
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  const refreshing =
    dashboardQuery.isRefetching || activeRideQuery.isRefetching || notificationsQuery.isRefetching;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              dashboardQuery.refetch();
              activeRideQuery.refetch();
              notificationsQuery.refetch();
            }}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good day, {user?.full_name?.split(' ')[0] || 'there'}.</Text>
            <Text style={styles.subtitle}>Demand-responsive commute dashboard</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn} onPress={() => navigation.navigate('Inbox')}>
            <Ionicons name="notifications-outline" size={22} color="#E2E8F0" />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.active_count || 0}</Text>
            <Text style={styles.statLabel}>Active rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dashboard?.pending_count || 0}</Text>
            <Text style={styles.statLabel}>Pending requests</Text>
          </View>
        </View>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('Book')}>
            <Ionicons name="car-sport-outline" size={18} color="#00B4D8" />
            <Text style={styles.quickActionTitle}>Book now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('RecurringRides')}>
            <Ionicons name="calendar-outline" size={18} color="#1D9E75" />
            <Text style={styles.quickActionTitle}>Schedule rides</Text>
          </TouchableOpacity>
        </View>

        {activeRide ? (
          <TouchableOpacity style={styles.activeRideCard} onPress={() => navigation.navigate('TrackRide')}>
            <View style={styles.activeRideHeader}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.activeRideStatus}>{normalizeStatus(activeRide.status)}</Text>
            </View>
            <Text style={styles.activeRideTitle}>Tap to track your active ride</Text>
            <Text style={styles.activeRideRoute} numberOfLines={1}>
              {activeRide.pickup_address}
            </Text>
            <Text style={styles.activeRideRoute} numberOfLines={1}>
              {activeRide.destination_address || activeRide.dropoff_address}
            </Text>
            <View style={styles.activeRideMeta}>
              <Text style={styles.metaText}>ETA {activeRide.estimated_wait_minutes ?? '--'} min</Text>
              <Text style={styles.metaText}>{activeRide.driver_name ?? 'Driver pending'}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="car-outline" size={46} color="#334155" />
            <Text style={styles.emptyText}>No active ride</Text>
            <Text style={styles.emptyHint}>Book now or create a recurring schedule to get started.</Text>
            <TouchableOpacity style={styles.bookInlineBtn} onPress={() => navigation.navigate('Book')}>
              <Text style={styles.bookInlineText}>Book a ride</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent rides</Text>
          {(dashboard?.recent_rides ?? []).slice(0, 5).map((ride) => (
            <TouchableOpacity key={ride.id} style={styles.rideItem} onPress={() => navigation.navigate('History')}>
              <View style={styles.rideIcon}>
                <Ionicons
                  name={ride.status === 'completed' ? 'checkmark-circle' : 'time'}
                  size={20}
                  color={ride.status === 'completed' ? '#1D9E75' : '#F59E0B'}
                />
              </View>
              <View style={styles.rideInfo}>
                <Text style={styles.rideAddress} numberOfLines={1}>
                  {ride.pickup_address}
                </Text>
                <Text style={styles.rideTime}>
                  {new Date(ride.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.rideStatusPill}>
                <Text style={styles.rideStatusText}>{normalizeStatus(ride.status)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    paddingBottom: 14,
  },
  greeting: {
    color: '#E2E8F0',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  quickActionCard: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickActionTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  activeRideCard: {
    margin: 16,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.5)',
    padding: 14,
    gap: 6,
  },
  activeRideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  livePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(29,158,117,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(29,158,117,0.45)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1D9E75',
  },
  liveText: {
    color: '#A7F3D0',
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  activeRideStatus: {
    color: '#BAE6FD',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  activeRideTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  activeRideRoute: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  activeRideMeta: {
    marginTop: 2,
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  emptyCard: {
    margin: 16,
    borderRadius: 16,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    alignItems: 'center',
    gap: 7,
  },
  emptyText: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  bookInlineBtn: {
    marginTop: 7,
    borderRadius: 10,
    minHeight: 40,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00B4D8',
    paddingHorizontal: 12,
  },
  bookInlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  recentSection: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 24,
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  rideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E45',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  rideIcon: {
    marginRight: 10,
  },
  rideInfo: {
    flex: 1,
  },
  rideAddress: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  rideTime: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  rideStatusPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  rideStatusText: {
    color: '#CBD5E1',
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
