const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');  
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
});
let accessToken = '';
const db = admin.database();
const newsRef = db.ref('News');
const quizzesRef = db.ref('News'); // Corrected to 'Quizzes'
const app = express();
const port = process.env.PORT || 3000;
const fixed_desc = "Click to know more";
const { v4: uuidv4 } = require('uuid'); 
const { time } = require('console');

// Enable CORS with default options
app.use(cors());

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session middleware (place this before initializing passport)
app.use(session({
  secret: '2008',
  resave: false,
  saveUninitialized: true,
}));

// Initialize Passport (after express-session middleware)
app.use(passport.initialize());
app.use(passport.session());


// Redirect to Google login page
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://author.edulips.com/auth/google/callback'
  
}, async (accessToken, refreshToken, profile, done) => {
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
        // If the user doesn't exist, create a new Firebase user with the Google ID as UID
        userRecord = await admin.auth().createUser({
          uid: googleId,  // Manually set the UID to Google's profile ID (string)
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

// Google Callback Route
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    res.redirect('/profile');
  }
);
// Profile route (protected)
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  // Access Firebase UID here
  const userUID = req.user.uid; // This is the Firebase UID
  res.send('<h1>Profile</h1><p>Welcome ${req.user.displayName}</p><p>User UID: ${userUID}</p><a href="/logout">Logout</a>');
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
// Middleware to serve static files (index.html, quiz.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

async function getAccessToken() {
  const serviceAccount = {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN
  };

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse.token;

  console.log('Access Token:', accessToken);
  accessToken = accessTokenResponse.token;
}


// Function to get the lowest child key under 'News' and subtract 1
async function getNextChildKey(ref) {
  try {
    const snapshot = await ref.orderByKey().limitToFirst(1).once('value');
    if (snapshot.exists()) {
      const firstKey = Object.keys(snapshot.val())[0];
      const firstChildNumber = parseInt(firstKey);
      return firstChildNumber - 1; // Subtract 1 from the first child number
    } else {
      return 999; // Default value if no children exist yet
    }
  } catch (error) {
    console.error('Error fetching next child key:', error.message);
    throw error;
  }
}
async function checkTitleExists(title) {
  try {
    const snapshot = await newsRef.once('value');
    const newsItems = snapshot.val();
    for (const key in newsItems) {
      if (newsItems.hasOwnProperty(key)) {
        const newsItem = newsItems[key];
        if (newsItem.title === title) {
          return true; // Title already exists
        }
      }
    }
    return false; // Title does not exist
  } catch (error) {
    console.error('Error checking title existence:', error.message);
    throw error;
  }
}

// Function to fetch news uploaded by same ID in last 2 hours
async function countNewsByUsernameInLastTwoHours(username) {
  try {
    // Retrieve all news items from the 'News' reference
    const snapshot = await newsRef.limitToFirst(100).once('value');
    const allNewsItems = snapshot.val();
    
    let count = 0;
    const currentDate = new Date(); // Get current date

    if (allNewsItems) {
      // Filter the news items by 'Uploaded By' field and time (within the last 2 hours) and date (current date)
      for (const key in allNewsItems) {
        if (allNewsItems.hasOwnProperty(key)) {
          const newsItem = allNewsItems[key];
          const newsUploader = newsItem['Uploaded By']; // Ensure the 'Uploaded By' field exists
          const newsTime = newsItem.time; // Ensure 'time' exists
          const newsDate = newsItem.date; // Ensure 'date' exists

          // Check if 'newsUploader' matches the username and validate 'newsTime' and 'newsDate'
          if (newsUploader && newsUploader === username && newsTime && newsDate) {
            // Parse 'newsDate' and 'newsTime' into a valid Date object
            const newsDateTime = new Date(`${newsDate} ${newsTime}`);

            // Ensure that the newsDate matches the current date and the news was uploaded within the last 2 hours
            if (isSameDate(newsDateTime, currentDate) && isWithinLastTwoHours(newsDateTime)) {
              count++;
            }
          }
        }
      }
    }

    console.log(`Number of news items uploaded by ${username} in the last 2 hours:`, count);
    return count;
  } catch (error) {
    console.error('Error counting news items by username in last 2 hours:', error.message);
    throw error;
  }
}

// Helper function to check if two dates are the same (ignoring the time)
function isSameDate(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Function to check if the news item was uploaded within the last 2 hours
function isWithinLastTwoHours(newsDateTime) {
  const currentTime = new Date();
  const diffInMilliseconds = currentTime - newsDateTime;
  const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

  return diffInHours <= 1;
}


////CHECK RESTRICTION////
async function checkRestricted(username) {
  if (username == "Admin_2" || username == "Uploader05" || username == "Admin_3" || username == "Editor01" ||username == "Admin_6"){
    return true;
  }
}
// Function to add news to the general 'News' reference
async function addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username) {
  if (await checkTitleExists(title)) {
    return;
  }
  if (await checkRestricted(username)){
    return;
  }
  const newNewsRef = newsRef.child(childKey.toString());
  const currentTime = getCurrentTime();
  await newNewsRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
    time: currentTime,
    'Uploaded By': username
  });
}

async function checkTitleExistsCATEGORY(title ,category) {
  try {
    const categoryRef = db.ref(category);
    const snapshot = await categoryRef.once('value');
    const newsItems = snapshot.val();
    for (const key in newsItems) {
      if (newsItems.hasOwnProperty(key)) {
        const newsItem = newsItems[key];
        if (newsItem.title === title) {
          return true; // Title already exists
        }
      }
    }
    return false; // Title does not exist
  } catch (error) {
    console.error('Error checking title existence:', error.message);
    throw error;
  }
}
// Function to add news to the selected category reference
async function addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username) {
  if (await checkTitleExistsCATEGORY(title , category)) {
      return;
  }
  if (await checkRestricted(username)){
    return;
  }
  const categoryRef = db.ref(category);
  const currentTime = getCurrentTime();
  const newCategoryRef = categoryRef.child(childKey.toString());
  await newCategoryRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
    time: currentTime,
    'Uploaded By': username
  });
}
async function checkTitleExistsLang(title , language) {
  try {
    const languageRef = db.ref(language);
    const snapshot = await languageRef.once('value');
    const newsItems = snapshot.val();
    for (const key in newsItems) {
      if (newsItems.hasOwnProperty(key)) {
        const newsItem = newsItems[key];
        if (newsItem.title === title) {
          return true; // Title already exists
        }
      }
    }
    return false; // Title does not exist
  } catch (error) {
    console.error('Error checking title existence:', error.message);
    throw error;
  }
}
// Function to add news to the selected language reference
async function addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username) {
  if (await checkTitleExistsLang(title, language)) {
    return;
  }
  if (await checkRestricted(username)){
    return;
  }
  const languageRef = db.ref(language);
  const newLanguageRef = languageRef.child(childKey.toString());
  const currentTime = getCurrentTime();
  await newLanguageRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
    time: currentTime,
    'Uploaded By': username
  });
}
// Function to get current date
function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
// Function to get current time
function getCurrentTime() {
  const date = new Date();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12; // convert to 12-hour format
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
const generateUniqueId = () => {
  return uuidv4(); // Generate a unique ID
};

const sendNotification = async (title, fixed_desc, childKey, imagelink) => {
  const uniqueNotificationId = generateUniqueId();
  const groupKey = uuidv4();
  const message = {
    app_id: '7627f664-3313-4277-87e6-fe121cdd20aa',
    included_segments: ['All'],
    headings: { "en": title },
    contents: { "en": fixed_desc },
    big_picture: imagelink,
    small_picture: imagelink,
    data: { 
      child_key: childKey.toString(),
    },
    android: {
      priority: "high",
    },
    android_group: uniqueNotificationId
   };
  
  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', message, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': NzkzYjkzNDAtOGU1Yi00ZGZkLWEyMWQtMmU1NzY0NjJhZTk1
      }
    });
    console.log('Notification sent successfully:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response.data);
    } else if (error.request) {
      console.error('Error request:', error.request);
    } else {
      console.error('Error message:', error.message);
    }
  }
};


app.post('/submit-news', async (req, res) => {
  const { title, desc, newslink, imagelink, category, language, username } = req.body;
  const currentDate = getCurrentDate();
  
  try {
    // Count the number of news items uploaded by this user in the last 2 hours
    const newsCount = await countNewsByUsernameInLastTwoHours(username);
    
    if (newsCount >= 10) {
      res.send('Upload limit reached');
      return;
    }
    // Fetch the next child key
    const childKey = await getNextChildKey(newsRef);

    const uniqueId = generateUniqueId();

    // Add news to the selected category reference
    await addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username,  getCurrentTime());
    
    // Add news to the Language reference
    await addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username,  getCurrentTime());
    
    const titleExists = await checkTitleExists(title);
    if (titleExists) {
      res.send('News Already Exists!');
      return;
    }
    const Admin_Restricted = await checkRestricted(username);
    if(Admin_Restricted){
      res.send('Kindly Login again')
      return;
    }
    // Add news to the general 'News' reference
    await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username,  getCurrentTime());
    // Send notification
    await sendNotification( title, fixed_desc , childKey , imagelink);  
    res.send('News added Successfully!');
  } catch (error) {
    console.error('Error adding news:', error.message);
    res.status(500).send('Error adding news: ' + error.message);
  }
});

// Function to get the lowest child key under 'Quizzes' and subtract 1
async function getNextQuizChildKey() {
  try {
    const snapshot = await quizzesRef.orderByKey().limitToFirst(1).once('value');
    if (snapshot.exists()) {
      const firstKey = Object.keys(snapshot.val())[0];
      const firstChildNumber = parseInt(firstKey);
      return firstChildNumber - 1; // Subtract 1 from the first child number
    } else {
      return 999; // Default value if no children exist yet
    }
  } catch (error) {
    console.error('Error fetching next quiz child key:', error.message);
    throw error;
  }
}

// Function to add quiz to the general 'Quizzes' reference
async function addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
  const newQuizRef = quizzesRef.child(childKey.toString());
  await newQuizRef.set({
    ques: question,
    opt1: question1,
    opt2: question2,
    opt3: question3,
    opt4: question4,
    CorrectAns: correctAnswer,
    desc_quiz: description,
    date: currentDate,
    'Uploaded By': username,
    'Ques_in_News_Enabled' : 'Yes'
  });
}
async function countNewsByUsername(username) {
  try {
    // Query the "News" reference to find all nodes where "Uploaded By" equals the username
    const snapshot = await newsRef.orderByChild('Uploaded By').equalTo(username).once('value');

    // Count the number of matching children
    const count = snapshot.numChildren();

    console.log(`Number of news items uploaded by ${username}:`, count);
    return count;
  } catch (error) {
    console.error('Error counting news items by username:', error.message);
    throw error;
  }
}

app.get('/count-news', async (req, res) => {
  const username = req.query.username; // Get the username from query parameters

  try {
    const newsCount = await countNewsByUsername(username);
    res.send(`Number of news items uploaded by ${username}: ${newsCount}`);
  } catch (error) {
    console.error('Error counting news items by username:', error.message);
    res.status(500).send('Error counting news items: ' + error.message);
  }
});


// Route to submit quizzes
app.post('/submit-quiz', async (req, res) => {
  const {question, question1, question2, question3, question4, correctAnswer, description, username } = req.body;
  const currentDate = getCurrentDate();

  try {
    // Fetch the next child key for quizzes
    const childKey = await getNextQuizChildKey();

    // Add quiz to the general 'Quizzes' reference
    await addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    res.send('Quiz added successfully');
  } catch (error) {
    console.error('Error adding quiz:', error.message);
    res.status(500).send('Error adding quiz: ' + error.message);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
