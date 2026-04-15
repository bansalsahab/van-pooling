import React from 'react';
import { ActivityIndicator, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, typography } from '../theme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ 
  size = 'large', 
  color = colors.primary, 
  text,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const content = (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={styles.text}>{text}</Text>}
    </View>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return content;
}

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorDisplay({ message, onRetry, compact = false }: ErrorDisplayProps) {
  if (compact) {
    return (
      <View style={styles.compactError}>
        <Ionicons name="alert-circle" size={16} color={colors.danger} />
        <Text style={styles.compactErrorText}>{message}</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.errorCard}>
      <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color={colors.white} />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ 
  icon = 'folder-open-outline', 
  title, 
  message, 
  actionLabel,
  onAction 
}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionButton} onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: object;
}

export function Skeleton({ 
  width = '100%', 
  height = 20, 
  radius = borderRadius.sm,
  style 
}: SkeletonProps) {
  return (
    <View 
      style={[
        styles.skeleton, 
        { width, height, borderRadius: radius },
        style
      ]} 
    />
  );
}

interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
}

export function LoadingOverlay({ visible, text }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.overlayContent}>
        <ActivityIndicator size="large" color={colors.white} />
        {text && <Text style={styles.overlayText}>{text}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  text: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
  },
  errorTitle: {
    ...typography.label,
    color: colors.dangerLight,
    fontSize: 16,
  },
  errorMessage: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  compactError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  compactErrorText: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.dangerLight,
  },
  retryText: {
    ...typography.label,
    color: colors.danger,
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  actionButtonText: {
    ...typography.button,
    color: colors.white,
  },
  skeleton: {
    backgroundColor: colors.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  overlayContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  overlayText: {
    ...typography.body,
    color: colors.white,
  },
});
