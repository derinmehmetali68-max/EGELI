import app from './app.js';

const port = process.env.PORT || 5174;
const host = process.env.HOST || '0.0.0.0'; // Tüm network interface'lerine dinle

app.listen(port, host, () => {
  console.log(`Server http://localhost:${port}`);
  console.log(`Server network accessible on http://0.0.0.0:${port}`);
});
