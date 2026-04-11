import React, { useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </View>
  );
}

function metricText(value?: number | null, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(1)}${suffix}`;
}

export default function DashboardScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [window, setWindow] = useState<'today' | '7d' | '30d'>('today');

  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => backend.getAdminDashboard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const kpiQuery = useQuery({
    queryKey: ['admin', 'kpis', window],
    queryFn: () => backend.getAdminKpis(accessToken!, window),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const slaQuery = useQuery({
    queryKey: ['admin', 'sla'],
    queryFn: () => backend.getAdminSla(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const incidentsQuery = useQuery({
    queryKey: ['admin', 'incidents'],
    queryFn: () => backend.getAdminIncidents(accessToken!, { includeResolved: false, limit: 6 }),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const isRefreshing =
    dashboardQuery.isRefetching
    || kpiQuery.isRefetching
    || slaQuery.isRefetching
    || incidentsQuery.isRefetching;

  const dashboard = dashboardQuery.data;
  const kpi = kpiQuery.data;
  const sla = slaQuery.data;
  const incidents = incidentsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              dashboardQuery.refetch();
              kpiQuery.refetch();
              slaQuery.refetch();
              incidentsQuery.refetch();
            }}
            tintColor="#00B4D8"
          />
        )}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Operations Command</Text>
          <Text style={styles.subtitle}>Live dispatch health for your tenant fleet</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard title="Employees" value={dashboard?.total_employees ?? 0} icon="people" color="#3B82F6" />
          <StatCard title="Drivers" value={dashboard?.total_drivers ?? 0} icon="person" color="#1D9E75" />
          <StatCard title="Active Vans" value={dashboard?.active_vans ?? 0} icon="bus" color="#00B4D8" />
          <StatCard title="Open Alerts" value={dashboard?.open_alerts ?? 0} icon="warning" color="#F59E0B" />
        </View>

        <View style={styles.windowRow}>
          {(['today', '7d', '30d'] as const).map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.windowBtn, window === value && styles.windowBtnActive]}
              onPress={() => setWindow(value)}
            >
              <Text style={[styles.windowText, window === value && styles.windowTextActive]}>{value.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.sectionTitle}>Demand KPIs</Text>
          {kpiQuery.isLoading ? (
            <ActivityIndicator color="#00B4D8" style={{ marginVertical: 10 }} />
          ) : (
            <>
              <View style={styles.kpiRow}>
                <Text style={styles.kpiLabel}>P95 wait time</Text>
                <Text style={styles.kpiValue}>{metricText(kpi?.metrics.p95_wait_time_minutes, ' min')}</Text>
              </View>
              <View style={styles.kpiRow}>
                <Text style={styles.kpiLabel}>Dispatch success</Text>
                <Text style={styles.kpiValue}>{metricText(kpi?.metrics.dispatch_success_percent, '%')}</Text>
              </View>
              <View style={styles.kpiRow}>
                <Text style={styles.kpiLabel}>Seat utilization</Text>
                <Text style={styles.kpiValue}>{metricText(kpi?.metrics.seat_utilization_percent, '%')}</Text>
              </View>
              <View style={styles.kpiRow}>
                <Text style={styles.kpiLabel}>Deadhead per trip</Text>
                <Text style={styles.kpiValue}>{metricText(kpi?.metrics.deadhead_km_per_trip, ' km')}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.slaCard}>
          <View style={styles.slaHeader}>
            <Text style={styles.sectionTitle}>SLA Health</Text>
            <Text style={[
              styles.healthPill,
              sla?.health === 'critical'
                ? styles.healthCritical
                : sla?.health === 'warning'
                  ? styles.healthWarning
                  : styles.healthHealthy,
            ]}>
              {sla?.health?.toUpperCase() ?? 'UNKNOWN'}
            </Text>
          </View>
          <Text style={styles.slaText}>
            Open breaches: {sla?.open_breach_count ?? 0}
          </Text>
        </View>

        <View style={styles.incidentsCard}>
          <Text style={styles.sectionTitle}>Recent Incidents</Text>
          {incidentsQuery.isLoading ? (
            <ActivityIndicator color="#00B4D8" style={{ marginVertical: 10 }} />
          ) : incidents.length === 0 ? (
            <Text style={styles.emptyText}>No unresolved incidents reported.</Text>
          ) : (
            incidents.map((incident) => (
              <View key={incident.id} style={styles.incidentRow}>
                <View style={[
                  styles.incidentDot,
                  {
                    backgroundColor:
                      incident.severity === 'high' || incident.severity === 'critical'
                        ? '#EF4444'
                        : incident.severity === 'medium'
                          ? '#F59E0B'
                          : '#00B4D8',
                  },
                ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.incidentTitle}>{incident.title || 'Operational incident'}</Text>
                  <Text style={styles.incidentMessage}>{incident.message}</Text>
                </View>
              </View>
            ))
          )}
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    color: '#E2E8F0',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  windowRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 14,
  },
  windowBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: '#1A2E45',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  windowBtnActive: {
    borderColor: '#00B4D8',
    backgroundColor: '#12334A',
  },
  windowText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  windowTextActive: {
    color: '#E2E8F0',
  },
  kpiCard: {
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
    fontSize: 16,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  kpiValue: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  slaCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 8,
  },
  slaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  healthPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  healthHealthy: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    color: '#22C55E',
  },
  healthWarning: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    color: '#F59E0B',
  },
  healthCritical: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    color: '#EF4444',
  },
  slaText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  incidentsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 26,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    gap: 10,
  },
  incidentRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  incidentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  incidentTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  incidentMessage: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
