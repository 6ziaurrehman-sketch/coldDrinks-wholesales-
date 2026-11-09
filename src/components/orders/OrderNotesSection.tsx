import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNotesStore, QUICK_NOTE_CHIPS } from '@/store/notesStore';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatDate } from '@/utils/formatDate';
import type { OrderStatus } from '@/types/orders.types';

interface OrderNotesSectionProps {
  orderId: string;
  orderStatus: OrderStatus | string;
  sellerPhone?: string | null;
  orderNumber?: number;
}

export function OrderNotesSection({
  orderId,
  orderStatus,
  sellerPhone = '+923001234567',
  orderNumber,
}: OrderNotesSectionProps) {
  const theme = useTheme();
  const isOnline = useUiStore((state) => state.isOnline);
  const { notesByOrder, loadForOrder, addNote } = useNotesStore();

  const [noteText, setNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const notes = notesByOrder[orderId] || [];

  // Order status check: only 'placed' orders allow note edits; 'confirmed' or later are locked!
  const isLocked = orderStatus !== 'placed';

  useEffect(() => {
    if (orderId) {
      void loadForOrder(orderId);
    }
  }, [orderId, loadForOrder]);

  const handleChipPress = (chipText: string) => {
    if (isLocked) return;
    setNoteText((prev) => {
      const trimmed = prev.trim();
      const next = trimmed ? `${trimmed}, ${chipText}` : chipText;
      return next.slice(0, 500);
    });
  };

  const handleTextChange = (text: string) => {
    setErrorMessage(null);
    // Enforce 500 char length limit
    setNoteText(text.slice(0, 500));
  };

  const handleSaveNote = async () => {
    const clean = noteText.trim();
    if (!clean) {
      setErrorMessage('Note cannot be empty.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('Cannot save notes while offline.');
      return;
    }

    if (isLocked) {
      setErrorMessage(t('orderNotes.noteLockedMessage'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await addNote(orderId, clean);
      setNoteText('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHelpContact = () => {
    const msg = `Hi, I need assistance with Order #${orderNumber || orderId}. Note: ${noteText}`;
    const cleanPhone = (sellerPhone || '+923001234567').replace(/[^0-9]/g, '');
    void Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <AppText variant="title">{t('orderNotes.title')}</AppText>
        {isLocked ? (
          <Badge label="Locked" tone="neutral" />
        ) : (
          <Badge label="Editable" tone="primary" />
        )}
      </View>

      {/* Locked Explanation Banner */}
      {isLocked && (
        <View style={[styles.lockedBanner, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
          <AppText variant="caption" color={theme.colors.textMuted} style={{ fontWeight: '600' }}>
            🔒 {t('orderNotes.noteLockedMessage')}
          </AppText>
          <View style={styles.contactBtnRow}>
            <Button
              label="Contact Seller on WhatsApp"
              variant="secondary"
              onPress={handleHelpContact}
            />
          </View>
        </View>
      )}

      {/* Note Input Box */}
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.textInput,
            {
              borderColor: theme.colors.border,
              backgroundColor: isLocked ? theme.colors.surfaceMuted : theme.colors.surface,
              color: theme.colors.text,
            },
          ]}
          placeholder={t('orderNotes.placeholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          numberOfLines={3}
          value={noteText}
          onChangeText={handleTextChange}
          editable={!isLocked && isOnline}
        />

        {/* Live Character Counter: X / 500 */}
        <View style={styles.counterRow}>
          {errorMessage ? (
            <AppText variant="caption" color={theme.colors.error}>
              ⚠️ {errorMessage}
            </AppText>
          ) : <View />}

          <AppText
            variant="caption"
            color={noteText.length >= 480 ? theme.colors.warning : theme.colors.textMuted}
          >
            {t('orderNotes.charCount', { count: noteText.length })}
          </AppText>
        </View>
      </View>

      {/* Quick-Pick Chips (only active when editable) */}
      {!isLocked && (
        <View style={styles.chipsSection}>
          <AppText variant="caption" color={theme.colors.textMuted} style={{ marginBottom: 6 }}>
            {t('orderNotes.quickSuggestions')}
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_NOTE_CHIPS.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => handleChipPress(chip)}
                style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}
              >
                <AppText variant="caption" color={theme.colors.text}>
                  + {chip}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.saveBtnRow}>
            <Button
              label={t('orderNotes.save')}
              variant="primary"
              loading={isSubmitting}
              disabled={!noteText.trim() || !isOnline}
              onPress={handleSaveNote}
            />
          </View>
        </View>
      )}

      {/* Saved Notes History List */}
      {notes.length > 0 && (
        <View style={[styles.notesList, { borderTopColor: theme.colors.border }]}>
          <AppText variant="subtitle" style={{ marginBottom: 8 }}>
            Instructions Log:
          </AppText>
          {notes.map((note) => (
            <View key={note.id} style={[styles.savedNoteItem, { backgroundColor: theme.colors.surfaceMuted }]}>
              <View style={styles.noteMetaRow}>
                <Badge
                  label={note.authorRole.toUpperCase()}
                  tone={note.authorRole === 'owner' ? 'primary' : 'neutral'}
                />
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {formatDate(note.createdAt, { style: 'datetime' })}
                </AppText>
              </View>
              <AppText variant="body" color={theme.colors.text} style={{ marginTop: 4 }}>
                {note.text}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  lockedBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  contactBtnRow: {
    marginTop: 8,
  },
  inputContainer: {
    width: '100%',
  },
  textInput: {
    height: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  chipsSection: {
    marginTop: 10,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  saveBtnRow: {
    marginTop: 12,
  },
  notesList: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  savedNoteItem: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  noteMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
