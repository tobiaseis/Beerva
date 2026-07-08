import React from 'react';
import { FlatList, FlatListProps } from 'react-native';

type FeedListProps<ItemT> = FlatListProps<ItemT> & {
  getItemType?: (item: ItemT, index: number) => string | number | undefined;
};

export const FeedList = React.forwardRef<FlatList<any>, FeedListProps<any>>(
  ({ getItemType, ...props }, ref) => {
    void getItemType;
    return <FlatList ref={ref} {...props} />;
  }
);

FeedList.displayName = 'FeedList';
