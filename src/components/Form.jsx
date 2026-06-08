// Primitivas de formulario: Field (label+hint), Select, inputs tipados.
// Las páginas las usan para forms consistentes.
export function Field({ label, hint, required, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <span className="field-label">{label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text', invalid, ...rest }) {
  return <input className={`input ${invalid ? 'invalid' : ''}`} type={type} value={value ?? ''}
                onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} />;
}

export function NumberInput({ value, onChange, placeholder, invalid, step = 'any', min, ...rest }) {
  return <input className={`input num ${invalid ? 'invalid' : ''}`} type="number" inputMode="decimal" step={step} min={min}
                value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} />;
}

export const MoneyInput = NumberInput;

export function DateInput({ value, onChange, invalid, ...rest }) {
  return <input className={`input ${invalid ? 'invalid' : ''}`} type="date" value={value ?? ''}
                onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function TextArea({ value, onChange, placeholder, rows = 2, ...rest }) {
  return <textarea className="textarea" rows={rows} value={value ?? ''}
                   onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} />;
}

// options = [{value, label}] o [string]. placeholder = opción vacía (value '').
export function Select({ value, onChange, options = [], placeholder, invalid, disabled }) {
  return (
    <select className={`select ${invalid ? 'invalid' : ''}`} value={value ?? ''} disabled={disabled}
            onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const lbl = typeof o === 'object' ? o.label : o;
        return <option key={String(val)} value={val}>{lbl}</option>;
      })}
    </select>
  );
}
