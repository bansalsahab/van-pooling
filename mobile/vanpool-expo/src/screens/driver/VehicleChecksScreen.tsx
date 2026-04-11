import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

const CHECK_ITEMS = [
  { key: 'tires', label: 'Tires Condition', icon: 'disc' },
  { key: 'brakes', label: 'Brakes Response', icon: 'hand-left' },
  { key: 'lights', label: 'Lights & Indicators', icon: 'bulb' },
  { key: 'fuel', label: 'Fuel & Range', icon: 'speedometer' },
  { key: 'cabin', label: 'Cabin Cleanliness', icon: 'car' },
  { key: 'firstaid', label: 'First-Aid Kit', icon: 'medical' },
];

export default function VehicleChecksScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [checkType, setCheckType] = useState<'pre_trip' | 'post_trip'>('pre_trip');
  const [itemStates, setItemStates] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  const checksQuery = useQuery({
    queryKey: ['driver', 'vehicle-checks'],
    queryFn: () => backend.getVehicleChecks(accessToken!, 20),
    enabled: Boolean(accessToken),
  });

  const submitMutation = useMutation({
    mutationFn: () => backend.submitVehicleCheck(accessToken!, {
      check_type: checkType,
      items: CHECK_ITEMS.map(item => ({
        name: item.key,
        passed: itemStates[item.key] ?? true,
      })),
      notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-checks'] });
      setShowForm(false);
      resetForm();
      Alert.alert('Success', 'Vehicle check submitted');
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to submit check');
    },
  });

  const resetForm = () => {
    setItemStates({});
    setNotes('');
    setCheckType('pre_trip');
  };

  const toggleItem = (key: string) => {
    setItemStates(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }));
  };

  const allPassed = CHECK_ITEMS.every(item => itemStates[item.key] !== false);
  const failedCount = CHECK_ITEMS.filter(item => itemStates[item.key] === false).length;

  const checks = checksQuery.data || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={checksQuery.isRefetching}
            onRefresh={() => checksQuery.refetch()}
            tintColor="#06C167"
          />
        }
      >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Vehicle Checks</Text>
          <Text style={styles.subtitle}>Pre-trip and post-trip inspections</Text>
        </View>
        <TouchableOpacity 
          style={styles.addBtn}
          onPress={() => setShowForm(!showForm)}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* New Check Form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Inspection</Text>

            {/* Check Type Toggle */}
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, checkType === 'pre_trip' && styles.typeBtnActive]}
                onPress={() => setCheckType('pre_trip')}
              >
                <Text style={[styles.typeBtnText, checkType === 'pre_trip' && styles.typeBtnTextActive]}>
                  Pre-Trip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, checkType === 'post_trip' && styles.typeBtnActive]}
                onPress={() => setCheckType('post_trip')}
              >
                <Text style={[styles.typeBtnText, checkType === 'post_trip' && styles.typeBtnTextActive]}>
                  Post-Trip
                </Text>
              </TouchableOpacity>
            </View>

            {/* Checklist Items */}
            <Text style={styles.sectionTitle}>Checklist</Text>
            {CHECK_ITEMS.map(item => {
              const passed = itemStates[item.key] !== false;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={styles.checkItem}
                  onPress={() => toggleItem(item.key)}
                >
                  <View style={styles.checkItemLeft}>
                    <View style={[
                      styles.checkIcon,
                      { backgroundColor: passed ? '#06C16720' : '#FF5D7420' }
                    ]}>
                      <Ionicons 
                        name={item.icon as any} 
                        size={20} 
                        color={passed ? '#06C167' : '#FF5D74'} 
                      />
                    </View>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                  </View>
                  <View style={[
                    styles.statusPill,
                    { backgroundColor: passed ? '#06C16720' : '#FF5D7420' }
                  ]}>
                    <Text style={[
                      styles.statusPillText,
                      { color: passed ? '#06C167' : '#FF5D74' }
                    ]}>
                      {passed ? 'Pass' : 'Fail'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any comments or issues..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Summary */}
            <View style={[
              styles.summaryCard,
              { backgroundColor: allPassed ? '#06C16720' : '#FF5D7420' }
            ]}>
              <Ionicons 
                name={allPassed ? 'checkmark-circle' : 'warning'} 
                size={24} 
                color={allPassed ? '#06C167' : '#FF5D74'} 
              />
              <Text style={[
                styles.summaryText,
                { color: allPassed ? '#06C167' : '#FF5D74' }
              ]}>
                {allPassed 
                  ? 'All items passed' 
                  : `${failedCount} item${failedCount > 1 ? 's' : ''} failed`}
              </Text>
            </View>

            <TouchableOpacity 
              style={[
                styles.submitBtn,
                { backgroundColor: allPassed ? '#06C167' : '#FF5D74' }
              ]}
              onPress={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  Submit {allPassed ? 'Passed' : 'Failed'} Check
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        <Text style={styles.historyTitle}>Inspection History</Text>
        {checksQuery.isLoading ? (
          <ActivityIndicator size="large" color="#06C167" style={{ marginTop: 20 }} />
        ) : checks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="clipboard-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No inspections yet</Text>
            <Text style={styles.emptyHint}>Complete a vehicle check to get started</Text>
          </View>
        ) : (
          <View style={styles.checksList}>
            {checks.map((check) => (
              <View key={check.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyType}>
                      {check.check_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} Inspection
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(check.created_at ?? check.submitted_at ?? Date.now()).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[
                    styles.historyStatus,
                    { backgroundColor: check.status === 'passed' ? '#06C16720' : '#FF5D7420' }
                  ]}>
                    <Text style={[
                      styles.historyStatusText,
                      { color: check.status === 'passed' ? '#06C167' : '#FF5D74' }
                    ]}>
                      {check.status === 'passed' ? 'Passed' : 'Failed'}
                    </Text>
                  </View>
                </View>
                {check.notes && (
                  <Text style={styles.historyNotes}>{check.notes}</Text>
                )}
              </View>
            ))}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#06C167',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCard: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.55)',
  },
  formTitle: {
    color: '#E2E8F0',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#0F2135',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  typeBtnActive: {
    backgroundColor: '#06C167',
  },
  typeBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#fff',
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F2135',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  checkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkLabel: {
    color: '#E2E8F0',
    fontSize: 16,
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginTop: 16,
  },
  label: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F2135',
    borderRadius: 12,
    padding: 16,
    color: '#E2E8F0',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  historyTitle: {
    color: '#E2E8F0',
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  checksList: {
    padding: 20,
    paddingTop: 0,
  },
  historyCard: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  historyDate: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  historyStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyNotes: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
    fontStyle: 'italic',
  },
  emptyCard: {
    margin: 20,
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});
