import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

import { ContentMention } from '../lib/mentions';
import { colors } from '../theme/colors';

type Props = {
  text: string;
  mentions?: ContentMention[];
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onMentionPress?: (userId: string) => void;
};

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; mentionedUserId: string };

const buildSegments = (text: string, mentions: ContentMention[] = []): Segment[] => {
  const uniqueMentions = Array.from(
    new Map(
      mentions
        .filter((mention) => mention.mentionLabel && text.includes(mention.mentionLabel))
        .map((mention) => [mention.mentionLabel, mention])
    ).values()
  ).sort((a, b) => b.mentionLabel.length - a.mentionLabel.length);

  const segments: Segment[] = [];
  let index = 0;

  while (index < text.length) {
    const match = uniqueMentions
      .map((mention) => ({ mention, at: text.indexOf(mention.mentionLabel, index) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at || b.mention.mentionLabel.length - a.mention.mentionLabel.length)[0];

    if (!match) {
      segments.push({ kind: 'text', text: text.slice(index) });
      break;
    }

    if (match.at > index) {
      segments.push({ kind: 'text', text: text.slice(index, match.at) });
    }

    segments.push({
      kind: 'mention',
      text: match.mention.mentionLabel,
      mentionedUserId: match.mention.mentionedUserId,
    });
    index = match.at + match.mention.mentionLabel.length;
  }

  return segments;
};

export const MentionText = ({
  text,
  mentions = [],
  style,
  mentionStyle,
  numberOfLines,
  onMentionPress,
}: Props) => {
  const segments = buildSegments(text, mentions);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => (
        segment.kind === 'mention' ? (
          <Text
            key={`${segment.text}-${index}`}
            style={[{ color: colors.primary, fontWeight: '900' }, mentionStyle]}
            onPress={() => onMentionPress?.(segment.mentionedUserId)}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={`text-${index}`}>{segment.text}</Text>
        )
      ))}
    </Text>
  );
};
