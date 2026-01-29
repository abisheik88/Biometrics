import React, { useState, useRef, useEffect } from 'react';
import './TimeSelector.css';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i); // 0, 1, 2, ... 59
const AMPM = ['AM', 'PM'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function ChevronDownIcon() {
  return (
    <svg className="time-selector__chevron-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function parseTime(value, use24h) {
  if (!value) return { hours: use24h ? 9 : 9, minutes: 0, ampm: 'AM' };
  const [time, period] = value.split(/\s+/);
  const [h, m] = (time || '').split(':').map(Number);
  let hours = Number.isNaN(h) ? 9 : h;
  const minutes = Number.isNaN(m) ? 0 : Math.min(59, Math.max(0, Math.round(m)));
  let ampm = (period && period.toUpperCase()) === 'PM' ? 'PM' : 'AM';
  if (!use24h) {
    if (hours > 12) {
      hours -= 12;
      ampm = 'PM';
    } else if (hours === 0) {
      hours = 12;
      ampm = 'AM';
    }
  }
  return { hours, minutes, ampm };
}

function TimeSelector({ value, onChange, label, id, use24Hour = false }) {
  const { hours, minutes, ampm } = parseTime(value, use24Hour);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [localHours, setLocalHours] = useState(hours);
  const [localMinutes, setLocalMinutes] = useState(minutes);
  const [localAmPm, setLocalAmPm] = useState(ampm);
  const [editingHour, setEditingHour] = useState(null);
  const [editingMinute, setEditingMinute] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const { hours: h, minutes: m, ampm: ap } = parseTime(value, use24Hour);
    setLocalHours(h);
    setLocalMinutes(m);
    setLocalAmPm(ap);
    setEditingHour(null);
    setEditingMinute(null);
  }, [value, use24Hour]);

  const displayHours = editingHour !== null ? editingHour : (localHours === '' ? '' : pad(localHours));
  const displayMinutes = editingMinute !== null ? editingMinute : (localMinutes === '' ? '' : pad(localMinutes));

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commit = (newHours, newMinutes, newAmPm) => {
    if (use24Hour) {
      onChange(`${pad(newHours)}:${pad(newMinutes)}`);
    } else {
      onChange(`${pad(newHours)}:${pad(newMinutes)} ${newAmPm}`);
    }
    setOpenDropdown(null);
  };

  const handleHourSelect = (h) => {
    setLocalHours(h);
    setEditingHour(null);
    const m = localMinutes === '' ? 0 : localMinutes;
    commit(h, m, localAmPm);
  };

  const handleMinuteSelect = (m) => {
    setLocalMinutes(m);
    setEditingMinute(null);
    const h = localHours === '' ? hourMin : localHours;
    commit(h, m, localAmPm);
  };

  const handleAmPmSelect = (ap) => {
    setLocalAmPm(ap);
    commit(localHours, localMinutes, ap);
  };

  const hourOptions = use24Hour ? HOURS_24 : HOURS_12;
  const hourMin = use24Hour ? 0 : 1;
  const hourMax = use24Hour ? 23 : 12;

  const clampHour = (v) => Math.max(hourMin, Math.min(hourMax, Number(v) || hourMin));
  const clampMinute = (v) => Math.max(0, Math.min(59, Number(v) || 0));

  const handleHourInputChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setEditingHour(raw);
    if (raw === '') {
      setLocalHours('');
      return;
    }
    const v = clampHour(raw);
    setLocalHours(v);
  };

  const handleHourFocus = () => {
    setOpenDropdown(null);
    setEditingHour(localHours === '' ? '' : pad(localHours));
  };

  const handleHourBlur = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const v = raw === '' ? hourMin : clampHour(raw);
    setLocalHours(v);
    setEditingHour(null);
    const m = localMinutes === '' ? 0 : localMinutes;
    commit(v, m, localAmPm);
  };

  const handleMinuteInputChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setEditingMinute(raw);
    if (raw === '') {
      setLocalMinutes('');
      return;
    }
    const v = clampMinute(raw);
    setLocalMinutes(v);
  };

  const handleMinuteFocus = () => {
    setOpenDropdown(null);
    setEditingMinute(localMinutes === '' ? '' : pad(localMinutes));
  };

  const handleMinuteBlur = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const v = raw === '' ? 0 : clampMinute(raw);
    setLocalMinutes(v);
    setEditingMinute(null);
    const h = localHours === '' ? hourMin : localHours;
    commit(h, v, localAmPm);
  };

  return (
    <div className={`time-selector ${use24Hour ? 'time-selector--24h' : ''}`} ref={containerRef}>
      {label && (
        <label className="time-selector__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="time-selector__inputs" id={id}>
        <div className="time-selector__group">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="time-selector__input"
            maxLength={2}
            value={displayHours}
            placeholder="--"
            onChange={handleHourInputChange}
            onBlur={handleHourBlur}
            onFocus={handleHourFocus}
            aria-label="Hour (type or use list)"
            aria-haspopup="listbox"
            aria-expanded={openDropdown === 'hour'}
          />
          <button
            type="button"
            className="time-selector__chevron-btn"
            onClick={(e) => { e.preventDefault(); setOpenDropdown(openDropdown === 'hour' ? null : 'hour'); }}
            aria-label="Open hour list"
            tabIndex={-1}
          >
            <ChevronDownIcon />
          </button>
          {openDropdown === 'hour' && (
            <ul className="time-selector__dropdown" role="listbox">
              {hourOptions.map((h) => (
                <li
                  key={h}
                  role="option"
                  aria-selected={h === localHours}
                  className={`time-selector__option ${h === localHours ? 'time-selector__option--selected' : ''}`}
                  onClick={() => handleHourSelect(h)}
                >
                  {pad(h)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="time-selector__separator">:</span>

        <div className="time-selector__group">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="time-selector__input time-selector__input--minute"
            maxLength={2}
            value={displayMinutes}
            placeholder="--"
            onChange={handleMinuteInputChange}
            onBlur={handleMinuteBlur}
            onFocus={handleMinuteFocus}
            aria-label="Minute (type or use list)"
            aria-haspopup="listbox"
            aria-expanded={openDropdown === 'minute'}
          />
          <button
            type="button"
            className="time-selector__chevron-btn"
            onClick={(e) => { e.preventDefault(); setOpenDropdown(openDropdown === 'minute' ? null : 'minute'); }}
            aria-label="Open minute list"
            tabIndex={-1}
          >
            <ChevronDownIcon />
          </button>
          {openDropdown === 'minute' && (
            <ul className="time-selector__dropdown time-selector__dropdown--minutes" role="listbox">
              {MINUTES_60.map((m) => (
                <li
                  key={m}
                  role="option"
                  aria-selected={m === localMinutes}
                  className={`time-selector__option ${m === localMinutes ? 'time-selector__option--selected' : ''}`}
                  onClick={() => handleMinuteSelect(m)}
                >
                  {pad(m)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!use24Hour && (
          <>
            <span className="time-selector__separator time-selector__separator--ampm"> </span>
            <div className="time-selector__group">
              <select
                className="time-selector__select"
                value={localAmPm}
                onChange={(e) => handleAmPmSelect(e.target.value)}
                aria-label="AM or PM"
              >
                {AMPM.map((ap) => (
                  <option key={ap} value={ap}>{ap}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TimeSelector;
