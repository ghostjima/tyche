// Where a widget's figures come from, at its top: a tag with the source's
// short name and a line that names it, with a link where the source asks
// for one.
//
// App-local: Stoa has no data-provenance label yet. A candidate for Stoa
// (a "SourceNote" beside Panel), to be promoted with this shape: a tag,
// a sentence, an optional link.
import type { ReactNode } from "react";
import { Tag } from "@ghostjima/stoa-react";

export type SourceNoteProps = {
  /** The source's short name, the same wherever it appears ("SIM"). */
  tag: string;
  /** "sim" for the synthetic universe, "official" for an outside source. */
  kind: "sim" | "official";
  /** The sentence beside the tag, links included. */
  children: ReactNode;
};

export function SourceNote({ tag, kind, children }: SourceNoteProps) {
  return (
    <p className="source-note" data-source={kind}>
      <Tag size="small" tone={kind === "sim" ? "info" : "neutral"}>
        {tag}
      </Tag>{" "}
      <span>{children}</span>
    </p>
  );
}
