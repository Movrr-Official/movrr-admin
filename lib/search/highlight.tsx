import { Fragment, type ReactNode } from "react";

/**
 * Case-insensitive highlight of `query` substrings inside `text`.
 * Pure presentational helper — does not affect ranking or navigation.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  let key = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(
        <Fragment key={`t-${key++}`}>{text.slice(cursor, matchIndex)}</Fragment>,
      );
    }
    parts.push(
      <mark
        key={`m-${key++}`}
        className="bg-primary/15 text-foreground rounded-sm px-0.5"
      >
        {text.slice(matchIndex, matchIndex + needle.length)}
      </mark>,
    );
    cursor = matchIndex + needle.length;
    matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  }

  if (cursor < text.length) {
    parts.push(<Fragment key={`t-${key++}`}>{text.slice(cursor)}</Fragment>);
  }

  return parts.length > 0 ? parts : text;
}
