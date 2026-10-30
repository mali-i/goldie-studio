import { FrameIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { frameMention, type ChatFrame } from "../lib/chatFrames";

export function FrameComposer({ frames, selected, locale, value, disabled, onChange, onSelect, onRemove, onSend }: {
  frames: ChatFrame[];
  selected: ChatFrame[];
  locale: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSelect: (frame: ChatFrame) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<ReturnType<typeof frameMention>>(null);
  const [active, setActive] = useState(0);
  const matches = frames.filter((frame) => !selected.some((item) => item.id === frame.id) && `${frame.label} ${frame.headline} ${frame.sceneId}`.toLocaleLowerCase().includes(mention?.query.toLocaleLowerCase() ?? ""));
  const open = mention !== null && !disabled;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  useEffect(() => { if (!value || disabled) setMention(null); }, [value, disabled]);
  useEffect(() => {
    if (open) document.getElementById(`frame-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const updateMention = (text: string, caret: number) => {
    setMention(frameMention(text, caret));
    setActive(0);
  };
  const choose = (frame: ChatFrame) => {
    if (!mention) return;
    onSelect(frame);
    onChange(value.slice(0, mention.start) + value.slice(mention.end));
    const caret = mention.start;
    setMention(null);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); });
  };

  return <div className="relative rounded-xl border border-border bg-background focus-within:border-ring">
    {open && <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">Frames · Current canvas</p>
      <div id="chat-frame-options" role="listbox" aria-label="Frames on current canvas" className="max-h-60 overflow-y-auto p-1">
        {matches.map((frame, index) => <button key={frame.id} id={`frame-option-${index}`} type="button" role="option" aria-selected={index === activeIndex} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(frame)}>
          <FrameIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0"><span className="block font-medium">{frame.label}</span><span className="block truncate text-muted-foreground">{frame.headline || "Untitled"}</span></span>
        </button>)}
        {!matches.length && <p role="status" className="p-3 text-xs text-muted-foreground">{frames.length ? frames.every((frame) => selected.some((item) => item.id === frame.id)) ? "All Frames selected" : "No matching Frames" : "No Frames on this canvas"}</p>}
      </div>
    </div>}
    {selected.length > 0 && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{selected.map((frame) => <div key={frame.id} className="flex max-w-full items-center rounded-md bg-muted text-xs"><button type="button" disabled={disabled} className="flex min-w-0 items-center gap-1.5 rounded-l-md px-2 py-1" title={`${frame.headline || frame.label} · ${locale}`} aria-label={`Add Frame reference after ${frame.label}`} onClick={() => {
      const prefix = value && !/\s$/.test(value) ? `${value} ` : value;
      onChange(`${prefix}@`);
      updateMention(`${prefix}@`, prefix.length + 1);
      input.current?.focus();
    }}><FrameIcon className="size-3 shrink-0" /><span className="truncate">{frame.label}{frame.headline ? ` · ${frame.headline}` : ""}</span><span className="shrink-0 text-muted-foreground">{locale}</span></button><button type="button" disabled={disabled} className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50" aria-label={`Remove ${frame.label}`} title="Remove Frame reference" onClick={() => {
      onRemove(frame.id);
      setMention(null);
      input.current?.focus();
    }}><XIcon className="size-3" /></button></div>)}</div>}
    <textarea ref={input} aria-label="Message Codex" aria-expanded={open} aria-controls={open ? "chat-frame-options" : undefined} aria-activedescendant={open && matches.length ? `frame-option-${activeIndex}` : undefined} aria-autocomplete="list" className="min-h-20 w-full resize-none rounded-xl bg-transparent p-3 text-sm outline-none disabled:opacity-50" placeholder="Message Codex. Type @ to add Frames (optional)." value={value} maxLength={16000} disabled={disabled}
      onChange={(event) => { onChange(event.target.value); updateMention(event.target.value, event.target.selectionStart); }}
      onClick={(event) => updateMention(value, event.currentTarget.selectionStart)}
      onBlur={() => setMention(null)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (open && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Escape") setMention(null);
          else if (event.key === "Enter") { if (matches[activeIndex]) choose(matches[activeIndex]); }
          else if (matches.length) setActive((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); }
      }}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateMention(value, event.currentTarget.selectionStart); }} />
  </div>;
}
