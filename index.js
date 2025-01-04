  require('dotenv').config();
  const express = require('express');
  const bodyParser = require('body-parser');
  const admin = require('firebase-admin');
  const path = require('path');
  const cors = require('cors');
  const axios = require('axios');
  const moment = require('moment-timezone');
  const cheerio = require('cheerio');
  const xlsx = require('xlsx');
  const fileUpload = require('express-fileupload'); 
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
  });
  const db = admin.database();
  const firestore = admin.firestore();
  const port = process.env.PORT || 3000;
  const fixed_desc = "Click to know more";
  const { v4: uuidv4 } = require('uuid'); 
  const { time } = require('console');
  const app = express();
  app.use(cors());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(fileUpload());

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
    accessToken = accessTokenResponse.token;
  }

  async function getNextChildKey() {
    const ref = firestore.collection('News_UnApproved');
    const snapshot = await ref.limit(1).get();
    try {
      const snapshot = await ref.limit(1).get();
      
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        const firstDocId = parseInt(firstDoc.id);
        return firstDocId - 1;
      } else {
        return 999;
      }
    } catch (error) {
      console.error('Error fetching next child key:', error.message);
      throw error;
    }
  }

  async function getNextChildKeySuperAdmin() {
    const ref = firestore.collection('News');
    const snapshot = await ref.limit(1).get();
    try {
      const snapshot = await ref.limit(1).get();
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        const firstDocId = parseInt(firstDoc.id);
        return firstDocId - 1;
      } else {
        return 999;
      }
    } catch (error) {
      console.error('Error fetching next child key:', error.message);
      throw error;
    }
  }
  
  async function getNextStudyChildKey() {
    const ref = firestore.collection('Ques_Data');
    try {
      const snapshot = await ref.orderBy('key_field', 'desc').limit(1).get();
      if (!snapshot.empty) {
        const lastDoc = snapshot.docs[0];
        const lastChildNumber = lastDoc.data().key_field;
        return lastChildNumber + 1;
      } else {
       return 1;
      }
    } catch (error) {
      console.error('Error fetching next child key:', error.message);
      throw error;
    }
  }
  
  ///// CHECK DUPLICATION ////////
  async function checkTitleExists(title, username) {
    let newsRef;
    try {
      if (username === "Pramod Kumar" || username === "Navjyoti Kumar") {
        newsRef = firestore.collection('News');
      } else {
        newsRef = firestore.collection('News_UnApproved');
      }
      const snapshot = await newsRef.where('title', '==', title).get();
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking title existence:', error.message);
      throw error;
    }
  }
  
  // PUBLISH TO UNAPPROVED NEWS
  async function addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, language, category) {
   
    if (await checkTitleExists(title, username)) {
      console.log('Title already exists, skipping addition.');
      return;
    }  
    let newsRef;
    try {
      if (username === "Navjyoti Kumar" || username === "Pramod Kumar") {
        newsRef = firestore.collection('News');
      } else {
        newsRef = firestore.collection('News_UnApproved');
      }
      const currentTime = getCurrentTime();
      const newsData = {
        title: title,
        desc: desc,
        newslink: newslink,
        imagelink: imagelink,
        date: currentDate,
        time: currentTime,
        lang: category,
        'Uploaded By': username,
        cat: language,
        notification_id: childKey.toString(),
      };
      await newsRef.doc(childKey.toString()).set(newsData);
      console.log('News added successfully with document ID:', childKey.toString());
    } catch (error) {
      console.error('Error adding news:', error.message);
      throw error;
    }
}
  async function addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username, language) {
    if (await checkTitleExistsCATEGORY(title, category)) {
      return;
    }
    const categoryRef = firestore.collection(category); 
    try {
      const currentTime = getCurrentTime();
      const newsData = {
        title: title,
        desc: desc,
        newslink: newslink,
        imagelink: imagelink,
        date: currentDate,
        time: currentTime,
        lang: category,
        'Uploaded By': username,
        cat: language,
        notification_id: childKey.toString(),
      };
      await categoryRef.doc(childKey.toString()).set(newsData);
    } catch (error) {
      console.error('Error adding news to category:', error.message);
      throw error;
    }
  }
  
  ////2. LANG DIRECT UPLOAD///
  async function checkTitleExistsLang(title, language) {
    try {
      const languageRef = firestore.collection(language);
      const snapshot = await languageRef.where('title', '==', title).get();
      if (!snapshot.empty) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error checking title existence:', error.message);
      throw error;
    }
  }
  
  async function addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username, category) {
    if (await checkTitleExistsLang(title, language)) {
      return;
    }
    const languageRef = firestore.collection(language); 
    try {
      const currentTime = getCurrentTime();
      const newsData = {
        title: title,
        desc: desc,
        newslink: newslink,
        imagelink: imagelink,
        date: currentDate,
        time: currentTime,
        lang: category,
        'Uploaded By': username,
        cat: language,
        notification_id: childKey.toString(),
      };
      await languageRef.doc(childKey.toString()).set(newsData);
    } catch (error) {
      console.error('Error adding news to language:', error.message);
      throw error;
    }
  }
  
  function getCurrentDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); 
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function getCurrentTime() {
  const indiaTime = moment.tz("Asia/Kolkata").format("h:mm A");
  return indiaTime;
  }

  app.post('/submit-news', async (req, res) => {
    const { title, desc, newslink, imagelink, category, language, username } = req.body;
    const currentDate = getCurrentDate();
    try {
       const titleExists = await checkTitleExists(title, username);
      if (titleExists) {
        res.send('News Already Exists!');
        return;
      }
      if (username === "Navjyoti Kumar" || username === "Pramod Kumar") {
        const childKey = await getNextChildKeySuperAdmin();
    
        await addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username, category, language);
        await addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username, category);
        await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, category, language);  
      // Send notification
      await sendNotification(title, fixed_desc, childKey, imagelink);
      } else {
        const childKey = await getNextChildKey();
        await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, category, language);
      }
      res.send('News added Successfully!');
    } catch (error) {
      console.error('Error adding news:', error.message);
      res.status(500).send('Error adding news: ' + error.message);
    }
  });
  async function getNextQuizChildKey(username) {
    try {
      let ref;
    
      if (username === "Pramod Kumar") {
        ref = firestore.collection('News');
      } else {
        ref = firestore.collection('News_UnApproved');
      }
      const snapshot = await ref.orderBy('notification_id').limit(1).get();
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        const firstChildNumber = parseInt(firstDoc.id, 10); 
        return firstChildNumber - 1;
      } else {
        return 999;
      }
    } catch (error) {
      console.error('Error fetching next quiz child key:', error.message);
      throw error;
    }
  }
  
  async function addQuizToGeneral(question, question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
    try {
      let quizzesRef;
      if (username === "Admin_1") {
        quizzesRef = firestore.collection('News');
      } else {
        quizzesRef = firestore.collection('News_UnApproved');
      }
      if (correctAnswer === "Option 1") {
        correctAnswer = question1;
      } else if (correctAnswer === "Option 2") {
        correctAnswer = question2;
      } else if (correctAnswer === "Option 3") {
        correctAnswer = question3;
      } else if (correctAnswer === "Option 4") {
        correctAnswer = question4;
      }
      const newQuizRef = quizzesRef.doc(childKey.toString());  
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
        'Ques_in_News_Enabled': 'Yes'
      });
      
    } catch (error) {
      console.error('Error adding quiz to Firestore:', error.message);
      throw error;
    }
  }
  
  app.post('/submit-quiz', async (req, res) => {
    const {question, question1, question2, question3, question4, correctAnswer, description, username } = req.body;
    const currentDate = getCurrentDate();

    try {
      const childKey = await getNextQuizChildKey();
      await addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
      res.send('Quiz added successfully');
    } catch (error) {
      console.error('Error adding quiz:', error.message);
      res.status(500).send('Error adding quiz: ' + error.message);
    }
  });

  //// ROUTE FOR HTTP NOTIFICATIONS REQUEST////
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

  const generateUniqueId = () => {
    return uuidv4();
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

  /////////BULK QUIZ UPLOAD//////////
  app.post('/uploadDailyQues', async (req, res) => {
    if (!req.files || !req.files.file) {
      return res.status(400).send('No file uploaded.');
    }
    const file = req.files.file;
    try {
      const workbook = xlsx.read(file.data, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(sheet);
      console.log('Converted JSON Data:', jsonData);
      await uploadQuizToFirebase(jsonData , res);
      res.json(jsonData);
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file.', details: error.message });
    }
  });
  async function uploadQuizToFirebase(data , res) {
    const bulkRef = firestore.collection('News')
    for (const item of data) {
      const childKey = await getNextChildKeySuperAdmin();
      if (childKey) {
        const itemRef = bulkRef.child(childKey.toString());
        item.Ques_in_News_Enabled = 'Yes'; 
        item['Uploaded By']  = 'Bulk_Upload'; 
        await itemRef.set(item);
      } else {
        console.warn('Invalid child key for item:', item);
      }
    }
    rearrangeAndUploadNewsData(res);
    console.log('Data uploaded to Firebase successfully.');
  }
  ////////////BULK STUDY DATA///////////
  app.post('/uploadStudyQues', async (req, res) => {
    if (!req.files || !req.files.file) {
      return res.status(400).send('No file uploaded.');
    }
    const file = req.files.file;
    try {
      const workbook = xlsx.read(file.data, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(sheet);

      // Process and upload each row
      for (const row of jsonData) {
        const category_bk = row['Exam/Category'];
        const subject_bk = row['Subject'];
        const section_bk = row['Section'];
        const chapter_bk = row['Chapter'];

        console.log('Category:', category_bk);
        console.log('Subject:', subject_bk);
        console.log('Section:', section_bk);
        console.log('Chapter:', chapter_bk);

        // Sanitize row before uploading
        const sanitizedRow = sanitizeKeys(row);

        // Upload each row to Firebase using these category values
        await uploadToFirebase(sanitizedRow, category_bk, subject_bk, section_bk, chapter_bk);
      }

      res.json(jsonData);
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file.', details: error.message });
    }
  });
  // Function to replace invalid characters in keys
  function sanitizeKeys(obj) {
    const sanitizedObj = {};
    for (const key in obj) {
      // Replace invalid characters with an underscore or remove them
      const sanitizedKey = key.replace(/[.#$/\[\]]/g, '_');
      sanitizedObj[sanitizedKey] = obj[key];
    }
    return sanitizedObj;
  }
  //BULK UPLOAD//
  async function uploadToFirebase(item, category_bk, subject_bk, section_bk, chapter_bk) {
    const bulkRef = db.ref('Ques_Data');

    const childKey = await getNextStudyChildKey(bulkRef);

    if (childKey) {
      const itemRef = bulkRef.child(childKey.toString());
      await itemRef.set(item);
      await RegisterKeys(item ,category_bk, subject_bk, section_bk, chapter_bk , childKey.toString());
    } else {
      console.warn('Invalid child key for item:', item);
    }
    console.log('Data uploaded to Firebase successfully.');
  }

  async function RegisterKeys(item, category_bk, subject_bk, section_bk, chapter_bk , child_key) {
    const bulkRef = db.ref('Questions_Data').child(category_bk).child(subject_bk).child(section_bk).child(chapter_bk).child(child_key);
    if (child_key) {
      await bulkRef.set({
        'ques_id' : child_key  , 
        'subject': subject_bk,
        'section': section_bk,
        'chapter': chapter_bk,
        'category': category_bk
      });
      } else {
      console.warn('Invalid child key for item:', item);
    }
  }
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  
  // 1.CAT DIRECT UPLOAD ////
  async function checkTitleExistsCATEGORY(title, category) {
    try {
      const categoryRef = firestore.collection(category); // Reference to Firestore collection
      const snapshot = await categoryRef.where("title", "==", title).get(); // Query Firestore for matching title
      
      if (!snapshot.empty) {
        return true; // Title exists
      }
      return false; // Title does not exist
    } catch (error) {
      console.error('Error checking title existence:', error.message);
      throw error;
    }
  }
  async function rearrangeAndUploadNewsData(res) {
    try {
      const snapshot = await reorderedNewsRef.once("value");
  
      const keysList = [];
      const engList = [];
      const hindiList = [];
      const yesList = [];
      const defaultNewsList = [];
  
      snapshot.forEach((childSnapshot) => {
        const quizEnabled = childSnapshot.child("Ques_in_News_Enabled").val();
        const itemData = childSnapshot.val();
        const key = childSnapshot.key;
  
        if (itemData) {
          keysList.push(key);
  
          if (quizEnabled === "Yes") {
            yesList.push(itemData);
          } else {
            const lang = childSnapshot.child("lang").val();
            if (lang === "News_Eng") {
              engList.push(itemData);
            } else if (lang === "News_Hindi") {
              hindiList.push(itemData);
            } else {
              defaultNewsList.push(itemData);
            }
          }
        } else {
          console.error("ItemData is null for snapshot:", key);
        }
      });
  
      const finalList = [];
      let engIndex = 0, hindiIndex = 0, yesIndex = 0;
  
      while (engIndex < engList.length || hindiIndex < hindiList.length || yesIndex < yesList.length) {
        if (hindiIndex < hindiList.length) finalList.push(hindiList[hindiIndex++]);
        else if (defaultNewsList.length > 0) finalList.push(defaultNewsList.shift());
  
        if (engIndex < engList.length) finalList.push(engList[engIndex++]);
        else if (defaultNewsList.length > 0) finalList.push(defaultNewsList.shift());
  
        if (hindiIndex < hindiList.length) finalList.push(hindiList[hindiIndex++]);
        else if (defaultNewsList.length > 0) finalList.push(defaultNewsList.shift());
  
        if (engIndex < engList.length) finalList.push(engList[engIndex++]);
        else if (defaultNewsList.length > 0) finalList.push(defaultNewsList.shift());
  
        if (yesIndex < yesList.length) finalList.push(yesList[yesIndex++]);
      }
  
      const totalItems = finalList.length;
      const updatePromises = finalList.map((itemData, index) => {
        const key = index < keysList.length ? keysList[index] : reorderedNewsRef.push().key;
        return reorderedNewsRef.child(key).set(itemData);
      });
  
      await Promise.all(updatePromises);
      console.log("Upload Complete");
      res.status(200).send("Rearranged and uploaded news data.");
    } catch (error) {
      console.error("Error fetching data:", error.message);
      res.status(500).send("Error fetching data.");
    }
  }
  
  app.get('/rearrange', (req, res) => {
    rearrangeAndUploadNewsData(res);
  });
  

  app.get('/rearrange', (req, res) => {
    rearrangeAndUploadNewsData(res);
  });
  
  /////
  const resetLeaderboard = async (req, res) => {
    try {
        const leaderboardRef = firestore.ref("Live_Leaderboard");
  
      // Fetch data once
      const snapshot = await leaderboardRef.once("value");
  
      if (!snapshot.exists()) {
        return res.status(404).send("No data found under Live_Leaderboard");
      }
  
      // Prepare updates for all players
      const updates = {};
      snapshot.forEach((childSnapshot) => {
        const key = childSnapshot.key;
        updates[`${key}/points`] = 0;
        updates[`${key}/attempts`] = 0;
      });
  
      // Update all children at once
      await leaderboardRef.update(updates);
      res.status(200).send("Reset complete successfully");
    } catch (error) {
      console.error("Error resetting leaderboard:", error);
      res.status(500).send("Failed to reset leaderboard");
    }
  };
    
  app.get('/reset-leaderboard', resetLeaderboard);  


const validCredentials = [
  { username: 'Kirtiman Nanda', password: 'Kirtiman_Pass' },
  { username: 'Sonam Kumari', password: 'Sonam_Pass2024' },
  { username: 'Navjyoti Kumar', password: 'Navjyoti_Pass' },
  { username: 'Pramod Kumar', password: 'pramod_edulips2024' },
];

app.post('/validate_login', async (req, res) => {
  const { username, password } = req.body;

  const user = validCredentials.find(
    (cred) => cred.username === username && cred.password === password
  );

  if (user) {
    try {
      const isValid = await checkUserCondition(username);
      if (isValid) {
        res.status(200).json({ success: true, message: 'Login successful!' });
      } else {
        res.status(401).json({ success: false, message: 'User not allowed' });
      }
    } catch (error) {
      console.error('Error checking user condition:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
});

async function checkUserCondition(username) {
  try {
    const adminDataRef = db.ref('Admin_Data');
    const snapshot = await adminDataRef.once('value');
    const adminData = snapshot.val();

    // Early exit if no data exists
    if (!adminData) {
      console.log('Admin_Data is empty.');
      return false;
    }

    // Check if the user exists with the correct status
    for (const childKey in adminData) {
      if (adminData.hasOwnProperty(childKey)) {
        const childData = adminData[childKey];
        
        // Early return if username matches and status is allowed
        if (childData.ADMIN_NAME === username &&
            (childData.ADMIN_STATUS === 'ALLOWED' || childData.ADMIN_STATUS === 'SUPER_ALLOWED')) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking user condition:', error.message);
    throw error; // Re-throw to allow the caller to handle it
  }
}

app.post('/check_user', async (req, res) => {
  const { username } = req.body;
  try {
    const adminDataRef = db.ref('Admin_Data');
    const snapshot = await adminDataRef.once('value');
    const adminData = snapshot.val();

    if (!adminData) {
      return res.status(403).json({ success: false, message: 'Access denied. No admin data found.' });
    }

    // Iterate through admin data to find the user
    for (const childKey in adminData) {
      if (adminData.hasOwnProperty(childKey)) {
        const childData = adminData[childKey];

        // Check if the username matches
        if (childData.ADMIN_NAME === username) {
          // Check the user's status
          if (childData.ADMIN_STATUS === 'ALLOWED' || childData.ADMIN_STATUS === 'SUPER_ALLOWED') {
            console.log(`Access allowed for username: ${username} with status: ${childData.ADMIN_STATUS}`);
            return res.status(200).json({ success: true, message: 'Access allowed.' });
          } else {
            console.log(`Access denied for username: ${username} with status: ${childData.ADMIN_STATUS}`);
            return res.status(403).json({ success: false, message: 'Access denied. User not allowed.' });
          }
        }
      }
    }

    // If no matching user is found
    console.log(`No match for ADMIN_NAME with username: ${username}`);
    return res.status(403).json({ success: false, message: 'Access denied. User not found.' });

  } catch (error) {
    console.error('Error checking user condition:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});


app.post('/submit-quiz', async (req, res) => {
  const {question, question1, question2, question3, question4, correctAnswer, description, username } = req.body;
  const currentDate = getCurrentDate();

  try {
    const childKey = await getNextQuizChildKey();
    await addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username);
    res.send('Quiz added successfully');
  } catch (error) {
    console.error('Error adding quiz:', error.message);
    res.status(500).send('Error adding quiz: ' + error.message);
  }
});

//// ROUTE FOR HTTP NOTIFICATIONS REQUEST////
  app.post('/notifyUser', async (req, res) => {
    const { title, fixed_desc } = req.body;

    if (!title || !fixed_desc) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await sendUserSpecificNotification(title, fixed_desc);
        res.status(200).json({ message: 'Notification sent successfully', result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  });

  const sendUserSpecificNotification = async (title, fixed_desc) => {
    const uniqueNotificationId = generateUniqueId();
    const groupKey = uuidv4();
    const message = {
      app_id: 'b184d4f9-341c-46d8-8c8f-f5863faaf3f0',
      include_player_ids: [title.trim()],
      headings: { "en": 'Enrollment Request' },
      contents: { "en": [fixed_desc] + ' wants to join with you!' },
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

//    const rdbPath = "News";
// // Function to copy data from RDB to Firestore
// async function transferData() {
//   try {
//     // Fetch data from Realtime Database
//     const rdbRef = db.ref(rdbPath);
//     const snapshot = await rdbRef.once("value");
//     const data = snapshot.val();

//     if (data) {
//       console.log(`Data fetched from Realtime Database at ${rdbPath}:`);
//       console.log(data);

//       // Loop through the data and write it to Firestore
//       const firestoreRef = firestore.collection(rdbPath); // Firestore collection name
//       const promises = [];

//       Object.keys(data).forEach((key) => {
//         // Writing each record as a document in Firestore with the same ID as in RDB
//         const docRef = firestoreRef.doc(key);
//         promises.push(docRef.set(data[key]));
//       });

//       // Wait for all writes to finish
//       await Promise.all(promises);

//       console.log("Data successfully transferred to Firestore!");
//     } else {
//       console.log("No data found at the specified Realtime Database path.");
//     }
//   } catch (error) {
//     console.error("Error transferring data:", error);
//   }
// }
// transferData()