const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');  
const session = require('express-session');

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
const newsRef = db.ref('News_UnApproved');
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
////CHECK RESTRICTION////
async function checkRestricted(username) {
  if (username == "Admin_2" || username == "Uploader05" || username == "Admin_3" || username == "Editor01" ||username == "Admin_6"){
    return true;
  }
}
// Function to add news to the general 'News' reference
async function addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username , language , category) {
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
    'lang' : category  , 
    'Uploaded By': username,
    'cat': language
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
    'Uploaded By': username,
    'lang': language
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
    app_id: 'b184d4f9-341c-46d8-8c8f-f5863faaf3f0',
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
        'Authorization': `ZjY3ZDExNjAtOGVkZC00NjFiLThmOTEtODU5YWIxY2I0NDUy`
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
    // Fetch the next child key
    const childKey = await getNextChildKey(newsRef);

    const uniqueId = generateUniqueId();

    // Add news to the selected category reference
   /// await addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username,  getCurrentTime());
    
    // Add news to the Language reference
  //  await addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username,  getCurrentTime());
    
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
    await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, category , language , getCurrentTime());
    
    // Send notification
   //await sendNotification( title, fixed_desc , childKey , imagelink);  
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
// Function to add quiz to the general 'Quizzes' reference
async function addQuizToLang_HINDI(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
  const quizzesRef_Hindi = db.ref('News_Hindi'); // Corrected to 'Quizzes'
  const newQuizRef = quizzesRef_Hindi.child(childKey.toString());
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
// Function to add quiz to the general 'Quizzes' reference
async function addQuizToLang_ENG(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
  const quizzesRef_Eng = db.ref('News_Eng'); // Corrected to 'Quizzes'
  const newQuizRef = quizzesRef_Eng.child(childKey.toString());
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
    // Add quiz to the GENERAL 
    await addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    // Add quiz to the Hindi
    await addQuizToLang_HINDI(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    // Add quiz to the ENG
    await addQuizToLang_ENG(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    res.send('Quiz added successfully');
  } catch (error) {
    console.error('Error adding quiz:', error.message);
    res.status(500).send('Error adding quiz: ' + error.message);
  }
});

// Route to submit quizzes
app.post('/notify', async (req, res) => {
  const { title, fixed_desc, childKey, imagelink } = req.body;

  if (!title || !fixed_desc || !childKey || !imagelink) {
      return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
      const result = await sendNotification(title, fixed_desc, childKey, imagelink);
      res.status(200).json({ message: 'Notification sent successfully', result });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
