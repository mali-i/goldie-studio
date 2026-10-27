import { useEffect, useRef, useState } from "react";
import { codexJson } from "../codex";
import { emptyNotes, type WorkspaceNotes } from "../notes";

export function useWorkspaceNotes(projectId: string, enabled: boolean) {
  const key = `goldie:notes-draft:${projectId}`;
  const url = `/api/projects/${encodeURIComponent(projectId)}/notes`;
  const [notes, setNotes] = useState(emptyNotes);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = useRef(notes);
  const version = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const cache = (value: WorkspaceNotes) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Server saving still works when browser storage is unavailable. */ }
  };
  const load = async () => {
    try {
      const saved = await codexJson<WorkspaceNotes>(url);
      if (!mounted.current) return;
      let draft: WorkspaceNotes | null = null;
      try { draft = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* Ignore broken browser cache. */ }
      const valid = draft && typeof draft.document === "string" && Array.isArray(draft.excerpts) && Number.isSafeInteger(draft.revision);
      const alreadySaved = valid && draft!.document === saved.document && JSON.stringify(draft!.excerpts) === JSON.stringify(saved.excerpts);
      if (alreadySaved) { try { localStorage.removeItem(key); } catch { /* Optional draft cache. */ } }
      const recovered = valid && !alreadySaved;
      const next = recovered ? { ...draft!, history: saved.history } : saved;
      current.current = next; setNotes(next); setReady(true); setDirty(Boolean(recovered));
      setError(recovered && draft!.revision !== saved.revision ? "A recovered draft conflicts with notes in another window. Copy your draft before reloading." : "");
    } catch (error) { if (mounted.current) setError(String(error instanceof Error ? error.message : error)); }
  };
  useEffect(() => {
    mounted.current = true;
    if (enabled) void load();
    return () => { mounted.current = false; };
  }, [projectId, enabled]);

  const discardDraft = async () => {
    if (inFlight.current) return;
    setReady(false);
    try {
      const saved = await codexJson<WorkspaceNotes>(url);
      if (!mounted.current) return;
      current.current = saved; version.current++;
      try { localStorage.removeItem(key); } catch { /* Optional draft cache. */ }
      setNotes(saved); setDirty(false); setError("");
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (mounted.current) setReady(true); }
  };
  const update = (change: (previous: WorkspaceNotes) => WorkspaceNotes) => {
    const next = change(current.current);
    current.current = next; version.current++; cache(next); setNotes(next); setDirty(true);
  };
  const save = async () => {
    if (!ready || !dirty || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    const sentVersion = version.current;
    try {
      const saved = await codexJson<WorkspaceNotes>(url, current.current, "PUT");
      const next = { ...current.current, revision: saved.revision, history: saved.history };
      current.current = next;
      if (version.current === sentVersion) {
        try { localStorage.removeItem(key); } catch { /* Optional draft cache. */ }
      } else cache(next);
      if (mounted.current) { setNotes(next); setError(""); setDirty(version.current !== sentVersion); }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  };
  useEffect(() => {
    if (!dirty || !ready || saving || error) return;
    const timer = setTimeout(() => void save(), 650);
    return () => clearTimeout(timer);
  }, [notes, dirty, ready, saving, error]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { notes, ready, error, update, discardDraft, retry: () => { if (ready) void save(); else void load(); }, status: saving ? "Saving…" : dirty ? "Unsaved changes" : ready ? "Saved" : "Loading…" };
}
export type NotesController = ReturnType<typeof useWorkspaceNotes>;
