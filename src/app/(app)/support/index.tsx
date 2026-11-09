import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Button, Card, EmptyState } from '@/components/ui';
import { ContactSellerSheet } from '@/components/support/ContactSellerSheet';
import { useSupportStore } from '@/store/supportStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import type { SupportTicketStatus } from '@/types/support.types';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'ordering', label: 'Ordering' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payments', label: 'Payments' },
  { id: 'returns', label: 'Returns' },
  { id: 'account', label: 'Account' },
];

export default function SupportHubScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    faqs,
    tickets,
    faqCategory,
    faqSearch,
    status,
    loadContact,
    loadFaqs,
    setFaqFilter,
    loadTickets,
    subscribe,
    unsubscribe,
  } = useSupportStore();

  const [activeTab, setActiveTab] = useState<'faqs' | 'tickets'>('faqs');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadContact();
    void loadFaqs();
    if (activeShopId) {
      void loadTickets(activeShopId);
      subscribe(activeShopId);
    }
    return () => {
      unsubscribe();
    };
  }, [activeShopId, loadContact, loadFaqs, loadTickets, subscribe, unsubscribe]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadContact(),
      loadFaqs(),
      activeShopId ? loadTickets(activeShopId) : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const statusToneMap: Record<SupportTicketStatus, 'primary' | 'warning' | 'success'> = {
    open: 'primary',
    in_progress: 'warning',
    resolved: 'success',
  };

  const screenStateStatus = useMemo(() => {
    if (status === 'loading' && tickets.length === 0 && faqs.length === 0) return 'loading';
    if (status === 'error' && tickets.length === 0 && faqs.length === 0) return 'error';
    return 'data';
  }, [status, tickets.length, faqs.length]);

  return (
    <Screen
      title={t('support.title')}
      onBack={router.back}
      rightAction={
        <Button
          label={t('support.contactSeller')}
          variant="secondary"
          onPress={() => setContactSheetVisible(true)}
        />
      }
    >
      <ScreenState
        status={screenStateStatus}
        onRetry={onRefresh}
        data={
          <View style={styles.container}>
            {/* Tab Switcher */}
            <View style={[styles.tabBar, { borderBottomColor: theme.colors.border }]}>
              <Pressable
                style={[
                  styles.tabItem,
                  activeTab === 'faqs' && {
                    borderBottomColor: theme.colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setActiveTab('faqs')}
              >
                <AppText
                  variant="subtitle"
                  color={activeTab === 'faqs' ? theme.colors.primary : theme.colors.textMuted}
                >
                  📖 {t('support.faqsTitle')}
                </AppText>
              </Pressable>

              <Pressable
                style={[
                  styles.tabItem,
                  activeTab === 'tickets' && {
                    borderBottomColor: theme.colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setActiveTab('tickets')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppText
                    variant="subtitle"
                    color={activeTab === 'tickets' ? theme.colors.primary : theme.colors.textMuted}
                  >
                    🎫 {t('support.myTickets')}
                  </AppText>
                  {tickets.length > 0 && (
                    <Badge label={String(tickets.length)} tone="primary" />
                  )}
                </View>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[theme.colors.primary]}
                />
              }
            >
              {activeTab === 'faqs' ? (
                <View style={styles.faqsSection}>
                  {/* Search Bar */}
                    <View
                      style={[
                        styles.searchContainer,
                        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                      ]}
                    >
                    <AppText color={theme.colors.textMuted}>🔍</AppText>
                    <TextInput
                      style={[styles.searchInput, { color: theme.colors.text }]}
                      placeholder={t('support.searchFaqs')}
                      placeholderTextColor={theme.colors.textMuted}
                      value={faqSearch}
                      onChangeText={(txt) => setFaqFilter(faqCategory, txt)}
                    />
                    {faqSearch ? (
                      <Pressable onPress={() => setFaqFilter(faqCategory, '')}>
                        <AppText color={theme.colors.textMuted}>✕</AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Category Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {CATEGORIES.map((c) => {
                      const isSelected =
                        (c.id === 'all' && !faqCategory) || faqCategory === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSelected
                                ? theme.colors.primary
                                : theme.colors.surfaceMuted,
                              borderColor: theme.colors.border,
                            },
                          ]}
                          onPress={() =>
                            setFaqFilter(c.id === 'all' ? null : c.id, faqSearch)
                          }
                        >
                          <AppText
                            variant="caption"
                            color={isSelected ? '#FFFFFF' : theme.colors.text}
                            style={{ fontWeight: isSelected ? '700' : '400' }}
                          >
                            {c.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* FAQ Accordion List */}
                  {faqs.length === 0 ? (
                    <EmptyState
                      title="No matching questions"
                      message="Try searching with a different term or browse all categories."
                    />
                  ) : (
                    <View style={styles.faqList}>
                      {faqs.map((faq) => {
                        const isExpanded = expandedFaqId === faq.id;
                        return (
                          <Card key={faq.id} style={styles.faqCard}>
                            <Pressable
                              style={styles.faqHeader}
                              onPress={() =>
                                setExpandedFaqId(isExpanded ? null : faq.id)
                              }
                            >
                              <AppText variant="subtitle" style={{ flex: 1 }}>
                                {faq.question}
                              </AppText>
                              <AppText color={theme.colors.textMuted}>
                                {isExpanded ? '▲' : '▼'}
                              </AppText>
                            </Pressable>
                            {isExpanded && (
                              <View
                                style={[
                                  styles.faqBody,
                                  { borderTopColor: theme.colors.border },
                                ]}
                              >
                                <AppText color={theme.colors.textMuted}>
                                  {faq.answer}
                                </AppText>
                              </View>
                            )}
                          </Card>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.ticketsSection}>
                  <View style={styles.ticketsHeaderRow}>
                    <AppText variant="title">{t('support.myTickets')}</AppText>
                    <Button
                      label={`+ ${t('support.newTicket')}`}
                      variant="primary"
                      onPress={() => router.push('/support/create')}
                    />
                  </View>

                  {tickets.length === 0 ? (
                    <EmptyState
                      title={t('support.noTickets')}
                      message={t('support.noTicketsDesc')}
                    />
                  ) : (
                    <View style={styles.ticketList}>
                      {tickets.map((ticket) => (
                        <Card
                          key={ticket.id}
                          style={styles.ticketCard}
                          onPress={() => router.push(`/support/${ticket.id}`)}
                        >
                          <View style={styles.ticketTopRow}>
                            <AppText variant="subtitle" style={{ flex: 1 }}>
                              {ticket.subject}
                            </AppText>
                            <Badge
                              label={ticket.status.toUpperCase().replace('_', ' ')}
                              tone={statusToneMap[ticket.status]}
                            />
                          </View>

                          {ticket.orderNumber ? (
                            <AppText
                              variant="caption"
                              color={theme.colors.primary}
                              style={{ fontWeight: '600' }}
                            >
                              📦 Order #{ticket.orderNumber}
                            </AppText>
                          ) : null}

                          <AppText
                            variant="caption"
                            color={theme.colors.textMuted}
                            numberOfLines={2}
                          >
                            {ticket.lastMessage || ticket.body}
                          </AppText>

                          <View style={styles.ticketFooter}>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              💬 {ticket.messageCount || 1} messages
                            </AppText>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              {new Date(ticket.updatedAt).toLocaleDateString()}
                            </AppText>
                          </View>
                        </Card>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <ContactSellerSheet
              visible={contactSheetVisible}
              onClose={() => setContactSheetVisible(false)}
            />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  faqsSection: {
    gap: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  chipRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  faqList: {
    gap: spacing.sm,
  },
  faqCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqBody: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  ticketsSection: {
    gap: spacing.md,
  },
  ticketsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketList: {
    gap: spacing.sm,
  },
  ticketCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
});
