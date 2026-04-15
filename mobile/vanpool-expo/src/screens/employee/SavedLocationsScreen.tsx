import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { backend } from '../../api/backend';

export default function SavedLocationsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  
  // Home location state
  const [homeAddress, setHomeAddress] = useState(user?.home_address ?? '');
  const [homeLat, setHomeLat] = useState(user?.home_latitude ? String(user.home_latitude) : '');
  const [homeLng, setHomeLng] = useState(user?.home_longitude ? String(user.home_longitude) : '');
  
  // Office location state
  const [officeAddress, setOfficeAddress] = useState(user?.default_destination_address ?? '');
  const [officeLat, setOfficeLat] = useState(
    user?.default_destination_latitude ? String(user.default_destination_latitude) : '',
  );
  const [officeLng, setOfficeLng] = useState(
    user?.default_destination_longitude ? String(user.default_destination_longitude) : '',
  );
  
  const [geocoding, setGeocoding] = useState<'home' | 'office' | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGeocode = async (type: 'home' | 'office') => {
    const address = type === 'home' ? homeAddress : officeAddress;
    if (!address.trim()) {
      Alert.alert('Error', 'Please enter an address first');
      return;
    }

    setGeocoding(type);
    try {
      const result = await backend.geocodeAddress(accessToken!, address);
      if (type === 'home') {
        setHomeLat(String(result.lat));
        setHomeLng(String(result.lng));
        if (result.formatted_address) {
          setHomeAddress(result.formatted_address);
        }
      } else {
        setOfficeLat(String(result.lat));
        setOfficeLng(String(result.lng));
        if (result.formatted_address) {
          setOfficeAddress(result.formatted_address);
        }
      }
      Alert.alert('Success', 'Location geocoded successfully');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to geocode address');
    } finally {
      setGeocoding(null);
    }
  };

  const handleSave = async () => {
    if (!accessToken) {
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }
    setSaving(true);
    try {
      const parsedHomeLat = homeLat.trim() ? Number(homeLat.trim()) : undefined;
      const parsedHomeLng = homeLng.trim() ? Number(homeLng.trim()) : undefined;
      const parsedOfficeLat = officeLat.trim() ? Number(officeLat.trim()) : undefined;
      const parsedOfficeLng = officeLng.trim() ? Number(officeLng.trim()) : undefined;

      if (
        (parsedHomeLat !== undefined && Number.isNaN(parsedHomeLat))
        || (parsedHomeLng !== undefined && Number.isNaN(parsedHomeLng))
        || (parsedOfficeLat !== undefined && Number.isNaN(parsedOfficeLat))
        || (parsedOfficeLng !== undefined && Number.isNaN(parsedOfficeLng))
      ) {
        throw new Error('Latitude and longitude must be valid numbers.');
      }

      const updated = await backend.updateProfile(accessToken, {
        home_address: homeAddress.trim() || '',
        home_latitude: parsedHomeLat,
        home_longitude: parsedHomeLng,
        default_destination_address: officeAddress.trim() || '',
        default_destination_latitude: parsedOfficeLat,
        default_destination_longitude: parsedOfficeLng,
      });
      await setAuth(updated, accessToken);
      Alert.alert('Saved', 'Your locations have been saved.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save locations');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Saved Locations</Text>
          <Text style={styles.subtitle}>Manage your frequently used addresses</Text>
        </View>

        {/* Home Location Card */}
        <View style={styles.locationCard}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="home" size={24} color="#06C167" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Home Address</Text>
              <Text style={styles.cardHint}>Your default pickup location</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Street Address</Text>
            <TextInput
              style={styles.input}
              value={homeAddress}
              onChangeText={setHomeAddress}
              placeholder="Enter your home address"
              placeholderTextColor="#64748B"
            />
          </View>

          <TouchableOpacity 
            style={styles.geocodeBtn}
            onPress={() => handleGeocode('home')}
            disabled={geocoding === 'home'}
          >
            {geocoding === 'home' ? (
              <ActivityIndicator size="small" color="#06C167" />
            ) : (
              <>
                <Ionicons name="location" size={18} color="#06C167" />
                <Text style={styles.geocodeBtnText}>Geocode Address</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.coordRow}>
            <View style={styles.coordInput}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                value={homeLat}
                onChangeText={setHomeLat}
                placeholder="0.000000"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.coordInput}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                value={homeLng}
                onChangeText={setHomeLng}
                placeholder="0.000000"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Office Location Card */}
        <View style={styles.locationCard}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="business" size={24} color="#3B82F6" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Office / Destination</Text>
              <Text style={styles.cardHint}>Your default dropoff location</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Street Address</Text>
            <TextInput
              style={styles.input}
              value={officeAddress}
              onChangeText={setOfficeAddress}
              placeholder="Enter your office address"
              placeholderTextColor="#64748B"
            />
          </View>

          <TouchableOpacity 
            style={styles.geocodeBtn}
            onPress={() => handleGeocode('office')}
            disabled={geocoding === 'office'}
          >
            {geocoding === 'office' ? (
              <ActivityIndicator size="small" color="#06C167" />
            ) : (
              <>
                <Ionicons name="location" size={18} color="#06C167" />
                <Text style={styles.geocodeBtnText}>Geocode Address</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.coordRow}>
            <View style={styles.coordInput}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                value={officeLat}
                onChangeText={setOfficeLat}
                placeholder="0.000000"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.coordInput}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                value={officeLng}
                onChangeText={setOfficeLng}
                placeholder="0.000000"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity 
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Locations</Text>
          )}
        </TouchableOpacity>
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
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
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
  locationCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cardHint: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#06C167',
  },
  geocodeBtnText: {
    color: '#06C167',
    fontSize: 16,
    fontWeight: '600',
  },
  coordRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordInput: {
    flex: 1,
  },
  saveBtn: {
    backgroundColor: '#06C167',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
