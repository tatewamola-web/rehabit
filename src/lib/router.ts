/**
 * A ~40-line hash router. A routing library would be more code than the whole
 * navigation surface of this app, and hash URLs mean the built app works from a
 * plain `file://` open or any static folder without server rewrites.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export function navigate(path: string, params?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) query.set(k, v);
  const qs = query.toString();
  window.location.hash = qs ? `${path}?${qs}` : path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '/';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function useNavigate() {
  return useCallback(navigate, []);
}
