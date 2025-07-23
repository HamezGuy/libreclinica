# EDC Project Setup Checklist

## ✅ Completed
- [x] Firebase API keys configured in environment files
- [x] Angular app structure with routing and guards
- [x] EDC-compliant authentication service
- [x] User profile model with compliance fields
- [x] Login component with compliance badges
- [x] Compliance setup component (terms & training)
- [x] Firestore security rules created

## 🔲 Firebase Console Setup Required

### 1. **Authentication Setup**
- [ ] Enable **Google** sign-in provider
  - [ ] Add public-facing project name
  - [ ] Add support email
- [ ] Enable **Email/Password** provider (if needed)
- [ ] Enable **Phone** provider (for SMS MFA)
- [ ] Configure authorized domains:
  - [ ] `localhost` (for development)
  - [ ] Your production domain

### 2. **Firestore Database**
- [ ] Create Firestore database in **production mode**
- [ ] Select closest region to users
- [ ] Deploy security rules:
  ```bash
  firebase deploy --only firestore:rules
  ```
- [ ] Create initial collections:
  - [ ] `users`
  - [ ] `audit_logs`
  - [ ] `auth_logs`
  - [ ] `studies`
  - [ ] `forms`
  - [ ] `compliance`

### 3. **Firebase Storage** (for file uploads)
- [ ] Enable Firebase Storage
- [ ] Set up storage security rules
- [ ] Configure CORS if needed

## 🔲 Application Setup

### 1. **Install Firebase CLI**
```bash
npm install -g firebase-tools
firebase login
firebase init
```

### 2. **Deploy Firestore Rules**
```bash
firebase deploy --only firestore:rules
```

### 3. **Create First Admin User**
After setting up authentication:
1. Sign up with Google/Email
2. Manually update user document in Firestore:
   - Set `role: 'admin'`
   - Set `status: 'ACTIVE'`
   - Set `accessLevel: 'ADMIN'`

### 4. **Test Authentication Flow**
1. Start the app: `ng serve`
2. Navigate to `http://localhost:4200`
3. Test sign-in flow
4. Complete compliance setup
5. Verify audit logs are created

## 🔲 Production Deployment

### 1. **Security Measures**
- [ ] Enable Firebase App Check
- [ ] Set up API key restrictions
- [ ] Configure CORS policies
- [ ] Enable audit log monitoring
- [ ] Set up backup procedures

### 2. **Compliance Documentation**
- [ ] Document authentication flow
- [ ] Create user training materials
- [ ] Prepare SOPs for:
  - [ ] User management
  - [ ] Password policies
  - [ ] Audit trail review
  - [ ] Data backup/recovery

### 3. **Testing & Validation**
- [ ] Test all user roles
- [ ] Verify audit trail completeness
- [ ] Test session timeout
- [ ] Validate MFA flow
- [ ] Performance testing
- [ ] Security penetration testing

## 📋 Quick Commands

```bash
# Start development server
ng serve

# Build for production
ng build --configuration production

# Deploy to Firebase Hosting
firebase deploy

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# View Firebase logs
firebase functions:log
```

## 🔐 Security Reminders

1. **Never commit environment files** with real API keys
2. **Always use HTTPS** in production
3. **Enable MFA** for all admin accounts
4. **Regular security audits** (monthly)
5. **Monitor failed login attempts**
6. **Review audit logs** regularly
7. **Update dependencies** for security patches

## 📞 Support Contacts

- Firebase Support: https://firebase.google.com/support
- Angular Issues: https://github.com/angular/angular/issues
- Security Concerns: [Your Security Team]
- Compliance Questions: [Your Compliance Officer]
