import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';

import { backend } from '../../api/backend';
import type { GeocodeResult } from '../../api/types';
import { useAuthStore } from '../../store/authStore';
import RouteMap from '../../components/RouteMap';

type Suggestion = {
  description: string;
  place_id?: string;
};

type RideMode = 'now' | 'schedule';

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default function BookRideScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickupResolved, setPickupResolved] = useState<GeocodeResult | null>(null);
  const [dropoffResolved, setDropoffResolved] = useState<GeocodeResult | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<Suggestion[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<Suggestion[]>([]);
  const [suggestingField, setSuggestingField] = useState<'pickup' | 'destination' | null>(null);
  const [rideMode, setRideMode] = useState<RideMode>('now');
  const [pickupTime, setPickupTime] = useState(new Date(Date.now() + 30 * 60000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState<number | null>(null);

  const debouncedPickup = useDebouncedValue(pickupAddress.trim(), 280);
  const debouncedDropoff = useDebouncedValue(dropoffAddress.trim(), 280);

  const activeRideQuery = useQuery({
    queryKey: ['employee', 'activeRide'],
    queryFn: () => backend.getActiveRide(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });

  const cancelRideMutation = useMutation({
    mutationFn: async () => {
      const activeRide = activeRideQuery.data;
      if (!activeRide) {
        throw new Error('No active ride to cancel.');
      }
      return backend.cancelRide(accessToken!, activeRide.id);
    },
    onSuccess: () => {
      Alert.alert('Ride cancelled', 'Your active ride request was cancelled.');
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      Alert.alert(
        'Cancel failed',
        error instanceof Error ? error.message : 'Could not cancel the active ride.',
      );
    },
  });

  const resolveAddressMutation = useMutation({
    mutationFn: async (address: string) => backend.geocodeAddress(accessToken!, address),
  });

  const previewRouteMutation = useMutation({
    mutationFn: async (payload: {
      origin: { latitude: number; longitude: number; address?: string };
      destination: { latitude: number; longitude: number; address?: string };
    }) => backend.getRoutePreview(accessToken!, payload),
    onSuccess: (route) => {
      setRouteDistanceMeters(route.distance_meters ?? null);
      setRouteDurationMinutes(route.duration_minutes ?? null);
    },
    onError: (error) => {
      Alert.alert('Route Preview Unavailable', error instanceof Error ? error.message : 'Could not preview route');
      setRouteDistanceMeters(null);
      setRouteDurationMinutes(null);
    },
  });

  const bookRideMutation = useMutation({
    mutationFn: async () => {
      if (activeRideQuery.data) {
        throw new Error('You already have an active ride. Complete or cancel it before booking another one.');
      }

      const pickup = pickupResolved ?? await backend.geocodeAddress(accessToken!, pickupAddress);
      const destination = dropoffResolved ?? await backend.geocodeAddress(accessToken!, dropoffAddress);

      return backend.requestRide(accessToken!, {
        pickup: {
          address: pickup.address,
          latitude: pickup.latitude,
          longitude: pickup.longitude,
        },
        destination: {
          address: destination.address,
          latitude: destination.latitude,
          longitude: destination.longitude,
        },
        scheduled_time: rideMode === 'schedule' ? pickupTime.toISOString() : null,
      });
    },
    onSuccess: (ride) => {
      const state = ride.status.replace(/_/g, ' ');
      Alert.alert('Ride Requested', `Request submitted in ${state} state.`);
      setPickupAddress('');
      setDropoffAddress('');
      setPickupResolved(null);
      setDropoffResolved(null);
      setPickupSuggestions([]);
      setDropoffSuggestions([]);
      setRouteDistanceMeters(null);
      setRouteDurationMinutes(null);
      queryClient.invalidateQueries({ queryKey: ['employee'] });
    },
    onError: (error) => {
      Alert.alert('Booking Failed', error instanceof Error ? error.message : 'Failed to book ride');
    },
  });

  useEffect(() => {
    if (!accessToken || debouncedPickup.length < 2 || pickupResolved?.address === debouncedPickup) {
      setPickupSuggestions([]);
      return;
    }
    let cancelled = false;
    setSuggestingField('pickup');
    backend
      .suggestAddresses(accessToken, debouncedPickup, 5)
      .then((items) => {
        if (!cancelled) {
          setPickupSuggestions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPickupSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSuggestingField((current) => (current === 'pickup' ? null : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, debouncedPickup, pickupResolved?.address]);

  useEffect(() => {
    if (!accessToken || debouncedDropoff.length < 2 || dropoffResolved?.address === debouncedDropoff) {
      setDropoffSuggestions([]);
      return;
    }
    let cancelled = false;
    setSuggestingField('destination');
    backend
      .suggestAddresses(accessToken, debouncedDropoff, 5)
      .then((items) => {
        if (!cancelled) {
          setDropoffSuggestions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDropoffSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSuggestingField((current) => (current === 'destination' ? null : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, debouncedDropoff, dropoffResolved?.address]);

  useEffect(() => {
    if (!pickupResolved || !dropoffResolved || !accessToken) {
      return;
    }
    previewRouteMutation.mutate({
      origin: {
        address: pickupResolved.address,
        latitude: pickupResolved.latitude,
        longitude: pickupResolved.longitude,
      },
      destination: {
        address: dropoffResolved.address,
        latitude: dropoffResolved.latitude,
        longitude: dropoffResolved.longitude,
      },
    });
  }, [accessToken, pickupResolved, dropoffResolved]);

  const hasActiveRide = Boolean(activeRideQuery.data);
  const distanceKm = useMemo(
    () => (routeDistanceMeters ? (routeDistanceMeters / 1000).toFixed(1) : null),
    [routeDistanceMeters],
  );

  const handleSelectSuggestion = async (field: 'pickup' | 'destination', suggestion: Suggestion) => {
    if (!accessToken) return;

    if (field === 'pickup') {
      setPickupAddress(suggestion.description);
      setPickupSuggestions([]);
    } else {
      setDropoffAddress(suggestion.description);
      setDropoffSuggestions([]);
    }

    try {
      const resolved = await resolveAddressMutation.mutateAsync(suggestion.description);
      if (field === 'pickup') {
        setPickupResolved(resolved);
      } else {
        setDropoffResolved(resolved);
      }
    } catch (error) {
      Alert.alert('Address Error', error instanceof Error ? error.message : 'Could not resolve address');
    }
  };

  const handleBook = () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      Alert.alert('Incomplete Form', 'Please enter both pickup and destination addresses.');
      return;
    }
    if (pickupAddress.trim().length < 3 || dropoffAddress.trim().length < 3) {
      Alert.alert('Address too short', 'Please enter a more complete pickup and destination address.');
      return;
    }
    if (hasActiveRide) {
      Alert.alert('Ride In Progress', 'You already have an active ride. Open tracking or cancel before booking a new ride.');
      return;
    }
    bookRideMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Book a Ride</Text>
            <Text style={styles.subtitle}>Live maps-assisted booking</Text>
          </View>

          {(pickupResolved || dropoffResolved) && (
            <View style={styles.mapContainer}>
              <RouteMap
                pickup={pickupResolved ? { latitude: pickupResolved.latitude, longitude: pickupResolved.longitude } : null}
                destination={dropoffResolved ? { latitude: dropoffResolved.latitude, longitude: dropoffResolved.longitude } : null}
                height={180}
              />
            </View>
          )}

          {hasActiveRide && (
            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={18} color="#F59E0B" />
              <View style={styles.warningContent}>
                <Text style={styles.warningText}>
                  Active ride detected ({activeRideQuery.data?.status?.replace(/_/g, ' ') || 'in progress'}).
                  Finish or cancel it before requesting another ride.
                </Text>
                <View style={styles.warningActionsRow}>
                  <TouchableOpacity
                    style={styles.trackInlineButton}
                    onPress={() => navigation.navigate('TrackRide')}
                  >
                    <Text style={styles.trackInlineText}>Open tracking</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cancelInlineButton, cancelRideMutation.isPending && styles.inlineButtonDisabled]}
                    onPress={() => cancelRideMutation.mutate()}
                    disabled={cancelRideMutation.isPending}
                  >
                    {cancelRideMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.cancelInlineText}>Cancel active ride</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pickup Location</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="location" size={20} color="#1D9E75" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter pickup address"
                  placeholderTextColor="#667A91"
                  value={pickupAddress}
                  onChangeText={(value) => {
                    setPickupAddress(value);
                    setPickupResolved(null);
                    setRouteDistanceMeters(null);
                    setRouteDurationMinutes(null);
                  }}
                />
              </View>
              {suggestingField === 'pickup' && (
                <Text style={styles.helperText}>Loading pickup suggestions...</Text>
              )}
              {pickupSuggestions.length > 0 && (
                <View style={styles.suggestionsList}>
                  {pickupSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={`${suggestion.place_id ?? suggestion.description}-${index}`}
                      style={styles.suggestionItem}
                      onPress={() => {
                        void handleSelectSuggestion('pickup', suggestion);
                      }}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#00B4D8" />
                      <Text style={styles.suggestionText}>{suggestion.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destination</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="flag" size={20} color="#EF4444" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter destination address"
                  placeholderTextColor="#667A91"
                  value={dropoffAddress}
                  onChangeText={(value) => {
                    setDropoffAddress(value);
                    setDropoffResolved(null);
                    setRouteDistanceMeters(null);
                    setRouteDurationMinutes(null);
                  }}
                />
              </View>
              {suggestingField === 'destination' && (
                <Text style={styles.helperText}>Loading destination suggestions...</Text>
              )}
              {dropoffSuggestions.length > 0 && (
                <View style={styles.suggestionsList}>
                  {dropoffSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={`${suggestion.place_id ?? suggestion.description}-${index}`}
                      style={styles.suggestionItem}
                      onPress={() => {
                        void handleSelectSuggestion('destination', suggestion);
                      }}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#00B4D8" />
                      <Text style={styles.suggestionText}>{suggestion.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, rideMode === 'now' && styles.modeButtonActive]}
                onPress={() => setRideMode('now')}
              >
                <Text style={[styles.modeButtonText, rideMode === 'now' && styles.modeButtonTextActive]}>
                  Now
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, rideMode === 'schedule' && styles.modeButtonActive]}
                onPress={() => setRideMode('schedule')}
              >
                <Text style={[styles.modeButtonText, rideMode === 'schedule' && styles.modeButtonTextActive]}>
                  Schedule
                </Text>
              </TouchableOpacity>
            </View>

            {rideMode === 'schedule' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pickup Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="time-outline" size={20} color="#94A3B8" />
                  <Text style={styles.timeText}>
                    {pickupTime.toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={pickupTime}
                mode="datetime"
                is24Hour={false}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setPickupTime(date);
                  }
                }}
              />
            )}

            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Route Preview</Text>
              {previewRouteMutation.isPending ? (
                <Text style={styles.previewText}>Calculating distance and ETA...</Text>
              ) : routeDistanceMeters && routeDurationMinutes ? (
                <Text style={styles.previewText}>
                  Approx. {distanceKm} km - {routeDurationMinutes} min
                </Text>
              ) : (
                <Text style={styles.previewText}>
                  Select pickup and destination to preview route.
                </Text>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.bookButton,
              (bookRideMutation.isPending || hasActiveRide) && styles.buttonDisabled,
            ]}
            onPress={handleBook}
            disabled={bookRideMutation.isPending || hasActiveRide}
          >
            {bookRideMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="car" size={20} color="#fff" />
                <Text style={styles.bookButtonText}>Confirm Booking</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  mapContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 6,
  },
  warningCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 13,
    flex: 1,
  },
  warningContent: {
    flex: 1,
    gap: 8,
  },
  warningActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  trackInlineButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#223F5F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackInlineText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelInlineButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelInlineText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineButtonDisabled: {
    opacity: 0.75,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E45',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    height: 54,
    paddingHorizontal: 12,
    color: '#E2E8F0',
    fontSize: 15,
  },
  helperText: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 12,
  },
  suggestionsList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  suggestionText: {
    color: '#E2E8F0',
    fontSize: 13,
    flex: 1,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#00B4D8',
  },
  modeButtonText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#0D1B2A',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E45',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 54,
    paddingHorizontal: 14,
    gap: 8,
  },
  timeText: {
    color: '#E2E8F0',
    fontSize: 15,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A2E45',
    padding: 14,
    marginBottom: 4,
  },
  previewTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  previewText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0D1B2A',
  },
  bookButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00B4D8',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
