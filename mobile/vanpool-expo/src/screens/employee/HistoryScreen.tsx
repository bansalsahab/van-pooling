import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';
import type { RideSummary } from '../../api/types';

function RideHistoryItem({ ride }: { ride: RideSummary }) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    completed: { bg: '#06C16720', text: '#06C167' },
    cancelled_by_employee: { bg: '#EF444420', text: '#EF4444' },
    cancelled_by_admin: { bg: '#EF444420', text: '#EF4444' },
    no_show: { bg: '#EF444420', text: '#EF4444' },
    failed_no_capacity: { bg: '#EF444420', text: '#EF4444' },
    failed_driver_unreachable: { bg: '#EF444420', text: '#EF4444' },
    failed_operational_issue: { bg: '#EF444420', text: '#EF4444' },
    requested: { bg: '#F59E0B20', text: '#F59E0B' },
    matching: { bg: '#F59E0B20', text: '#F59E0B' },
    matched: { bg: '#3B82F620', text: '#3B82F6' },
    driver_en_route: { bg: '#3B82F620', text: '#3B82F6' },
    arrived_at_pickup: { bg: '#3B82F620', text: '#3B82F6' },
    picked_up: { bg: '#3B82F620', text: '#3B82F6' },
    in_transit: { bg: '#3B82F620', text: '#3B82F6' },
    arrived_at_destination: { bg: '#3B82F620', text: '#3B82F6' },
    dropped_off: { bg: '#3B82F620', text: '#3B82F6' },
  };

  const normalizedStatus = ride.status.toLowerCase();
  const colors = statusColors[normalizedStatus] || { bg: '#F59E0B20', text: '#F59E0B' };
  const rideTime = ride.requested_pickup_time ?? ride.scheduled_time ?? ride.created_at;
  const friendlyStatus = normalizedStatus.replace(/_/g, ' ');

  return (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {new Date(ride.created_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.timeText}>
            {new Date(rideTime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {friendlyStatus}
          </Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: '#06C167' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {ride.pickup_address}
          </Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {ride.destination_address || ride.dropoff_address}
          </Text>
        </View>
      </View>

      <View style={styles.rideFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="people-outline" size={16} color="#64748B" />
          <Text style={styles.footerText}>{ride.passengers ?? 1} passenger(s)</Text>
        </View>
        {ride.driver_name && (
          <View style={styles.footerItem}>
            <Ionicons name="person-outline" size={16} color="#64748B" />
            <Text style={styles.footerText}>{ride.driver_name}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const historyQuery = useQuery({
    queryKey: ['employee', 'history'],
    queryFn: () => backend.getRideHistory(accessToken!, 50),
    enabled: Boolean(accessToken),
  });

  const rides = historyQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ride History</Text>
        <Text style={styles.subtitle}>{rides.length} rides</Text>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RideHistoryItem ride={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={historyQuery.isRefetching}
            onRefresh={() => historyQuery.refetch()}
            tintColor="#06C167"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>No ride history yet</Text>
            <Text style={styles.emptyHint}>Your completed rides will appear here</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
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
  list: {
    padding: 16,
    paddingTop: 0,
  },
  rideCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateContainer: {},
  dateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  routeContainer: {
    marginBottom: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#333',
    marginLeft: 4,
    marginVertical: 4,
  },
  addressText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  rideFooter: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: '#64748B',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
  },
});
