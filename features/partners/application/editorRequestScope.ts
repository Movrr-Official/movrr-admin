/** Invalidate response ownership on page change or editor unmount. Does not cancel a committed server transaction. */
export class EditorRequestScope {
    private revision = 0;
    invalidate() { this.revision++; }
    capture() { const revision = this.revision; return () => revision === this.revision; }
}
