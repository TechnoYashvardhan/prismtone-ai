import { useCallback, useEffect, useState } from 'react';

/**
 * useState that persists to localStorage (zero-database persistence for
 * history, favourites, and custom personas). Survives reloads; never leaves the device.
 */
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or disabled (private mode): keep working in memory only.
    }
  }, [key, value]);

  return [value, setValue];
}

const HISTORY_LIMIT = 40;

/** History of transformations, newest first. Starred items are never auto-evicted. */
export function useHistory() {
  const [items, setItems] = usePersistentState('prismtone.history.v1', []);

  const add = useCallback((entry) => {
    setItems((prev) => {
      const next = [{ ...entry, id: `${Date.now()}`, createdAt: new Date().toISOString(), starred: false }, ...prev];
      if (next.length <= HISTORY_LIMIT) return next;
      // Drop the oldest unstarred entry first.
      const dropIndex = next.map((e) => e.starred).lastIndexOf(false);
      return dropIndex === -1 ? next : next.filter((_, i) => i !== dropIndex);
    });
  }, [setItems]);

  const toggleStar = useCallback((id) => {
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)));
  }, [setItems]);

  const remove = useCallback((id) => setItems((prev) => prev.filter((e) => e.id !== id)), [setItems]);

  const clearUnstarred = useCallback(() => setItems((prev) => prev.filter((e) => e.starred)), [setItems]);

  return { items, add, toggleStar, remove, clearUnstarred };
}
