import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, shadows } from '../theme/layout';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  data: string[];
  placeholder: string;
  icon?: React.ReactNode;
}

export const AutocompleteInput = ({ value, onChangeText, data, placeholder, icon }: Props) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchingDropdownRef = useRef(false);
  const scrollingDropdownRef = useRef(false);

  const filteredData = data.filter(item => 
    item.toLowerCase().includes(value.toLowerCase()) && item.toLowerCase() !== value.toLowerCase()
  );

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const closeAfterBlur = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = setTimeout(() => {
      if (!touchingDropdownRef.current) {
        setShowDropdown(false);
      }
    }, 250);
  };

  const releaseDropdownTouch = () => {
    setTimeout(() => {
      touchingDropdownRef.current = false;
      scrollingDropdownRef.current = false;
    }, 120);
  };

  const selectItem = (item: string) => {
    if (scrollingDropdownRef.current) return;

    onChangeText(item);
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, { zIndex: showDropdown ? 100 : 1 }]}>
      <View style={styles.inputWrapper}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={closeAfterBlur}
        />
      </View>
      
      {showDropdown && filteredData.length > 0 && (
        <View style={styles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onTouchStart={() => {
              touchingDropdownRef.current = true;
            }}
            onTouchEnd={releaseDropdownTouch}
            onTouchCancel={releaseDropdownTouch}
            onScrollBeginDrag={() => {
              touchingDropdownRef.current = true;
              scrollingDropdownRef.current = true;
            }}
            onScrollEndDrag={releaseDropdownTouch}
            onMomentumScrollEnd={releaseDropdownTouch}
          >
            {filteredData.slice(0, 20).map((item, index) => (
              <Pressable
                key={`${item}-${index}`}
                style={({ pressed }) => [
                  styles.dropdownItem,
                  pressed ? styles.dropdownItemPressed : null,
                ]}
                onPress={() => selectItem(item)}
              >
                <Text style={styles.dropdownText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    position: 'relative',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 16,
    height: 56,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    maxHeight: 220,
    overflow: 'hidden',
    ...shadows.raised,
  },
  dropdownItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  dropdownItemPressed: {
    backgroundColor: colors.glass,
  },
  dropdownText: {
    ...typography.body,
    color: colors.text,
  },
});
