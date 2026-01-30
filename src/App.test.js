import { render, screen } from '@testing-library/react';
import App from './App';

test('renders biometric calculator title', () => {
  render(<App />);
  expect(screen.getByText(/Biometric Calculator/i)).toBeInTheDocument();
});

test('renders punch log with Punch In and Punch Out', () => {
  render(<App />);
  expect(screen.getByTestId('punch-in-btn')).toBeInTheDocument();
  expect(screen.getByTestId('punch-out-btn')).toBeInTheDocument();
});

test('renders Add punch button', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /add punch/i })).toBeInTheDocument();
});

test('displays worked time, break time and remaining time', () => {
  render(<App />);
  const worked = screen.getByTestId('worked-time');
  const breakTime = screen.getByTestId('break-time');
  const remaining = screen.getByTestId('remaining-time');
  expect(worked).toBeInTheDocument();
  expect(breakTime).toBeInTheDocument();
  expect(remaining).toBeInTheDocument();
  expect(worked.textContent).toMatch(/\d+h\s*\d+m|\d+m|\d+h/);
  expect(breakTime.textContent).toMatch(/\d+h\s*\d+m|\d+m|\d+h/);
  expect(remaining.textContent).toMatch(/\d+h\s*\d+m|\d+m|\d+h/);
});
