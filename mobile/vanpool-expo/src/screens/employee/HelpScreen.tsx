import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Linking 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const FAQ_ITEMS = [
  {
    question: 'How do I book a ride?',
    answer: 'Go to the Home screen and tap "Book Ride". Enter your pickup and destination addresses, select your preferred time, and submit your request. You\'ll receive a notification when your ride is confirmed.',
  },
  {
    question: 'Can I cancel a ride?',
    answer: 'Yes, you can cancel an active ride from the Track Ride screen while it is still before pickup. Cancellation may be restricted after pickup starts.',
  },
  {
    question: 'How do I set up recurring rides?',
    answer: 'Navigate to the Recurring Rides screen from the menu. You can create a schedule with your preferred pickup times and weekdays. The system will automatically book rides for you based on your schedule.',
  },
  {
    question: 'What if my driver is late?',
    answer: 'You can track your driver\'s location in real-time on the Home screen. If there are significant delays, you\'ll receive a notification. Contact support if the delay exceeds 15 minutes.',
  },
  {
    question: 'How do I update my saved locations?',
    answer: 'Go to Saved Locations from the menu. You can update your home address, office location, or any other frequently used addresses. Use the geocode feature to automatically get coordinates.',
  },
  {
    question: 'How do notifications work?',
    answer: 'You\'ll receive push notifications for ride confirmations, driver arrivals, trip completions, and important updates. You can manage notification preferences in your Profile settings.',
  },
];

const SUPPORT_EMAIL = 'support@vanpool.com';
const SUPPORT_PHONE = '+1-800-VAN-POOL';

export default function HelpScreen() {
  const handleEmailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Van Pooling Support Request`);
  };

  const handleCallSupport = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE.replace(/-/g, '')}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Help & Support</Text>
          <Text style={styles.subtitle}>Find answers to common questions</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionCard} onPress={handleEmailSupport}>
            <View style={[styles.actionIcon, { backgroundColor: '#06C16720' }]}>
              <Ionicons name="mail" size={24} color="#06C167" />
            </View>
            <Text style={styles.actionTitle}>Email Support</Text>
            <Text style={styles.actionText}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={handleCallSupport}>
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="call" size={24} color="#3B82F6" />
            </View>
            <Text style={styles.actionTitle}>Call Us</Text>
            <Text style={styles.actionText}>{SUPPORT_PHONE}</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        
        {FAQ_ITEMS.map((item, index) => (
          <View key={index} style={styles.faqCard}>
            <View style={styles.faqHeader}>
              <Ionicons name="help-circle" size={20} color="#06C167" />
              <Text style={styles.faqQuestion}>{item.question}</Text>
            </View>
            <Text style={styles.faqAnswer}>{item.answer}</Text>
          </View>
        ))}

        {/* Additional Resources */}
        <Text style={styles.sectionTitle}>Additional Resources</Text>
        
        <View style={styles.resourcesList}>
          <TouchableOpacity style={styles.resourceItem}>
            <View style={styles.resourceIcon}>
              <Ionicons name="document-text" size={20} color="#666" />
            </View>
            <View style={styles.resourceInfo}>
              <Text style={styles.resourceTitle}>Terms of Service</Text>
              <Text style={styles.resourceText}>Read our terms and conditions</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#444" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.resourceItem}>
            <View style={styles.resourceIcon}>
              <Ionicons name="shield-checkmark" size={20} color="#666" />
            </View>
            <View style={styles.resourceInfo}>
              <Text style={styles.resourceTitle}>Privacy Policy</Text>
              <Text style={styles.resourceText}>How we handle your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#444" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.resourceItem}>
            <View style={styles.resourceIcon}>
              <Ionicons name="information-circle" size={20} color="#666" />
            </View>
            <View style={styles.resourceInfo}>
              <Text style={styles.resourceTitle}>About Van Pooling</Text>
              <Text style={styles.resourceText}>Learn more about our service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#444" />
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>Van Pooling Platform v1.0.0</Text>
          <Text style={styles.copyrightText}>(c) 2024 Van Pooling Inc.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    fontSize: 16,
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  faqCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  faqQuestion: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  faqAnswer: {
    color: '#999',
    fontSize: 14,
    lineHeight: 22,
    paddingLeft: 30,
  },
  resourcesList: {
    backgroundColor: '#141414',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#222',
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  resourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  resourceText: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  versionInfo: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionText: {
    color: '#444',
    fontSize: 14,
  },
  copyrightText: {
    color: '#333',
    fontSize: 12,
    marginTop: 4,
  },
});
