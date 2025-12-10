// Test simple pour vérifier les logs
import express from 'express';
const app = express();

app.get('/calendar.ics', (req, res) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${clientIP}`);
  console.log(`[${new Date().toISOString()}] Query params:`, req.query);
  
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.send('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:Test\nEND:VCALENDAR');
  
  const duration = Date.now() - startTime;
  console.log(`[${new Date().toISOString()}] SUCCESS: Request completed in ${duration}ms`);
});

const port = 3000;
app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Test server listening on http://localhost:${port}`);
});
