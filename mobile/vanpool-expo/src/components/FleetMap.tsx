import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { VanSummary } from '../api/types';

interface FleetMapProps {
  vans: VanSummary[];
  height?: number;
}

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

function statusColor(status: string) {
  switch (status) {
    case 'on_trip':
      return '#1D9E75';
    case 'available':
      return '#00B4D8';
    case 'maintenance':
      return '#F59E0B';
    case 'offline':
      return '#EF4444';
    default:
      return '#64748B';
  }
}

function calculateRegion(vans: VanSummary[]): Region {
  const vansWithLocation = vans.filter((v) => v.latitude && v.longitude);

  if (vansWithLocation.length === 0) {
    return DEFAULT_REGION;
  }

  let minLat = vansWithLocation[0].latitude!;
  let maxLat = vansWithLocation[0].latitude!;
  let minLng = vansWithLocation[0].longitude!;
  let maxLng = vansWithLocation[0].longitude!;

  for (const van of vansWithLocation) {
    minLat = Math.min(minLat, van.latitude!);
    maxLat = Math.max(maxLat, van.latitude!);
    minLng = Math.min(minLng, van.longitude!);
    maxLng = Math.max(maxLng, van.longitude!);
  }

  const latDelta = Math.max(0.05, (maxLat - minLat) * 1.5);
  const lngDelta = Math.max(0.05, (maxLng - minLng) * 1.5);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export default function FleetMap({ vans, height = 220 }: FleetMapProps) {
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch {
        // Location not available
      }
    })();
  }, []);

  useEffect(() => {
    if (!mapReady || vans.length === 0) return;

    const region = calculateRegion(vans);
    mapRef.current?.animateToRegion(region, 800);
  }, [mapReady, vans]);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const region = calculateRegion(vans);
  const vansWithLocation = vans.filter((v) => v.latitude && v.longitude);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        onMapReady={onMapReady}
        customMapStyle={darkMapStyle}
      >
        {vansWithLocation.map((van) => (
          <Marker
            key={van.id}
            coordinate={{
              latitude: van.latitude!,
              longitude: van.longitude!,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.vanMarker, { borderColor: statusColor(van.status) }]}>
              <Ionicons name="bus" size={16} color={statusColor(van.status)} />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#1D9E75' }]} />
          <Text style={styles.legendText}>On Trip</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#00B4D8' }]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>Maintenance</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Offline</Text>
        </View>
      </View>

      {vansWithLocation.length === 0 && (
        <View style={styles.noLocationOverlay}>
          <Text style={styles.noLocationText}>No vans with live location data</Text>
        </View>
      )}
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
  vanMarker: {
    backgroundColor: '#0D1B2A',
    borderRadius: 16,
    padding: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
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
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#E2E8F0',
    fontSize: 10,
  },
  noLocationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 27, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLocationText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
