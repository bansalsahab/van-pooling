import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';
import type { DriverShiftSummary } from '../../api/types';

function ShiftItem({ shift }: { shift: DriverShiftSummary }) {
  const duration = shift.ended_at 
    ? Math.round((new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 60000)
    : null;

  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftHeader}>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {new Date(shift.started_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.timeText}>
            {new Date(shift.started_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {shift.ended_at && ` - ${new Date(shift.ended_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          </Text>
        </View>
        <View style={[
          styles.statusBadge, 
          { backgroundColor: shift.status === 'completed' ? '#06C16720' : '#3B82F620' }
        ]}>
          <Text style={[
            styles.statusText,
            { color: shift.status === 'completed' ? '#06C167' : '#3B82F6' }
          ]}>
            {shift.status}
          </Text>
        </View>
      </View>

      {duration && (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={16} color="#64748B" />
          <Text style={styles.durationText}>
            {Math.floor(duration / 60)}h {duration % 60}m
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ShiftsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const shiftsQuery = useQuery({
    queryKey: ['driver', 'shifts'],
    queryFn: () => backend.getDriverShifts(accessToken!, 30),
    enabled: Boolean(accessToken),
  });

  const shifts = shiftsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shift History</Text>
        <Text style={styles.subtitle}>{shifts.length} shifts</Text>
      </View>

      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ShiftItem shift={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={shiftsQuery.isRefetching}
            onRefresh={() => shiftsQuery.refetch()}
            tintColor="#06C167"
          />
        }
        ListHeaderComponent={shiftsQuery.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load shifts</Text>
            <Text style={styles.errorText}>
              {shiftsQuery.error instanceof Error ? shiftsQuery.error.message : 'Try refreshing the shift feed.'}
            </Text>
            <TouchableOpacity style={styles.errorBtn} onPress={() => shiftsQuery.refetch()}>
              <Text style={styles.errorBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#334155" />
            <Text style={styles.emptyText}>No shift history</Text>
            <Text style={styles.emptyHint}>Completed shifts will appear here.</Text>
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
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.14)',
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  errorTitle: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18,
  },
  errorBtn: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  errorBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  shiftCard: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {},
  dateText: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#94A3B8',
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
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  durationText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
});
