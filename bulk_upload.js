// const express = require('express');
// const bodyParser = require('body-parser');
// const admin = require('firebase-admin');
// const path = require('path');
// const cors = require('cors');
// const xlsx = require('xlsx');
// const fileUpload = require('express-fileupload'); // Include express-fileupload
// const { GoogleAuth } = require('google-auth-library');
// require('dotenv').config();

// // Initialize Firebase Admin SDK
// admin.initializeApp({
//   credential: admin.credential.cert({
//     projectId: process.env.FIREBASE_PROJECT_ID,
//     privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
//     clientEmail: process.env.FIREBASE_CLIENT_EMAIL
//   }),
//   databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
// });

// const app = express();
// const port = process.env.PORT || 3000;

// // Enable CORS
// app.use(cors());

// // Use express-fileupload middleware
// app.use(fileUpload()); // Add this line

// // Middleware to parse incoming request bodies
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(bodyParser.json());

// // Middleware to serve static files (index.html, etc.)
// app.use(express.static(path.join(__dirname, 'public')));

// // Access Firebase Database reference
// const db = admin.database();
// const newsRef = db.ref('Bulk_Upload');

// // Endpoint to upload the Excel file and convert it to JSON
// app.post('/upload', async (req, res) => {
//     // Check if the file is uploaded
//     if (!req.files || !req.files.file) {
//       return res.status(400).send('No file uploaded.');
//     }
  
//     const file = req.files.file;
  
//     try {
//       // Load the Excel file
//       const workbook = xlsx.read(file.data, { type: 'buffer' });
  
//       // Get the first sheet
//       const sheetName = workbook.SheetNames[0];
//       const sheet = workbook.Sheets[sheetName];
  
//       // Convert the sheet to JSON
//       const jsonData = xlsx.utils.sheet_to_json(sheet);
//       console.log('Converted JSON Data:', jsonData);
  
//       // Upload to Firebase
//       await uploadToFirebase(jsonData);
  
//       res.json(jsonData); // Send the JSON data back as a JSON response
//     } catch (error) {
//       console.error('Error processing file:', error);
//       res.status(500).json({ error: 'Error processing file.', details: error.message });
//     }
//   });
  
// // Function to upload data to Firebase using the CHILD value as the key
// async function uploadToFirebase(data) {
//     for (const item of data) {
//       // Use the CHILD value as the key
//       const childKey = item.CHILD; // Replace 'CHILD' with the exact name of your column if different
  
//       // Ensure the childKey is a valid string and does not already exist
//       if (childKey) {
//         const itemRef = newsRef.child(childKey); // Use childKey as the node name
//         await itemRef.set(item); // Upload the item to Firebase
//     //    console.log(`Uploaded ${childKey}:`, item);
//       } else {
//         console.warn('Invalid child key for item:', item);
//       }
//     }
  
//     console.log('Data uploaded to Firebase successfully.');
//   }
  

// // Start the server
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });
