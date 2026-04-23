export type DocsResponse = { root: string; files: string[] };

export async function fetchDocs(): Promise<DocsResponse> {
  const res = await fetch("/api/docs");
  if (!res.ok) throw new Error(`failed to load docs list (${res.status})`);
  return res.json();
}

export async function fetchDoc(path: string): Promise<string> {
  const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}
