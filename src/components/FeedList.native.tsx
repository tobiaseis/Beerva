import React from 'react';
import { FlatListProps } from 'react-native';
import { FlashList, FlashListProps, FlashListRef } from '@shopify/flash-list';

type FeedListProps<ItemT> = FlatListProps<ItemT> & {
  getItemType?: (item: ItemT, index: number) => string | number | undefined;
};

const NativeFlashList = FlashList as unknown as React.ComponentType<
  FlashListProps<any> & React.RefAttributes<FlashListRef<any>>
>;

export const FeedList = React.forwardRef<FlashListRef<any>, FeedListProps<any>>(
  (
    {
      getItemType,
      initialNumToRender,
      maxToRenderPerBatch,
      windowSize,
      updateCellsBatchingPeriod,
      removeClippedSubviews,
      ...props
    },
    ref
  ) => {
    void initialNumToRender;
    void maxToRenderPerBatch;
    void windowSize;
    void updateCellsBatchingPeriod;
    void removeClippedSubviews;

    return (
      <NativeFlashList
        ref={ref}
        {...(props as FlashListProps<any>)}
        getItemType={getItemType}
      />
    );
  }
);

FeedList.displayName = 'FeedList';
