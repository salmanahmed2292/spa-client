const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");
const REPORT_CACHE_TTL = 2 * 60 * 1000;
const reportCache = new Map();
const pendingReports = new Map();

const isReportList = (method, path) => method === "GET" && path.startsWith("/reports");

const invalidateReportCache = () => {
  reportCache.clear();
};

const apiRequest = async (path, options = {}) => {
  const { body, headers: customHeaders, skipMemoryCache = false, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const cacheable = isReportList(method, path) && !skipMemoryCache;
  const cached = cacheable ? reportCache.get(path) : null;

  if (cached && Date.now() - cached.savedAt < REPORT_CACHE_TTL) return cached.data;
  if (cacheable && pendingReports.has(path)) return pendingReports.get(path);

  const headers = new Headers(customHeaders);
  const token = localStorage.getItem("token");

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let requestBody = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const request = (async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers,
      body: requestBody,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || "The request could not be completed.");
    }

    if (isReportList(method, path) && !skipMemoryCache) {
      reportCache.set(path, { data: payload.data, savedAt: Date.now() });
    } else if (method !== "GET" && path.startsWith("/reports")) {
      invalidateReportCache();
    }

    return payload.data;
  })();

  if (!cacheable) return request;

  pendingReports.set(path, request);
  try {
    return await request;
  } finally {
    pendingReports.delete(path);
  }
};

export default apiRequest;
