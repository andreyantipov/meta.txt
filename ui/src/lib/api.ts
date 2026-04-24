export type RootEntry = { name: string; path: string; files: string[] };
export type DocsResponse = { roots: RootEntry[]; version: string };

export type DocRef = { root: string; path: string };

export async function fetchDocs(): Promise<DocsResponse> {
  const res = await fetch("/api/docs");
  if (!res.ok) throw new Error(`failed to load docs list (${res.status})`);
  return res.json();
}

export async function fetchDoc(ref: DocRef): Promise<string> {
  const qs = new URLSearchParams({ root: ref.root, path: ref.path });
  const res = await fetch(`/api/doc?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

export async function fetchChangelog(): Promise<string> {
  const res = await fetch("/api/changelog");
  if (!res.ok) throw new Error(`failed to load changelog (${res.status})`);
  return res.text();
}

export type GitInfo =
  | { ok: false }
  | { ok: true; branch: string | null; sha: string | null };

export async function fetchGit(root?: string): Promise<GitInfo> {
  const qs = root ? `?root=${encodeURIComponent(root)}` : "";
  try {
    const res = await fetch(`/api/git${qs}`);
    if (!res.ok) return { ok: false };
    return (await res.json()) as GitInfo;
  } catch {
    return { ok: false };
  }
}

export type ContentHit = {
  root: string;
  path: string;
  line: number;
  snippet: string;
  matchStart: number;
  matchEnd: number;
};

export async function searchContent(
  q: string,
  signal?: AbortSignal,
): Promise<ContentHit[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ContentHit[] };
  return data.results ?? [];
}
