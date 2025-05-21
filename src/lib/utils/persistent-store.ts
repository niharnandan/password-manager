import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

// Type-safe persistent store that works with SvelteKit
export function persistentStore<T>(key: string, initialValue: T): Writable<T> {
  // Initialize with value from localStorage or use initialValue if not in browser
  const storedValueStr = browser ? localStorage.getItem(key) : null;
  
  // Parse the stored value or use initial value
  const storedValue: T = storedValueStr 
    ? JSON.parse(storedValueStr) 
    : initialValue;
  
  // Create the writable store
  const store = writable<T>(storedValue);
  
  // Sync the store with localStorage whenever it changes
  if (browser) {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
    
    // Listen for storage events (for cross-tab synchronization)
    window.addEventListener('storage', event => {
      if (event.key === key && event.newValue) {
        const newValue = JSON.parse(event.newValue);
        store.set(newValue);
      }
    });
  }
  
  return store;
}