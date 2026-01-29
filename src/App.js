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
    outTime: '06:00 PM', // use "Now" button to set punch out to current time
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

/** Parse time from file/bulk: if AM/PM present use 12h; otherwise treat as 24-hour format. Supports HH:MM or HHMM (e.g. 15:00 or 1500). */
function normalizeTimeFromFile(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  let hours24;
  let minutes;
  const matchColon = trimmed.match(/(\d{1,2})\s*:\s*(\d{1,2})\s*(AM|PM)?/i);
  if (matchColon) {
    hours24 = parseInt(matchColon[1], 10);
    minutes = parseInt(matchColon[2], 10);
    const period = (matchColon[3] || '').toUpperCase();
    if (period === 'AM' || period === 'PM') {
      if (period === 'AM' && hours24 === 12) hours24 = 0;
      if (period === 'PM' && hours24 !== 12) hours24 += 12;
    }
  } else {
    const matchCompact = trimmed.match(/^(\d{3,4})$/);
    if (matchCompact) {
      const val = matchCompact[1];
      if (val.length === 4) {
        hours24 = parseInt(val.slice(0, 2), 10);
        minutes = parseInt(val.slice(2, 4), 10);
      } else {
        hours24 = parseInt(val.slice(0, 1), 10);
        minutes = parseInt(val.slice(1, 3), 10);
      }
    } else {
      return null;
    }
  }
  minutes = Math.min(59, Math.max(0, minutes || 0));
  if (hours24 < 0 || hours24 > 23) return null;
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

/** Split a line into two time parts: supports comma, tab, or space between two times (e.g. "10:25 12:25"). */
function splitLineIntoTwoTimes(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const byCommaOrTab = trimmed.split(/[\t,]/).map((p) => p.trim()).filter(Boolean);
  if (byCommaOrTab.length >= 2) return [byCommaOrTab[0], byCommaOrTab[1]];
  if (byCommaOrTab.length === 1) {
    const part = byCommaOrTab[0];
    const match = part.match(/^(.+?)\s+(\d{1,2}\s*:\s*\d{1,2}(?:\s*[AP]M)?)\s*$/i);
    if (match) return [match[1].trim(), match[2].trim()];
  }
  return [];
}

/** Parse CSV/text: each line = punch in, punch out. No AM/PM = 24-hour format. */
function parseUploadedFile(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const parts = splitLineIntoTwoTimes(line);
    if (parts.length >= 2) {
      const inTime = normalizeTimeFromFile(parts[0]);
      const outTime = normalizeTimeFromFile(parts[1]);
      if (inTime && outTime) rows.push({ inTime, outTime });
    }
  }
  return rows;
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
  const [activeTab, setActiveTab] = useState('manual');
  const [uploadedRows, setUploadedRows] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkParsedRows, setBulkParsedRows] = useState([]);
  const [bulkError, setBulkError] = useState(null);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    setUploadedRows([]);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result;
        if (typeof text !== 'string') {
          setUploadError('Could not read file as text.');
          return;
        }
        const rows = parseUploadedFile(text);
        if (rows.length === 0) {
          setUploadError('No valid punch in/out rows found. Use CSV or tab-separated: time1, time2 per line (e.g. 9:00 AM, 5:00 PM or 09:00, 17:00).');
          return;
        }
        setUploadedRows(rows);
      } catch (err) {
        setUploadError(err.message || 'Failed to parse file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const addUploadedToLog = useCallback(() => {
    if (uploadedRows.length === 0) return;
    setSessions(
      uploadedRows.map((row) => ({
        id: nextId++,
        inTime: row.inTime,
        outTime: row.outTime,
      }))
    );
    setUploadedRows([]);
    setActiveTab('manual');
  }, [uploadedRows, setSessions]);

  const parseBulkText = useCallback(() => {
    setBulkError(null);
    setBulkParsedRows([]);
    const text = bulkText.trim();
    if (!text) {
      setBulkError('Enter punch in and punch out times (one pair per line).');
      return;
    }
    try {
      const rows = parseUploadedFile(text);
      if (rows.length === 0) {
        setBulkError('No valid rows found. Use one line per pair: punch in, punch out (e.g. 9:00, 5:00 or 09:00 AM, 05:00 PM).');
        return;
      }
      setBulkParsedRows(rows);
    } catch (err) {
      setBulkError(err.message || 'Failed to parse.');
    }
  }, [bulkText]);

  const addBulkToLog = useCallback(() => {
    if (bulkParsedRows.length === 0) return;
    setSessions(
      bulkParsedRows.map((row) => ({
        id: nextId++,
        inTime: row.inTime,
        outTime: row.outTime,
      }))
    );
    setBulkParsedRows([]);
    setBulkText('');
    setActiveTab('manual');
  }, [bulkParsedRows, setSessions]);

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

          <div className="tabs">
            <button
              type="button"
              className={`tabs__tab ${activeTab === 'manual' ? 'tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('manual')}
              aria-pressed={activeTab === 'manual'}
            >
              Manual entry
            </button>
            <button
              type="button"
              className={`tabs__tab ${activeTab === 'upload' ? 'tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('upload')}
              aria-pressed={activeTab === 'upload'}
            >
              Upload file
            </button>
            <button
              type="button"
              className={`tabs__tab ${activeTab === 'bulk' ? 'tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('bulk')}
              aria-pressed={activeTab === 'bulk'}
            >
              Bulk entry
            </button>
          </div>

          {activeTab === 'manual' && (
            <div className="container container--manual">
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
                    className={`summary__value ${remainingMinutes < 0 ? 'summary__value--overtime' : ''
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
          )}

          {activeTab === 'upload' && (
            <div className="container container--upload">
            <p className="upload-hint">
              Upload a CSV or text file with one punch in/out per line. Separate times by comma or tab.
              <br />
              With AM/PM: <code>9:00 AM, 5:00 PM</code>. Without AM/PM: treated as 24-hour format, e.g. <code>09:00, 17:00</code>.
            </p>
              <label className="upload-label">
                <span className="upload-label__text">Choose file</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={handleFileUpload}
                  className="upload-input"
                  aria-label="Choose file to upload"
                />
              </label>
              {uploadError && (
                <p className="upload-error" role="alert">
                  {uploadError}
                </p>
              )}
              {uploadedRows.length > 0 && (
                <>
                  <p className="upload-preview-title">
                    Parsed {uploadedRows.length} row(s). Add to punch log?
                  </p>
                  <ul className="upload-preview-list">
                    {uploadedRows.map((row, i) => (
                      <li key={i} className="upload-preview-row">
                        <span>{row.inTime}</span>
                        <span>→</span>
                        <span>{row.outTime}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="upload-add-btn"
                    onClick={addUploadedToLog}
                  >
                    Add to punch log
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'bulk' && (
            <div className="container container--bulk">
              <p className="bulk-hint">
                Enter punch in and punch out on separate rows. One pair per line, separate times by comma or tab.
                <br />
                With AM/PM: <code>9:00 AM, 5:00 PM</code>. Without AM/PM: treated as 24-hour format, e.g. <code>09:00, 17:00</code>.
              </p>
              <textarea
                className="bulk-textarea"
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setBulkError(null);
                  setBulkParsedRows([]);
                }}
                placeholder="9:00 AM, 5:00 PM&#10;09:00, 17:00&#10;8:30, 12:00&#10;13:00, 18:00"
                rows={10}
                aria-label="Bulk punch in/out data"
              />
              <div className="bulk-actions">
                <button
                  type="button"
                  className="bulk-parse-btn"
                  onClick={parseBulkText}
                >
                  Parse & preview
                </button>
              </div>
              {bulkError && (
                <p className="bulk-error" role="alert">
                  {bulkError}
                </p>
              )}
              {bulkParsedRows.length > 0 && (
                <>
                  <p className="bulk-preview-title">
                    Parsed {bulkParsedRows.length} row(s). Add to punch log to include in calculation.
                  </p>
                  <ul className="upload-preview-list">
                    {bulkParsedRows.map((row, i) => (
                      <li key={i} className="upload-preview-row">
                        <span>{row.inTime}</span>
                        <span>→</span>
                        <span>{row.outTime}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="upload-add-btn"
                    onClick={addBulkToLog}
                  >
                    Add to punch log
                  </button>
                </>
              )}
            </div>
          )}
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
