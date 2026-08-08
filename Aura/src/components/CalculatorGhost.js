import React, { useState } from 'react';

function CalculatorGhost({ onUnlock }) {
  const [display, setDisplay] = useState('0');
  const [firstOperand, setFirstOperand] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);
  const [typedCode, setTypedCode] = useState('');
  const [expression, setExpression] = useState('');
  const [unlockCode, setUnlockCode] = useState('9999');
  const [isSettingCode, setIsSettingCode] = useState(false);
  const [newCode, setNewCode] = useState('');

  const inputDigit = (digit) => {
    if (waitingForSecondOperand) {
      setDisplay(String(digit));
      setWaitingForSecondOperand(false);
    } else {
      setDisplay(display === '0' ? String(digit) : display + digit);
    }
    const newTypedCode = typedCode + digit;
    setTypedCode(newTypedCode);
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
    setTypedCode('');
    setExpression('');
  };

  const calculate = (first, second, op) => {
    switch (op) {
      case '+': return first + second;
      case '-': return first - second;
      case '*': return first * second;
      case '/': return second !== 0 ? first / second : 'Error';
      default: return second;
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
    const sym = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    setExpression(display + ' ' + (sym[nextOperator] || nextOperator));
  };

  const handleEquals = () => {
    if (typedCode === unlockCode) {
      onUnlock();
      return;
    }
    if (!operator || firstOperand === null) return;
    const inputValue = parseFloat(display);
    const result = calculate(firstOperand, inputValue, operator);
    const sym = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    setExpression(firstOperand + ' ' + (sym[operator] || operator) + ' ' + inputValue + ' =');
    setDisplay(String(result));
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
    setTypedCode('');
  };

  const changeUnlockCode = () => {
    if (newCode.length === 4 && /^\d{4}$/.test(newCode)) {
      setUnlockCode(newCode);
      setNewCode('');
      setIsSettingCode(false);
      setDisplay('✓ Code Updated');
      setTimeout(() => setDisplay('0'), 1500);
    } else {
      setDisplay('✗ 4 digits');
      setTimeout(() => setDisplay('0'), 1500);
    }
  };

  const toggleCodeChange = () => {
    if (isSettingCode) {
      setIsSettingCode(false);
      setNewCode('');
      setDisplay('0');
    } else {
      setIsSettingCode(true);
      setNewCode('');
      setDisplay('Enter 4-digit code');
    }
  };

  return (
    <div className="calculator-ghost">
      <div className="calculator-display">
        <div className="display-expression">{expression}</div>
        <div className="display-value">{display}</div>
      </div>

      <div className="calculator-buttons">
        <button className="calc-btn number" onClick={() => inputDigit('7')}>7</button>
        <button className="calc-btn number" onClick={() => inputDigit('8')}>8</button>
        <button className="calc-btn number" onClick={() => inputDigit('9')}>9</button>
        <button className="calc-btn operator" onClick={() => performOperation('/')}>÷</button>

        <button className="calc-btn number" onClick={() => inputDigit('4')}>4</button>
        <button className="calc-btn number" onClick={() => inputDigit('5')}>5</button>
        <button className="calc-btn number" onClick={() => inputDigit('6')}>6</button>
        <button className="calc-btn operator" onClick={() => performOperation('*')}>×</button>

        <button className="calc-btn number" onClick={() => inputDigit('1')}>1</button>
        <button className="calc-btn number" onClick={() => inputDigit('2')}>2</button>
        <button className="calc-btn number" onClick={() => inputDigit('3')}>3</button>
        <button className="calc-btn operator" onClick={() => performOperation('-')}>−</button>

        <button className="calc-btn clear" onClick={clearDisplay}>C</button>
        <button className="calc-btn number" onClick={() => inputDigit('0')}>0</button>
        <button className="calc-btn equals" onClick={handleEquals}>=</button>
        <button className="calc-btn operator" onClick={() => performOperation('+')}>+</button>
      </div>
      
      <div className="calculator-hint">
        <p>
          enter code <strong>{unlockCode}</strong> · tap <strong>=</strong> to unlock
          <button className="change-code-btn" onClick={toggleCodeChange}>
            {isSettingCode ? '✓ Save' : '✎ Change'}
          </button>
        </p>
        {isSettingCode && (
          <div className="code-change-area">
            <input
              type="text"
              className="code-input"
              value={newCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setNewCode(val);
                setDisplay(val || 'Enter 4-digit code');
              }}
              placeholder="4-digit code"
              maxLength="4"
              autoFocus
            />
            <button className="code-set-btn" onClick={changeUnlockCode}>Set</button>
            <button className="code-cancel-btn" onClick={toggleCodeChange}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CalculatorGhost;