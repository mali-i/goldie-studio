import { ArrowUpRightIcon, InfoIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";

const ORIGINAL_PROJECT = "https://github.com/software-mansion-labs/goldie";
const REPOSITORY = "https://github.com/mali-i/goldie-studio";
const linkClass =
  "rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function AboutDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full gap-1.5 text-xs text-muted-foreground"
        >
          <InfoIcon aria-hidden />
          About Goldie Studio
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Title className="pr-8 text-lg font-semibold tracking-tight">
            Goldie Studio
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A standalone studio for designing and exporting app store screenshots.
          </Dialog.Description>
          <section className="mt-6 border-t border-border pt-5" aria-labelledby="about-origins">
            <h2 id="about-origins" className="text-sm font-medium">
              Origins &amp; acknowledgments
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Goldie Studio began as a fork of{" "}
              <a className={linkClass} href={ORIGINAL_PROJECT} target="_blank" rel="noreferrer">
                Goldie
              </a>{" "}
              by Software Mansion. It has since evolved into an independently maintained
              project focused on uploading, editing, and exporting screenshots.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Thanks to the original authors and contributors for their work.
            </p>
          </section>
          <nav aria-label="Project resources" className="mt-6 flex flex-wrap gap-x-5 gap-y-3 border-t border-border pt-4 text-xs text-muted-foreground">
            {[
              ["GitHub", REPOSITORY],
              ["Original project", ORIGINAL_PROJECT],
              ["License", `${REPOSITORY}/blob/main/LICENSE`],
            ].map(([label, href]) => (
              <a key={label} className={`${linkClass} inline-flex items-center gap-1`} href={href} target="_blank" rel="noreferrer">
                {label}
                <ArrowUpRightIcon className="size-3" aria-hidden />
              </a>
            ))}
          </nav>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-5 right-5" aria-label="Close about dialog">
              <XIcon aria-hidden />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
