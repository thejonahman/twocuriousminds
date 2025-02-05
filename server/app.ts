import express from 'express';
import thumbnailRoutes from './routes/thumbnail';

// ... other imports ...

const app = express();

// ... other middleware setup ...

app.use('/api/thumbnails', thumbnailRoutes);

// ... rest of the file ...
