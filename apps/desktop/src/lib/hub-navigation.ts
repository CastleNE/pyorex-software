import { useEffect } from 'react';
import { useAppStore, type AppNav } from '../stores/app-store';
import { useHubStore } from '../stores/hub-store';
import { sectionFromHash } from './hub-api';

export function navigateApp(nav: AppNav) {
  if (nav === 'hub') useHubStore.getState().select(useHubStore.getState().section);
  else if (sectionFromHash(window.location.hash))
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  useAppStore.getState().setActiveNav(nav);
}

export function useHubNavigation() {
  useEffect(() => {
    const sync = () => {
      const section = sectionFromHash(window.location.hash);
      if (section) {
        useHubStore.setState({ section, query: '' });
        useAppStore.getState().setActiveNav('hub');
      } else if (useAppStore.getState().activeNav === 'hub') {
        useAppStore.getState().setActiveNav('file');
      }
    };
    if (window.location.pathname === '/hub' && !window.location.hash)
      window.history.replaceState(null, '', '/hub#/hub/today');
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
}
