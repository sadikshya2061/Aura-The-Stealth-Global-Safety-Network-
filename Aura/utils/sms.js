// SMS Utilities for composing and sending SMS

export const composeSMS = (phoneNumber, message) => {
  const smsUrl = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
  window.location.href = smsUrl;
};

export const composeSMSToMultiple = (phoneNumbers, message) => {
  const phoneString = phoneNumbers.join(',');
  const smsUrl = `sms:${phoneString}?body=${encodeURIComponent(message)}`;
  window.location.href = smsUrl;
};

export const sendEmergencySMS = (contacts, location) => {
  const message = `🚨 SOS ALERT! I need help!\n\nLocation: ${location.lat}, ${location.lng}\nTime: ${new Date().toLocaleString()}\n\nPlease contact me immediately!`;
  
  composeSMSToMultiple(
    contacts.map(contact => contact.phone),
    message
  );
};

export const isValidPhoneNumber = (phoneNumber) => {
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return phoneRegex.test(phoneNumber);
};