import React, { useState, useMemo, useCallback, useEffect } from 'react';
import TimeSelector from './components/TimeSelector';
import './App.css';

const STORAGE_KEY = 'biometric-calculator-logs';
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.sessions)) return null;
    const savedAt = data.savedAt != null ? data.savedAt : 0;
    if (Date.now() - savedAt > STORAGE_MAX_AGE_MS) return null; // expired after a day
    const expectedWorkHours = typeof data.expectedWorkHours === 'number'
      ? Math.max(0, Math.min(24, data.expectedWorkHours))
      : 8;
    return { sessions: data.sessions, expectedWorkHours };
  } catch {
    return null;
  }
}

function saveToStorage(sessions, expectedWorkHours) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessions,
      expectedWorkHours,
      savedAt: Date.now(),
    }));
  } catch (e) {
    console.warn('Could not save punch logs to localStorage', e);
  }
}

function parseTimeToMinutes(value) {
  if (!value) return 0;
  const [time, period] = value.split(/\s+/);
  const [h, m] = (time || '').split(':').map(Number);
  let hours = Number.isNaN(h) ? 0 : h;
  const minutes = Number.isNaN(m) ? 0 : m;
  if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function to24h(value) {
  if (!value || !value.includes(' ')) return value || '09:00';
  const [time, period] = value.split(/\s+/);
  const [h, m] = (time || '').split(':').map(Number);
  let hours = Number.isNaN(h) ? 9 : h;
  const minutes = Number.isNaN(m) ? 0 : m;
  if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function to12h(value) {
  if (!value || value.includes(' ')) return value || '09:00 AM';
  const [h, m] = (value || '').split(':').map(Number);
  let hours = Number.isNaN(h) ? 9 : h;
  const minutes = Number.isNaN(m) ? 0 : m;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function formatDuration(totalMinutes) {
  if (totalMinutes <= 0) return '0h 0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getCurrentTimeString(use24Hour) {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (use24Hour) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getCurrentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

let nextId = 1;
function createSession() {
  return {
    id: nextId++,
    inTime: '09:00 AM',
    outTime: null, // null = use current time as punch out
  };
}

function getInitialState() {
  const loaded = loadFromStorage();
  if (loaded && loaded.sessions.length > 0) {
    const maxId = Math.max(...loaded.sessions.map((s) => s.id), 0);
    nextId = maxId + 1;
    return { sessions: loaded.sessions, expectedWorkHours: loaded.expectedWorkHours };
  }
  return { sessions: [createSession()], expectedWorkHours: 8 };
}

function App() {
  const [state, setState] = useState(getInitialState);
  const { sessions, expectedWorkHours } = state;
  const setSessions = useCallback((updater) => {
    setState((prev) => ({ ...prev, sessions: typeof updater === 'function' ? updater(prev.sessions) : updater }));
  }, []);
  const setExpectedWorkHours = useCallback((value) => {
    setState((prev) => ({ ...prev, expectedWorkHours: value }));
  }, []);
  // 24-hour format logic commented out for now – always use 12-hour format
  // const [use24Hour, setUse24Hour] = useState(false);
  const use24Hour = false;
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    saveToStorage(sessions, expectedWorkHours);
  }, [sessions, expectedWorkHours]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const addPunch = useCallback(() => {
    setSessions((prev) => [...prev, createSession()]);
  }, [setSessions]);

  const removePunch = useCallback((id) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length ? next : [createSession()];
    });
  }, [setSessions]);

  const updateSession = useCallback((id, field, value) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }, [setSessions]);

  const { workedMinutes, breakMinutes, remainingMinutes } = useMemo(() => {
    const nowM = getCurrentTimeMinutes();
    const sorted = [...sessions]
      .map((s) => ({
        inM: parseTimeToMinutes(use24Hour ? to24h(s.inTime) : s.inTime),
        outM: s.outTime == null
          ? nowM
          : parseTimeToMinutes(use24Hour ? to24h(s.outTime) : s.outTime),
      }))
      .sort((a, b) => a.inM - b.inM);

    let worked = 0;
    let breakTime = 0;

    for (const s of sorted) {
      const duration = Math.max(0, s.outM - s.inM);
      worked += duration;
    }

    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.max(0, sorted[i].inM - sorted[i - 1].outM);
      breakTime += gap;
    }

    const expectedMinutes = expectedWorkHours * 60;
    const remaining = expectedMinutes - worked;

    return {
      workedMinutes: worked,
      breakMinutes: breakTime,
      remainingMinutes: remaining,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowTick triggers recompute every minute for live punch-out
  }, [sessions, use24Hour, expectedWorkHours, nowTick]);

  const totalSpanMinutes = useMemo(() => {
    if (sessions.length === 0) return 0;
    const nowM = getCurrentTimeMinutes();
    const sorted = [...sessions]
      .map((s) => ({
        inM: parseTimeToMinutes(use24Hour ? to24h(s.inTime) : s.inTime),
        outM: s.outTime == null
          ? nowM
          : parseTimeToMinutes(use24Hour ? to24h(s.outTime) : s.outTime),
      }))
      .sort((a, b) => a.inM - b.inM);
    const first = sorted[0].inM;
    const last = sorted[sorted.length - 1].outM;
    return Math.max(0, last - first);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowTick triggers recompute every minute for live punch-out
  }, [sessions, use24Hour, nowTick]);

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="App-title">Biometric Calculator</h1>
        <p className="App-subtitle">
          Log punch in / punch out and see worked time, break time and remaining time
        </p>
      </header>

      <main className="App-main">
        <div className="calculator-card">
          <div className="calculator-options">
            {/* 24-hour format toggle commented out for now
            <label className="calculator-option">
              <input
                type="checkbox"
                checked={use24Hour}
                onChange={(e) => setUse24Hour(e.target.checked)}
              />
              <span>24-hour format</span>
            </label>
            */}
            <div className="calculator-option calculator-option--expected">
              <label htmlFor="expected-hours">Expected work</label>
              <input
                id="expected-hours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={expectedWorkHours}
                onChange={(e) =>
                  setExpectedWorkHours(Math.max(0, Math.min(24, Number(e.target.value) || 0)))
                }
              />
              <span>hours/day</span>
            </div>
          </div>

          <section className="punch-log" aria-label="Punch log">
            <div className="punch-log__header">
              <h2 className="punch-log__title">Punch log</h2>
              <button
                type="button"
                className="punch-log__add"
                onClick={addPunch}
                aria-label="Add punch in / out"
              >
                + Add punch
              </button>
            </div>

            <ul className="punch-log__list">
              {sessions.map((session) => (
                <li key={session.id} className="punch-log__row">
                  <div className="punch-log__times">
                    <TimeSelector
                      id={`in-${session.id}`}
                      label="Punch in"
                      value={use24Hour ? to24h(session.inTime) : session.inTime}
                      onChange={(v) =>
                        updateSession(
                          session.id,
                          'inTime',
                          use24Hour ? to12h(v) : v
                        )
                      }
                      use24Hour={use24Hour}
                    />
                    <div className="punch-log__out-wrap">
                      <TimeSelector
                        id={`out-${session.id}`}
                        label="Punch out"
                        value={
                          session.outTime != null
                            ? (use24Hour ? to24h(session.outTime) : session.outTime)
                            : getCurrentTimeString(use24Hour)
                        }
                        onChange={(v) =>
                          updateSession(
                            session.id,
                            'outTime',
                            use24Hour ? to12h(v) : v
                          )
                        }
                        use24Hour={use24Hour}
                      />
                      <button
                        type="button"
                        className="punch-log__now"
                        onClick={() => updateSession(session.id, 'outTime', null)}
                        title="Use current time for punch out"
                        aria-label="Use current time"
                      >
                        Now
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="punch-log__remove"
                    onClick={() => removePunch(session.id)}
                    aria-label="Remove this punch"
                    title="Remove"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="summary">
            <div className="summary__row summary__row--worked">
              <span className="summary__label">Worked time</span>
              <span className="summary__value" data-testid="worked-time">
                {formatDuration(workedMinutes)}
              </span>
            </div>
            <div className="summary__row summary__row--break">
              <span className="summary__label">Break time</span>
              <span className="summary__value" data-testid="break-time">
                {formatDuration(breakMinutes)}
              </span>
            </div>
            <div className="summary__row summary__row--remaining">
              <span className="summary__label">
                {remainingMinutes >= 0 ? 'Remaining to work' : 'Overtime'}
              </span>
              <span
                className={`summary__value ${
                  remainingMinutes < 0 ? 'summary__value--overtime' : ''
                }`}
                data-testid="remaining-time"
              >
                {formatDuration(Math.abs(remainingMinutes))}
                {remainingMinutes < 0 ? ' (over)' : ''}
              </span>
            </div>
            <div className="summary__row summary__row--total-span">
              <span className="summary__label">Total span (first in → last out)</span>
              <span className="summary__value summary__value--muted">
                {formatDuration(totalSpanMinutes)}
              </span>
            </div>
          </div>
        </div>
      </main>
      <footer className="App-footer">
        <p className="App-footer__credit">
          Developed by <strong>Abisheik</strong>
        </p>
      </footer>
    </div>
  );
}

export default App;
