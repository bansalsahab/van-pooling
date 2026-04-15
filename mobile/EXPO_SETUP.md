# VanPool Mobile - Expo Setup Instructions

## Prerequisites
1. Node.js 18+ installed
2. Install Expo Go app on your phone:
   - [Android Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)

## Quick Start

### Step 1: Create the Expo project

Open a terminal and run:

```bash
cd "c:\Users\Parth bansal\Desktop\van-pooling-platform\mobile"
npx create-expo-app vanpool-expo -t expo-template-blank-typescript
cd vanpool-expo
```

### Step 2: Install dependencies

```bash
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install zustand @tanstack/react-query
npm install expo-secure-store
npm install @expo/vector-icons
```

### Step 3: Copy the source files

Copy all files from the sections below into your project, creating the folder structure:

```
vanpool-expo/
├── App.tsx (replace the existing one)
├── src/
│   ├── api/
│   │   ├── types.ts
│   │   └── backend.ts
│   ├── store/
│   │   └── authStore.ts
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── employee/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── BookRideScreen.tsx
│   │   │   ├── HistoryScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   ├── driver/
│   │   │   ├── ConsoleScreen.tsx
│   │   │   ├── ShiftsScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   └── admin/
│   │       ├── DashboardScreen.tsx
│   │       └── SettingsScreen.tsx
│   └── navigation/
│       ├── RootNavigator.tsx
│       ├── EmployeeTabs.tsx
│       ├── DriverTabs.tsx
│       └── AdminTabs.tsx
```

### Step 4: Update API URL

In `src/api/backend.ts`, update the API_BASE_URL:
- Find your computer's IP address (run `ipconfig` on Windows)
- Replace `YOUR_IP` with your actual IP

### Step 5: Start the app

```bash
npx expo start
```

### Step 6: Run on your phone

1. Make sure your phone and computer are on the same WiFi network
2. Scan the QR code with:
   - iOS: Camera app
   - Android: Expo Go app
3. The app will load on your phone!

---

## Troubleshooting

### "Network request failed"
- Make sure your phone and computer are on the same WiFi
- Check that the backend server is running
- Verify the IP address in backend.ts

### "Unable to connect"
- Try using tunnel mode: `npx expo start --tunnel`
- Install ngrok: `npm install -g @expo/ngrok`

### Metro bundler issues
- Clear cache: `npx expo start -c`
