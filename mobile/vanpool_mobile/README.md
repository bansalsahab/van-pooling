# VanPool Mobile App

React Native mobile app for the Van Pooling Platform.

## Setup

1. Install dependencies:
```bash
cd mobile/vanpool_mobile
npm install
```

2. For iOS (macOS only):
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

3. For Android:
```bash
npx react-native run-android
```

## Project Structure

```
src/
├── api/          # API client and types
├── store/        # Zustand state management
├── screens/      # Screen components
│   ├── auth/     # Login screens
│   ├── employee/ # Employee role screens
│   ├── driver/   # Driver role screens
│   └── admin/    # Admin role screens
├── components/   # Reusable components
└── navigation/   # React Navigation setup
```

## Configuration

Update the API base URL in `src/api/backend.ts` to point to your backend server.
