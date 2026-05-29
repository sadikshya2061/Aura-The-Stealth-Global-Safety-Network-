import React, { useState } from 'react';

function CalculatorGhost({ onUnlock }) {
  const [display, setDisplay] = useState('0');
  const [firstOperand, setFirstOperand] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);
  const [typedCode, setTypedCode] = useState(''); // NEW: track typed digits

  const inputDigit = (digit) => {
    if (waitingForSecondOperand) {
      setDisplay(String(digit));
      setWaitingForSecondOperand(false);
    } else {
      setDisplay(display === '0' ? String(digit) : display + digit);
    }
    
    // NEW: Track typed digits for secret code
    const newTypedCode = typedCode + digit;
    setTypedCode(newTypedCode);
    
    // Keep only last 4 digits
    if (newTypedCode.length > 4) {
      setTypedCode(newTypedCode.slice(-4));
    }
  };

  const inputDot = () => {
    if (waitingForSecondOperand) {
      setDisplay('0.');
      setWaitingForSecondOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clearDisplay = () => {
    setDisplay('0');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
    setTypedCode(''); // NEW: Reset code tracking
  };

  const calculate = (first, second, op) => {
    switch (op) {
      case '+':
        return first + second;
      case '-':
        return first - second;
      case '*':
        return first * second;
      case '/':
        return second !== 0 ? first / second : 'Error';
      default:
        return second;
    }
  };

  const performOperation = (nextOperator) => {
    const inputValue = parseFloat(display);

    if (firstOperand === null) {
      setFirstOperand(inputValue);
    } else if (operator) {
      const result = calculate(firstOperand, inputValue, operator);
      setDisplay(String(result));
      setFirstOperand(result);
    }

    setWaitingForSecondOperand(true);
    setOperator(nextOperator);
  };

  const handleEquals = () => {
    if (!operator || firstOperand === null) return;

    const inputValue = parseFloat(display);
    const result = calculate(firstOperand, inputValue, operator);

    setDisplay(String(result));
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
    
    // NEW: Check for secret code "9999="
    if (typedCode === '9999') {
      onUnlock(); // This will show the safety app
    }
  };

  return (
    <div className="calculator-ghost">
      <div className="calculator-display">
        {display}
      </div>

      <div className="calculator-buttons">
        {/* Row 1 */}
        <button className="calc-btn clear" onClick={clearDisplay}>
          AC
        </button>
        <button
          className="calc-btn operator"
          onClick={() => performOperation('/')}
        >
          ÷
        </button>
        <button
          className="calc-btn operator"
          onClick={() => performOperation('*')}
        >
          ×
        </button>
        <button
          className="calc-btn operator"
          onClick={() => performOperation('-')}
        >
          −
        </button>

        {/* Row 2 */}
        <button
          className="calc-btn number"
          onClick={() => inputDigit('7')}
        >
          7
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('8')}
        >
          8
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('9')}
        >
          9
        </button>
        <button
          className="calc-btn operator"
          onClick={() => performOperation('+')}
        >
          +
        </button>

        {/* Row 3 */}
        <button
          className="calc-btn number"
          onClick={() => inputDigit('4')}
        >
          4
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('5')}
        >
          5
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('6')}
        >
          6
        </button>
        <button
          className="calc-btn equals"
          onClick={handleEquals}
        >
          =
        </button>

        {/* Row 4 */}
        <button
          className="calc-btn number"
          onClick={() => inputDigit('1')}
        >
          1
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('2')}
        >
          2
        </button>
        <button
          className="calc-btn number"
          onClick={() => inputDigit('3')}
        >
          3
        </button>

        {/* Row 5 - Zero spans 2 columns, dot is separate */}
        <button
          className="calc-btn number zero"
          onClick={() => inputDigit('0')}
        >
          0
        </button>
        <button
          className="calc-btn number"
          onClick={inputDot}
        >
          .
        </button>
      </div>
      
      {/* NEW: Hint for users */}
      <div className="calculator-hint">
        <p>🔒 Enter <strong>9999=</strong> to access emergency features</p>
      </div>
    </div>
  );
}

export default CalculatorGhost;