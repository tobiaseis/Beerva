import { MentionCandidate, toMentionRpcPayload } from './mentions';
import { supabase } from './supabase';

export type MentionTargetType = 'session' | 'pub_crawl';
export type MentionSurface = 'post' | 'comment';

export type NotifyContentMentionsInput = {
  targetType: MentionTargetType;
  targetId: string;
  surface: MentionSurface;
  sourceId: string;
  text: string;
  mentions: MentionCandidate[];
};

export const notifyContentMentions = async ({
  targetType,
  targetId,
  surface,
  sourceId,
  text,
  mentions,
}: NotifyContentMentionsInput): Promise<number> => {
  const mentionPayload = toMentionRpcPayload(text, mentions);
  if (mentionPayload.length === 0) return 0;

  const { data, error } = await supabase.rpc('create_content_mentions', {
    target_type_input: targetType,
    target_id_input: targetId,
    surface_input: surface,
    source_id_input: sourceId,
    mention_candidates: mentionPayload,
  });

  if (error) throw error;
  return typeof data === 'number' ? data : 0;
};

export const notifyContentMentionsSafely = (input: NotifyContentMentionsInput) => {
  notifyContentMentions(input).catch((error) => {
    console.warn('Could not create mention notifications:', error);
  });
};
