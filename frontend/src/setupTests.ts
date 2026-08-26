import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('unit-test-firebase-token'),
    },
  },
  authPersistenceReady: Promise.resolve(),
  firebaseApp: {},
  firestore: {},
  startTrace: vi.fn(() => null),
  trackEvent: vi.fn(),
  trackException: vi.fn(),
}));

afterEach(() => {
  cleanup();
});
