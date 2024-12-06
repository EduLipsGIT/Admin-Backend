  const express = require('express');
  const bodyParser = require('body-parser');
  const admin = require('firebase-admin');
  const path = require('path');
  const cors = require('cors');
  const axios = require('axios');
  require('dotenv').config();
  const { GoogleAuth } = require('google-auth-library');  
  const moment = require('moment-timezone');
  const cheerio = require('cheerio');
  const GOOGLE_API_KEY = 'AIzaSyDzM70IvTmqcS9M5PC5Tg4tmder3U5fQnY';
  const GOOGLE_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';


  const xlsx = require('xlsx');
  const fileUpload = require('express-fileupload'); 
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
  const bulkRef = db.ref('News_UnApproved');
  const reorderedNewsRef = db.ref("News");
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

  ///CHILD CALCULATION///
  async function getNextChildKey(username) {
    try {
      let ref;
      if(username == "Admin_1"){
      ref = db.ref('News');
      }else{
      ref = db.ref('News_UnApproved');
      }
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
  async function getNextStudyChildKey() {
    try {
      let ref;
      ref = db.ref('Ques_Data');
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

  ///// CHECK DUPLICATION ////////
  async function checkTitleExists(title , username) {
    try {
      let newsRef;
      if(username == "Admin_1"){
      newsRef = db.ref('News');
      }else{
      newsRef = db.ref('News_UnApproved');
      }
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

  // PUBLISH TO UNAPPROVED NEWS
  async function addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username , language , category) {
    if (await checkTitleExists(title)) {
      return;
    }
    if (await checkRestricted(username)){
      return;
    }
    let newsRef;
    if(username == "Admin_1"){
    newsRef = db.ref('News');
    }else{
    newsRef = db.ref('News_UnApproved');
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
  const indiaTime = moment.tz("Asia/Kolkata").format("h:mm A");
  return indiaTime;
  }

  app.post('/submit-news', async (req, res) => {
    const { title, desc, newslink, imagelink, category, language, username } = req.body;
    const currentDate = getCurrentDate();
    try {
      const childKey = await getNextChildKey(username);
      const uniqueId = generateUniqueId();
      const titleExists = await checkTitleExists(title , username);
      if (titleExists) {
        res.send('News Already Exists!');
        return;
      }
      const Admin_Restricted = await checkRestricted(username);
      if(Admin_Restricted){
        res.send('Kindly Login again')
        return;
      }
      if(username == "Admin_1"){
        await addNewsToCategory(title, desc, newslink, imagelink, category, childKey, currentDate, username,  getCurrentTime());
        await addNewsToLanguage(title, desc, newslink, imagelink, language, childKey, currentDate, username,  getCurrentTime());
        await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, category , language , getCurrentTime());
        await sendNotification( title, fixed_desc , childKey , imagelink);  
      
      }else{ 
        await addNewsToGeneral(title, desc, newslink, imagelink, childKey, currentDate, username, category , language , getCurrentTime());
      } 
      res.send('News added Successfully!');
    } catch (error) {
      console.error('Error adding news:', error.message);
      res.status(500).send('Error adding news: ' + error.message);
    }
  });

  ////SPECIFIC ADMIN 
  async function getNextQuizChildKey(username) {
    try {
      let ref;
      if(username == "Admin_1"){
      ref = db.ref('News');
      }else{
      ref = db.ref('News_UnApproved');
      }
      const snapshot = await ref.orderByKey().limitToFirst(1).once('value');
      if (snapshot.exists()) {
        const firstKey = Object.keys(snapshot.val())[0];
        const firstChildNumber = parseInt(firstKey);
        return firstChildNumber - 1;
      } else {
        return 999;
      }
    } catch (error) {
      console.error('Error fetching next quiz child key:', error.message);
      throw error;
    }
  }
  // Function to add quiz to the general 'Quizzes' reference
  async function addQuizToGeneral(question , question1, question2, question3, question4, correctAnswer, description, childKey, currentDate, username) {
    let quizzesRef;
    if(username == "Admin_1"){
      quizzesRef = db.ref('News');
    }else{
      quizzesRef = db.ref('News_UnApproved');
    }
    const newQuizRef = quizzesRef.child(childKey.toString());
    if(correctAnswer == "Option 1 "){
      correctAnswer = question1
    }else if (correctAnswer == "Option 2"){
      correctAnswer = question2
    }else if (correctAnswer == "Option 3"){
      correctAnswer = question3
    }else if (correctAnswer == "Option 4"){
      correctAnswer = question4
    };
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

  app.use(fileUpload());
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
      await uploadQuizToFirebase(jsonData);
      res.json(jsonData);
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file.', details: error.message });
    }
  });
  async function uploadQuizToFirebase(data) {
    const bulkRef = db.ref('News_UnApproved')
    for (const item of data) {
      const childKey = await getNextChildKey(bulkRef);
      if (childKey) {
        const itemRef = bulkRef.child(childKey.toString());
        item.Ques_in_News_Enabled = 'Yes'; 
        item['Uploaded By']  = 'Bulk_Upload'; 
        await itemRef.set(item);
      } else {
        console.warn('Invalid child key for item:', item);
      }
    }
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

  ////2. LANG DIRECT UPLOAD///
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
  // Function to Rearrange and Upload News Data
  function rearrangeAndUploadNewsData(res) {
    // Fetch all children
    reorderedNewsRef.once("value", (snapshot) => {
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

      // Arrange items in the final order
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

      finalList.forEach((itemData, index) => {
        const key = index < keysList.length ? keysList[index] : reorderedNewsRef.push().key;
        reorderedNewsRef.child(key).set(itemData, (error) => {
          if (error) {
            console.error("Failed to upload item:", itemData, "-", error);
          } else {
            if (index === totalItems - 1) {
              console.log("Upload Complete");
              res.status(200).send("Rearranged and uploaded news data.");
            }
          }
        });
      });
    }, (error) => {
      console.error("Error fetching data:", error.message);
      res.status(500).send("Error fetching data.");
    });
  }

  app.get('/rearrange', (req, res) => {
    rearrangeAndUploadNewsData(res);
  });
  
  /////
  const resetLeaderboard = async (req, res) => {
    try {
      const db = admin.database();
      const leaderboardRef = db.ref("Live_Leaderboard");

      // Fetch data once
      const snapshot = await leaderboardRef.once("value");

      if (snapshot.exists()) {
        // Iterate through each child
        const updates = {};
        snapshot.forEach((childSnapshot) => {
          const key = childSnapshot.key;
          updates[`${key}/points`] = 0;
          updates[`${key}/attempts`] = 0;
        });

        // Update all children at once
        await leaderboardRef.update(updates);

        // Respond with success
        res.status(200).send("Reset complete successfully");
      } else {
        res.status(404).send("No data found under Live_Leaderboard");
      }
    } catch (error) {
      console.error("Error resetting leaderboard:", error);
      res.status(500).send("Failed to reset leaderboard");
    }
  };
  app.get('/reset-leaderboard', resetLeaderboard);  

  app.post('/generate-content', async (req, res) => {
    const { url } = req.body;
    let image;

    if (!url) {
        console.error('URL is missing in the request');
        return res.status(400).send('URL is missing.');
    }

    try {
        console.log('Received URL:', url);

        // Step 1: Fetch the news page HTML to get the image URL
        try {
            const newsResponse = await axios.get(url);
            console.log('Successfully fetched news page HTML');

            const $ = cheerio.load(newsResponse.data);
            image = $('meta[property="og:image"]').attr('content') || '';
            console.log('Extracted Image URL:', image);
        } catch (newsErr) {
            console.error('Failed to fetch news page HTML or extract image:', newsErr.message);
            return res.status(500).send('Error fetching news content or extracting image URL.');
        }

        // Step 2: Communicate with the Google Gemini API to get title and description
        try {
            const response = await axios.post(
                GOOGLE_GEMINI_URL + `?key=${GOOGLE_API_KEY}`,
                {
                    contents: [
                        {
                            parts: [
                                {
                                    text: `Separately give a 15-word title and a 60-word description from: ${url} , start title with T: and start descritpion with D: in respective language`
                                }
                            ]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Google Gemini API Response:', JSON.stringify(response.data));

            const apiText = response.data.candidates?.[0]?.content?.parts?.map(part => part.text).join(' ') || '';
            console.log('API Text Received:', apiText);

            const titleStart = '**Title:**';
            const descStart = '**Description:**';
            
            const titleIndex = apiText.indexOf(titleStart);
            const descIndex = apiText.indexOf(descStart);
            
            if (titleIndex !== -1 && descIndex !== -1) {
                const title = apiText.substring(titleIndex + titleStart.length, descIndex).trim();
                const description = apiText.substring(descIndex + descStart.length).trim();
            
                // console.log('Extracted Title:', title);
                // console.log('Extracted Description:', description);
                // console.log('Extracted Image URL:', image);
            
                return res.status(200).json({
                    title,
                    description,
                    image
                });
            } else {
                return res.status(500).send('Title or description could not be found in the response.');
            }            
        } catch (apiErr) {
            // console.error('Failed to communicate with Google Gemini API:', apiErr.message);
            return res.status(500).send('Failed to communicate with the Google Gemini API.');
        }
    } catch (err) {
        // console.error('Unexpected error:', err.message);
        return res.status(500).send('An unexpected error occurred.');
    }
});
