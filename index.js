require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");
const xlsx = require("xlsx");
const fileUpload = require("express-fileupload");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
  storageBucket: process.env.FIREBASE_STORAGE_URL, // ✅ CORRECT
});

const db = admin.database();
const firestore = admin.firestore();
const bucket = admin.storage().bucket();
const port = process.env.PORT || 3000;
const { v4: uuidv4 } = require("uuid");
const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(fileUpload());

async function getAccessToken() {
  const serviceAccount = {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : "",
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
  };

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  accessToken = accessTokenResponse.token;
}

///// CALCULATION OF CHILD KEYS /////

async function getNextStudyChildKey() {
  const ref = db.ref("Ques_Data");
  try {
    const snapshot = await ref.orderByKey().limitToLast(1).once("value");
    if (snapshot.exists()) {
      const lastKey = Object.keys(snapshot.val())[0];
      const lastChildNumber = parseInt(lastKey, 10);
      return isNaN(lastChildNumber) ? "1" : String(lastChildNumber + 1);
    } else {
      return "1";
    }
  } catch (error) {
    console.error("Error fetching next child key:", error.message);
    return "1"; // Fallback in case of an error
  }
}

///// CHECK DUPLICATION ////////
async function checkTitleExists(title, username) {
  const newsRef = firestore.collection("News");
  try {
    const snapshot = await newsRef.where("title", "==", title).get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking title existence:", error.message);
    throw error;
  }
}

async function checkTitleExistsCATEGORY(title, category) {
  try {
    const categoryRef = firestore.collection(category); // Reference to Firestore collection
    const snapshot = await categoryRef.where("title", "==", title).get(); // Query Firestore for matching title

    if (!snapshot.empty) {
      return true; // Title exists
    }
    return false; // Title does not exist
  } catch (error) {
    console.error("Error checking title existence:", error.message);
    throw error;
  }
}
async function checkTitleExistsLang(title, language) {
  try {
    const languageRef = firestore.collection(language);
    const snapshot = await languageRef.where("title", "==", title).get();
    if (!snapshot.empty) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error checking title existence:", error.message);
    throw error;
  }
}

//////// UPLOAD NEWS

async function getNextChildKeySuperAdmin(ref_recd) {
  try {
    const snapshot = await ref_recd.limit(1).get(); // fetch 1 doc, arbitrary
    if (!snapshot.empty) {
      const docId = snapshot.docs[0].id;
      const nextKey = parseInt(docId, 10) - 1;
      return nextKey;
    } else {
      return 999; // if collection empty
    }
  } catch (error) {
    console.error("Error fetching next child key:", error.message);
    throw error;
  }
}

function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTime() {
  const indiaTime = moment.tz("Asia/Kolkata").format("h:mm A");
  return indiaTime;
}

// ================= Add News Functions =================

async function addNewsToGeneral(
  title,
  desc,
  hinTitle,
  hinDesc,
  newslink,
  imagelink,
  childKey,
  currentDate,
  username,
  category,
) {
  if (await checkTitleExists(title, username)) {
    console.log("Title already exists in General, skipping.");
    return;
  }

  const newsRef = firestore.collection("News");
  const lang = "both";
  try {
    const currentTime = getCurrentTime();
    const newsData = {
      title,
      desc,
      hinTitle,
      hinDesc,
      newslink,
      imagelink,
      date: currentDate,
      time: currentTime,
      lang,
      cat: category, // FIXED
      "Uploaded By": username,
      notification_id: childKey.toString(),
    };

    // ✅ First add news to Firestore
    await newsRef.doc(childKey.toString()).set(newsData);
    console.log("News added to General:", childKey);

    // ✅ Then send notification
    await sendNotification(
      title, // English title
      hinTitle, // Hindi title
      desc, // English desc
      hinDesc, // Hindi desc
      childKey.toString(),
      imagelink,
    );
  } catch (error) {
    console.error("Error adding news to General:", error.message);
    throw error;
  }
}

async function addNewsToCategory(
  title,
  desc,
  hinTitle,
  hinDesc,
  newslink,
  imagelink,
  category,
  currentDate,
  username,
  childKey,
) {
  if (await checkTitleExistsCATEGORY(title, category)) {
    console.log("Title already exists in Category, skipping.");
    return;
  }

  const categoryRef = firestore.collection(category);
  const pushId = await getNextChildKeySuperAdmin(categoryRef);
  const lang = "both";

  try {
    const currentTime = getCurrentTime();
    const newsData = {
      title,
      desc,
      hinTitle,
      hinDesc,
      newslink,
      imagelink,
      date: currentDate,
      time: currentTime,
      lang,
      cat: category, // FIXED
      "Uploaded By": username,
      notification_id: childKey.toString(),
    };
    await categoryRef.doc(pushId.toString()).set(newsData);
    console.log("News added to Category:", pushId);
  } catch (error) {
    console.error("Error adding news to Category:", error.message);
    throw error;
  }
}

async function addNewsToLanguage(
  title,
  desc,
  hinTitle,
  hinDesc,
  newslink,
  imagelink,
  currentDate,
  username,
  category,
  childKey,
) {
  const languageVersions = [
    { langCollection: "News_Eng", title: title, desc: desc },
    { langCollection: "News_Hindi", title: hinTitle, desc: hinDesc },
  ];

  for (const version of languageVersions) {
    const { langCollection, title, desc } = version;

    if (await checkTitleExistsLang(title, langCollection)) {
      console.log(`Title already exists in ${langCollection}, skipping.`);
      continue;
    }

    const languageRef = firestore.collection(langCollection);
    const pushId = await getNextChildKeySuperAdmin(languageRef);

    try {
      const currentTime = getCurrentTime();
      const newsData = {
        title,
        desc,
        newslink,
        imagelink,
        date: currentDate,
        time: currentTime,
        lang: langCollection,
        cat: category,
        "Uploaded By": username,
        notification_id: childKey.toString(),
      };

      await languageRef.doc(pushId.toString()).set(newsData);
      console.log(`News added to ${langCollection}:`, pushId);
    } catch (error) {
      console.error(`Error adding news to ${langCollection}:`, error.message);
      throw error;
    }
  }
}

// ================= Express Route =================

app.post("/submit-news", async (req, res) => {
  const {
    title,
    desc,
    hinTitle,
    hinDesc,
    newslink,
    imagelink,
    category,
    username,
  } = req.body;
  const currentDate = getCurrentDate();

  try {
    const newsRef = firestore.collection("News");
    const childKey = await getNextChildKeySuperAdmin(newsRef);

    // Prepare promises (don’t await yet)
    const promises = [
      addNewsToGeneral(
        title,
        desc,
        hinTitle,
        hinDesc,
        newslink,
        imagelink,
        childKey,
        currentDate,
        username,
        category,
      ),
      addNewsToCategory(
        title,
        desc,
        hinTitle,
        hinDesc,
        newslink,
        imagelink,
        category,
        currentDate,
        username,
        childKey,
      ),
      addNewsToLanguage(
        title,
        desc,
        hinTitle,
        hinDesc,
        newslink,
        imagelink,
        currentDate,
        username,
        category,
        childKey,
      ),
    ];

    await Promise.all(promises); // Run in parallel

    res.send("News added Successfully!");
  } catch (error) {
    console.error("Error adding news:", error.message);
    res.status(500).send("Error adding news: " + error.message);
  }
});

//// ROUTE FOR HTTP NOTIFICATIONS REQUEST////
app.post("/notify", async (req, res) => {
  const {
    title_en,
    title_hi,
    fixed_desc_en,
    fixed_desc_hi,
    childKey,
    imagelink,
  } = req.body;

  // English is mandatory as fallback
  if (!title_en || !fixed_desc_en || !childKey || !imagelink) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await sendNotification(
      title_en,
      title_hi,
      fixed_desc_en,
      fixed_desc_hi,
      childKey,
      imagelink,
    );

    res.status(200).json({
      message: "Notification sent successfully",
      result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const generateUniqueId = () => {
  return uuidv4();
};

// ✅ POST route to test notification
app.post("/test-notification", async (req, res) => {
  const { title_en, title_hi, body_en, body_hi, childKey, imagelink } =
    req.body;

  if (
    !title_en ||
    !title_hi ||
    !body_en ||
    !body_hi ||
    !childKey ||
    !imagelink
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await sendNotification(
      title_en,
      title_hi,
      body_en,
      body_hi,
      childKey,
      imagelink,
    );
    res.status(200).json({ message: "Notification sent successfully", result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const sendNotification = async (
  title_en,
  title_hi,
  fixed_desc_en,
  fixed_desc_hi,
  childKey,
  imagelink,
) => {
  const uniqueNotificationId = generateUniqueId();

  const message = {
    app_id: "b184d4f9-341c-46d8-8c8f-f5863faaf3f0",

    // 🔔 Send to all users
    included_segments: ["All"],

    // 🔹 Fallback (system tray)
    headings: {
      en: title_en,
      hi: title_hi,
    },
    contents: {
      en: fixed_desc_en,
      hi: fixed_desc_hi,
    },

    // 🖼 Image support
    big_picture: imagelink,
    small_picture: imagelink,

    // 📦 Send both languages to app
    data: {
      child_key: childKey.toString(),
      title_en: title_en,
      title_hi: title_hi,
      body_en: fixed_desc_en,
      body_hi: fixed_desc_hi,
      image: imagelink,
    },

    android: {
      priority: "high",
    },

    android_group: uniqueNotificationId,
  };

  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      message,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ZjY3ZDExNjAtOGVkZC00NjFiLThmOTEtODU5YWIxY2I0NDUy`,
        },
      },
    );

    console.log("Notification sent successfully:", response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("OneSignal Error:", error.response.data);
    } else if (error.request) {
      console.error("No response:", error.request);
    } else {
      console.error("Error:", error.message);
    }
    throw error;
  }
};

///////////////// QUIZ UPLOADS ////////////////
async function getNextQuizChildKey() {
  try {
    const ref = firestore.collection("News");
    const snapshot = await ref.orderBy("notification_id").limit(1).get();
    if (!snapshot.empty) {
      const firstDoc = snapshot.docs[0];
      const firstChildNumber = parseInt(firstDoc.id, 10);
      return firstChildNumber - 1;
    } else {
      return 999;
    }
  } catch (error) {
    console.error("Error fetching next quiz child key:", error.message);
    throw error;
  }
}

async function addQuizToGeneral(
  question,
  question1,
  question2,
  question3,
  question4,
  correctAnswer,
  description,
  childKey,
  currentDate,
  username,
) {
  try {
    const quizzesRef = firestore.collection("News");
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
      "Uploaded By": username,
      Ques_in_News_Enabled: "Yes",
      notification_id: childKey,
    });
  } catch (error) {
    console.error("Error adding quiz to Firestore:", error.message);
    throw error;
  }
}

app.post("/submit-quiz", async (req, res) => {
  const {
    question,
    question1,
    question2,
    question3,
    question4,
    correctAnswer,
    description,
    username,
  } = req.body;
  const currentDate = getCurrentDate();
  try {
    const childKey = await getNextQuizChildKey();
    await addQuizToGeneral(
      question,
      question1,
      question2,
      question3,
      question4,
      correctAnswer,
      description,
      childKey,
      currentDate,
      username,
    );
    res.send("Quiz added successfully");
  } catch (error) {
    console.error("Error adding quiz:", error.message);
    res.status(500).send("Error adding quiz: " + error.message);
  }
});
////////////BULK UPLOADS ///////////
app.post("/uploadQuizBulk", async (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).send("No file uploaded.");
  }

  const file = req.files.file;

  try {
    const workbook = xlsx.read(file.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Step 1: Read sheet with raw values
    const rawData = xlsx.utils.sheet_to_json(sheet, { raw: true });

    // Step 2: Convert Excel serials to dd-mm-yyyy format
    function parsePossibleDate(value) {
      if (typeof value === "number" && value > 25569 && value < 60000) {
        const utc_days = Math.floor(value - 25569);
        const utc_value = utc_days * 86400;
        const date = new Date(utc_value * 1000);

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${day}-${month}-${year}`;
      }
      return value;
    }

    // Step 3: Process all rows and convert fields dynamically
    const jsonData = rawData.map((row) => {
      const convertedRow = {};
      for (const key in row) {
        convertedRow[key] = parsePossibleDate(row[key]);
      }
      return convertedRow;
    });

    // Step 4: Loop through and process each row
    for (const row of jsonData) {
      const category_bk = cleanString(row["Exam/Category"]);
      const subject_bk = cleanString(row["Subject"]);
      const section_bk = cleanString(row["Section"]);
      const chapter_bk = cleanString(row["Chapter"]);
      const type = cleanString(row["type"]);

      console.log("Category:", category_bk);
      console.log("Subject:", subject_bk);
      console.log("Section:", section_bk);
      console.log("Chapter:", chapter_bk);
      console.log("Type:", type);

      const sanitizedRow = sanitizeKeys(row);

      if (type === "news") {
        await uploadBulkGeneralQuiz(sanitizedRow);
        await uploadStudy(
          sanitizedRow,
          category_bk,
          subject_bk,
          section_bk,
          chapter_bk,
        );
      } else if (type === "study") {
        await uploadStudy(
          sanitizedRow,
          category_bk,
          subject_bk,
          section_bk,
          chapter_bk,
        );
      } else {
        await uploadStudy(
          sanitizedRow,
          category_bk,
          subject_bk,
          section_bk,
          chapter_bk,
        );
      }
    }

    res.json(jsonData);
  } catch (error) {
    console.error("Error processing file:", error);
    res
      .status(500)
      .json({ error: "Error processing file.", details: error.message });
  }
});

function cleanString(value) {
  return value != null ? String(value).trim().replace(/[\/]/g, "_") : "";
}
////FOR UPLOADING STUDY QUESTIONS
async function uploadStudy(
  item,
  category_bk,
  subject_bk,
  section_bk,
  chapter_bk,
) {
  const childkey = await getNextStudyChildKey();
  const bulkRef = db.ref("Ques_Data");
  if (childkey) {
    const itemRef = bulkRef.child(childkey);
    await itemRef.set(item);
    await RegisterKeys(
      item,
      category_bk,
      subject_bk,
      section_bk,
      chapter_bk,
      childkey,
    );
  } else {
    console.warn("Invalid child key for item:", item);
  }
  console.log("Study Data uploaded!");
}

async function uploadBulkGeneralQuiz(item) {
  try {
    const quizzesRef = firestore.collection("News_Quizzes");

    // Generate key for "News"
    let childkey = await getNextChildKeySuperAdmin(quizzesRef);

    // Add extra metadata fields
    item["Ques_in_News_Enabled"] = "Yes";
    item["notification_id"] = childkey.toString();

    // Upload to News
    const newQuizRef = quizzesRef.doc(childkey.toString());
    await newQuizRef.set(item);
    console.log("General Quiz Data uploaded!");
  } catch (error) {
    console.error("Error adding quiz to Firestore:", error.message);
    throw error;
  }
}

async function RegisterKeys(
  item,
  category_bk,
  subject_bk,
  section_bk,
  chapter_bk,
  childkey,
) {
  const bulkRef = db
    .ref("Questions_Data")
    .child(category_bk)
    .child(subject_bk)
    .child(section_bk)
    .child(chapter_bk)
    .child(childkey);
  if (childkey) {
    await bulkRef.set({
      ques_id: childkey,
      subject: subject_bk,
      section: section_bk,
      chapter: chapter_bk,
      category: category_bk,
    });
  } else {
    console.warn("Invalid child key for item:", item);
  }
}

/// FOR UPLOADING GENERAL QUIZ IN NEWS
async function uploadQuizToFirebase(data, res) {
  try {
    const bulkRef = firestore.collection("News"); // Firestore collection reference

    for (const item of data) {
      const childKey = await getNextChildKeySuperAdmin(bulkRef); // Get unique key

      if (childKey) {
        const itemRef = bulkRef.doc(childKey.toString()); // Firestore uses `doc()`

        // Modify item before uploading
        item.Ques_in_News_Enabled = "Yes";
        item["Uploaded By"] = "Bulk_Upload";
        item["notification_id"] = String.valueOf(childKey) + " ";

        await itemRef.set(item); // Upload item to Firestore
      } else {
        console.warn("Invalid child key for item:", item);
      }
    }

    // Call function after successful upload
    await rearrangeAndUploadNewsData(res);

    console.log("Data uploaded to Firebase successfully.");
  } catch (error) {
    console.error("Error uploading data to Firebase:", error);
  }
}

function sanitizeKeys(obj) {
  const sanitizedObj = {};
  for (const key in obj) {
    const trimmedKey = key.trim();
    const sanitizedKey = trimmedKey.replace(/[.#$/\[\]]/g, "_");
    sanitizedObj[sanitizedKey] =
      typeof obj[key] === "string" ? obj[key].trim() : obj[key];
  }
  return sanitizedObj;
}

/////////////// CRON JOBS //////////////////////

// async function rearrangeAndUploadNewsData(res) {
//   try {
//     const collections = ["News", "News_Eng", "News_Hindi"];

//     for (const colName of collections) {
//       console.log(`Processing collection: ${colName}`);
//       const newsRef = firestore.collection(colName);

//       const snapshot = await newsRef.limit(100).get();
//       if (snapshot.empty) {
//         console.log(`No documents found in ${colName}`);
//         continue;
//       }

//       // Separate Yes items and normal items
//       const yesList = [];
//       const normalList = [];

//       snapshot.forEach((doc) => {
//         const data = doc.data();
//         if (!data) return;

//         if (data.Ques_in_News_Enabled === "Yes") {
//           yesList.push(data);
//         } else {
//           normalList.push(data);
//         }
//       });

//       // Sort all items by code descending (latest first)
//       normalList.sort((a, b) => b.code - a.code);
//       yesList.sort((a, b) => b.code - a.code); // optional, latest first

//       let finalList = [];

//       if (colName === "News") {
//         // Mix Hindi + English + default but keep chronological order
//         // Step 1: merge all normal items by chronological order
//         finalList = [...normalList];

//         // Step 2: Insert Yes items at their respective positions
//         // We'll insert them at top while maintaining order (latest first)
//         yesList.forEach((yesItem) => {
//           // Find index where its code fits in descending order
//           let insertIndex = finalList.findIndex(
//             (item) => item.code < yesItem.code
//           );
//           if (insertIndex === -1) insertIndex = finalList.length; // put at end if older
//           finalList.splice(insertIndex, 0, yesItem);
//         });
//       } else {
//         // For News_Eng & News_Hindi → latest first, interleave Yes items
//         finalList = [...normalList];
//         let yesIndex = 0;
//         const result = [];
//         for (let item of finalList) {
//           result.push(item);
//           if (yesIndex < yesList.length) result.push(yesList[yesIndex++]);
//         }
//         while (yesIndex < yesList.length) result.push(yesList[yesIndex++]);
//         finalList = result;
//       }

//       // Upload reordered docs
//       const keysList = snapshot.docs.map((doc) => doc.id);
//       const updatePromises = finalList.map((item, index) => {
//         const key =
//           index < keysList.length ? keysList[index] : newsRef.doc().id;
//         return newsRef.doc(key).set(item);
//       });

//       await Promise.all(updatePromises);
//       console.log(`Upload complete for collection: ${colName}`);
//     }

//     res
//       .status(200)
//       .send("Rearranged and uploaded news data for all collections.");
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).send("Error fetching data.");
//   }
// }

// app.get("/rearrange", (req, res) => {
//   rearrangeAndUploadNewsData(res);
// });
const resetLeaderboard = async (req, res) => {
  try {
    const leaderboardRef = db.ref("Live_Leaderboard");
    const overallRef = db.ref("UserData");

    console.log("🔹 Fetching Live_Leaderboard data...");
    const snapshot = await leaderboardRef.once("value");

    if (!snapshot.exists()) {
      console.log("❌ No data found under Live_Leaderboard");
      return res.status(404).send("No data found under Live_Leaderboard");
    }

    const leaderboard = [];
    snapshot.forEach((child) => {
      const data = child.val();
      leaderboard.push({
        id: child.key,
        points: data.points || 0,
        attempts: data.attempts || 0,
      });
    });

    leaderboard.sort((a, b) => b.points - a.points);
    const top3 = leaderboard.slice(0, 3);
    console.log("🏆 Top 3 Players:");
    top3.forEach((p, i) => console.log(`${i + 1}. ${p.id} — ${p.points} pts`));

    const rewards = [
      { rank: 1, bonusPercent: 50 },
      { rank: 2, bonusPercent: 30 },
      { rank: 3, bonusPercent: 10 },
    ];

    const overallSnapshot = await overallRef.once("value");
    const overallData = overallSnapshot.exists() ? overallSnapshot.val() : {};

    console.log("📊 Applying rewards + sending notifications...");

    for (let i = 0; i < top3.length; i++) {
      const player = top3[i];
      const bonus = Math.floor((player.points * rewards[i].bonusPercent) / 100);
      const currentOverallPoints = Math.floor(
        overallData[player.id]?.points || 0,
      );
      const newTotal = currentOverallPoints + bonus;
      const notificationId = overallData[player.id]?.notification_id;

      console.log(
        `⭐ Rank ${i + 1}: ${player.id}\n` +
          `   Bonus: ${bonus}\n` +
          `   Old Total: ${currentOverallPoints}\n` +
          `   New Total: ${newTotal}\n`,
      );

      // Update UserData with new points
      await overallRef.child(player.id).update({ points: newTotal });

      // Send push notification if ID exists
      if (notificationId) {
        const rankText = i === 0 ? "1st" : i === 1 ? "2nd" : "3rd";
        const message_fixed = `🎉 Congrats! You ranked ${rankText} in today's leaderboard and earned a ${rewards[i].bonusPercent}% bonus!`;
        await sendUserSpecificNotification(
          "Daily Leaderboard",
          "You are among top 3!",
          "Daily Leaderboard Result",
          message_fixed,
          "leaderboard_reward",
          player.id,
        );
      } else {
        console.warn(`⚠️ No notification_id for user ${player.id}`);
      }
    }

    // Reset daily leaderboard
    const updates = {};
    leaderboard.forEach((player) => {
      updates[`${player.id}/points`] = 0;
      updates[`${player.id}/attempts`] = 0;
    });
    await leaderboardRef.update(updates);

    console.log("✅ Leaderboard reset complete.");
    res
      .status(200)
      .send("Top 3 rewarded, notified, and leaderboard reset successfully.");
  } catch (error) {
    console.error("🚨 Error resetting leaderboard:", error);
    res.status(500).send("Failed to reset leaderboard");
  }
};

app.get("/reset-leaderboard", resetLeaderboard);

////////////AUTHENTICATION
const validCredentials = [
  { username: "Kirtiman Nanda", password: "Kirtiman_Pass" },
  { username: "Sonam Kumari", password: "Sonam_Pass2024" },
  { username: "Navjyoti Kumar", password: "Navjyoti_Pass" },
  { username: "Pramod Kumar", password: "pramod_edulips2024" },
  { username: "Badal_Edulips2025", password: "badal_pass2025" },
];

app.post("/validate_login", async (req, res) => {
  const { username, password } = req.body;

  const user = validCredentials.find(
    (cred) => cred.username === username && cred.password === password,
  );

  if (user) {
    try {
      const isValid = await checkUserCondition(username);
      if (isValid) {
        res.status(200).json({ success: true, message: "Login successful!" });
      } else {
        res.status(401).json({ success: false, message: "User not allowed" });
      }
    } catch (error) {
      console.error("Error checking user condition:", error.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  } else {
    res
      .status(401)
      .json({ success: false, message: "Invalid username or password" });
  }
});

async function checkUserCondition(username) {
  try {
    const adminDataRef = db.ref("Admin_Data");
    const snapshot = await adminDataRef.once("value");
    const adminData = snapshot.val();

    // Early exit if no data exists
    if (!adminData) {
      console.log("Admin_Data is empty.");
      return false;
    }

    // Check if the user exists with the correct status
    for (const childKey in adminData) {
      if (adminData.hasOwnProperty(childKey)) {
        const childData = adminData[childKey];

        // Early return if username matches and status is allowed
        if (
          childData.ADMIN_NAME === username &&
          (childData.ADMIN_STATUS === "ALLOWED" ||
            childData.ADMIN_STATUS === "SUPER_ALLOWED")
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking user condition:", error.message);
    throw error; // Re-throw to allow the caller to handle it
  }
}

app.post("/check_user", async (req, res) => {
  const { username } = req.body;
  try {
    const adminDataRef = db.ref("Admin_Data");
    const snapshot = await adminDataRef.once("value");
    const adminData = snapshot.val();

    if (!adminData) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No admin data found.",
      });
    }

    // Iterate through admin data to find the user
    for (const childKey in adminData) {
      if (adminData.hasOwnProperty(childKey)) {
        const childData = adminData[childKey];

        // Check if the username matches
        if (childData.ADMIN_NAME === username) {
          // Check the user's status
          if (
            childData.ADMIN_STATUS === "ALLOWED" ||
            childData.ADMIN_STATUS === "SUPER_ALLOWED"
          ) {
            console.log(
              `Access allowed for username: ${username} with status: ${childData.ADMIN_STATUS}`,
            );
            return res
              .status(200)
              .json({ success: true, message: "Access allowed." });
          } else {
            console.log(
              `Access denied for username: ${username} with status: ${childData.ADMIN_STATUS}`,
            );
            return res.status(403).json({
              success: false,
              message: "Access denied. User not allowed.",
            });
          }
        }
      }
    }

    // If no matching user is found
    console.log(`No match for ADMIN_NAME with username: ${username}`);
    return res
      .status(403)
      .json({ success: false, message: "Access denied. User not found." });
  } catch (error) {
    console.error("Error checking user condition:", error.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// NEW ROLE RESOLVER API (FOR NEW WORK)
app.post("/auth/resolve-role", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      success: false,
      message: "Username is required",
    });
  }

  try {
    const adminRef = db.ref("Admin_Data");
    const snapshot = await adminRef.once("value");
    const adminData = snapshot.val();

    if (!adminData) {
      return res.status(403).json({
        success: false,
        role: null,
        message: "No admin data found",
      });
    }

    for (const key in adminData) {
      const admin = adminData[key];

      if (admin.ADMIN_NAME === username) {
        if (admin.ADMIN_STATUS === "SUPER_ALLOWED") {
          return res.status(200).json({
            success: true,
            role: "super_admin",
          });
        }

        if (admin.ADMIN_STATUS === "ALLOWED") {
          return res.status(200).json({
            success: true,
            role: "admin",
          });
        }

        return res.status(403).json({
          success: false,
          role: null,
          message: "User exists but not allowed",
        });
      }
    }

    return res.status(403).json({
      success: false,
      role: null,
      message: "User not found",
    });
  } catch (error) {
    console.error("resolve-role error:", error);
    return res.status(500).json({
      success: false,
      role: null,
      message: "Server error",
    });
  }
});

//// ROUTE FOR HTTP NOTIFICATION REQUESTS////
app.post("/notifyUser", async (req, res) => {
  const { title, fixed_desc, message_fixed, notificationType, childCode } =
    req.body;

  if (!title || !fixed_desc) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await sendUserSpecificNotification(
      title,
      fixed_desc,
      message_fixed,
      notificationType,
      childCode,
    );
    res.status(200).json({ message: "Notification sent successfully", result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const sendUserSpecificNotification = async (
  title,
  fixed_desc,
  message_fixed,
  notificationType,
  childCode,
) => {
  const uniqueNotificationId = generateUniqueId();
  const groupKey = uuidv4();
  const message = {
    app_id: "b184d4f9-341c-46d8-8c8f-f5863faaf3f0",
    include_player_ids: [title.trim()],
    headings: { en: "Enrollment Request" },
    contents: { en: message_fixed.trim() },
    android: {
      priority: "high",
    },
    data: {
      child_key: childCode.toString(),
      notificationType: notificationType.toString(),
    },
    android_group: uniqueNotificationId,
  };

  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      message,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `ZjY3ZDExNjAtOGVkZC00NjFiLThmOTEtODU5YWIxY2I0NDUy`,
        },
      },
    );
    console.log("Notification sent successfully:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("Error response:", error.response.data);
    } else if (error.request) {
      console.error("Error request:", error.request);
    } else {
      console.error("Error message:", error.message);
    }
  }
};

app.get("/test/:testID", (req, res) => {
  const testID = req.params.testID;
  const instID = req.query.InstID || "";
  const batchSelected = req.query.batchSelected || "";

  // Your custom app deep link
  const deepLink = `myapp://test?TestID=${testID}&InstID=${instID}&batchSelected=${batchSelected}`;

  // Play Store link as fallback
  const playStoreLink =
    "https://play.google.com/store/apps/details?id=com.edulips";

  // HTML with JavaScript redirection
  const htmlResponse = `
     <!DOCTYPE html>
     <html>
     <head>
         <title>Redirecting...</title>
         <script>
             function openApp() {
                 var deepLink = "${deepLink}";
                 var fallbackUrl = "${playStoreLink}";
 
                 window.location.href = deepLink;
                 
                 setTimeout(function() {
                     window.location.href = fallbackUrl;
                 }, 2000); // Wait 2 seconds before redirecting to Play Store if the app isn't opened
             }
         </script>
     </head>
     <body onload="openApp()">
         <p>Redirecting... If nothing happens, <a href="${playStoreLink}">click here</a> to download the app.</p>
     </body>
     </html>
   `;

  res.send(htmlResponse);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

///AUTHOR

// GET EXAMS
// --- GET EXAMS ---
app.get("/exams", async (req, res) => {
  try {
    const snap = await db.ref("Questions_Data").once("value");
    res.json(Object.keys(snap.val() || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET SUBJECTS ---
app.get("/subjects", async (req, res) => {
  try {
    const exam = req.query.exam;
    const snap = await db.ref(`Questions_Data/${exam}`).once("value");
    res.json(Object.keys(snap.val() || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET SECTIONS ---
app.get("/sections", async (req, res) => {
  try {
    const { exam, subject } = req.query;
    const snap = await db
      .ref(`Questions_Data/${exam}/${subject}`)
      .once("value");
    res.json(Object.keys(snap.val() || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET CHAPTERS ---
app.get("/chapters", async (req, res) => {
  try {
    const { exam, subject, section } = req.query;
    const snap = await db
      .ref(`Questions_Data/${exam}/${subject}/${section}`)
      .once("value");
    res.json(Object.keys(snap.val() || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET QUESTIONS ---
app.get("/questions", async (req, res) => {
  try {
    const { exam, subject, section, chapters } = req.query;

    if (!chapters) return res.json({});

    const chapterList = chapters.split(",");
    let questionIDs = [];

    // Collect QIDs from Questions_Data
    for (let chapter of chapterList) {
      const snap = await db
        .ref(`Questions_Data/${exam}/${subject}/${section}/${chapter}`)
        .once("value");
      const obj = snap.val() || {};
      questionIDs.push(...Object.keys(obj));
    }

    // Fetch full question data in parallel
    let result = {};
    await Promise.all(
      questionIDs.map(async (qid) => {
        const snap = await db.ref(`Ques_Data/${qid}`).once("value");
        if (snap.exists()) result[qid] = snap.val();
      }),
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/update-question", async (req, res) => {
  try {
    const { qid, data } = req.body;

    if (!qid || !data)
      return res
        .status(400)
        .json({ success: false, error: "Missing qid or data" });

    await db.ref(`Ques_Data/${qid}`).update(data);

    console.log(`QID ${qid} updated successfully:`, data);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating question:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/delete-question", async (req, res) => {
  try {
    const { qid } = req.body;

    if (!qid)
      return res.status(400).json({ success: false, error: "Missing qid" });

    await db.ref(`Ques_Data/${qid}`).remove();

    console.log(`QID ${qid} deleted successfully`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting question:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// CREATE QUESTION REPORT (STRING REASON)
app.post("/report-question", async (req, res) => {
  const { qid, message, username } = req.body;

  if (!qid || !message || !username) {
    return res.status(400).json({
      success: false,
      message: "qid, message and username are required",
    });
  }

  try {
    // 🔍 Resolve role
    const role = await checkUserCondition(username);

    if (!role) {
      return res.status(403).json({
        success: false,
        message: "User not allowed to report",
      });
    }

    const reportObj = {
      message,
      reported_by: username,
      role,
      created_at: Date.now(),
    };

    /* ===============================
       1️⃣ CENTRAL REPORT STORAGE
    =============================== */
    await db.ref(`ReportedItems_Study/${qid}/reports`).push(reportObj);

    await db.ref(`ReportedItems_Study/${qid}/status`).set("OPEN");

    /* ===============================
       2️⃣ STORE STRING REASON IN QUESTION
       (NO OVERWRITE)
    =============================== */
    await db.ref(`Ques_Data/${qid}/reason`).set(message); // ✅ string only

    return res.status(200).json({
      success: true,
      message: "Report submitted successfully",
      qid,
    });
  } catch (error) {
    console.error("Report create error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.get("/reported-questions", async (req, res) => {
  try {
    // 1️⃣ Load reported items
    const reportSnap = await db.ref("ReportedItems_Study").once("value");
    const reports = reportSnap.val();

    if (!reports) {
      return res.json({ success: true, data: {} });
    }

    // 2️⃣ Map reported question IDs and include reason
    const questionIDs = Object.keys(reports);
    let result = {};

    await Promise.all(
      questionIDs.map(async (qid) => {
        const snap = await db.ref(`Ques_Data/${qid}`).once("value");
        if (snap.exists()) {
          result[qid] = {
            ...snap.val(),
            reported_reason: reports[qid].message,
            reported_by: reports[qid].reported_by,
          };
        }
      }),
    );

    // 3️⃣ Send response
    res.json({
      success: true,
      count: Object.keys(result).length,
      data: result,
    });
  } catch (error) {
    console.error("Reported questions API error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while loading reported questions",
    });
  }
});

///upload image
app.post("/upload-question-image", async (req, res) => {
  try {
    const { qid } = req.body;

    if (!qid || !req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: "qid and image are required",
      });
    }

    const image = req.files.image;

    if (!image.mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Only image files allowed",
      });
    }

    // 🔹 Remove extension from original filename
    const baseName = path.parse(image.name).name;

    // 🔹 Store image WITHOUT extension
    const filePath = `questionImages/${qid}/${baseName}`;
    const bucketFile = bucket.file(filePath);

    await bucketFile.save(image.data, {
      metadata: { contentType: image.mimetype },
    });

    await bucketFile.makePublic();

    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // 🔹 Save URL in Realtime Database
    await admin.database().ref(`Ques_Data/${qid}`).update({
      imgUrl: imageUrl,
    });

    return res.json({
      success: true,
      message: "Image uploaded & URL saved",
      imgUrl: imageUrl,
    });
  } catch (err) {
    console.error("Image upload error:", err);
    res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
});
///bulk ques edit fix
app.post("/update-question", async (req, res) => {
  const { qid, data } = req.body;

  if (!qid || !data) {
    return res.json({ updated: false });
  }

  const ref = admin.database().ref("Ques_Data").child(qid);
  const snap = await ref.once("value");

  // ❌ QID not found → skip
  if (!snap.exists()) {
    return res.json({ updated: false });
  }

  // ✅ Update only
  await ref.update(data);

  return res.json({ updated: true });
});
