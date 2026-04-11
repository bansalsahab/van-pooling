import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';

import { backend } from '../../api/backend';
import { useAuthStore } from '../../store/authStore';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const ROLE_TITLE: Record<'employee' | 'driver' | 'admin', string> = {
  employee: 'Employee Copilot',
  driver: 'Driver Copilot',
  admin: 'Admin Copilot',
};

const ROLE_PLACEHOLDER: Record<'employee' | 'driver' | 'admin', string> = {
  employee: 'Ask about ETA changes, ride status, or next steps',
  driver: 'Ask about next stop, delays, or no-show handling',
  admin: 'Ask about fleet pressure, alerts, or reassignment',
};

export default function CopilotScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const role = user?.role ?? 'employee';
  const title = ROLE_TITLE[role];
  const inputPlaceholder = ROLE_PLACEHOLDER[role];

  const briefQuery = useQuery({
    queryKey: ['copilot', role, 'brief'],
    queryFn: () => backend.getCopilotBrief(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30000,
  });

  const askMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        throw new Error('Type a question for copilot.');
      }
      const reply = await backend.askCopilot(accessToken!, trimmed);
      return { prompt: trimmed, reply };
    },
    onSuccess: ({ prompt, reply }) => {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-user`, role: 'user', text: prompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: reply.answer },
      ]);
      setQuestion('');
    },
    onError: (error) => {
      Alert.alert('Copilot unavailable', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const quickPrompts = useMemo(
    () => briefQuery.data?.quick_prompts?.slice(0, 4) ?? [],
    [briefQuery.data?.quick_prompts],
  );

  const handlePromptSend = (value?: string) => {
    const prompt = (value ?? question).trim();
    if (!prompt || askMutation.isPending) {
      return;
    }
    askMutation.mutate(prompt);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>AI guidance for live operations.</Text>
          </View>
          <View style={styles.badge}>
            <View
              style={[
                styles.dot,
                { backgroundColor: briefQuery.data?.generated_by === 'openai' ? '#1D9E75' : '#F59E0B' },
              ]}
            />
            <Text style={styles.badgeText}>
              {briefQuery.data?.generated_by === 'openai' ? 'OpenAI' : 'Fallback'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          {briefQuery.isLoading ? (
            <ActivityIndicator color="#00B4D8" />
          ) : (
            <>
              <Text style={styles.summaryHeadline}>
                {briefQuery.data?.headline || 'Copilot is ready.'}
              </Text>
              <Text style={styles.summaryBody}>
                {briefQuery.data?.summary || 'Ask a question to get operational recommendations.'}
              </Text>
              {briefQuery.data?.recommended_actions?.slice(0, 2).map((action) => (
                <Text key={action} style={styles.recommendation}>
                  {'\u2022'} {action}
                </Text>
              ))}
            </>
          )}
        </View>

        {quickPrompts.length > 0 && (
          <View style={styles.quickPrompts}>
            {quickPrompts.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.quickPromptChip}
                onPress={() => handlePromptSend(prompt)}
                disabled={askMutation.isPending}
              >
                <Text style={styles.quickPromptText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.chatCard}>
          <Text style={styles.chatTitle}>Conversation</Text>
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>No messages yet. Start by asking copilot a question.</Text>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text style={styles.messageLabel}>
                  {message.role === 'user' ? 'You' : 'Copilot'}
                </Text>
                <Text style={styles.messageText}>{message.text}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder={inputPlaceholder}
          placeholderTextColor="#64748B"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!question.trim() || askMutation.isPending) && styles.sendButtonDisabled]}
          onPress={() => handlePromptSend()}
          disabled={!question.trim() || askMutation.isPending}
        >
          {askMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#E2E8F0',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    marginTop: 4,
    fontSize: 13,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  summaryHeadline: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryBody: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
  },
  recommendation: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
  },
  quickPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickPromptChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,180,216,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.35)',
  },
  quickPromptText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '600',
  },
  chatCard: {
    backgroundColor: '#1A2E45',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 10,
  },
  chatTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  messageBubble: {
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  userBubble: {
    backgroundColor: '#0F2135',
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.3)',
  },
  assistantBubble: {
    backgroundColor: '#172C43',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  messageLabel: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
  },
  inputWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderRadius: 12,
    backgroundColor: '#1A2E45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#00B4D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
