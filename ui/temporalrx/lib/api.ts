const API_BASE = "https://api.chsrijan.com"; // New domain for api access

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, options);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

export const api = {
  doctors: (limit = 200) =>
    req<{ total: number; doctors: any[] }>(`/doctors?limit=${limit}`),

  profile: (id: string) =>
    req<any>(`/doctor/${id}`),

  history: (id: string, n = 40) =>
    req<any>(`/doctor/${id}/history?last_n=${n}`),

  predict: (id: string) =>
    req<any>(`/doctor/${id}/predict`, { method: "POST" }),

  pushEvent: (id: string, body: any) =>
    req<any>(`/doctor/${id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  simulate: (id: string, n = 6) =>
    req<any>(`/simulate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: id, n_events: n }),
    }),

  population: () => req<any>(`/population/stats`),
};