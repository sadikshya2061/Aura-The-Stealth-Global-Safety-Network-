import React from 'react';

function TestCalculator() {
  return (
    <div style={{
      width: '300px',
      background: 'black',
      padding: '20px',
      margin: '50px auto',
      textAlign: 'center',
      borderRadius: '10px'
    }}>
      <h2 style={{ color: 'white' }}>CALCULATOR TEST</h2>
      <div>
        <button style={{ padding: '20px', margin: '5px', fontSize: '20px', background: '#333', color: 'white', border: 'none' }}>7</button>
        <button style={{ padding: '20px', margin: '5px', fontSize: '20px', background: '#333', color: 'white', border: 'none' }}>8</button>
        <button style={{ padding: '20px', margin: '5px', fontSize: '20px', background: '#333', color: 'white', border: 'none' }}>9</button>
        <button style={{ padding: '20px', margin: '5px', fontSize: '20px', background: '#ff9500', color: 'white', border: 'none' }}>=</button>
      </div>
      <p style={{ color: 'orange', marginTop: '20px' }}>
        Type 9999= to unlock
      </p>
    </div>
  );
}

export default TestCalculator;