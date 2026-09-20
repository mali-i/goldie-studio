import { Loader2Icon, PencilIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectApi } from "../project-api";

export function LocaleSettings({
  projectId,
  demo,
  locales,
  locale,
  onLocale,
  onChanged,
}: {
  projectId: string;
  demo: boolean;
  locales: string[];
  locale: string;
  onLocale: (locale: string) => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(locale);
  const [newDraft, setNewDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(locale), [locale]);

  const save = async () => {
    const next = draft.trim();
    if (busy || next === locale) return;
    if (!next || locales.some((value) => value === next && value !== locale)) {
      setError(next ? "This locale already exists." : "Enter a locale code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await projectApi.renameLocale(projectId, locale, next);
      onLocale(next);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const next = newDraft.trim();
    if (busy) return;
    if (!next || locales.includes(next)) {
      setError(next ? "This locale already exists." : "Enter a locale code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await projectApi.addLocale(projectId, next);
      onLocale(next);
      setNewDraft("");
      setAdding(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-sidebar-border px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Locale</Label>
          {!demo ? (
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={editing ? "Close locale editor" : "Edit selected locale"}
                aria-expanded={editing}
                className={editing ? "bg-muted text-foreground" : undefined}
                onClick={() => {
                  setEditing(!editing);
                  setAdding(false);
                  setDraft(locale);
                  setError(null);
                }}
                disabled={busy}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={adding ? "Cancel adding locale" : "Add locale"}
                aria-expanded={adding}
                onClick={() => { setAdding(!adding); setEditing(false); setNewDraft(""); setError(null); }}
                disabled={busy}
              >
                {adding ? <XIcon /> : <PlusIcon />}
              </Button>
            </div>
          ) : null}
        </div>
        <RadioGroupPrimitive.Root
          value={locale}
          onValueChange={onLocale}
          aria-label="Locale"
          className="grid grid-cols-4 gap-2"
        >
          {locales.map((value) => (
            <RadioGroupPrimitive.Item
              key={value}
              value={value}
              disabled={busy}
              className="min-w-0 rounded-lg border border-transparent px-1 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:not-data-[state=checked]:bg-muted/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[state=checked]:border-border data-[state=checked]:bg-muted data-[state=checked]:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <span className="block truncate" title={value}>{value}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        {adding ? (
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="New locale code"
              autoFocus
              placeholder="zh-Hans"
              value={newDraft}
              onChange={(event) => { setNewDraft(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") void add(); }}
              disabled={busy}
            />
            <Button size="sm" onClick={() => void add()} disabled={busy || !newDraft.trim()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add
            </Button>
          </div>
        ) : editing ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <Label htmlFor="locale-code" className="text-[11px] text-muted-foreground">Edit selected locale</Label>
            <div className="flex gap-2">
              <Input
                id="locale-code"
                autoFocus
                value={draft}
                onChange={(event) => { setDraft(event.target.value); setError(null); }}
                onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
                disabled={busy}
              />
              <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy || draft.trim() === locale}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
