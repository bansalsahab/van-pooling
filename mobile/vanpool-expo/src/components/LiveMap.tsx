import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View, Text, Platform, Alert } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { RideSummary } from '../api/types';

interface LiveMapProps {
  ride?: RideSummary | null;
  showUserLocation?: boolean;
  height?: number;
  initialRegion?: Region;
}

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

function calculateRegion(
  pickup?: { lat: number; lng: number },
  destination?: { lat: number; lng: number },
  van?: { lat: number; lng: number },
  user?: { lat: number; lng: number }
): Region {
  const points: { latitude: number; longitude: number }[] = [];

  if (pickup?.lat && pickup?.lng) points.push({ latitude: pickup.lat, longitude: pickup.lng });
  if (destination?.lat && destination?.lng) points.push({ latitude: destination.lat, longitude: destination.lng });
  if (van?.lat && van?.lng) points.push({ latitude: van.lat, longitude: van.lng });
  if (user?.lat && user?.lng) points.push({ latitude: user.lat, longitude: user.lng });

  if (points.length === 0) return DEFAULT_REGION;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const latDelta = Math.max(0.01, (maxLat - minLat) * 1.4);
  const lngDelta = Math.max(0.01, (maxLng - minLng) * 1.4);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export default function LiveMap({
  ride,
  showUserLocation = true,
  height = 280,
  initialRegion,
}: LiveMapProps) {
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
    if (mapReady && ride) {
      const pickupCoords = ride.pickup_latitude && ride.pickup_longitude
        ? { lat: ride.pickup_latitude, lng: ride.pickup_longitude }
        : undefined;
      const destCoords = ride.destination_latitude && ride.destination_longitude
        ? { lat: ride.destination_latitude, lng: ride.destination_longitude }
        : undefined;
      const vanCoords = ride.van_latitude && ride.van_longitude
        ? { lat: ride.van_latitude, lng: ride.van_longitude }
        : undefined;

      const region = calculateRegion(
        pickupCoords,
        destCoords,
        vanCoords,
        userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : undefined
      );
      mapRef.current?.animateToRegion(region, 800);
    }
  }, [mapReady, ride, userLocation]);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const pickup = ride?.pickup_latitude && ride?.pickup_longitude
    ? { latitude: ride.pickup_latitude, longitude: ride.pickup_longitude }
    : null;

  const destination = ride?.destination_latitude && ride?.destination_longitude
    ? { latitude: ride.destination_latitude, longitude: ride.destination_longitude }
    : null;

  const van = ride?.van_latitude && ride?.van_longitude
    ? { latitude: ride.van_latitude, longitude: ride.van_longitude }
    : null;

  const routePoints = ride?.route_polyline ? decodePolyline(ride.route_polyline) : [];

  const region = initialRegion ?? calculateRegion(
    pickup ? { lat: pickup.latitude, lng: pickup.longitude } : undefined,
    destination ? { lat: destination.latitude, lng: destination.longitude } : undefined,
    van ? { lat: van.latitude, lng: van.longitude } : undefined,
    userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : undefined
  );

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
              <Ionicons name="location" size={24} color="#EF4444" />
            </View>
          </Marker>
        )}

        {van && (
          <Marker coordinate={van} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.vanMarker}>
              <Ionicons name="bus" size={22} color="#00B4D8" />
            </View>
          </Marker>
        )}

        {routePoints.length > 0 && (
          <Polyline
            coordinates={routePoints}
            strokeColor="#00B4D8"
            strokeWidth={4}
            lineDashPattern={undefined}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {pickup && destination && routePoints.length === 0 && (
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

      {ride && (
        <View style={styles.legend}>
          {pickup && (
            <View style={styles.legendItem}>
              <Ionicons name="radio-button-on" size={14} color="#1D9E75" />
              <Text style={styles.legendText}>Pickup</Text>
            </View>
          )}
          {destination && (
            <View style={styles.legendItem}>
              <Ionicons name="location" size={14} color="#EF4444" />
              <Text style={styles.legendText}>Destination</Text>
            </View>
          )}
          {van && (
            <View style={styles.legendItem}>
              <Ionicons name="bus" size={14} color="#00B4D8" />
              <Text style={styles.legendText}>Van</Text>
            </View>
          )}
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
  pickupMarker: {
    alignItems: 'center',
  },
  destinationMarker: {
    alignItems: 'center',
  },
  vanMarker: {
    backgroundColor: '#0D1B2A',
    borderRadius: 20,
    padding: 4,
    borderWidth: 2,
    borderColor: '#00B4D8',
    alignItems: 'center',
    justifyContent: 'center',
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
