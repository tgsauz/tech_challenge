const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();

  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error("Request timed out. Please try again.");
    }
    init.signal.addEventListener("abort", abortListener, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (init.signal) {
      init.signal.removeEventListener("abort", abortListener);
    }
  }
}
