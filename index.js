const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');  

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

// Enable CORS with default options
app.use(cors());

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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

// Function to add news to the general 'News' reference
async function addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username) {
  const newNewsRef = newsRef.child(childKey.toString());
  await newNewsRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
    'Uploaded By': username
  });
}

// Function to add news to the selected category reference
async function addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username) {
  const categoryRef = db.ref(category);
  const newCategoryRef = categoryRef.child(childKey.toString());
  await newCategoryRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
    'Uploaded By': username
  });
}

// Function to add news to the selected language reference
async function addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username) {
  const languageRef = db.ref(language);
  const newLanguageRef = languageRef.child(childKey.toString());
  await newLanguageRef.set({
    title: title,
    desc: desc,
    newslink: newslink,
    imagelink: imagelink,
    date: currentDate,
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
// Function to send FCM
const sendNotification = async ( title, fixed_desc, childKey , imagelink) => {
  const message = {
    topic : "edulips",
    notification: {
      title: title,
      body: fixed_desc,
      image: imagelink
    },
    data: {
      child_key: childKey.toString() 
    },
    android: {
      priority: "high"
    },
    apns: {
      payload: {
        aps: {
          badge: 42
        }
      }
    }
  };

  try {
    await admin.messaging().send(message);
    console.log('Notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
};

app.post('/submit-news', async (req, res) => {
  const { title, desc, newslink, imagelink, category, language, username } = req.body;
  const currentDate = getCurrentDate();

  try {
    // Fetch the next child key
    const childKey = await getNextChildKey(newsRef);
    
    // Add news to the selected category reference
    await addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username);
    
    // Add news to the general 'News' reference
    await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username);

    // Send notification
    await sendNotification( title, fixed_desc , childKey , imagelink);
    
    // Add news to the Language reference
    await addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username);
    
    res.send('News added successfully');
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
async function addQuizToGeneral(question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
  const newQuizRef = quizzesRef.child(childKey.toString());
  await newQuizRef.set({
    question1: question1,
    question2: question2,
    question3: question3,
    question4: question4,
    correctAnswer: correctAnswer,
    description: description,
    date: currentDate,
    'Uploaded By': username,
    'Ques_in_News_Enabled' : 'Yes'
  });
}

// Route to submit quizzes
app.post('/submit-quiz', async (req, res) => {
  const { question1, question2, question3, question4, correctAnswer, description, username } = req.body;
  const currentDate = getCurrentDate();

  try {
    // Fetch the next child key for quizzes
    const childKey = await getNextQuizChildKey();

    // Add quiz to the general 'Quizzes' reference
    await addQuizToGeneral(question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    
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
