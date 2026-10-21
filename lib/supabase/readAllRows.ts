/** PostgREST caps every response, including relationship projections. Continue
 * until an empty page: this also handles a server cap smaller than pageSize.
 * Callers must supply a unique stable order and propagate failures. */
export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  while (true) {
    const result = await page(rows.length, rows.length + 499);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("User projection returned no response data");
    if (!result.data.length) return rows;
    rows.push(...result.data);
  }
}
