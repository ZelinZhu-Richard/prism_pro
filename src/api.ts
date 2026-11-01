import type { AiEvent, AiRequest } from "../shared/types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + url, {
    method,
    headers: {
      "X-Prism-Request": "1",
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      message = (await response.json()).error ?? message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return response.json();
}
export async function aiStream(
  request: AiRequest,
  onEvent: (e: AiEvent) => void,
) {
  const response = await fetch("/api/ai/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Prism-Request": "1" },
    body: JSON.stringify(request),
  });
  if (!response.ok)
    throw new Error((await response.json()).error ?? "Could not start AI.");
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    sawDone = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (event.startsWith("data: ")) {
          const parsed = JSON.parse(event.slice(6)) as AiEvent;
          if (parsed.type === "done") sawDone = true;
          onEvent(parsed);
        }
      }
      if (done) break;
    }
    if (!sawDone)
      throw new Error(
        "The AI connection ended before completion. Saved text has been kept.",
      );
  } finally {
    reader.releaseLock();
  }
}
