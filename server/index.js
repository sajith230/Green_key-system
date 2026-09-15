require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const salaryRoutes = require('./routes/salary');
const roomRoutes = require('./routes/rooms');
const restaurantRoutes = require('./routes/restaurant');
const cashierRoutes = require('./routes/cashier');
const bankRoutes = require('./routes/bank');
const dashboardRoutes = require('./routes/dashboard');
const pettyCashRoutes = require('./routes/pettyCash');
const madamCashRoutes = require('./routes/madamCash');
const drinkRoutes = require('./routes/drinks');
const mealRoutes = require('./routes/meals');
const loanRoutes = require('./routes/loans');
const kotRoutes = require('./routes/kot');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/petty-cash', pettyCashRoutes);
app.use('/api/madam-cash', madamCashRoutes);
app.use('/api/drinks', drinkRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/kot', kotRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hotel: 'Green Key Pvt' });
});

const DEFAULT_PORT = Number(process.env.PORT) || 4000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Green Key Hotel Server running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Retrying on port ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}

startServer(DEFAULT_PORT);
