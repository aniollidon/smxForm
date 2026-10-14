export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Error ${status}`);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const upload = (path, file) => {
  const form = new FormData();
  form.append('file', file);
  return api(path, { method: 'POST', form });
};

export const fileUrl = (name) => (name ? `/api/files/${name}` : null);
