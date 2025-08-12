import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'
import logger from './middleware/logger.js'

const app = express();
const PORT = process.env.PORT || 8000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(logger);

// API endpoint to send config to frontend
app.get('/config', (req, res) => {
    res.json({
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY
    });
});

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});