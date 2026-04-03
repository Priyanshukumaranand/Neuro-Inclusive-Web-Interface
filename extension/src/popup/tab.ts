import type { ContentRequest, ContentResponse } from "../shared/messages.js";


export async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function sendToActiveTab(
  msg: ContentRequest
): Promise<ContentResponse> {
  const id = await getActiveTabId();
  if (id == null) return { ok: false, error: "No active tab" };
  try {
    return await chrome.tabs.sendMessage(id, msg);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not reach page (reload tab?)",
    };
  }
}
