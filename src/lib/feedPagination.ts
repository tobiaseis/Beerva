export type FeedOrderable = { id: string; publishedAt: string };

/** Sort newest-first by publishedAt (ISO string). Returns a new array. */
export const sortFeedItemsByPublishedAt = <T extends FeedOrderable>(items: T[]): T[] => (
  [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
);

/**
 * Append a freshly-fetched feed page to the already-displayed list WITHOUT
 * re-sorting items the user has already seen.
 *
 * The feed merges three independently-paginated sources (sessions, pub crawls,
 * official posts). Sessions are dense while crawls/official posts are sparse, so
 * a later page of sessions routinely contains items newer than already-shown
 * crawl/official items that page 1 over-fetched. Globally re-sorting the whole
 * accumulated list would relocate those already-seen items, which makes the list
 * jump/glitch under the user's scroll. Appending keeps prior order stable; only
 * the new page is sorted, among itself, and added at the end.
 */
export const appendFeedPage = <T extends FeedOrderable>(previous: T[], pageItems: T[]): T[] => {
  const existingIds = new Set(previous.map((item) => item.id));
  const uniqueNew = pageItems.filter((item) => !existingIds.has(item.id));
  return [...previous, ...sortFeedItemsByPublishedAt(uniqueNew)];
};
