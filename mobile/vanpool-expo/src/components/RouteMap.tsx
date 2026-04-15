import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View, Text, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

interface RouteMapProps {
  pickup?: { latitude: number; longitude: number } | null;
  destination?: { latitude: number; longitude: number } | null;
  height?: number;
  showUserLocation?: boolean;
}

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function calculateRegion(
  pickup?: { latitude: number; longitude: number },
  destination?: { latitude: number; longitude: number }
): Region {
  if (pickup && destination) {
    const latDelta = Math.max(0.01, Math.abs(destination.latitude - pickup.latitude) * 1.5);
    const lngDelta = Math.max(0.01, Math.abs(destination.longitude - pickup.longitude) * 1.5);
    return {
      latitude: (pickup.latitude + destination.latitude) / 2,
      longitude: (pickup.longitude + destination.longitude) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }
  if (pickup) {
    return {
      latitude: pickup.latitude,
      longitude: pickup.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }
  if (destination) {
    return {
      latitude: destination.latitude,
      longitude: destination.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }
  return DEFAULT_REGION;
}

export default function RouteMap({
  pickup,
  destination,
  height = 200,
  showUserLocation = true,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!showUserLocation) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch {
        setLocationError('Could not get location');
      }
    })();
  }, [showUserLocation]);

  useEffect(() => {
    if (!mapReady) return;

    const region = calculateRegion(pickup ?? undefined, destination ?? undefined);
    mapRef.current?.animateToRegion(region, 800);
  }, [mapReady, pickup, destination]);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const region = calculateRegion(pickup ?? undefined, destination ?? undefined);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={showUserLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        onMapReady={onMapReady}
        customMapStyle={darkMapStyle}
      >
        {pickup && (
          <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.pickupMarker}>
              <Ionicons name="radio-button-on" size={24} color="#1D9E75" />
            </View>
          </Marker>
        )}

        {destination && (
          <Marker coordinate={destination} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.destinationMarker}>
              <Ionicons name="flag" size={24} color="#EF4444" />
            </View>
          </Marker>
        )}

        {pickup && destination && (
          <Polyline
            coordinates={[pickup, destination]}
            strokeColor="#00B4D8"
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}
      </MapView>

      {locationError && (
        <View style={styles.locationError}>
          <Text style={styles.locationErrorText}>{locationError}</Text>
        </View>
      )}

      <View style={styles.legend}>
        {pickup && (
          <View style={styles.legendItem}>
            <Ionicons name="radio-button-on" size={14} color="#1D9E75" />
            <Text style={styles.legendText}>Pickup</Text>
          </View>
        )}
        {destination && (
          <View style={styles.legendItem}>
            <Ionicons name="flag" size={14} color="#EF4444" />
            <Text style={styles.legendText}>Destination</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334e68' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#023e62' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba5' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#023e62' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#3C7680' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#023e62' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'transit', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'transit.line', elementType: 'geometry.fill', stylers: [{ color: '#283d6a' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#3a4762' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
];

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A2E45',
  },
  map: {
    flex: 1,
  },
  pickupMarker: {
    alignItems: 'center',
  },
  destinationMarker: {
    alignItems: 'center',
  },
  locationError: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 8,
    padding: 8,
  },
  locationErrorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  legend: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'rgba(13, 27, 42, 0.85)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    color: '#E2E8F0',
    fontSize: 11,
  },
});
