# 🎸 GuitarWiter - Guitar-to-Keyboard Input System

**Real-time pitch detection powered by TunerPro algorithm with zero-delay keyboard input**

## 🚀 Features

- **TunerPro Pitch Detection**: Accurate, low-latency pitch recognition
- **Zero-Delay Typing**: Instant keyboard input response
- **Gboard-like UI**: Responsive, modern keyboard interface
- **Hold-to-Delete**: Long-press acceleration for faster deletion
- **Cross-App Compatible**: Works with any application
- **Performance Optimized**: Service Worker, debouncing, GPU acceleration
- **Mobile Responsive**: Touch-optimized interface
- **Multi-language Support**: Indonesian & English
- **Offline Support**: Service Worker caching

## 📋 Tech Stack

- **Frontend**: React 18 + Tailwind CSS
- **Audio Processing**: Web Audio API + TunerPro Algorithm
- **State Management**: Redux Toolkit
- **Mobile**: Capacitor (Android)
- **Performance**: Service Worker, IndexedDB caching
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library

## 📁 Project Structure

```
guitarwiter/
├── src/
│   ├── components/
│   │   ├── Keyboard.tsx           # Virtual keyboard UI
│   │   ├── PitchDetector.tsx       # Pitch detection controls
│   │   ├── InputDisplay.tsx        # Text display
│   │   └── PerformanceMonitor.tsx  # Performance metrics
│   ├── services/
│   │   ├── audioService.ts         # Audio capture
│   │   ├── pitchDetection.ts       # TunerPro algorithm
│   │   ├── keyboardInput.ts        # Keyboard handling
│   │   └── performanceOptimizer.ts # Performance optimization
│   ├── hooks/
│   │   ├── useAudio.ts             # Audio hook
│   │   ├── usePitchDetection.ts    # Pitch detection hook
│   │   └── usePerformance.ts       # Performance hook
│   ├── store/
│   │   ├── appSlice.ts             # Redux state
│   │   └── index.ts                # Store config
│   ├── styles/
│   │   └── globals.css             # Global styles
│   ├── App.tsx                     # Main component
│   └── main.tsx                    # Entry point
├── www/                            # Alternative Gboard keyboard (Indonesian)
├── .github/workflows/
│   └── build-apk.yml               # Automatic APK building
├── public/
│   └── service-worker.js           # Service worker
├── capacitor.config.json           # Capacitor config
├── vite.config.ts                  # Vite config
├── tsconfig.json                   # TypeScript config
├── tailwind.config.js              # Tailwind config
└── package.json                    # Dependencies

```

## 🔧 Installation & Setup

### 1. Clone Repository
```bash
git clone https://github.com/greeneryvilaofficial/guitarwiter.git
cd guitarwiter
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Development Server
```bash
npm run dev
```
Open http://localhost:5173 in your browser

### 4. Build Web Assets
```bash
npm run build
```

## 🤖 Building APK

### Automatic Build (GitHub Actions)
Every push to `main` branch automatically builds APK and creates a release.
- Download from **Releases** tab
- Or from **Actions** → Build logs → Artifacts

### Manual Build (Local)

**Prerequisites:**
- Android Studio or Android SDK
- Java JDK 17+
- Gradle

**Steps:**

```bash
# Initialize Capacitor (first time only)
npm run capacitor:init

# Add Android platform (first time only)
npm run capacitor:add-android

# Build APK
npm run build-apk

# Debug APK: android/app/build/outputs/apk/debug/app-debug.apk
# Release APK: android/app/build/outputs/apk/release/app-release.apk
```

### Detailed Build Process

```bash
# 1. Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Build web assets
npm run build

# 3. Initialize Capacitor
npx cap init guitarwiter com.greeneryvilla.guitarwiter --web-dir dist

# 4. Add Android
npx cap add android

# 5. Sync files
npx cap sync

# 6. Build Debug APK
cd android && ./gradlew assembleDebug

# 7. Build Release APK
cd android && ./gradlew assembleRelease
```

## 📱 Installation on Android Device

```bash
# Connect device via USB (enable USB Debugging)
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or open `android/` in Android Studio and click Run.

## ⚙️ Required Permissions

The app requires these Android permissions:
- `RECORD_AUDIO` - For microphone access (pitch detection)
- `INTERNET` - For web features
- `ACCESS_NETWORK_STATE` - For connectivity check

These are automatically included in the build.

## 🎤 How It Works

1. **Microphone Capture**: Captures audio from guitar via Web Audio API
2. **Pitch Detection**: TunerPro algorithm detects note frequency
3. **MIDI Mapping**: Converts frequency to MIDI note number
4. **Keyboard Mapping**: Maps MIDI note to keyboard character
5. **Input Injection**: Types character into active field

## 📚 Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Pitch Detection Algorithm](./docs/PITCH_DETECTION.md)
- [Performance Optimization](./docs/PERFORMANCE.md)
- [API Reference](./docs/API.md)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

MIT License - See LICENSE file for details

## 🙋 Support

- Report issues: [GitHub Issues](https://github.com/greeneryvilaofficial/guitarwiter/issues)
- Ask questions: [GitHub Discussions](https://github.com/greeneryvilaofficial/guitarwiter/discussions)

## 🎵 Credits

**Made with ❤️ by Greeneryvilla**

- TunerPro Algorithm - Real-time pitch detection
- Capacitor - Cross-platform mobile development
- React 18 - UI framework
- Web Audio API - Audio processing

---

**Version**: 2.0.0  
**Last Updated**: 2026
**Status**: Production Ready ✅
