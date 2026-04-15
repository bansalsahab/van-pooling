import { StyleSheet, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  primary: '#00B4D8',
  primaryDark: '#0096B4',
  primaryLight: '#33C4E1',
  
  success: '#1D9E75',
  successLight: '#2EB68A',
  
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  
  danger: '#EF4444',
  dangerLight: '#F87171',
  
  background: '#0D1B2A',
  surface: '#1A2E45',
  surfaceLight: '#223F5F',
  
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDisabled: '#475569',
  
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
  borderFocused: 'rgba(0,180,216,0.5)',
  
  overlay: 'rgba(2,6,23,0.72)',
  
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const typography = {
  title: {
    fontSize: 26,
    fontWeight: '700' as TextStyle['fontWeight'],
    color: colors.text,
  },
  titleLarge: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: colors.textSecondary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: colors.text,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: colors.textSecondary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as TextStyle['fontWeight'],
    color: colors.text,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: colors.textMuted,
  },
  button: {
    fontSize: 15,
    fontWeight: '600' as TextStyle['fontWeight'],
    color: colors.white,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  surface: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  surfaceLight: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.borderFocused,
  },
  button: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.md,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyStateTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: spacing.md,
    margin: spacing.lg,
  },
  errorText: {
    color: colors.dangerLight,
    fontSize: 14,
  },
});

export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  switch (statusLower) {
    case 'completed':
    case 'completed_by_employee':
    case 'dropped_off':
      return colors.success;
    case 'active':
    case 'in_progress':
    case 'on_trip':
    case 'active_to_pickup':
      return colors.primary;
    case 'matched':
    case 'driver_en_route':
    case 'arrived_at_pickup':
    case 'in_transit':
    case 'available':
      return colors.successLight;
    case 'requested':
    case 'matching':
    case 'scheduled_requested':
    case 'scheduled_queued':
      return colors.warning;
    case 'cancelled':
    case 'cancelled_by_employee':
    case 'cancelled_by_admin':
    case 'failed_operational_issue':
    case 'no_show':
    case 'offline':
      return colors.danger;
    case 'maintenance':
    case 'suspended':
      return colors.warning;
    default:
      return colors.textMuted;
  }
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
