import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { useSupportStore } from '@/store/supportStore';
import { useTheme } from '@/hooks/useTheme';
import { validateAttachment } from '@/lib/supportService';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { SupportTicketStatus } from '@/types/support.types';

export default function SupportTicketDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const {
    selectedTicket,
    status,
    loadTicket,
    reply,
  } = useSupportStore();

  const [replyText, setReplyText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) {
      void loadTicket(id);
    }
  }, [id, loadTicket]);

  const statusToneMap: Record<SupportTicketStatus, 'primary' | 'warning' | 'success'> = {
    open: 'primary',
    in_progress: 'warning',
    resolved: 'success',
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const val = validateAttachment({
          uri: asset.uri,
          size: asset.fileSize,
          type: asset.mimeType,
        });

        if (!val.valid) {
          Alert.alert('Invalid Photo', val.error || 'Please choose a photo under 5MB.');
          return;
        }

        setAttachments((prev) => [...prev, asset.uri]);
      }
    } catch {
      Alert.alert('Permission Error', 'Could not open photo library.');
    }
  };

  const handleSendReply = async () => {
    if (!id) return;
    const clean = replyText.trim();
    if (!clean && attachments.length === 0) return;

    setSending(true);
    try {
      await reply(id, clean || 'Attached image', attachments);
      setReplyText('');
      setAttachments([]);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (err: any) {
      Alert.alert('Reply Failed', err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen title={t('support.ticketDetail')} onBack={router.back}>
      <ScreenState
        status={status === 'loading' && !selectedTicket ? 'loading' : 'data'}
        onRetry={() => id && loadTicket(id)}
        data={
          <KeyboardAvoidingView
            style={styles.keyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            {/* Ticket Header Card */}
            {selectedTicket && (
              <Card style={styles.headerCard}>
                <View style={styles.headerTop}>
                  <AppText variant="subtitle" style={{ flex: 1 }}>
                    {selectedTicket.subject}
                  </AppText>
                  <Badge
                    label={selectedTicket.status.toUpperCase().replace('_', ' ')}
                    tone={statusToneMap[selectedTicket.status]}
                  />
                </View>

                {selectedTicket.orderNumber && (
                  <Button
                    label={`📦 View Linked Order #${selectedTicket.orderNumber}`}
                    variant="ghost"
                    onPress={() => router.push(`/orders/${selectedTicket.orderId}`)}
                  />
                )}
              </Card>
            )}

            {/* Message Thread */}
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {selectedTicket?.messages?.map((msg) => {
                const isCustomer = msg.senderRole === 'customer';
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.bubbleRow,
                      isCustomer ? styles.bubbleRowRight : styles.bubbleRowLeft,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isCustomer
                          ? [styles.bubbleCustomer, { backgroundColor: theme.colors.primary }]
                          : [
                              styles.bubbleSeller,
                              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                            ],
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={isCustomer ? '#FFFFFFCC' : theme.colors.primary}
                        style={{ fontWeight: '700', marginBottom: 2 }}
                      >
                        {isCustomer ? 'You' : 'Wholesale Support'}
                      </AppText>

                      <AppText color={isCustomer ? '#FFFFFF' : theme.colors.text}>
                        {msg.message}
                      </AppText>

                      {/* Attachments inside bubble */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <View style={styles.bubbleImages}>
                          {msg.attachments.map((uri, idx) => (
                            <Image
                              key={idx}
                              source={{ uri }}
                              style={styles.attachedImage}
                              resizeMode="cover"
                            />
                          ))}
                        </View>
                      )}

                      <AppText
                        variant="caption"
                        color={isCustomer ? '#FFFFFF99' : theme.colors.textMuted}
                        style={styles.timestamp}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Attachments preview before sending */}
            {attachments.length > 0 && (
              <View style={[styles.attachmentDraftRow, { backgroundColor: theme.colors.surface }]}>
                {attachments.map((uri, idx) => (
                  <View key={idx} style={styles.draftThumbContainer}>
                    <Image source={{ uri }} style={styles.draftThumb} />
                    <Button
                      label="✕"
                      variant="destructive"
                      onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Input Composer */}
            <View
              style={[
                styles.composerRow,
                { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
              ]}
            >
              <Button label="📷" variant="ghost" onPress={handlePickImage} />
              <TextInput
                style={[
                  styles.composerInput,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                placeholder={t('support.replyPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={replyText}
                onChangeText={setReplyText}
                multiline
              />
              <Button
                label={sending ? '...' : t('support.sendReply')}
                variant="primary"
                onPress={handleSendReply}
                disabled={sending || (!replyText.trim() && attachments.length === 0)}
              />
            </View>
          </KeyboardAvoidingView>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  headerCard: {
    margin: spacing.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messagesContent: {
    padding: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
  },
  bubbleCustomer: {
    borderBottomRightRadius: 2,
  },
  bubbleSeller: {
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  bubbleImages: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachedImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  attachmentDraftRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  draftThumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  draftThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 90,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
  },
});
