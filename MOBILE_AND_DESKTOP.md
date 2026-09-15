# Steady installable apps

The Android app and Windows companion use the existing Steady Site, so journey data and interface updates remain shared. A tagged GitHub release builds an Android APK and a Windows installer.

## First repository setup

1. Create a Firebase Android app with package name `au.com.steadytrip.app`.
2. Add the base64-encoded `google-services.json` as the GitHub Actions secret `GOOGLE_SERVICES_JSON`.
3. Add the base64-encoded Android signing key as `ANDROID_KEYSTORE`, plus `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Keep the key backed up: every update must use the same key.

## Release

Update the version in `package.json`, commit, and push a matching tag such as `v0.5.0`. GitHub Actions attaches the Android APK and Windows installer to the release. Both apps check the same release channel when opened. Android asks the user to approve installation; Windows downloads the update and offers to restart.

## Local development

- `npm run android:sync` prepares the Android Studio project.
- `npm run android:open` opens it after Android Studio is installed.
- `npm run desktop` runs the Windows companion.
- `npm run desktop:pack` creates the Windows installer.
