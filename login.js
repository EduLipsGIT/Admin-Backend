const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const admin = require('firebase-admin');
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
});

// Session middleware
app.use(session({
  secret: '2008',
  resave: false,
  saveUninitialized: true,
}));
app.use(cors());
// Initialize Passport
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, 
async (accessToken, refreshToken, profile, done) => {
  try {
    // Use Google profile.id as UID (this is a string)
    const googleId = profile.id; // This is the Google ID (string)
    const email = profile.emails[0].value;
    const displayName = profile.displayName;

    // Try to get the user by email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log('User already exists:', userRecord.uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
       
        userRecord = await admin.auth().createUser({
          uid: googleId,  
          email: email,
          displayName: displayName,
        });
        console.log('New Firebase user created with UID:', userRecord.uid);
      } else {
        throw error;
      }
    }

    // Continue to save in Firebase Realtime Database if needed
    const db = admin.database();
    const userRef = db.ref('Admin_Data/' + userRecord.uid);

    // Check if the user exists in the database
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      // If user doesn't exist, create a new entry
      await userRef.set({
        ADMIN_NAME: displayName,
        ADMIN_EMAIL: email,
        ADMIN_STATUS: "PENDING"
      });
      console.log(`User with Firebase UID ${userRecord.uid} created in the database.`);
    } else {
      console.log(`User with Firebase UID ${userRecord.uid} already exists in the database.`);
    }

    return done(null, userRecord);
  } catch (error) {
    console.error('Error during authentication:', error);
    return done(error, null);
  }
}));

// Serialize user information into session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user information from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/authorization.html'); // Serve the HTML file
});

app.get('/auth/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    try {
      // Access Firebase UID here
      const userUID = req.user.uid; // This is the Firebase UID
      
      // Check the user's status in the database
      const db = admin.database();
      const userRef = db.ref('Admin_Data/' + userUID);
      const snapshot = await userRef.once('value');
      
      if (snapshot.exists()) {
        const userData = snapshot.val();
        const adminStatus = userData.ADMIN_STATUS;

        // Check if ADMIN_STATUS is "Allowed"
        if (adminStatus === "Allowed") {
          // Successful authentication and user is allowed, redirect to profile page
          return res.redirect('/profile');
        } else {
          // Redirect to another page if status is not "Allowed"
          return res.redirect('/account_status'); // Change to your actual page
        }
      } else {
        // User does not exist in the database
        return res.redirect('/not-allowed'); // Change to your actual page
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
      return res.redirect('/error'); // Handle the error case appropriately
    }
  }
);

// Profile route (protected)
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  // Access Firebase UID here
  const userUID = req.user.uid; // This is the Firebase UID
  res.send(`<h1>Profile</h1><p>Welcome ${req.user.displayName}</p><p>User UID: ${userUID}</p><a href="/logout">Logout</a>`);
});

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
