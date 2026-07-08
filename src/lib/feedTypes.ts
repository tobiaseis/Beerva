import type { ContentMention } from './mentions';
import type { OfficialFeedPost } from './officialFeedPosts';
import type { PubCrawl } from './pubCrawls';
import type { SessionBeer } from './sessionBeers';
import type { SessionBuddy } from './sessionBuddies';
import type { SessionChugAttempt } from './chugAttempts';
import type { SessionPhoto } from './sessionPhotos';

export type ProfilePreview = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type FeedComment = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: ProfilePreview | null;
  mentions?: ContentMention[];
};

export type FeedSession = {
  id: string;
  user_id: string;
  pub_id?: string | null;
  pub_name: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  comment: string | null;
  image_url: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  published_at?: string | null;
  edited_at?: string | null;
  hangover_score?: number | null;
  created_at: string;
  session_beers: SessionBeer[];
  session_photos: SessionPhoto[];
  session_chug_attempts: SessionChugAttempt[];
  drinking_buddies: SessionBuddy[];
  units?: number | null;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  author_current_streak?: number | null;
  cheer_profiles: ProfilePreview[];
  comments: FeedComment[];
  mentions?: ContentMention[];
  comments_count: number;
  cheers_count: number;
  has_cheered: boolean;
};

export type FeedItem =
  | { type: 'session'; id: string; publishedAt: string; session: FeedSession }
  | { type: 'pub_crawl'; id: string; publishedAt: string; crawl: PubCrawl }
  | { type: 'official_post'; id: string; publishedAt: string; post: OfficialFeedPost };
