import React, { useState } from 'react';

function SOSButton({ onEmergency }) {
  const [isPressed, setIsPressed] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('911');
  const [message, setMessage] = useState('🚨 SOS! I need emergency help! Please contact me immediately.');

  const handleSOSPress = () => {
    setIsPressed(true);
    
    const emergencyData = {
      phoneNumber,
      message,
      location: 'Fetching location...',
      action: 'SOS Button Pressed'
    };
    
    // Compose SMS
    composeSMS(phoneNumber, message);
    
    // Dial phone number
    dialNumber(phoneNumber);
    
    // Notify parent component
    if (onEmergency) {
      onEmergency(emergencyData);
    }
    
    // Reset after 3 seconds
    setTimeout(() => {
      setIsPressed(false);
    }, 3000);
  };

  const composeSMS = (number, msg) => {
    const smsUrl = `sms:${number}?body=${encodeURIComponent(msg)}`;
    window.location.href = smsUrl;
  };

  const dialNumber = (number) => {
    const dialUrl = `tel:${number}`;
    window.location.href = dialUrl;
  };

  return (
    <div className="sos-container">
      <button
        className={`sos-button ${isPressed ? 'pressed' : ''}`}
        onClick={handleSOSPress}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onTouchStart={() => setIsPressed(true)}
        onTouchEnd={() => setIsPressed(false)}
        aria-label="SOS Emergency Button"
      >
        <span className="icon">🚨</span>
        <span className="text">SOS</span>
      </button>
      
      <div className="emergency-actions">
        <button 
          className="action-btn sms"
          onClick={() => composeSMS(phoneNumber, message)}
        >
          📱 Compose SMS
        </button>
        <button 
          className="action-btn call"
          onClick={() => dialNumber(phoneNumber)}
        >
          📞 Dial Number
        </button>
      </div>
      
      <div className="emergency-settings">
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Emergency Number"
          style={{
            padding: '10px',
            fontSize: '1rem',
            borderRadius: '8px',
            border: '1px solid #ddd',
            width: '100%',
            maxWidth: '300px',
            marginTop: '10px'
          }}
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Emergency message"
          rows="3"
          style={{
            padding: '10px',
            fontSize: '1rem',
            borderRadius: '8px',
            border: '1px solid #ddd',
            width: '100%',
            maxWidth: '300px',
            marginTop: '10px',
            resize: 'vertical'
          }}
        />
      </div>
    </div>
  );
}

export default SOSButton;