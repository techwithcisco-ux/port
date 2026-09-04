import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Animated calculator panel for the POS till.
 *
 * Pressing a button briefly highlights it (the "punch-in" animation) and
 * the display updates instantly.  Supports +, -, ×, ÷, =, backspace and
 * clear — enough for quick quantity/price maths at the counter.
 *
 * Props:
 *   onResult(n) — fires when the user presses "=" with a valid result.
 *   onDisplayUpdate(expr) — fires on every keystroke so the parent can
 *     read the live expression string.
 *   initialValue — optional seed value shown on mount.
 */

interface CalcProps {
  onResult?: (n: number) => void;
  onDisplayUpdate?: (expr: string) => void;
  initialValue?: string;
}

export default function Calculator({ onResult, onDisplayUpdate, initialValue }: CalcProps) {
  const [display, setDisplay] = useState(initialValue ?? '0');
  const [expression, setExpression] = useState('');
  const [lastOp, setLastOp] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [resultFlash, setResultFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Animate button press: highlight for 120ms
  const animatePress = useCallback((key: string) => {
    setPressedKey(key);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPressedKey(null), 120);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Flash the result green briefly when "=" is pressed
  const flashResult = useCallback(() => {
    setResultFlash(true);
    setTimeout(() => setResultFlash(false), 400);
  }, []);

  const calculate = useCallback((a: number, op: string, b: number): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  }, []);

  const handleDigit = useCallback((d: string) => {
    animatePress(d);
    setDisplay((prev) => {
      const next = prev === '0' || prev === '-0' ? (prev.startsWith('-') ? '-' + d : d) : prev + d;
      onDisplayUpdate?.(expression + next);
      return next;
    });
  }, [animatePress, expression, onDisplayUpdate]);

  const handleDecimal = useCallback(() => {
    animatePress('.');
    setDisplay((prev) => {
      if (prev.includes('.')) return prev;
      const next = prev + '.';
      onDisplayUpdate?.(expression + next);
      return next;
    });
  }, [animatePress, expression, onDisplayUpdate]);

  const handleOperator = useCallback((op: string) => {
    animatePress(op);
    const current = parseFloat(display);
    if (pendingValue !== null && lastOp) {
      const result = calculate(pendingValue, lastOp, current);
      setPendingValue(result);
      setDisplay(String(Math.round(result * 10000) / 10000));
      setExpression(`${Math.round(result * 10000) / 10000} ${op} `);
    } else {
      setPendingValue(current);
      setExpression(`${current} ${op} `);
    }
    setLastOp(op);
    setDisplay('0');
  }, [animatePress, display, pendingValue, lastOp, calculate]);

  const handleEquals = useCallback(() => {
    animatePress('=');
    const current = parseFloat(display);
    if (pendingValue !== null && lastOp) {
      const result = calculate(pendingValue, lastOp, current);
      const rounded = Math.round(result * 10000) / 10000;
      setExpression(`${pendingValue} ${lastOp} ${current} =`);
      setDisplay(String(rounded));
      setPendingValue(null);
      setLastOp(null);
      onResult?.(rounded);
      flashResult();
    }
  }, [animatePress, display, pendingValue, lastOp, calculate, onResult, flashResult]);

  const handleClear = useCallback(() => {
    animatePress('C');
    setDisplay('0');
    setExpression('');
    setPendingValue(null);
    setLastOp(null);
    onDisplayUpdate?.('0');
  }, [animatePress, onDisplayUpdate]);

  const handleBackspace = useCallback(() => {
    animatePress('⌫');
    setDisplay((prev) => {
      const next = prev.length > 1 ? prev.slice(0, -1) : '0';
      onDisplayUpdate?.(expression + next);
      return next;
    });
  }, [animatePress, expression, onDisplayUpdate]);

  const handlePlusMinus = useCallback(() => {
    animatePress('±');
    setDisplay((prev) => {
      const next = prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      onDisplayUpdate?.(expression + next);
      return next;
    });
  }, [animatePress, expression, onDisplayUpdate]);

  // Keyboard support: 0-9, +, -, *, /, Enter/=', Backspace, Escape/C
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') { handleDigit(e.key); e.preventDefault(); }
      else if (e.key === '.') { handleDecimal(); e.preventDefault(); }
      else if (e.key === '+') { handleOperator('+'); e.preventDefault(); }
      else if (e.key === '-') { handleOperator('-'); e.preventDefault(); }
      else if (e.key === '*') { handleOperator('×'); e.preventDefault(); }
      else if (e.key === '/') { handleOperator('÷'); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { handleEquals(); e.preventDefault(); }
      else if (e.key === 'Backspace') { handleBackspace(); e.preventDefault(); }
      else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { handleClear(); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDigit, handleDecimal, handleOperator, handleEquals, handleBackspace, handleClear]);

  // Key styling helpers
  const digitCls = (key: string) =>
    `relative overflow-hidden rounded-xl h-14 text-lg font-semibold transition-all duration-100 select-none
     ${pressedKey === key
       ? 'bg-gray-800 text-white scale-95 shadow-inner'
       : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 active:bg-gray-100'
     }`;

  const opCls = (key: string) =>
    `relative overflow-hidden rounded-xl h-14 text-lg font-semibold transition-all duration-100 select-none
     ${pressedKey === key
       ? 'bg-gray-900 text-white scale-95 shadow-inner'
       : lastOp === key && pendingValue !== null
         ? 'bg-gray-800 text-white'
         : 'bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-950'
     }`;

  const actionCls = (key: string) =>
    `relative overflow-hidden rounded-xl h-14 text-lg font-medium transition-all duration-100 select-none
     ${pressedKey === key
       ? 'bg-gray-300 text-gray-900 scale-95'
       : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
     }`;

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
      {/* Display */}
      <div className={`px-5 pt-5 pb-3 transition-colors duration-300 ${resultFlash ? 'bg-green-50' : ''}`}>
        <p className="text-xs text-gray-400 truncate h-4 font-mono">
          {expression || '\u00A0'}
        </p>
        <p className={`text-3xl font-bold tabular-nums mt-1 truncate transition-colors duration-300 ${
          resultFlash ? 'text-green-700' : 'text-gray-900'
        }`}>
          {display}
        </p>
      </div>

      {/* Keypad */}
      <div className="flex-1 grid grid-cols-4 gap-2 p-3 auto-rows-fr">
        {/* Row 1: C ⌫ ± ÷ */}
        <button onClick={handleClear} className={actionCls('C')}>C</button>
        <button onClick={handleBackspace} className={actionCls('⌫')}>⌫</button>
        <button onClick={handlePlusMinus} className={actionCls('±')}>±</button>
        <button onClick={() => handleOperator('÷')} className={opCls('÷')}>÷</button>

        {/* Row 2: 7 8 9 × */}
        <button onClick={() => handleDigit('7')} className={digitCls('7')}>7</button>
        <button onClick={() => handleDigit('8')} className={digitCls('8')}>8</button>
        <button onClick={() => handleDigit('9')} className={digitCls('9')}>9</button>
        <button onClick={() => handleOperator('×')} className={opCls('×')}>×</button>

        {/* Row 3: 4 5 6 - */}
        <button onClick={() => handleDigit('4')} className={digitCls('4')}>4</button>
        <button onClick={() => handleDigit('5')} className={digitCls('5')}>5</button>
        <button onClick={() => handleDigit('6')} className={digitCls('6')}>6</button>
        <button onClick={() => handleOperator('-')} className={opCls('-')}>−</button>

        {/* Row 4: 1 2 3 + */}
        <button onClick={() => handleDigit('1')} className={digitCls('1')}>1</button>
        <button onClick={() => handleDigit('2')} className={digitCls('2')}>2</button>
        <button onClick={() => handleDigit('3')} className={digitCls('3')}>3</button>
        <button onClick={() => handleOperator('+')} className={opCls('+')}>+</button>

        {/* Row 5: 0 (wide) . = */}
        <button onClick={() => handleDigit('0')} className={`${digitCls('0')} col-span-2`}>0</button>
        <button onClick={handleDecimal} className={digitCls('.')}>.</button>
        <button onClick={handleEquals} className={
          `relative overflow-hidden rounded-xl h-14 text-lg font-bold transition-all duration-100 select-none
           ${pressedKey === '='
             ? 'bg-green-700 text-white scale-95 shadow-inner'
             : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
           }`
        }>=</button>
      </div>
    </div>
  );
}
