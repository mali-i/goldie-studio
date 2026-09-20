import { Loader2Icon, SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectApi } from "../project-api";
import { Field, Select } from "./Sidebar";

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
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-sidebar-border px-5 py-4">
      <Field label="Locale">
        <div className="flex flex-col gap-2">
          {locales.length > 1 ? (
            <Select value={locale} onChange={onLocale} options={locales.map((value) => [value, value])} />
          ) : null}
          <div className="flex gap-2">
            <Input
              aria-label="Locale code"
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
              disabled={demo || busy}
            />
            {!demo ? (
              <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy || draft.trim() === locale}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                Save
              </Button>
            ) : null}
          </div>
        </div>
      </Field>
      {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
