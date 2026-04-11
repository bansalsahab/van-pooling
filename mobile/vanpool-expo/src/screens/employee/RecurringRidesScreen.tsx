import React, { useMemo, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

const WEEKDAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

function normalizeTimezoneValue(value: string) {
  return value.trim().replace(/\s+/g, '_');
}

function isValidIanaTimezone(value: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function resolveDefaultTimezone() {
  const browserTimezone = normalizeTimezoneValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  );
  if (isValidIanaTimezone(browserTimezone)) {
    return browserTimezone;
  }
  return 'Asia/Kolkata';
}

export default function RecurringRidesScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const defaultTimezone = useMemo(() => resolveDefaultTimezone(), []);
  const timezoneOptions = useMemo(
    () => Array.from(new Set([defaultTimezone, ...COMMON_TIMEZONES])),
    [defaultTimezone],
  );
  
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [destLat, setDestLat] = useState('');
  const [destLng, setDestLng] = useState('');
  const [pickupTime, setPickupTime] = useState('08:00');
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);

  const schedulesQuery = useQuery({
    queryKey: ['recurring-rides'],
    queryFn: () => backend.getRecurringRides(accessToken!),
    enabled: Boolean(accessToken),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const normalizedTimezone = normalizeTimezoneValue(timezone);
      if (!isValidIanaTimezone(normalizedTimezone)) {
        throw new Error('Choose a valid timezone like Asia/Kolkata or America/New_York.');
      }
      if (!name.trim() || !pickupAddress.trim() || !destAddress.trim()) {
        throw new Error('Name, pickup address, and destination address are required.');
      }
      if (selectedDays.length === 0) {
        throw new Error('Select at least one weekday.');
      }
      return backend.createRecurringRide(accessToken!, {
        name: name.trim(),
        pickup_address: pickupAddress.trim(),
        pickup_lat: parseFloat(pickupLat) || 0,
        pickup_lng: parseFloat(pickupLng) || 0,
        destination_address: destAddress.trim(),
        destination_lat: parseFloat(destLat) || 0,
        destination_lng: parseFloat(destLng) || 0,
        pickup_time_local: pickupTime,
        timezone: normalizedTimezone,
        weekdays: selectedDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-rides'] });
      setShowForm(false);
      resetForm();
      Alert.alert('Success', 'Recurring ride created');
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create schedule');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) => 
      backend.updateRecurringRide(accessToken!, ruleId, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-rides'] });
    },
  });

  const resetForm = () => {
    setName('');
    setPickupAddress('');
    setPickupLat('');
    setPickupLng('');
    setDestAddress('');
    setDestLat('');
    setDestLng('');
    setPickupTime('08:00');
    setTimezone(defaultTimezone);
    setSelectedDays([0, 1, 2, 3, 4]);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleGeocode = async (type: 'pickup' | 'dest') => {
    const address = type === 'pickup' ? pickupAddress : destAddress;
    if (!address.trim()) {
      Alert.alert('Error', 'Please enter an address first');
      return;
    }
    try {
      const result = await backend.geocodeAddress(accessToken!, address);
      if (type === 'pickup') {
        setPickupLat(String(result.lat));
        setPickupLng(String(result.lng));
        if (result.formatted_address) setPickupAddress(result.formatted_address);
      } else {
        setDestLat(String(result.lat));
        setDestLng(String(result.lng));
        if (result.formatted_address) setDestAddress(result.formatted_address);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to geocode');
    }
  };

  const schedules = schedulesQuery.data || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView 
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={schedulesQuery.isRefetching}
            onRefresh={() => schedulesQuery.refetch()}
            tintColor="#06C167"
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Recurring Rides</Text>
            <Text style={styles.subtitle}>Manage your commute schedules</Text>
          </View>
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setShowForm(!showForm)}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Create Form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Schedule</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Schedule Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Daily Commute"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pickup Address</Text>
              <TextInput
                style={styles.input}
                value={pickupAddress}
                onChangeText={setPickupAddress}
                placeholder="Enter pickup address"
                placeholderTextColor="#666"
              />
              <TouchableOpacity 
                style={styles.geocodeBtn}
                onPress={() => handleGeocode('pickup')}
              >
                <Text style={styles.geocodeBtnText}>Geocode</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destination Address</Text>
              <TextInput
                style={styles.input}
                value={destAddress}
                onChangeText={setDestAddress}
                placeholder="Enter destination address"
                placeholderTextColor="#666"
              />
              <TouchableOpacity 
                style={styles.geocodeBtn}
                onPress={() => handleGeocode('dest')}
              >
                <Text style={styles.geocodeBtnText}>Geocode</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pickup Time</Text>
              <TextInput
                style={styles.input}
                value={pickupTime}
                onChangeText={setPickupTime}
                placeholder="HH:MM"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Timezone</Text>
              <TextInput
                style={styles.input}
                value={timezone}
                onChangeText={setTimezone}
                placeholder="Asia/Kolkata"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.timezoneScroll}
                contentContainerStyle={styles.timezoneRow}
              >
                {timezoneOptions.map((zone) => (
                  <TouchableOpacity
                    key={zone}
                    style={[
                      styles.timezoneChip,
                      normalizeTimezoneValue(timezone) === zone && styles.timezoneChipActive,
                    ]}
                    onPress={() => setTimezone(zone)}
                  >
                    <Text
                      style={[
                        styles.timezoneChipText,
                        normalizeTimezoneValue(timezone) === zone && styles.timezoneChipTextActive,
                      ]}
                    >
                      {zone}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Weekdays</Text>
              <View style={styles.daysRow}>
                {WEEKDAYS.map((day) => (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.dayBtn,
                      selectedDays.includes(day.value) && styles.dayBtnActive
                    ]}
                    onPress={() => toggleDay(day.value)}
                  >
                    <Text style={[
                      styles.dayBtnText,
                      selectedDays.includes(day.value) && styles.dayBtnTextActive
                    ]}>
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity 
              style={styles.submitBtn}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Create Schedule</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Schedules List */}
        {schedulesQuery.isLoading ? (
          <ActivityIndicator size="large" color="#06C167" style={{ marginTop: 40 }} />
        ) : schedules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No recurring rides</Text>
            <Text style={styles.emptyHint}>Create a schedule to automate your commute</Text>
          </View>
        ) : (
          <View style={styles.schedulesList}>
            {schedules.map((schedule) => (
              <View key={schedule.id} style={styles.scheduleCard}>
                <View style={styles.scheduleHeader}>
                  <View style={styles.scheduleInfo}>
                    <Text style={styles.scheduleName}>{schedule.name}</Text>
                    <Text style={styles.scheduleTime}>
                      <Ionicons name="time-outline" size={14} color="#666" /> {schedule.pickup_time_local}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.statusBadge,
                      { backgroundColor: schedule.is_active ? '#06C16720' : '#FF5D7420' }
                    ]}
                    onPress={() => toggleMutation.mutate({ 
                      ruleId: schedule.id, 
                      isActive: !schedule.is_active 
                    })}
                  >
                    <Text style={[
                      styles.statusText,
                      { color: schedule.is_active ? '#06C167' : '#FF5D74' }
                    ]}>
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.routeRow}>
                  <Ionicons name="locate" size={16} color="#06C167" />
                  <Text style={styles.routeText} numberOfLines={1}>
                    {schedule.pickup_address}
                  </Text>
                </View>
                <View style={styles.routeRow}>
                  <Ionicons name="flag" size={16} color="#FF5D74" />
                  <Text style={styles.routeText} numberOfLines={1}>
                    {schedule.destination_address}
                  </Text>
                </View>

                <View style={styles.daysDisplay}>
                  {WEEKDAYS.map((day) => (
                    <View
                      key={day.value}
                      style={[
                        styles.dayDisplay,
                        schedule.weekdays.includes(day.value) && styles.dayDisplayActive
                      ]}
                    >
                      <Text style={[
                        styles.dayDisplayText,
                        schedule.weekdays.includes(day.value) && styles.dayDisplayTextActive
                      ]}>
                        {day.label[0]}
                      </Text>
                    </View>
                  ))}
                </View>

                {schedule.next_pickup && (
                  <Text style={styles.nextPickup}>
                    Next: {new Date(schedule.next_pickup).toLocaleString()}
                  </Text>
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
    backgroundColor: '#000',
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
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
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
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  formTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  geocodeBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  geocodeBtnText: {
    color: '#06C167',
    fontSize: 14,
  },
  timezoneScroll: {
    marginTop: 8,
  },
  timezoneRow: {
    gap: 8,
  },
  timezoneChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timezoneChipActive: {
    borderColor: '#06C167',
    backgroundColor: '#06C16730',
  },
  timezoneChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  timezoneChipTextActive: {
    color: '#06C167',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  dayBtnActive: {
    backgroundColor: '#06C167',
    borderColor: '#06C167',
  },
  dayBtnText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  dayBtnTextActive: {
    color: '#fff',
  },
  submitBtn: {
    backgroundColor: '#06C167',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  schedulesList: {
    padding: 20,
    paddingTop: 0,
  },
  scheduleCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scheduleTime: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  routeText: {
    color: '#999',
    fontSize: 14,
    flex: 1,
  },
  daysDisplay: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  dayDisplay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDisplayActive: {
    backgroundColor: '#06C16740',
  },
  dayDisplayText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '600',
  },
  dayDisplayTextActive: {
    color: '#06C167',
  },
  nextPickup: {
    color: '#666',
    fontSize: 12,
    marginTop: 12,
  },
  emptyCard: {
    margin: 20,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHint: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});
