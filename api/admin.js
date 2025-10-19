const express = require("express");
const admin = require("firebase-admin");

const app = express();

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
  });
}

const db_firestore = admin.firestore();

// Middleware
app.use(express.json());

// Example GET API using app.get
app.get("/count/:date", async (req, res) => {
  const { date } = req.params;

  try {
    const snapshot = await db_firestore
      .collection("News")
      .where("date", "==", date)
      .get();

    const count = snapshot.size;
    console.log(`Count for date ${date}: ${count}`);

    res.status(200).json({ date, count });
  } catch (err) {
    console.error("Error in /count/:date", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Optional root endpoint
app.get("/", (req, res) => {
  res.send("Express server running 🎯");
});

// ✅ Export app for Vercel serverless
module.exports = app;
