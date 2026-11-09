import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TextInput, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useCatalogStore } from '@/store/catalogStore';
import { useTheme } from '@/theme/themeContext';
import { tokens } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';

export default function SearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { query, setQuery, recentSearches, removeRecentSearch, clearRecentSearches } = useCatalogStore();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSearch = (term: string) => {
    setQuery(term);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          value={query}
          onChangeText={setQuery}
          placeholder={t('catalog.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={(e) => handleSearch(e.nativeEvent.text)}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} style={styles.clearIcon}>
            <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
        {recentSearches.length > 0 && !query && (
          <View>
            <View style={styles.recentHeader}>
              <AppText variant="subtitle">{t('catalog.recentSearches')}</AppText>
              <Pressable onPress={clearRecentSearches}>
                <AppText color="primary" variant="caption">{t('catalog.clearAll')}</AppText>
              </Pressable>
            </View>
            <FlatList
              data={recentSearches}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <Pressable style={styles.recentItem} onPress={() => handleSearch(item)}>
                  <Ionicons name="time-outline" size={20} color={theme.colors.textMuted} />
                  <AppText style={styles.recentText}>{item}</AppText>
                  <Pressable onPress={() => removeRecentSearch(item)} style={styles.removeRecent}>
                    <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                  </Pressable>
                </Pressable>
              )}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    marginEnd: tokens.spacing.sm,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  clearIcon: {
    position: 'absolute',
    end: tokens.spacing.xl,
  },
  content: {
    flex: 1,
    padding: tokens.spacing.md,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  recentText: {
    flex: 1,
    marginStart: tokens.spacing.sm,
  },
  removeRecent: {
    padding: tokens.spacing.xs,
  }
});
