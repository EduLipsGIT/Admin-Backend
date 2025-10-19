const express = require("express");
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
});

const db_firestore = admin.firestore();

// Middleware
app.use(express.json());

// Function to count documents by date
async function countDocsWithDate(targetDate) {
  try {
    const snapshot = await db_firestore
      .collection("News") // replace with your collection
      .where("date", "==", targetDate)
      .get();

    const count = snapshot.size;
    console.log(`Documents with date ${targetDate}: ${count}`);
    return count;
  } catch (error) {
    console.error("Error fetching documents:", error);
    return 0;
  }
}

// Example GET API to get count for a specific date
app.get("/count/:date", async (req, res) => {
  const { date } = req.params;
  const count = await countDocsWithDate(date);
  res.status(200).json({ date, count });
});

