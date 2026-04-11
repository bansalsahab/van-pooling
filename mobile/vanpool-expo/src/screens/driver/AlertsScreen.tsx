import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { backend } from '../../api/backend';
import { useAuthStore } from '../../store/authStore';
import type { NotificationItem } from '../../api/types';

type AlertFilter = 'all' | 'unread';

function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const deltaMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function resolveAlertTone(item: NotificationItem) {
  const severity = String(item.severity ?? '').toLowerCase();
  if (severity === 'critical' || severity === 'high') {
    return { icon: 'warning', color: '#EF4444', border: 'rgba(239,68,68,0.45)' };
  }
  if (severity === 'medium' || item.type === 'warning') {
    return { icon: 'alert-circle', color: '#F59E0B', border: 'rgba(245,158,11,0.45)' };
  }
  return { icon: 'notifications', color: '#00B4D8', border: 'rgba(0,180,216,0.45)' };
}

export default function AlertsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AlertFilter>('all');

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'driver', 'alerts'],
    queryFn: () => backend.getNotifications(accessToken!, { includeAlerts: true, limit: 80 }),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => backend.readNotification(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: () => backend.readAllNotifications(accessToken!, { includeAlerts: true, limit: 80 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((item) => !item.read);
    }
    return notifications;
  }, [filter, notifications]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => notificationsQuery.refetch()}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Driver Alerts</Text>
            <Text style={styles.subtitle}>{unreadCount} unread updates</Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
            >
              {readAllMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.markAllText}>Mark all read</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>Unread</Text>
          </TouchableOpacity>
        </View>

        {notificationsQuery.isLoading ? (
          <ActivityIndicator size="large" color="#00B4D8" style={{ marginTop: 42 }} />
        ) : filteredNotifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#1D9E75" />
            <Text style={styles.emptyTitle}>No active driver alerts</Text>
            <Text style={styles.emptyBody}>Trip and dispatch alerts will appear here in real time.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredNotifications.map((item) => {
              const tone = resolveAlertTone(item);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.itemCard,
                    { borderColor: item.read ? 'rgba(255,255,255,0.08)' : tone.border },
                  ]}
                  onPress={() => {
                    if (!item.read) {
                      readMutation.mutate(item.id);
                    }
                  }}
                >
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleRow}>
                      <View style={[styles.iconWrap, { backgroundColor: `${tone.color}25` }]}>
                        <Ionicons name={tone.icon as any} size={16} color={tone.color} />
                      </View>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                    {!item.read && <View style={styles.unreadDot} />}
                  </View>

                  <Text style={styles.itemMessage}>{item.message}</Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{formatTime(item.created_at)}</Text>
                    {item.kind ? <Text style={styles.metaText}>{item.kind.replace(/_/g, ' ')}</Text> : null}
                    {item.severity ? <Text style={styles.metaText}>{item.severity}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  markAllBtn: {
    borderRadius: 999,
    backgroundColor: '#00B4D8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#1A2E45',
  },
  filterChipActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  filterText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#BAE6FD',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 10,
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#1A2E45',
    padding: 12,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1D9E75',
  },
  itemMessage: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 26,
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
  emptyBody: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
