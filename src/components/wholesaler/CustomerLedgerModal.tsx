import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { WholesalerCustomer } from '@/types/wholesaler.types';
import { wholesalerService } from '@/lib/wholesalerService';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';

interface CustomerLedgerModalProps {
  visible: boolean;
  customer: WholesalerCustomer | null;
  onClose: () => void;
  onRecordPayment: (customer: WholesalerCustomer) => void;
}

export function CustomerLedgerModal({
  visible,
  customer,
  onClose,
  onRecordPayment,
}: CustomerLedgerModalProps) {
  const { colors, spacing } = useTheme();
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (visible && customer) {
      wholesalerService.getCustomerLedger(customer.id)
        .then((data) => {
          if (active) setLedgerEntries(data);
        })
        .catch((err: any) => {
          if (active) Alert.alert('Error', err.message || 'Failed to load customer ledger');
        });
    }
    return () => {
      active = false;
    };
  }, [visible, customer]);

  const handleRefresh = async () => {
    if (!customer) return;
    try {
      setLoading(true);
      const data = await wholesalerService.getCustomerLedger(customer.id);
      setLedgerEntries(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load customer ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleShareKhata = async () => {
    if (!customer) return;

    let text = `*LOAN KHATA STATEMENT - ${customer.name.toUpperCase()}*\n`;
    if (customer.owner_name) text += `Contact Person: ${customer.owner_name}\n`;
    if (customer.phone) text += `Phone: ${customer.phone}\n`;
    text += `Date: ${formatDate(new Date().toISOString(), { style: 'datetime' })}\n`;
    text += `Current Outstanding Balance: ${formatMoney(customer.current_balance)}\n`;
    text += `--------------------------------\n`;
    text += `*RECENT TRANSACTIONS:*\n`;

    if (ledgerEntries.length === 0) {
      text += `No transactions recorded yet.\n`;
    } else {
      ledgerEntries.slice(0, 15).forEach((entry) => {
        const dateStr = formatDate(entry.created_at, { style: 'date' });
        const typeLabel =
          entry.entry_type === 'sale'
            ? `Sale (${entry.reference_id || 'Slip'})`
            : entry.entry_type === 'payment'
            ? 'Cash Payment Received'
            : entry.entry_type === 'opening_balance'
            ? 'Opening Balance'
            : 'Adjustment';

        const amountStr =
          Number(entry.debit) > 0
            ? `+${formatMoney(entry.debit)}`
            : `-${formatMoney(entry.credit)}`;

        text += `${dateStr} | ${typeLabel}\nAmount: ${amountStr} | Balance: ${formatMoney(entry.running_balance)}\n\n`;
      });
    }

    text += `--------------------------------\n`;
    text += `*Final Amount Due: ${formatMoney(customer.current_balance)}*\n`;
    text += `Please verify this statement and clear any pending dues. Thank you!`;

    try {
      await Share.share({ message: text });
    } catch {
      // User cancelled
    }
  };

  if (!customer) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <AppText variant="title">{customer.name}</AppText>
              <AppText variant="caption" muted>
                {customer.phone || 'No phone'} {customer.address ? `• ${customer.address}` : ''}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Balance Summary Header */}
          <Card style={[styles.balanceBanner, { backgroundColor: colors.surfaceMuted }]}>
            <View>
              <AppText variant="caption" muted>Total Outstanding Loan Khata Debt</AppText>
              <AppText
                variant="title"
                style={[
                  styles.boldText,
                  customer.current_balance > 0 ? { color: colors.error } : { color: colors.success },
                ]}
              >
                {formatMoney(customer.current_balance)}
              </AppText>
            </View>

            <Button
              label="Receive Cash"
              variant="primary"
              onPress={() => {
                onClose();
                onRecordPayment(customer);
              }}
              style={{ width: 130 }}
            />
          </Card>

          {/* Transactions List */}
          <View style={styles.listHeaderRow}>
            <AppText variant="subtitle" style={styles.boldText}>
              Transaction Ledger History
            </AppText>
            <Pressable onPress={handleRefresh} hitSlop={6}>
              <Ionicons name="refresh" size={18} color={colors.primary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <AppText variant="caption" muted style={{ marginTop: 8 }}>
                Loading Loan Khata transactions...
              </AppText>
            </View>
          ) : ledgerEntries.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="newspaper-outline" size={36} color={colors.textMuted} />
              <AppText variant="caption" muted style={{ marginTop: 8 }}>
                No ledger entries for this shop yet.
              </AppText>
            </Card>
          ) : (
            <ScrollView style={styles.ledgerScroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
              {ledgerEntries.map((entry) => {
                const isDebit = Number(entry.debit) > 0;
                const isPayment = entry.entry_type === 'payment';

                return (
                  <Card key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View
                          style={[
                            styles.badge,
                            isPayment
                              ? { backgroundColor: '#e6f9f0' }
                              : { backgroundColor: '#fff1f2' },
                          ]}
                        >
                          <Ionicons
                            name={isPayment ? 'arrow-down-circle' : 'receipt-outline'}
                            size={14}
                            color={isPayment ? '#10b981' : '#f43f5e'}
                          />
                          <AppText
                            variant="caption"
                            style={{
                              marginLeft: 4,
                              fontWeight: '600',
                              color: isPayment ? '#10b981' : '#f43f5e',
                            }}
                          >
                            {(() => {
                              if (isPayment) return 'Payment Received';
                              if (entry.entry_type === 'sale') return `Sale: ${entry.reference_id || 'Slip'}`;
                              if (entry.entry_type === 'opening_balance') return 'Opening Balance';
                              return 'Adjustment';
                            })()}
                          </AppText>
                        </View>
                      </View>

                      <AppText variant="caption" muted style={{ marginTop: 4 }}>
                        {formatDate(entry.created_at, { style: 'datetime' })}
                      </AppText>
                      {entry.description && (
                        <AppText variant="caption" muted style={{ fontStyle: 'italic', marginTop: 2 }}>
                          {entry.description}
                        </AppText>
                      )}
                    </View>

                    <View style={styles.entryRight}>
                      <AppText
                        variant="subtitle"
                        style={[
                          styles.boldText,
                          isDebit ? { color: colors.error } : { color: colors.success },
                        ]}
                      >
                        {isDebit ? `+${formatMoney(entry.debit)}` : `-${formatMoney(entry.credit)}`}
                      </AppText>
                      <AppText variant="caption" muted style={{ marginTop: 2 }}>
                        Bal: {formatMoney(entry.running_balance)}
                      </AppText>
                    </View>
                  </Card>
                );
              })}
            </ScrollView>
          )}

          {/* Action Footer */}
          <View style={styles.footer}>
            <Button
              label="Share Loan Khata via WhatsApp"
              variant="secondary"
              onPress={handleShareKhata}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ledgerScroll: {
    maxHeight: 380,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  entryLeft: {
    flex: 1,
  },
  entryRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  boldText: {
    fontWeight: '700',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    marginVertical: 10,
  },
  footer: {
    marginTop: 12,
  },
});
