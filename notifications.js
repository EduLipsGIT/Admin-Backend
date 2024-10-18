const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON requests
app.use(bodyParser.json());

// Function to generate unique ID
const generateUniqueId = () => {
    return uuidv4();
};

// Function to send notification
const sendNotification = async (title, fixed_desc, childKey, imagelink) => {
    const uniqueNotificationId = generateUniqueId();
    const groupKey = uuidv4();
    const message = {
      app_id: '7627f664-3313-4277-87e6-fe121cdd20aa',
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
          'Authorization': `Basic NzkzYjkzNDAtOGU1Yi00ZGZkLWEyMWQtMmU1NzY0NjJhZTk1` // Use 'Basic' before the key
        }
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.errors || 'Failed to send notification');
      } else if (error.request) {
        console.error('Error request:', error.request);
        throw new Error('No response from OneSignal');
      } else {
        console.error('Error message:', error.message);
        throw new Error(error.message);
      }
    }
};

// Endpoint to receive POST request from Android app
app.post('/send-notification', async (req, res) => {
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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
