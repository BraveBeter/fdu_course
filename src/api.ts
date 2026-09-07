export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-requested-with': 'fdu-course',
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? '请求失败，请稍后重试');
  return data as T;
}
