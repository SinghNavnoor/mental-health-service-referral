export async function pandaDocFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `API-Key ${apiKey}`);
  return fetch(`https://api.pandadoc.com${path}`, { ...init, headers });
}
