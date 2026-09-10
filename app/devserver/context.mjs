import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage();

export function currentUser() {
  return requestContext.getStore()?.user || null;
}
