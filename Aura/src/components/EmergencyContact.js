import React, { useState, useEffect } from 'react';
import axios from 'axios';

function EmergencyContact() {
  const [contacts, setContacts] = useState([
    { name: 'Emergency SOS', phone: '911' },
    { name: 'Police', phone: '100' },
    { name: 'Ambulance', phone: '102' }
  ]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      // Try to load from backend
      const response = await axios.get('http://localhost:5000/api/contacts');
      if (response.data.success) {
        setContacts(response.data.contacts);
      }
    } catch (error) {
      console.log('Using default contacts');
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    
    if (!newName.trim() || !newPhone.trim()) {
      alert('Please enter both name and phone number');
      return;
    }

    const newContact = { name: newName.trim(), phone: newPhone.trim() };
    const updatedContacts = [...contacts, newContact];
    
    setContacts(updatedContacts);
    setNewName('');
    setNewPhone('');

    try {
      await axios.post('http://localhost:5000/api/contacts/update', {
        contacts: updatedContacts
      });
    } catch (error) {
      console.log('Contact added locally');
    }
  };

  const removeContact = async (index) => {
    const updatedContacts = contacts.filter((_, i) => i !== index);
    setContacts(updatedContacts);

    try {
      await axios.post('http://localhost:5000/api/contacts/update', {
        contacts: updatedContacts
      });
    } catch (error) {
      console.log('Contact removed locally');
    }
  };

  const dialContact = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const smsContact = (phone) => {
    const message = '🚨 SOS! I need emergency help!';
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
  };

  return (
    <div className="emergency-contact">
      <div className="contacts-grid">
        {contacts.map((contact, index) => (
          <div key={index} className="contact-card">
            <h3>{contact.name}</h3>
            <p>📞 {contact.phone}</p>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => dialContact(contact.phone)}
                style={{
                  padding: '8px 15px',
                  background: '#2ecc71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                📞 Call
              </button>
              <button
                onClick={() => smsContact(contact.phone)}
                style={{
                  padding: '8px 15px',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                📱 SMS
              </button>
              {index >= 3 && (
                <button
                  onClick={() => removeContact(index)}
                  style={{
                    padding: '8px 15px',
                    background: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  🗑️ Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="add-contact-form" onSubmit={addContact}>
        <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>Add Emergency Contact</h3>
        <input
          type="text"
          placeholder="Contact Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="Phone Number"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          required
        />
        <button type="submit">➕ Add Contact</button>
      </form>
    </div>
  );
}

export default EmergencyContact;