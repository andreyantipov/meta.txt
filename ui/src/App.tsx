import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Viewer } from "@/components/viewer";
import { fetchDocs } from "@/lib/api";

export default function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchDocs()
      .then(({ files }) => {
        setFiles(files);
        const fromHash = decodeURIComponent(location.hash.slice(1));
        if (fromHash && files.includes(fromHash)) {
          setActive(fromHash);
        } else if (files.length > 0) {
          setActive(files.find((f) => /readme/i.test(f)) ?? files[0]!);
        }
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (active) history.replaceState(null, "", `#${encodeURIComponent(active)}`);
  }, [active]);

  if (err) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        {err}
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar files={files} activePath={active} onSelect={setActive} />
      <Viewer path={active} />
    </div>
  );
}
