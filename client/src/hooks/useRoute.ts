import { useEffect, useState } from 'react';

export type Route = 'main' | 'admin';

function readRoute(): Route {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  if (hash.startsWith('admin')) return 'admin';
  return 'main';
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (r: Route) => {
    window.location.hash = r === 'admin' ? '#/admin' : '#/';
  };
  return [route, navigate];
}
