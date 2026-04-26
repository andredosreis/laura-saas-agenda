import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW server para Node (usado por Vitest).
 * Em E2E (Playwright) usaríamos setupWorker no browser, mas isso fica para depois.
 */
export const server = setupServer(...handlers);
