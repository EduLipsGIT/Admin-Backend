// // api/count.js
// import admin from "firebase-admin";

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId: process.env.FIREBASE_PROJECT_ID,
//       privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
//       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//     }),
//     databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
//   });
// }

// const db_firestore = admin.firestore();

// export default async function handler(req, res) {
//   const date = req.query.date;
//   try {
//     const snapshot = await db_firestore
//       .collection("News")
//       .where("date", "==", date)
//       .get();
//     res.status(200).json({ date, count: snapshot.size });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }
