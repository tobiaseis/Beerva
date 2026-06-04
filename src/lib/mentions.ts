export type MentionProfile = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

export type MentionCandidate = {
  userId: string;
  label: string;
};

export type MentionTrigger = {
  start: number;
  end: number;
  query: string;
};

export type ContentMention = {
  id: string;
  mentionedUserId: string;
  actorId: string;
  targetType: 'session' | 'pub_crawl';
  targetId: string;
  surface: 'post' | 'comment';
  sourceId: string;
  mentionLabel: string;
};

const MENTION_LIMIT = 10;
const SEARCH_LIMIT = 8;

const isBoundary = (char: string | undefined) => !char || /\s|\(|\[|\{/.test(char);

const cleanUsername = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return trimmed.length > 0 ? trimmed : null;
};

export const getMentionLabel = (username: string | null | undefined) => {
  const clean = cleanUsername(username);
  return clean ? `@${clean}` : null;
};

export const getActiveMentionTrigger = (text: string, cursorIndex: number): MentionTrigger | null => {
  const safeCursor = Math.max(0, Math.min(cursorIndex, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex < 0) return null;
  if (!isBoundary(text[atIndex - 1])) return null;

  const query = beforeCursor.slice(atIndex + 1);
  if (query.length === 0 || /\s/.test(query)) return null;
  return { start: atIndex, end: safeCursor, query };
};

export const insertMentionAtTrigger = (
  text: string,
  cursorIndex: number,
  profile: MentionProfile
) => {
  const trigger = getActiveMentionTrigger(text, cursorIndex);
  const label = getMentionLabel(profile.username);
  if (!trigger || !label) {
    return { text, cursor: cursorIndex, mention: null };
  }

  const replacement = `${label} `;
  const nextText = `${text.slice(0, trigger.start)}${replacement}${text.slice(trigger.end)}`;
  return {
    text: nextText,
    cursor: trigger.start + replacement.length,
    mention: { userId: profile.id, label },
  };
};

export const sanitizeMentionCandidates = (
  text: string,
  candidates: MentionCandidate[]
): MentionCandidate[] => {
  const seen = new Set<string>();
  const clean: MentionCandidate[] = [];

  candidates.forEach((candidate) => {
    const userId = candidate.userId?.trim();
    const label = candidate.label?.trim();
    if (!userId || !label || seen.has(userId) || !text.includes(label)) return;
    seen.add(userId);
    clean.push({ userId, label });
  });

  return clean.slice(0, MENTION_LIMIT);
};

export const toMentionRpcPayload = (
  text: string,
  candidates: MentionCandidate[]
) => sanitizeMentionCandidates(text, candidates);

export const searchMentionProfiles = async (
  supabaseClient: any,
  query: string,
  currentUserId: string | null | undefined,
  limit = SEARCH_LIMIT
): Promise<MentionProfile[]> => {
  const cleanQuery = query.trim();
  if (cleanQuery.length === 0) return [];

  let request = supabaseClient
    .from('profiles')
    .select('id, username, avatar_url')
    .ilike('username', `%${cleanQuery}%`);

  if (currentUserId) {
    request = request.neq('id', currentUserId);
  }

  const { data, error } = await request
    .order('username', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return ((data || []) as any[])
    .map((row) => ({
      id: String(row.id),
      username: cleanUsername(row.username),
      avatarUrl: row.avatar_url || null,
    }))
    .filter((profile) => profile.id && profile.username);
};

export const mapContentMentionRow = (row: any): ContentMention => ({
  id: String(row.id),
  mentionedUserId: String(row.mentioned_user_id),
  actorId: String(row.actor_id),
  targetType: row.target_type === 'pub_crawl' ? 'pub_crawl' : 'session',
  targetId: String(row.target_id),
  surface: row.surface === 'post' ? 'post' : 'comment',
  sourceId: String(row.source_id),
  mentionLabel: String(row.mention_label),
});

export const fetchContentMentionsForSources = async (
  supabaseClient: any,
  surface: 'post' | 'comment',
  sourceIds: string[]
): Promise<Map<string, ContentMention[]>> => {
  const cleanIds = Array.from(new Set(sourceIds.filter(Boolean)));
  const bySource = new Map<string, ContentMention[]>();
  if (cleanIds.length === 0) return bySource;

  const { data, error } = await supabaseClient
    .from('content_mentions')
    .select('id, mentioned_user_id, actor_id, target_type, target_id, surface, source_id, mention_label')
    .eq('surface', surface)
    .in('source_id', cleanIds);

  if (error) throw error;

  ((data || []) as any[]).forEach((row) => {
    const mention = mapContentMentionRow(row);
    const existing = bySource.get(mention.sourceId) || [];
    existing.push(mention);
    bySource.set(mention.sourceId, existing);
  });

  return bySource;
};
