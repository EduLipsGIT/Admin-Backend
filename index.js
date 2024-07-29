const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
});

const db = admin.database();
const newsRef = db.ref('News');
const quizzesRef = db.ref('News'); // Assuming 'Quizzes' as the node for quiz submissions

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS with default options
app.use(cors());

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve login.html as the default landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Middleware to serve static files (login.html, index.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Function to get the lowest child key under 'News' and subtract 1
async function getNextNewsChildKey() {
  try {
    const snapshot = await newsRef.orderByKey().limitToFirst(1).once('value');
    if (snapshot.exists()) {
      const firstKey = Object.keys(snapshot.val())[0];
      const firstChildNumber = parseInt(firstKey);
      return firstChildNumber - 1; // Subtract 1 from the first child number
    } else {
      return 999; // Default value if no children exist yet
    }
  } catch (error) {
    console.error('Error fetching next news child key:', error.message);
    throw error;
  }
}

// Endpoint to submit news
app.post('/submit-news', async (req, res) => {
  const { title, desc, newslink, imagelink } = req.body;

  try {
    // Fetch the next child key and use it
    const childName = await getNextNewsChildKey();
    const newNewsRef = newsRef.child(childName.toString());
    await newNewsRef.set({
      title: title,
      desc: desc,
      newslink: newslink,
      imagelink: imagelink
    });
    res.send('News added successfully!');
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

// Endpoint to submit quiz
app.post('/submit-quiz', async (req, res) => {
  const { question, question1, question2, question3, question4, correctAnswer, description } = req.body;

  try {
    // Fetch the next child key and use it
    const childName = await getNextQuizChildKey();
    const newQuizRef = quizzesRef.child(childName.toString());
    await newQuizRef.set({
      ques: question,
      opt1: question1,
      opt2: question2,
      opt3: question3,
      opt4: question4,
      CorrectAns: correctAnswer,
      desc_quiz: description,
      Ques_in_News_Enabled: "Yes"
    });
    res.send('Quiz added successfully!'); 
  } catch (error) {
    console.error('Error adding quiz:', error.message);
    res.status(500).send('Error adding quiz: ' + error.message);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
