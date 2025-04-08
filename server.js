const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);


const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public')); // optional if serving HTML from here

app.post('/mux', upload.fields([{ name: 'video' }, { name: 'audio' }]), (req, res) => {
  try {
    const video = req.files['video']?.[0];
    const audio = req.files['audio']?.[0];

    if (!video || !audio) {
      return res.status(400).send('Missing video or audio file.');
    }

    const outputPath = path.join('muxed', `${Date.now()}_output.mp4`);

    ffmpeg()
      .input(video.path)
      .input(audio.path)
      .outputOptions(['-c:v copy', '-c:a aac', '-strict experimental'])
      .on('end', () => {
        res.download(outputPath, () => {
          fs.unlinkSync(video.path);
          fs.unlinkSync(audio.path);
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        console.error('Muxing error:', err);
        res.status(500).send('Muxing failed.');
      })
      .save(outputPath);
  } catch (e) {
    console.error('Server error:', e);
    res.status(500).send('Server error.');
  }
});

app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
