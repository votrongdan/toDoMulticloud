const express = require('express');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// Google Cloud Storage config
const storage = new Storage({ keyFilename: path.join(__dirname, 'gcp-key.json') });
const bucket = storage.bucket('your-gcs-bucket-name');

// Multer setup for in-memory upload
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

let tasks = [];

// Upload file to GCS
async function uploadFileToGCS(fileBuffer, filename) {
  const blob = bucket.file(filename);
  const blobStream = blob.createWriteStream({ resumable: false });

  return new Promise((resolve, reject) => {
    blobStream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });
    blobStream.on('error', reject);
    blobStream.end(fileBuffer);
  });
}

// Routes
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

app.post('/tasks', upload.single('file'), async (req, res) => {
  const { title } = req.body;
  const file = req.file;
  let fileUrl = null;

  if (file) {
    const filename = `uploads/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
    try {
      fileUrl = await uploadFileToGCS(file.buffer, filename);
    } catch (error) {
      console.error('GCS Upload failed:', error);
    }
  }

  const task = { id: tasks.length + 1, title, fileUrl };
  tasks.push(task);

  // Notify Azure microservice
  try {
    await fetch('http://YOUR_AZURE_VM_PUBLIC_IP:5000/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
  } catch (error) {
    console.error('Notification failed:', error);
  }

  res.json(task);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
