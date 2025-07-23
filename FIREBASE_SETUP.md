# Firebase Setup Instructions

To get your Angular app working with Firebase authentication, follow these steps:

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "electronic-data-capture")
4. Follow the setup wizard

## 2. Enable Authentication

1. In your Firebase project, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to the "Sign-in method" tab
4. Enable "Email/Password" authentication
5. Enable "Google" authentication and configure it with your project details

## 3. Get Your Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ and select "Project settings"
2. Scroll down to "Your apps" section
3. Click "Add app" and select "Web" (</> icon)
4. Register your app with a nickname
5. Copy the Firebase configuration object

## 4. Update Your Angular App

Replace the placeholder values in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "your-actual-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id",
    measurementId: "your-measurement-id"
  }
};
```

Do the same for `src/environments/environment.prod.ts` for production.

## 5. Set Up Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" for development (remember to secure it later)
4. Select your preferred location

## 6. Configure Firestore Security Rules

For production, update your Firestore rules to:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.accessLevel in ['SUPER_ADMIN', 'ADMIN']);
    }
    
    // Add more rules for your collections
  }
}
```

## 7. Run Your Application

```bash
npm start
```

Your app should now be running with Firebase authentication enabled!

## Important Security Notes

1. **Never commit your Firebase configuration to public repositories**
   - The `.gitignore` file has been configured to exclude environment files
   - Use `environment.example.ts` as a template for team members
   - Store production keys in secure environment variables or secret management systems

2. **API Key Restrictions**
   - Your API key is restricted to specific Firebase APIs
   - Consider adding domain restrictions for web applications
   - Regularly rotate API keys for enhanced security

3. **Environment File Management**
   - Development: `src/environments/environment.ts` (excluded from git)
   - Production: `src/environments/environment.prod.ts` (excluded from git)
   - Example: `src/environments/environment.example.ts` (safe to commit)

4. **Firestore Security Rules**
   - Never use test mode in production
   - Implement proper authentication checks
   - Use role-based access control as shown above

5. **Additional Security Measures**
   - Enable App Check for API abuse prevention
   - Set up Firebase Security Rules monitoring
   - Configure budget alerts in Google Cloud Console
   - Enable audit logging for compliance
   - Use Firebase Authentication security features (email verification, etc.)

## Features Available

- Username/Password login (uses email behind the scenes)
- Google Sign-In
- User registration with approval workflow
- Password reset functionality
- Role-based access control
- Beautiful, modern UI with Material Design inspiration
