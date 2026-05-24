'use server';

const BACKEND_URL = process.env.BACKEND_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

async function fetchFromBackend(path: string, options: RequestInit = {}) {
  if (!BACKEND_URL || !ADMIN_API_KEY) {
    throw new Error('Server configuration error: BACKEND_URL or ADMIN_API_KEY is not set in the environment.');
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_API_KEY}`,
      ...(options.headers || {}),
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

export async function getDashboardData() {
  const data = await fetchFromBackend('/v1/admin/dashboard');
  return { success: true, dashboard: data.dashboard };
}

