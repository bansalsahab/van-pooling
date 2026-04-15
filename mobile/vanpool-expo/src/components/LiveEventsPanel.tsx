import React, { useState, useEffect, useRef } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface LiveEvent {
  id: string;
  type: 'ride.updated' | 'trip.updated' | 'van.updated' | 'driver.updated' | 'alert.created' | 'alert.resolved' | 'notification.created';
  message: string;
  timestamp: string;
  severity?: 'info' | 'warning' | 'success' | 'error';
}

interface LiveEventsPanelProps {
  maxEvents?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onEventPress?: (event: LiveEvent) => void;
}

const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'ride.updated': 'car-outline',
  'trip.updated': 'git-branch-outline',
  'van.updated': 'bus-outline',
  'driver.updated': 'person-outline',
  'alert.created': 'warning-outline',
  'alert.resolved': 'checkmark-circle-outline',
  'notification.created': 'notifications-outline',
};

const EVENT_COLORS: Record<string, string> = {
  info: '#00B4D8',
  warning: '#F59E0B',
  success: '#1D9E75',
  error: '#EF4444',
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function LiveEventsPanel({
  maxEvents = 20,
  onEventPress,
}: LiveEventsPanelProps) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const addEvent = (event: Omit<LiveEvent, 'id'>) => {
    const newEvent: LiveEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    setEvents((prev) => {
      const updated = [newEvent, ...prev];
      if (updated.length > maxEvents) {
        return updated.slice(0, maxEvents);
      }
      return updated;
    });
  };

  const clearEvents = () => {
    setEvents([]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((prev) =>
        prev.map((e) => ({ ...e }))
      );
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const renderEvent = ({ item }: { item: LiveEvent }) => {
    const icon = EVENT_ICONS[item.type] || 'information-circle-outline';
    const color = EVENT_COLORS[item.severity || 'info'];

    return (
      <View style={styles.eventItem}>
        <View style={[styles.eventIconContainer, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <View style={styles.eventContent}>
          <Text style={styles.eventMessage} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={styles.eventTime}>{formatTimestamp(item.timestamp)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Ionicons name="pulse" size={16} color="#00B4D8" />
          <Text style={styles.headerTitleText}>Live Events</Text>
          <View style={styles.eventCountBadge}>
            <Text style={styles.eventCountText}>{events.length}</Text>
          </View>
        </View>
        {events.length > 0 && (
          <Text style={styles.clearButton} onPress={clearEvents}>
            Clear
          </Text>
        )}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="radio-button-off-outline" size={28} color="#334155" />
          <Text style={styles.emptyText}>No live events yet</Text>
          <Text style={styles.emptyHint}>Events will appear here as your ride progresses</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={events}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  eventCountBadge: {
    backgroundColor: 'rgba(0,180,216,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eventCountText: {
    color: '#00B4D8',
    fontSize: 11,
    fontWeight: '700',
  },
  clearButton: {
    color: '#94A3B8',
    fontSize: 12,
  },
  listContent: {
    paddingVertical: 8,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  eventIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventContent: {
    flex: 1,
  },
  eventMessage: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
  eventTime: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
});

export { LiveEventsPanel };
