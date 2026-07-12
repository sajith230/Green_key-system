const express = require('express');
const Room = require('../models/Room');
const RoomBooking = require('../models/RoomBooking');
const BankTransaction = require('../models/BankTransaction');
const auth = require('../middleware/auth');
const { isOnlineRoomPayment, normalizeTransactionDateTime } = require('../utils/cashierBalance');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const room = await Room.create(req.body);
    res.status(201).json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/bookings/all', auth, async (req, res) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      filter.createdAt = { $gte: start, $lte: end };
    }
    const bookings = await RoomBooking.find(filter)
      .populate('room', 'roomNumber type')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/bookings', auth, async (req, res) => {
  try {
    const bookingData = { ...req.body };
    let bankTransactionId = null;

    if (isOnlineRoomPayment(bookingData.paymentMethod)) {
      const room = await Room.findById(bookingData.room);
      const roomLabel = room ? room.roomNumber : 'Room';
      const bankTx = await BankTransaction.create({
        type: 'deposit',
        amount: Number(bookingData.amount),
        date: normalizeTransactionDateTime(new Date()),
        description: `${roomLabel} - ${bookingData.guestName} - online payment`,
      });
      bankTransactionId = bankTx._id;
      bookingData.bankTransactionId = bankTransactionId;
    }

    const booking = await RoomBooking.create(bookingData);
    await Room.findByIdAndUpdate(bookingData.room, { status: 'occupied' });
    const populated = await booking.populate('room', 'roomNumber type');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/bookings/:id/checkout', auth, async (req, res) => {
  try {
    const booking = await RoomBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', checkOut: new Date() },
      { new: true }
    ).populate('room', 'roomNumber type');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    await Room.findByIdAndUpdate(booking.room._id, { status: 'available' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/bookings/:id', auth, async (req, res) => {
  try {
    const booking = await RoomBooking.findById(req.params.id).populate('room', 'roomNumber type');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === 'active' && booking.room) {
      await Room.findByIdAndUpdate(booking.room._id, { status: 'available' });
    }

    if (booking.bankTransactionId) {
      await BankTransaction.findByIdAndDelete(booking.bankTransactionId);
    }

    await RoomBooking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
