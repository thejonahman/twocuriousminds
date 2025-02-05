import express from 'express';
import thumbnailRoutes from './routes/thumbnail';

// ... other imports ...

const app = express();

// Ensure JSON body parsing is enabled
app.use(express.json());

// ... other middleware setup ...

app.use('/api/thumbnails', thumbnailRoutes);

// ... rest of the file ...