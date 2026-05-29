import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationTracker({ onLocationUpdate, emergencyStory }) {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        constcoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setLocation(coords);
        setError(null);
        setIsTracking(true);
        
        if (onLocationUpdate) {
          onLocationUpdate(coords);
        }
      },
      (err) => {
        setError(`Location error: ${err.message}`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [onLocationUpdate]);

  const getAddress = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      return data.display_name || `${lat}, ${lng}`;
    } catch (err) {
      return `${lat}, ${lng}`;
    }
  };

  if (error) {
    return (
      <div className="location-error">
        <p>⚠️ {error}</p>
        <p>Please enable location services to use this feature.</p>
      </div>
    );
  }

  return (
    <div className="location-tracker">
      <div className="location-status">
        <div className={`status-indicator ${isTracking ? 'active' : 'inactive'}`}></div>
        <span>{isTracking ? '🟢 Location Tracking Active' : '🔴 Location Tracking Inactive'}</span>
      </div>

      {location && (
        <div className="location-info">
          <p><strong>Latitude:</strong> {location.lat.toFixed(6)}</p>
          <p><strong>Longitude:</strong> {location.lng.toFixed(6)}</p>
          <p><strong>Accuracy:</strong> {location.accuracy} meters</p>
          <p><strong>Coordinates:</strong> {location.lat}, {location.lng}</p>
          <p>
            <strong>Map Link:</strong>{' '}
            <a 
              href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
            </a>
          </p>
        </div>
      )}

      {location && (
        <MapContainer
          center={[location.lat, location.lng]}
          zoom={15}
          style={{ height: '400px', width: '100%', borderRadius: '10px' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <Marker position={[location.lat, location.lng]}>
            <Popup>
              <div>
                <strong>Your Location</strong><br />
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      )}

      {!location && !error && (
        <div className="location-loading">
          <p>📡 Getting your location...</p>
          <p>Please allow location access when prompted.</p>
        </div>
      )}
    </div>
  );
}

export default LocationTracker;