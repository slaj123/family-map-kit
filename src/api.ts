import type { MemoryDetail, MemoryInput, World } from "./types";

const PERSON_KEY = "fmap.person";

export function getMe(): string | null {
  try {
    return localStorage.getItem(PERSON_KEY);
  } catch {
    return null;
  }
}

export function setMe(id: string | null) {
  try {
    if (id) localStorage.setItem(PERSON_KEY, id);
    else localStorage.removeItem(PERSON_KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const me = getMe();
  if (me) headers.set("x-person", me);
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "No connection. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.");
  return data as T;
}

export const api = {
  session: () => call<{ authed: boolean }>("/api/session"),
  login: (passcode: string) => call("/api/login", { method: "POST", body: JSON.stringify({ passcode }) }),
  logout: () => call("/api/logout", { method: "POST" }),
  world: () => call<World>("/api/world"),
  memory: (id: string) => call<MemoryDetail>(`/api/memories/${id}`),
  createMemory: (input: MemoryInput) =>
    call<MemoryDetail>("/api/memories", { method: "POST", body: JSON.stringify(input) }),
  updateMemory: (id: string, input: MemoryInput) =>
    call<MemoryDetail>(`/api/memories/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteMemory: (id: string) => call(`/api/memories/${id}`, { method: "DELETE" }),
  addMedia: (id: string, form: FormData) => call<MemoryDetail>(`/api/memories/${id}/media`, { method: "POST", body: form }),
  addThought: (memoryId: string, form: FormData) =>
    call<MemoryDetail>(`/api/memories/${memoryId}/thoughts`, { method: "POST", body: form }),
  updateThought: (id: string, text: string) =>
    call<MemoryDetail>(`/api/thoughts/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteThought: (id: string) => call<MemoryDetail>(`/api/thoughts/${id}`, { method: "DELETE" }),
  deleteMedia: (id: string) => call<MemoryDetail>(`/api/media/${id}`, { method: "DELETE" }),
};

export const mediaUrl = (id: string, thumb = false) => `/media/${id}${thumb ? "?thumb" : ""}`;
